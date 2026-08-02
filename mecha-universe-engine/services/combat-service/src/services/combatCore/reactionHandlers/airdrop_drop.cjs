/**
 * airdrop_drop.cjs — 空投 airdrop（卡8，H4 on_round_start）
 *
 * 触发：round >= 2 的新回合开始。
 * 行为：地图随机平地生成 groundItems（标准 getHexKey(q,r)），坐标不重叠、可平稳拾取。
 *   - 候选格须可通行的平地（Clear/可通行地形）；遇高山/深水/高掩体直接 reroll；
 *   - 数量 = 1d6；重试上限内无平地则跳过本次空投并记日志。
 * groundItems 仅内存态 battleState.groundItems；不写库。
 * 拾取检测由前端移动结束 / 回合开始触发 → 同步装备 + 置「空投增益」标记（幸运卡依赖）。
 */
const { register } = require('./index.cjs');

function getHexKey(q, r) { return `${q},${r}`; }
function rollD6(manual) { return manual != null ? manual : (1 + Math.floor(Math.random() * 6)); }

// 可平稳拾取的地形白名单（与前端 TERRAIN_COST 对齐；wall=99 等高阻类排除）
const PASSABLE = new Set(['clear', 'plain', 'grass', 'road', 'low_cover', 'ruins']);

function isClearTerrain(terrain) {
    if (!terrain) return true;
    const t = String(terrain).toLowerCase();
    return PASSABLE.has(t);
}

/**
 * 在新回合开始生成空投。
 * @returns { items:[{q,r,items,faction,spawned_round}], spawned:Number }
 */
function spawnAirdrops(ctx) {
    const { battleState, round } = ctx;
    if (round == null || round < 2) return { items: [], spawned: 0 };
    const map = battleState && battleState.map;
    const cols = (map && map.cols) || (map && map.width) || 20;
    const rows = (map && map.rows) || (map && map.height) || 20;

    const occupied = new Set();
    if (battleState.units) {
        for (const u of battleState.units) {
            if (u.position) occupied.add(getHexKey(u.position.q, u.position.r));
        }
    }
    if (Array.isArray(battleState.groundItems)) {
        for (const g of battleState.groundItems) occupied.add(getHexKey(g.q, g.r));
    }

    const count = rollD6();
    const spawned = [];
    const MAX_TRIES = count * 20;
    let tries = 0;
    while (spawned.length < count && tries < MAX_TRIES) {
        tries++;
        const q = Math.floor(Math.random() * cols);
        const r = Math.floor(Math.random() * rows);
        const key = getHexKey(q, r);
        if (occupied.has(key)) continue;
        const cell = map && map.cells && map.cells[r] && map.cells[r][q];
        const terrain = cell && (cell.terrain || cell.type);
        if (!isClearTerrain(terrain)) continue; // 高山/深水/高掩体 → reroll
        occupied.add(key);
        spawned.push({
            q, r,
            items: [{ name: '补给箱', type: 'weapon', def: { type: 'airdrop_rifle', attack: 3, damage_kind_modifiers: { kinetic: 0, beam: 0 } } }],
            faction: null,
            spawned_round: round,
        });
    }
    if (!Array.isArray(battleState.groundItems)) battleState.groundItems = [];
    battleState.groundItems.push(...spawned);
    if (ctx.broadcast) ctx.broadcast('airdrop_spawn', { items: spawned, round });
    if (ctx.log) ctx.log(`[airdrop] 第 ${round} 轮空投 ${spawned.length} 个补给箱`);
    return { items: spawned, spawned: spawned.length };
}

register('on_round_start', (ctx) => spawnAirdrops(ctx) || null);

/**
 * 拾取检测：单位占据 groundItem 格 → 同步装备（双槽位）+ 置「空投增益」标记 _airdropBuff（幸运依赖）。
 * 仅内存态：不回写整备室/仓库。返回拾取到的物品数。
 */
function pickupAirdrops(battleState, unit) {
    if (!battleState || !Array.isArray(battleState.groundItems) || !unit || !unit.position) return 0;
    const key = getHexKey(unit.position.q, unit.position.r);
    const idx = battleState.groundItems.findIndex(g => getHexKey(g.q, g.r) === key);
    if (idx < 0) return 0;
    const item = battleState.groundItems[idx];
    // 同步装备：嵌套 equipment + 扁平 right_hand_* + equipState（双槽位）
    const def = (item.items && item.items[0] && item.items[0].def) || {};
    if (def && Object.keys(def).length) {
        if (!unit.equipment) unit.equipment = {};
        unit.equipment.right_hand = JSON.parse(JSON.stringify(def));
        unit.right_hand_type = def.type || null;
        unit.right_hand_melee = num(def.attack);
        unit.right_hand_ranged = num(def.attack);
        if (!Array.isArray(unit.equipState)) unit.equipState = [];
        unit.equipState = unit.equipState.filter(e => !(e && e.slot === 'right_hand'));
        unit.equipState.push({ slot: 'right_hand', ...def });
    }
    unit._airdropBuff = true; // 幸运卡门控标记
    battleState.groundItems.splice(idx, 1);
    return 1;
}

function num(v, d = 0) { return typeof v === 'number' ? v : d; }

module.exports = { spawnAirdrops, pickupAirdrops, getHexKey, isClearTerrain };
