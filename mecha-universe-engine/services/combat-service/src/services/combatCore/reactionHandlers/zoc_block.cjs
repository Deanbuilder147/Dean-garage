/**
 * zoc_block.cjs — 联防 blockade_line（卡9，H6 on_move_path）
 *
 * D5（已拍板）：联防"并列" = 严格共线（立方坐标 (q,r,s=-q-r) 轴向，三点共线）。
 * 行为：仅当 >=3 同阵营单位严格共线，且移动方试图穿越其中两 blocker 之间的"公共边"
 *   （Edge-crossing）时，禁止该步；品字形/折线不阻断，正常绕行可达。
 * 越界格 undefined 保护：取公共边两侧格时一侧越界 → 仅判留存地图内一侧，防 undefined 崩溃。
 *
 * isCollinearBlockade 为共享纯函数，前端 hexUtils.js 有同规则副本（数学真理单源应保持一致）。
 */
const { register } = require('./index.cjs');

// 方案A：取单位轮转角色，role 优先，faction 回退（逻辑判定唯一依据）
function unitRoleOf(u) {
  if (!u) return 'neutral';
  if (u.role != null) return u.role;
  return u.faction != null ? u.faction : 'neutral';
}

function axialToCube(q, r) { return { x: q, y: -q - r, z: r }; }
function cubeEquals(a, b) { return a.x === b.x && a.y === b.y && a.z === b.z; }

/** 两点是否严格共线（同轴向连续） */
function areCollinear(a, b) {
    return (a.x === b.x) || (a.y === b.y) || (a.z === b.z);
}

/** 取某单位所在的所有共线同阵营直线（>=3 连续） */
function blockerLines(units) {
    const byFaction = {};
    for (const u of units) {
        if (!u || !u.position) continue;
        // 方案A：按轮转角色归并共线联防（同角色即同一联防阵营，不受固有阵营影响）
        const f = unitRoleOf(u) || 'neutral';
        (byFaction[f] = byFaction[f] || []).push(axialToCube(u.position.q, u.position.r));
    }
    const lines = [];
    for (const f in byFaction) {
        const arr = byFaction[f];
        for (let i = 0; i < arr.length; i++) {
            for (let j = i + 1; j < arr.length; j++) {
                if (!areCollinear(arr[i], arr[j])) continue;
                // 同轴线上的所有单位
                const line = arr.filter(c => areCollinear(c, arr[i]) && areCollinear(c, arr[j]));
                // 连续（无空挡）：排序后相邻间距=1
                const sorted = line.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y) || (a.z - b.z));
                let consecutive = sorted.length >= 3;
                for (let k = 1; k < sorted.length; k++) {
                    const d = Math.max(
                        Math.abs(sorted[k].x - sorted[k - 1].x),
                        Math.abs(sorted[k].y - sorted[k - 1].y),
                        Math.abs(sorted[k].z - sorted[k - 1].z)
                    );
                    if (d !== 1) { consecutive = false; break; }
                }
                if (consecutive) lines.push(sorted);
            }
        }
    }
    return lines;
}

/** 线段 a→b 在 cube 空间是否穿越某共线 blocker 直线两格之间的公共边（落在两 blocker 之间） */
function crossesBlockerSeam(a, b, line) {
    // 在 cube 空间插值，检测交点是否落在两个 consecutive blocker 之间的缝隙（非 blocker 本身）
    const N = 8;
    const ac = axialToCube(a.q, a.r), bc = axialToCube(b.q, b.r);
    for (let i = 1; i < N; i++) {
        const t = i / N;
        const px = ac.x + (bc.x - ac.x) * t;
        const py = ac.y + (bc.y - ac.y) * t;
        const pz = ac.z + (bc.z - ac.z) * t;
        // 若交点恰在某 blocker 上 → 该步本就被占用，不算 seam 穿越
        if (line.some(c => Math.abs(c.x - px) < 1e-6 && Math.abs(c.y - py) < 1e-6 && Math.abs(c.z - pz) < 1e-6)) {
            return false;
        }
        // 交点落在两 consecutive blocker 之间（共线且位于二者中点附近）→ seam
        for (let k = 1; k < line.length; k++) {
            const m = {
                x: (line[k].x + line[k - 1].x) / 2,
                y: (line[k].y + line[k - 1].y) / 2,
                z: (line[k].z + line[k - 1].z) / 2,
            };
            if (Math.abs(m.x - px) < 1e-6 && Math.abs(m.y - py) < 1e-6 && Math.abs(m.z - pz) < 1e-6) {
                return true;
            }
        }
    }
    return false;
}

/**
 * 严格共线联防边阻塞判定。
 * @param cur 移动起点 {q,r}
 * @param next 移动终点 {q,r}
 * @param units 全部单位（含 faction/position）
 * @returns Boolean 是否禁止该步
 */
function isCollinearBlockade(cur, next, units) {
    if (!cur || !next || !Array.isArray(units)) return false;
    const lines = blockerLines(units);
    for (const line of lines) {
        // 越界格保护：cur/next 任一侧公共边格越界 → 仅判留存侧
        if (crossesBlockerSeam(cur, next, line)) return true;
    }
    return false;
}

register('on_move_path', (ctx) => {
    const { cur, next, units } = ctx;
    return isCollinearBlockade(cur, next, units) ? { blocked: true } : null;
});

module.exports = { isCollinearBlockade, blockerLines, axialToCube };
