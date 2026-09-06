/**
 * diceUtil.js — 前端骰子工具（镜像后端 diceService.cjs 语义）
 *
 * 与后端 DiceService.roll 保持完全一致的解析规则：
 *   - number 当作面数（如 6 → 掷 1 颗 6 面骰）
 *   - "NdM" 字符串（如 "2d6" → 掷 2 颗 6 面骰并累加）
 * 供手动摇骰动画与「骰子工坊」模拟器使用，保证前后端掷骰分布一致。
 */

function parseDiceExpr(expr) {
  if (typeof expr === 'number' && !isNaN(expr)) {
    return { count: 1, sides: Math.max(1, Math.floor(expr)) };
  }
  const s = String(expr == null ? '1d6' : expr).trim().toLowerCase();
  const m = s.match(/^(\d*)d(\d+)$/);
  if (m) {
    const count = m[1] ? Math.max(1, parseInt(m[1], 10)) : 1;
    const sides = Math.max(1, parseInt(m[2], 10));
    return { count, sides };
  }
  const n = parseInt(s, 10);
  if (!isNaN(n) && n > 0) return { count: 1, sides: n };
  return { count: 1, sides: 6 };
}

function rollOnce(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

export function rollDice(diceStr) {
  const { count, sides } = parseDiceExpr(diceStr);
  let t = 0;
  for (let i = 0; i < count; i++) t += rollOnce(sides);
  return t;
}

// 兼容旧名：返回 { count, sides }
export function parseDiceType(diceStr) {
  return parseDiceExpr(diceStr);
}

export function rollDetails(diceStr) {
  const { count, sides } = parseDiceExpr(diceStr);
  const out = [];
  for (let i = 0; i < count; i++) out.push(rollOnce(sides));
  return out;
}

export function rollMany(diceStr, n) {
  const arr = [];
  const times = Math.max(1, Number(n) || 1);
  for (let i = 0; i < times; i++) arr.push(rollDice(diceStr));
  return arr;
}

export default { rollDice, parseDiceType, rollDetails, rollMany };
