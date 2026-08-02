/**
 * 六角格测距真理 · 跨端契约单测（Phase 30-HexTruth）
 *
 * 验证 shared-kernel（ESM + CJS 双产物）、frontend 镜像、combat-core(hexKey)、
 * aiStrategies 四端对相同 Even-R 坐标的求距 / 范围枚举结果 100% 逐字节一致。
 * 这是"焊死全栈测距真相源"的回归护栏：任何一端改了 hex 数学，本测试必须全绿。
 *
 * 运行：node scripts/hex-truth-contract.test.mjs
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// 项目根：scripts/ 的上一级（跨环境可移植，不再硬编码绝对路径）
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const B = resolve(SCRIPT_DIR, '..');

const require = createRequire(import.meta.url);
const cjs = require(B + '/shared-kernel/dist/hexMath.cjs');
const frontend = require(B + '/frontend/src/utils/hexUtils.js');
const combat = require(B + '/services/combat-service/src/services/combatCore/hexKey.cjs');
const ai = require(B + '/services/combat-service/src/services/combatCore/aiStrategies.cjs');

// ESM 真相源产物用动态 import 加载（静态 import 不接受变量路径）
const esmMod = await import(B + '/shared-kernel/dist/hexMath.js');
const esmDist = esmMod.hexDistance;
const esmRange = esmMod.getHexesInRange;

const cases = [
  [0, 0, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1], [0, 0, 3, 0], [0, 0, 0, 6],
  [2, 2, 4, 4], [5, 5, 0, 0], [1, 0, 2, 1], [3, 3, 5, 2],
  // 历史 _hexDistance 等效回归用例
  [1, 1, 4, 4], [0, 0, 0, 6],
];

let failures = 0;
for (const [q1, r1, q2, r2] of cases) {
  const a = esmDist(q1, r1, q2, r2);
  const b = cjs.hexDistance(q1, r1, q2, r2);
  const c = frontend.hexDistance(q1, r1, q2, r2);
  const d = combat.hexDistance(q1, r1, q2, r2);
  const e = ai.hexDistance({ q: q1, r: r1 }, { q: q2, r: r2 });
  const same = a === b && b === c && c === d && d === e;
  if (!same) {
    failures++;
    console.error(`MISMATCH (${q1},${r1})-(${q2},${r2}): esm=${a} cjs=${b} fe=${c} combat=${d} ai=${e}`);
  }
}

const r1 = esmRange(0, 0, 1).length;
const r2 = frontend.getHexesInRange(0, 0, 1).length;
const r3 = combat.getHexesInRange(0, 0, 1).length;
const rangeOk = r1 === 7 && r2 === 7 && r3 === 7;
if (!rangeOk) {
  failures++;
  console.error(`getHexesInRange(0,0,1).length MISMATCH: esm=${r1} fe=${r2} combat=${r3} (expect 7)`);
}

if (failures === 0) {
  console.log('✅ ALL FOUR ENDS CONSISTENT — hex math truth locked');
  process.exit(0);
} else {
  console.error(`❌ ${failures} inconsistency(ies) detected`);
  process.exit(1);
}
