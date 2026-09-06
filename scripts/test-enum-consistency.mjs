/**
 * 一致性断言：前端枚举镜像 ≡ shared-kernel 真相源。
 * 运行：node scripts/test-enum-consistency.mjs
 * 失败即说明镜像与真相源漂移，需重跑 sync-enums.mjs。
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import assert from 'assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENUMS_SRC = resolve(ROOT, 'mecha-universe-engine/shared-kernel/src/enums.ts');
const MIRROR = resolve(ROOT, 'mecha-universe-engine/frontend/src/contracts/enums.mirror.js');

function extractEnums(src) {
  const result = {};
  const re = /export const (\w+) = \{([\s\S]*?)\} as const;/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1]; const body = m[2];
    const obj = {};
    const kv = /(\w+):\s*'([^']*)'/g; let k;
    while ((k = kv.exec(body))) obj[k[1]] = k[2];
    result[name] = obj;
  }
  return result;
}
function extractMirror(src) {
  const result = {};
  const re = /export const (\w+) = \{([\s\S]*?)\n\};/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1]; const body = m[2];
    const obj = {};
    const kv = /(\w+):\s*'([^']*)'/g; let k;
    while ((k = kv.exec(body))) obj[k[1]] = k[2];
    result[name] = obj;
  }
  return result;
}

const a = extractEnums(readFileSync(ENUMS_SRC, 'utf-8'));
const b = extractMirror(readFileSync(MIRROR, 'utf-8'));
const names = Object.keys(a);
for (const n of names) {
  assert.deepStrictEqual(b[n], a[n], `枚举 ${n} 镜像与真相源不一致`);
}
for (const n of Object.keys(b)) {
  assert.ok(n in a, `镜像存在多余枚举 ${n}`);
}
console.log(`[enum-consistency] OK: ${names.length} 个枚举完全一致`);
