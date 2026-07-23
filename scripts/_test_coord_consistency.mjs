// 阶段 B·5 / B·3 一致性单测：点击逆推 + 邻居/距离一致性
// 直接 import 前端 hexUtils 真实模块（ESM）。
import { pointyTopCenter, pointyTopToHex, getHexNeighbors } from '../mecha-universe-engine/frontend/src/utils/hexUtils.js';

const SIZE = 36;
const offsetToAxial = (q, r) => ({ q: q - (r + (r & 1)) / 2, r });
const cubeDist = (a, b) => {
  const aq = a.q, ar = a.r, as = -aq - ar;
  const bq = b.q, br = b.r, bs = -bq - br;
  return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(as - bs));
};
const hexDistOffset = (q1, r1, q2, r2) => cubeDist(offsetToAxial(q1, r1), offsetToAxial(q2, r2));

// BFS（offset 邻居）真实距离
function bfsDist(q0, r0, q1, r1, N = 60) {
  const seen = new Set([`${q0},${r0}`]);
  let layer = [[q0, r0]];
  for (let d = 0; d <= N; d++) {
    if (layer.some(([q, r]) => q === q1 && r === r1)) return d;
    const next = [];
    for (const [q, r] of layer) {
      for (const n of getHexNeighbors(q, r)) {
        const k = `${n.q},${n.r}`;
        if (!seen.has(k)) { seen.add(k); next.push([n.q, n.r]); }
      }
    }
    layer = next;
  }
  return N + 1;
}

let fail = 0;
const note = (m) => { fail++; if (fail <= 8) console.log('  ✗', m); };

// 1) 点击命中逆推 round-trip（pointyTopCenter ↔ pointyTopToHex）
for (let r = 0; r < 40; r++) {
  for (let q = 0; q < 40; q++) {
    const { flatX, flatY } = pointyTopCenter(q, r, SIZE, 1, 1);
    const { q: rq, r: rr } = pointyTopToHex(flatX, flatY, SIZE, 1, 1);
    if (rq !== q || rr !== r) note(`click round-trip (${q},${r}) -> (${rq},${rr})`);
  }
}

// 2) 邻居一致性：getHexNeighbors 的 6 个结果 cube 距离均为 1
for (let r = 0; r < 20; r++) {
  for (let q = 0; q < 20; q++) {
    const ns = getHexNeighbors(q, r);
    if (ns.length !== 6) note(`neighbor count (${q},${r}) = ${ns.length}`);
    for (const n of ns) {
      if (hexDistOffset(q, r, n.q, n.r) !== 1) note(`neighbor (${q},${r})->(${n.q},${n.r}) dist=${hexDistOffset(q, r, n.q, n.r)}`);
    }
  }
}

// 3) 距离公式 == BFS 真实距离（偏移→axial 换算正确）
let mismatch = 0;
for (let r1 = 0; r1 < 12; r1++) for (let q1 = 0; q1 < 12; q1++)
  for (let r2 = 0; r2 < 12; r2++) for (let q2 = 0; q2 < 12; q2++) {
    const f = hexDistOffset(q1, r1, q2, r2);
    const b = bfsDist(q1, r1, q2, r2);
    if (f !== b) { mismatch++; if (mismatch <= 5) note(`dist (${q1},${r1})->(${q2},${r2}) formula=${f} bfs=${b}`); }
  }

console.log(`\n点击逆推失败: ${fail === 0 ? 'PASS' : fail}`);
console.log(`距离公式 vs BFS 不一致: ${mismatch === 0 ? 'PASS' : mismatch}`);
process.exit(fail === 0 && mismatch === 0 ? 0 : 1);
