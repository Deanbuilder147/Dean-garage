// victoryChecker.cjs
// 网关内存战局(BattleUnit)的实时胜利条件结算。
// 适配网关单位形状：unitId / faction(或 ownerId) / currentStats.hp / position.{q,r}
// 数据来源：
//   battle.victoryConditions = 完整 req.body（含 conditions[] / hold_round / facility）
//   battle.aceUnits          = { [unitId]: faction }
//   battle.round             = 当前轮次
//   battle.map.cells         = 战场格子（带 q,r,terrain,owner?）
// 与 TurnManager.checkVictoryConditions 语义对齐，但用同步 CommonJS 暴露给网关 require。
//
// 方案A：胜负判定以「轮转角色(attack/defense/ambush)」为唯一归并维度，
// unit.faction(固有阵营) 仅作展示与兜底；winner 一律返回轮转角色名。

// 方案A：轮转角色顺序（攻击/防守/偷袭）
const ROLE_ORDER = ['attack', 'defense', 'ambush'];

// 固有阵营 → 轮转角色（兜底映射，仅用于兼容旧配置/展示推导）
const FACTION_TO_ROLE = {
  earth: 'attack',
  balon: 'defense',
  maxion: 'ambush',
};

// 取单位轮转角色：role 优先，回退 faction / ownerId，再兜底 neutral
function unitRoleOf(u) {
  if (!u) return 'neutral';
  if (u.role != null) return u.role;
  if (u.faction != null) return u.faction;
  if (u.ownerId != null) return u.ownerId;
  return 'neutral';
}

// 同侧判定（holder/owner/capturer 可能是角色或固有阵营，兼容两者）
function sameSide(u, key) {
  if (key == null || !u) return false;
  const r = unitRoleOf(u);
  return (
    r === key ||
    (u.faction != null && u.faction === key) ||
    (u.ownerId != null && u.ownerId === key)
  );
}

// 将配置侧可能写出的固有阵营还原为轮转角色
function toRole(key) {
  if (key == null) return null;
  return FACTION_TO_ROLE[key] || key;
}

function getUnitsArray(battle) {
  if (!battle) return [];
  if (Array.isArray(battle.units)) return battle.units;
  if (battle.units && typeof battle.units.values === 'function') {
    try { return Array.from(battle.units.values()); } catch (e) { return []; }
  }
  if (battle.units && typeof battle.units.forEach === 'function') {
    return Array.from(battle.units instanceof Map ? battle.units.values() : Object.values(battle.units));
  }
  return [];
}

function normUnit(u) {
  const s = (u && (u.currentStats || u.stats)) || {};
  const hp = s && s.hp != null ? s.hp : (u && u.hp != null ? u.hp : 0);
  return {
    id: u && u.unitId != null ? u.unitId : (u ? u.id : null),
    faction: u && u.faction != null ? u.faction : (u && u.ownerId != null ? u.ownerId : 'earth'),
    // 方案A：归一化后携带轮转角色，作为后续所有判定依据
    role: u && u.role != null ? u.role : (u && u.faction != null ? u.faction : (u && u.ownerId != null ? u.ownerId : 'neutral')),
    hp: hp,
    q: u && u.position ? u.position.q : (u ? u.q : null),
    r: u && u.position ? u.position.r : (u ? u.r : null),
  };
}

function getCells(battle) {
  const b = battle || {};
  if (b.map && Array.isArray(b.map.cells)) return b.map.cells;
  if (Array.isArray(b.cells)) return b.cells;
  if (b.battlefield_state && Array.isArray(b.battlefield_state.cells)) return b.battlefield_state.cells;
  return [];
}

function evaluateVictory(battle) {
  if (!battle) return { victory: false };

  const vc = battle.victoryConditions || {};
  const conditions = Array.isArray(vc.conditions)
    ? vc.conditions
    : (Array.isArray(vc) ? vc : (vc && vc.condition ? [vc.condition] : ['annihilate']));
  const holdRound = vc.hold_round || vc.holdRound || 8;
  const facility = vc.facility || null;
  const aceUnits = battle.aceUnits || battle.ace_units || {};
  const round = battle.round || battle.roundNumber || 0;

  const rawUnits = getUnitsArray(battle);
  const units = rawUnits.map(normUnit);

  // 方案A：按轮转角色归并存活单位
  const aliveByRole = {};
  const allRoles = {};
  for (const u of units) {
    allRoles[u.role] = true;
    if (u.hp > 0) aliveByRole[u.role] = (aliveByRole[u.role] || 0) + 1;
  }
  const aliveRoles = Object.keys(aliveByRole).filter((r) => aliveByRole[r] > 0 && r !== 'neutral');

  const otherRole = (r) =>
    aliveRoles.find((x) => x !== r) ||
    ROLE_ORDER.find((x) => x !== r) ||
    '';

  for (const cond of conditions) {
    // ── 歼灭：仅剩 1 个非中立阵营存活 → 该阵营(轮转角色)获胜 ──
    if (cond === 'annihilate') {
      const totalRoles = Object.keys(allRoles).filter((r) => r !== 'neutral').length;
      if (totalRoles >= 2 && aliveRoles.length === 1) {
        return {
          victory: true,
          winner: aliveRoles[0],
          condition: 'annihilate',
          message: `其余阵营被全歼，阵营 ${aliveRoles[0]} 获胜`,
        };
      }
    }
    // ── 斩首：某阵营全部王牌单位阵亡 → 对方(轮转角色)获胜 ──
    else if (cond === 'assassinate') {
      const aceRoles = Object.values(aceUnits);
      for (const f of new Set(aceRoles)) {
        const fAces = rawUnits.filter(
          (u) => (aceUnits[(u.unitId != null ? u.unitId : u.id)] != null) && sameSide(u, f),
        );
        const allDead = fAces.length > 0 && fAces.every((u) => normUnit(u).hp <= 0);
        if (allDead) {
          const winner = otherRole(toRole(f));
          if (winner) {
            return { victory: true, winner, condition: 'assassinate', message: `阵营 ${f} 王牌单位被斩杀` };
          }
        }
      }
    }
    // ── 据守：轮次达到 hold_round 且占据方占领设施点 → 占据方(轮转角色)获胜 ──
    else if (cond === 'hold_position') {
      if (facility) {
        const fq = facility.q != null ? facility.q : facility.coord && facility.coord.q;
        const fr = facility.r != null ? facility.r : facility.coord && facility.coord.r;
        const holder = facility.faction || facility.owner || facility.holder;
        if (fq != null && fr != null && holder) {
          const occupied = units.some(
            (u) => u.hp > 0 && sameSide(u, holder) && u.q === fq && u.r === fr,
          );
          if (occupied && round >= holdRound) {
            const winnerRole = toRole(holder);
            return {
              victory: true,
              winner: winnerRole,
              condition: 'hold_position',
              message: `阵营 ${holder} 在第 ${round} 轮占据设施点`,
            };
          }
        }
      }
    }
    // ── 占领：占领方控制多数据点格子（cells 需带 owner/faction）→ 占领方(轮转角色)获胜 ──
    else if (cond === 'capture') {
      const cells = getCells(battle);
      const capturer = facility && (facility.capturer || facility.owner);
      if (cells.length && capturer) {
        let cap = 0;
        let def = 0;
        for (const c of cells) {
          const owner = c.owner != null ? c.owner : c.faction;
          if (owner === capturer) cap++;
          else if (owner) def++;
        }
        if (cap > def && cap > 0) {
          return { victory: true, winner: toRole(capturer), condition: 'capture', message: `阵营 ${capturer} 控制多数据点` };
        }
      }
    }
    // ── 摧毁设施：设施 hp<=0 → 攻击方(轮转角色)获胜 ──
    else if (cond === 'destroy_facility') {
      if (facility && typeof facility.hp === 'number' && facility.hp <= 0) {
        const attacker = facility.attacker || facility.owner || facility.capturer;
        if (attacker) {
          return { victory: true, winner: toRole(attacker), condition: 'destroy_facility', message: '设施被摧毁' };
        }
      }
    }
  }

  return { victory: false };
}

module.exports = { evaluateVictory, ROLE_ORDER, FACTION_ORDER: ROLE_ORDER, FACTION_TO_ROLE };
