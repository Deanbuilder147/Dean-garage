/**
 * Phase AssetGen — AI 素材生成网关
 *
 * 玩家在网页上传参考图 + 填写 prompt，由 Gateway 直连 Meowa REST API
 * （Bearer 鉴权，Node 原生 fetch，免 Python），生成后落盘到服务器持久卷
 * （/data/images），并回写游戏资源管道：
 *   - 单位七视图精灵 → /data/images/views/{unitCode}_{0..6}_idle.png + 更新 units.view_urls
 *   - 地形 tileset  → /data/images/terrains/{terrainId}.png + 返回素材 URL
 *
 * 防烧钱：每次生成按类型扣 users.credits（注册已送 10），余额不足返回 402。
 *
 * ⚠️ Meowa 工作流端点/返回字段集中在本文件顶部 MEOWA 配置块，
 *    首次联调请以真实 key 跑一次，若字段对不上只需改这里（已做容错扫描）。
 */

import { logger } from '../utils/logger.js';
import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { authenticate } from '../middleware/auth.js'
import { get, run, persistChanges } from '../db/sqlite.js'
import { readConfig, writeConfig } from './glossary.js'

const router = express.Router()

// ===================== Meowa 连接配置 =====================
const MEOWA_BASE = process.env.MEOWA_API_BASE || 'https://api.meowa.ai'
const MEOWA_KEY = process.env.MEOWART_API_KEY || process.env.MEOWA_API_KEY || ''

// 两类资源的生成参数（端点/payload/产出数量集中可调）
// 端点与字段以 meowart_api.py 为参考，首联调若不符在此微调即可。
const WORKFLOW = {
  unit: {
    endpoint: '/api/pixel-gen',
    payload: (prompt: string, style?: string) => ({
      prompt: [prompt, style ? `style: ${style}` : ''].filter(Boolean).join(' '),
      mode: 'heptaploid',      // 7 格 = 七视图
      num_outputs: 7,
      output_format: 'png',
    }),
    directions: 7,
  },
  terrain: {
    endpoint: '/api/pixel-gen',
    payload: (prompt: string, style?: string) => ({
      prompt: [prompt, style ? `style: ${style}` : ''].filter(Boolean).join(' '),
      mode: 'tileset',         // 瓦片集
      num_outputs: 1,
      output_format: 'png',
      tileable: true,
    }),
    directions: 1,
  },
} as const

// ===================== 落盘目录（复用现有 /data/images 持久卷） =====================
const VIEWS_DIR = path.join('/data/images', 'views')
const TERRAINS_DIR = path.join('/data/images', 'terrains')
for (const d of [VIEWS_DIR, TERRAINS_DIR]) {
  try { fs.mkdirSync(d, { recursive: true }) } catch { /* 容器重启后卷已存在 */ }
}

// ===================== 积分定价 =====================
const COST = { unit: 2, terrain: 3 } as Record<string, number>

// ===================== 上传（参考图，可选） =====================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (_req, file, cb) => {
    const ok = /\.(png|jpe?g|webp|gif)$/i.test(file.originalname) || /image\//.test(file.mimetype)
    cb(null, ok)
  },
})

// ===================== Meowa REST 客户端 =====================
function authHeaders() {
  return { Authorization: `Bearer ${MEOWA_KEY}`, Accept: 'application/json' }
}

// 提交生成任务（带可选参考图，multipart；无参考图则 JSON）
async function meowaSubmit(type: 'unit' | 'terrain', prompt: string, style: string | undefined, ref?: Express.Multer.File) {
  const cfg = WORKFLOW[type]
  const url = `${MEOWA_BASE}${cfg.endpoint}`
  const body = cfg.payload(prompt, style)

  let res: Response
  if (ref) {
    const fd = new FormData()
    for (const [k, v] of Object.entries(body)) fd.append(k, String(v))
    fd.append('reference', new Blob([ref.buffer as any], { type: ref.mimetype }), ref.originalname)
    res = await fetch(url, { method: 'POST', headers: authHeaders(), body: fd })
  } else {
    res = await fetch(url, { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  }
  const text = await res.text()
  if (!res.ok) throw new Error(`Meowa 提交失败 (${res.status}): ${text.slice(0, 300)}`)
  let data: any
  try { data = JSON.parse(text) } catch { throw new Error(`Meowa 返回非 JSON: ${text.slice(0, 300)}`) }
  const jobId = data.api_job_id || data.job_id || data.id || data.jobId
  if (!jobId) throw new Error(`Meowa 响应缺少 job id：${text.slice(0, 300)}`)
  return jobId as string
}

// 轮询任务至终态，返回最终 payload
async function meowaPoll(jobId: string, timeoutMs = 5 * 60 * 1000) {
  const start = Date.now()
  const candidates = [
    `${MEOWA_BASE}/api/pixel-gen/jobs?id=${encodeURIComponent(jobId)}`,
    `${MEOWA_BASE}/api/pixel-gen/jobs/${encodeURIComponent(jobId)}`,
  ]
  while (Date.now() - start < timeoutMs) {
    for (const u of candidates) {
      const res = await fetch(u, { headers: authHeaders() })
      if (!res.ok) continue
      const data: any = await res.json().catch(() => null)
      if (!data) continue
      const status = String(data.status || data.state || '').toLowerCase()
      if (status === 'completed' || status === 'done' || status === 'succeeded' || status === 'success') {
        return data
      }
      if (status === 'failed' || status === 'error') {
        throw new Error(`Meowa 任务失败：${JSON.stringify(data).slice(0, 300)}`)
      }
    }
    await new Promise(r => setTimeout(r, 4000))
  }
  throw new Error('Meowa 任务轮询超时（5 分钟）')
}

// 递归扫描最终 payload，收集可下载的图片 URL
function collectImageUrls(obj: any, out: string[] = [], seen = new Set<string>()): string[] {
  if (!obj || typeof obj !== 'object') return out
  const push = (v: any) => {
    if (typeof v !== 'string') return
    if (seen.has(v)) return
    if (/^https?:\/\//.test(v) && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(v)) { out.push(v); seen.add(v) }
  }
  if (Array.isArray(obj)) { obj.forEach(push); obj.forEach(o => collectImageUrls(o, out, seen)); return out }
  for (const [k, v] of Object.entries(obj)) {
    const lk = k.toLowerCase()
    if (lk.includes('url') || lk.includes('image') || lk.includes('output') || lk.includes('tile') || lk.includes('path')) push(v)
    collectImageUrls(v, out, seen)
  }
  return out
}

async function downloadTo(url: string, dest: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`下载 Meowa 产物失败 (${res.status}) ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(dest, buf)
}

// ===================== 路由 =====================
router.post('/generate', upload.single('reference'), authenticate, async (req: any, res) => {
  try {
    if (!MEOWA_KEY) {
      return res.status(503).json({ error: 'Meowa API key 未配置（服务器环境变量 MEOWART_API_KEY 缺失），请联系管理员。' })
    }
    const { type, prompt, style, unitCode, unitId, terrainId, force } = req.body as Record<string, string>
    if (type !== 'unit' && type !== 'terrain') {
      return res.status(400).json({ error: "type 必须为 'unit' 或 'terrain'" })
    }
    if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'prompt 不能为空' })

    // —— 命中复用（仅地形）：文件已在持久卷且非强制 → 直接复用，跳过 Meowa、不扣积分 ——
    const forceRegen = force === 'true' || force === '1'
    const cached = type === 'terrain' && !forceRegen && !!terrainId &&
      fs.existsSync(path.join(TERRAINS_DIR, `${terrainId}.png`))

    // —— 积分校验 ——
    const user = await get('SELECT id, credits FROM users WHERE id = ?', [req.user.id])
    const cost = COST[type]
    const balance = user ? Number(user.credits ?? 0) : 0
    if (balance < cost) {
      return res.status(402).json({ error: '积分不足，无法生成', credits: balance, required: cost })
    }

    // —— 调 Meowa（仅未命中缓存时）——
    let jobId: string | undefined
    let urls: string[] = []
    if (!cached) {
      jobId = await meowaSubmit(type, prompt.trim(), style?.trim() || undefined, req.file)
      const finalPayload = await meowaPoll(jobId)
      urls = collectImageUrls(finalPayload)
      if (urls.length === 0) {
        return res.status(502).json({ error: 'Meowa 未返回可下载的图片产物', debug: finalPayload })
      }
    }

    const result: any = { success: true, type, cost, jobId, cached, previewUrls: [] as string[] }

    if (type === 'unit') {
      if (!unitCode) return res.status(400).json({ error: '单位生成需要 unitCode（精灵标识）' })
      const dir = VIEWS_DIR
      const n = WORKFLOW.unit.directions
      for (let d = 0; d < n; d++) {
        const srcIdx = d % urls.length // 容错：产物不足 7 张时循环复用
        const fname = `${unitCode}_${d}_idle.png`
        await downloadTo(urls[srcIdx], path.join(dir, fname))
        result.previewUrls.push(`/api/units/views/${fname}`)
      }
      // 回写 units.view_urls，使战斗渲染立即生效（零改码）
      const viewUrls: Record<string, string> = {}
      for (let d = 0; d < n; d++) viewUrls[String(d)] = result.previewUrls[d]
      const viewJson = JSON.stringify(viewUrls)
      if (unitId) {
        await run('UPDATE units SET view_urls = ? WHERE id = ?', [viewJson, unitId])
      } else {
        await run('UPDATE units SET view_urls = ? WHERE codename = ? OR sprite_key = ?', [viewJson, unitCode, unitCode])
      }
      result.appliedTo = unitCode
    } else {
      if (!terrainId) return res.status(400).json({ error: '地形生成需要 terrainId' })
      const fname = `${terrainId}.png`
      const dest = path.join(TERRAINS_DIR, fname)
      const url = `/api/terrain/materials/${fname}`
      result.previewUrls.push(url)
      result.materialUrl = url
      result.appliedTo = terrainId
      result.cached = cached
      if (cached) {
        result.cost = 0 // 命中复用不消耗积分
      }
      // 仅未命中缓存时才下载落盘；命中时直接复用已存在文件
      if (!cached) {
        await downloadTo(urls[0], dest)
      }

      // 方案1：AI 生成即联动——写回 glossary 配置 terrains[terrainId].material_url，
      // 使地图编辑器无需手动粘贴即可显示该纹理。仅当该地形已在词条库登记时写回，避免污染配置；
      // 写回失败不影响素材落盘（仅告警），从而与「手动上传素材」能力完全解耦、互不冲突。
      // 命中缓存时也跑本段：保证 material_url 指向正确（兼自愈 build 覆盖导致的纹理丢失）。
      try {
        const cfg = readConfig()
        if (cfg.terrains && cfg.terrains[terrainId]) {
          cfg.terrains[terrainId].material_url = url
          writeConfig(cfg)
          result.configUpdated = true
        } else {
          result.configUpdated = false
          result.configNote = `地形「${terrainId}」未在词条库登记，素材已落盘但未联动配置，可在地图编辑器手动粘贴 URL`
        }
      } catch (cfgErr: any) {
        logger.error({ msg: `[asset-gen] 写回地形配置失败: ${ cfgErr }` })
        result.configUpdated = false
        result.configNote = '配置写回失败（不影响素材已落盘）'
      }
    }

    // —— 扣积分（仅未命中缓存时；命中复用不烧积分）——
    if (!cached) {
      await run('UPDATE users SET credits = credits - ? WHERE id = ?', [cost, req.user.id])
      await persistChanges()
    }

    res.json(result)
  } catch (e: any) {
    logger.error({ msg: `[asset-gen] ${ e }` })
    res.status(500).json({ error: e?.message || '生成失败' })
  }
})

// 查询当前用户积分（前端展示用）
router.get('/credits', authenticate, async (req: any, res) => {
  try {
    const user = await get('SELECT credits FROM users WHERE id = ?', [req.user.id])
    res.json({ credits: user ? Number(user.credits ?? 0) : 0, cost: COST })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '查询失败' })
  }
})

export default router
