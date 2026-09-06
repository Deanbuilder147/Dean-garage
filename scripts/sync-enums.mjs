/**
 * 同步 shared-kernel 枚举 → 前端镜像。
 * 运行：node scripts/sync-enums.mjs
 * 改 shared-kernel/src/enums.ts 后必须重跑本脚本 + test-enum-consistency.mjs。
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENUMS_SRC = resolve(ROOT, 'mecha-universe-engine/shared-kernel/src/enums.ts');
const MIRROR = resolve(ROOT, 'mecha-universe-engine/frontend/src/contracts/enums.mirror.js');

const HEADER = `/**
 * ⚠️ 自动镜像文件 —— 勿手动编辑。
 * 真相源：@mecha/shared-kernel/src/enums.ts
 * 生成：scripts/sync-enums.mjs
 * 一致性：scripts/test-enum-consistency.mjs（CI 断言相等）
 *
 * Phase A 词表与契约统一：前端未纳入 monorepo，故以「逐字镜像 + 注释约束 +
 * 一致性断言」方式保持 编辑器枚举 ≡ shared-kernel 枚举 ≡ 引擎 handler key 三头一致。
 * 改 shared-kernel/src/enums.ts 后必须重跑 sync-enums.mjs 并跑一致性测试。
 */`;

function extractEnums(src) {
  const result = {};
  const re = /export const (\w+) = \{([\s\S]*?)\} as const;/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    const body = m[2];
    const obj = {};
    const kv = /(\w+):\s*'([^']*)'/g;
    let k;
    while ((k = kv.exec(body))) obj[k[1]] = k[2];
    result[name] = obj;
  }
  return result;
}

const src = readFileSync(ENUMS_SRC, 'utf-8');
const enums = extractEnums(src);
const names = Object.keys(enums);
const blocks = names.map((n) => {
  const entries = Object.entries(enums[n]).map(([k, v]) => `  ${k}: '${v}',`).join('\n');
  return `export const ${n} = {\n${entries}\n};`;
}).join('\n\n');
const def = `export default { ${names.join(', ')} };`;
const out = `${HEADER}\n\n${blocks}\n\n${def}\n`;
writeFileSync(MIRROR, out);
console.log(`[sync-enums] 已同步 ${names.length} 个枚举到前端镜像`);
