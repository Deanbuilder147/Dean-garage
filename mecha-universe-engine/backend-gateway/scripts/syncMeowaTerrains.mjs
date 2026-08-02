/**
 * syncMeowaTerrains.mjs
 * ----------------------------------------------------------------------------
 * 将 Meowa 素材库中「与项目地形类型匹配」的地形瓦片自动下载，并绑定到
 * 游戏地形系统的对应节点（glossary 地形定义的 material_url 字段）。
 *
 * 设计依据（项目既有规范）：
 *  - 地形素材落盘：/data/images/terrains/<terrainId>.png
 *    （gateway_data 卷持久化，重建不丢；与 backend-gateway/src/routes/terrain.ts 一致）
 *  - 静态服务 URL：/api/terrain/materials/<terrainId>.png
 *  - 绑定字段：glossary 地形定义中的 material_url
 *    （前端 NewBattleView.terrainMaterials 已读取该字段 → HexGridCanvasEngine 用
 *      createPattern(img,'repeat') 平铺填充六边形；无 material_url 时回退纯色）
 *  - 单点真相：/app/data/glossary-skill-config.json（由构建时 symlink 同时被网关与
 *    .cjs 引擎读取）。本脚本同时写入运行态配置，便于「免重建即时生效」；
 *    仓库源 services/combat-service/src/config/glossary-skill-config.json 也需加
 *    material_url 以保证下次 rebuild 仍然保留。
 *
 * Meowa 素材库（map-presets）为内置参考瓦片，免鉴权可直接下载：
 *   URL 规律：https://media.meowa.ai/public/mapeditor/isometric/<templateId>/<index>.png
 *   本脚本使用 pixel-isometric（64x32 等距瓦片，index=0 确定性选取）。
 *
 * 用法（在 mecha-gateway 容器内执行）：
 *   node /app/scripts/syncMeowaTerrains.mjs
 * 可选环境变量：
 *   DEST_DIR  覆盖落盘目录（默认 /data/images/terrains）
 *   GLOSSARY 覆盖 glossary 配置路径（默认 /app/data/glossary-skill-config.json）
 *   MEOWA_MEDIA 覆盖 CDN 基址（默认 https://media.meowa.ai/public/mapeditor/isometric）
 * ----------------------------------------------------------------------------
 */

import fs from 'fs';
import path from 'path';

const DEST_DIR = process.env.DEST_DIR || '/data/images/terrains';
const GLOSSARY = process.env.GLOSSARY || '/app/data/glossary-skill-config.json';
const MEDIA_BASE = process.env.MEOWA_MEDIA || 'https://media.meowa.ai/public/mapeditor/isometric';

/**
 * 地形 → Meowa 素材映射。
 * - terrainId：项目 glossary 地形 key（必须与 combat-service 配置一致）
 * - slug：Meowa templateId（= URL 路径段）
 * - index：瓦片序号（确定性选取，0 = 首个种子变体）
 * - note：匹配依据（地形特征 → 素材主题）
 *
 * 结构类地形（fortress/ruins/rubble/city_building）在 Meowa 内置库无对应地形主题，
 * 故标记为 skip，保留纯色回退；如需纹理可改为生成式瓦片（消耗 credits）。
 */
const TERRAIN_MAP = [
  { terrainId: 'plain',   slug: 'grassland', index: 0, note: '平原→草地（绿，def+0）' },
  { terrainId: 'forest',  slug: 'rainforest', index: 0, note: '森林→雨林（深绿，def+15）' },
  { terrainId: 'mountain',slug: 'volcano',   index: 0, note: '山地→火山岩（棕岩，def+20）' },
  { terrainId: 'water',   slug: 'ocean',     index: 0, note: '水域→海洋（蓝，def-10）' },
  { terrainId: 'crystal', slug: 'elfland',  index: 0, note: '晶矿→精灵地（紫，魔法，def+5）' },
  { terrainId: 'moon',    slug: 'snow',      index: 0, note: '月面→雪原（灰白，近似）' },
  // 结构类：库内无匹配地形主题，跳过（保留纯色）
  { terrainId: 'fortress',      slug: null, skip: true, note: '堡垒：结构类，库无地形主题→跳过' },
  { terrainId: 'ruins',         slug: null, skip: true, note: '废墟：结构类，库无地形主题→跳过' },
  { terrainId: 'rubble',        slug: null, skip: true, note: '残骸：结构类，库无地形主题→跳过' },
  { terrainId: 'city_building', slug: null, skip: true, note: '城市建筑：结构类，库无地形主题→跳过' },
];

function urlFor(slug, index) {
  return `${MEDIA_BASE}/${slug}/${index}.png`;
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

function setMaterialUrl(terrainId) {
  const url = `/api/terrain/materials/${terrainId}.png`;
  if (!fs.existsSync(GLOSSARY)) {
    console.warn(`  [warn] glossary 配置不存在: ${GLOSSARY}（跳过 material_url 写入）`);
    return false;
  }
  const cfg = JSON.parse(fs.readFileSync(GLOSSARY, 'utf-8'));
  const t = cfg.terrains && cfg.terrains[terrainId];
  if (!t) {
    console.warn(`  [warn] glossary.terrains 无 ${terrainId}（跳过 material_url 写入）`);
    return false;
  }
  t.material_url = url;
  fs.writeFileSync(GLOSSARY, JSON.stringify(cfg, null, 2));
  return true;
}

async function main() {
  if (!fs.existsSync(DEST_DIR)) fs.mkdirSync(DEST_DIR, { recursive: true });
  const manifest = { generatedAt: new Date().toISOString(), terrains: {} };
  let ok = 0, skipped = 0, failed = 0;

  for (const m of TERRAIN_MAP) {
    if (m.skip || !m.slug) {
      console.log(`• ${m.terrainId}: 跳过（${m.note}）`);
      manifest.terrains[m.terrainId] = { skipped: true, reason: m.note };
      skipped++;
      continue;
    }
    const url = urlFor(m.slug, m.index);
    const dest = path.join(DEST_DIR, `${m.terrainId}.png`);
    try {
      const size = await download(url, dest);
      const bound = setMaterialUrl(m.terrainId);
      console.log(`✓ ${m.terrainId}: 下载 ${size}B ← ${url}${bound ? ' | 已绑定 material_url' : ''}（${m.note}）`);
      manifest.terrains[m.terrainId] = {
        material_url: `/api/terrain/materials/${m.terrainId}.png`,
        source: url, bytes: size, bound,
      };
      ok++;
    } catch (e) {
      console.error(`✗ ${m.terrainId}: 下载失败 ${url} → ${e.message}`);
      manifest.terrains[m.terrainId] = { error: e.message, source: url };
      failed++;
    }
  }

  fs.writeFileSync(path.join(DEST_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\n完成：成功 ${ok} / 跳过 ${skipped} / 失败 ${failed}`);
  console.log(`清单已写入 ${path.join(DEST_DIR, 'manifest.json')}`);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
