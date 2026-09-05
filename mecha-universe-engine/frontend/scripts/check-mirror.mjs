#!/usr/bin/env node
/**
 * 前端镜像防漂移校验（Phase 7.⑤ 收尾项）
 * ------------------------------------------------------------------
 * 前端有两个"真相源镜像"文件，历史上靠注释 + 口头约束保持与后端一致，
 * 曾多次出现"改了后端忘了前端 / 反之"的静默漂移。本脚本在 build 与 CI
 * 阶段强制比对，任一边改了另一边没改 → 非零退出，阻断部署。
 *
 * 校验的三组镜像：
 *  1. 体型配置：backend-gateway/src/unitSize.ts  ←→  frontend/src/utils/unitSize.js
 *     （SIZE_ORDER / *_FACTOR / SIZE_SEVEN_BOX / SIZE_LABELS 常量块）
 *  2. 射程基准：shared-kernel/src/hexMath.ts     ←→  frontend/src/utils/hexUtils.js
 *     （DEFAULT_RANGE_BY_CATEGORY / DEFAULT_MIN_RANGE_BY_CATEGORY）
 *  3. 等距基准：shared-kernel 无副本，但 hexUtils.ISO_DEFAULTS 属前端唯一真相，
 *     这里仅做结构性 sanity（字段齐全，不跨端比对）。
 *
 * 解析策略：用轻量正则从 TS/JS 源里抽取具名 const 对象，做 JSON 深比较。
 * 不依赖任何第三方包，纯 Node 内置。
 */

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..', '..') // mecha-universe-engine/

let failures = 0
const log = (m) => process.stdout.write(m + '\n')

/**
 * 从源码抽取具名导出的常量值（支持对象 {…} 或数组 […] 字面量）。
 * 兼容 `export const X = {…}` / `const X = {…}` / 带 TS 类型注解
 * `export const X: Record<…> = {…}` / `const X = [...] as const`。
 */
function extractConst(src, name) {
  // 1. 定位 `const NAME [可选类型注解] =` 的结尾位置
  const head = new RegExp(
    `(?:export\\s+const|const)\\s+${name}\\s*(?::\\s*[^=]+?)?=\\s*`,
    'm',
  )
  const hm = head.exec(src)
  if (!hm) return undefined
  let i = hm.index + hm[0].length
  // 跳过值前的空白
  while (i < src.length && /\s/.test(src[i])) i++
  const open = src[i]
  if (open !== '{' && open !== '[') return undefined
  const close = open === '{' ? '}' : ']'
  // 2. 从 open 起做括号平衡扫描，截取到匹配的右括号（支持嵌套）
  let depth = 0
  let j = i
  for (; j < src.length; j++) {
    const c = src[j]
    if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) {
        j++ // 包含右括号
        break
      }
    }
  }
  const literal = src.slice(i, j)
  try {
    // eslint-disable-next-line no-new-func
    return Function(`"use strict"; return (${literal})`)()
  } catch (e) {
    throw new Error(`无法解析常量 ${name}: ${e.message}`)
  }
}

// 别名，保持调用点语义清晰
const extractObject = extractConst

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function read(p) {
  const abs = resolve(ROOT, p)
  if (!existsSync(abs)) {
    throw new Error(`文件不存在: ${abs}`)
  }
  return readFileSync(abs, 'utf8')
}

function checkPair(label, srcA, nameA, srcB, nameB) {
  const a = extractObject(srcA, nameA)
  const b = extractObject(srcB, nameB)
  if (a === undefined) {
    log(`  ✗ [${label}] 真相源缺失导出 ${nameA}`)
    failures++
    return
  }
  if (b === undefined) {
    log(`  ✗ [${label}] 前端镜像缺失导出 ${nameB}`)
    failures++
    return
  }
  if (deepEqual(a, b)) {
    log(`  ✓ [${label}] ${nameA} ≡ ${nameB}`)
  } else {
    log(`  ✗ [${label}] 漂移! ${nameA} != ${nameB}`)
    log(`     真相源: ${JSON.stringify(a)}`)
    log(`     前端镜像: ${JSON.stringify(b)}`)
    failures++
  }
}

log('── 前端镜像防漂移校验 (Phase 7.⑤) ──')

// 1. 体型配置：gateway 源 ↔ 前端镜像
try {
  const gwSrc = read('backend-gateway/src/unitSize.ts')
  const feSrc = read('frontend/src/utils/unitSize.js')
  const order = extractObject(gwSrc, 'SIZE_ORDER')
  const feOrder = extractObject(feSrc, 'SIZE_ORDER')
  // SIZE_ORDER 在 TS 里是数组（带 as const），JS 里是数组，直接比
  const orderOk = JSON.stringify(order) === JSON.stringify(feOrder)
  log(`  ${orderOk ? '✓' : '✗'} [体型] SIZE_ORDER ≡ (${JSON.stringify(order)})`)
  if (!orderOk) failures++

  for (const name of [
    'SIZE_RENDER_SCALE',
    'SIZE_HP_FACTOR',
    'SIZE_MOB_FACTOR',
    'SIZE_HIT_FACTOR',
    'SIZE_SEVEN_BOX',
    'SIZE_LABELS',
  ]) {
    checkPair(`体型.${name}`, gwSrc, name, feSrc, name)
  }
} catch (e) {
  log(`  ✗ [体型] 校验异常: ${e.message}`)
  failures++
}

// 2. 射程基准：shared-kernel ↔ 前端镜像
try {
  const skSrc = read('shared-kernel/src/hexMath.ts')
  const feSrc = read('frontend/src/utils/hexUtils.js')
  checkPair('射程.DEFAULT_RANGE_BY_CATEGORY', skSrc, 'DEFAULT_RANGE_BY_CATEGORY', feSrc, 'DEFAULT_RANGE_BY_CATEGORY')
  checkPair('射程.DEFAULT_MIN_RANGE_BY_CATEGORY', skSrc, 'DEFAULT_MIN_RANGE_BY_CATEGORY', feSrc, 'DEFAULT_MIN_RANGE_BY_CATEGORY')
} catch (e) {
  log(`  ✗ [射程] 校验异常: ${e.message}`)
  failures++
}

// 3. 等距基准：结构性 sanity（前端唯一真相，字段齐全即可）
try {
  const feSrc = read('frontend/src/utils/hexUtils.js')
  const iso = extractObject(feSrc, 'ISO_DEFAULTS')
  const need = ['shearX', 'shearY', 'scaleX', 'scaleY', 'rotation']
  const missing = need.filter((k) => !(k in iso))
  if (missing.length === 0) {
    log(`  ✓ [等距] ISO_DEFAULTS 字段齐全 (${need.join('/')})`)
  } else {
    log(`  ✗ [等距] ISO_DEFAULTS 缺失字段: ${missing.join(', ')}`)
    failures++
  }
} catch (e) {
  log(`  ✗ [等距] 校验异常: ${e.message}`)
  failures++
}

log('────────────────────────────────────')
if (failures > 0) {
  log(`校验失败：${failures} 处漂移/异常。请同步后端真相源与前端镜像后再构建。`)
  process.exit(1)
} else {
  log('全部镜像一致，校验通过 ✅')
  process.exit(0)
}
