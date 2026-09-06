// victoryChecker.cjs
// 网关内存战局(BattleUnit)的实时胜利条件结算。
// 适配网关单位形状：unitId / faction(或 ownerId) / currentStats.hp / position.{q,r}
// 数据来源：
//   battle.victoryConditions = 完整 req.body（含 conditions[] / hold_round / facility）
//   battle.aceUnits          = { [unitId]: faction }
//   battle.round             = 当前轮次
//   battle.map.cells         = 战场格子（带 q,r,terrain,owner?）
// 与 TurnManager.checkVictoryConditions 语义对齐，但用同步 CommonJS 暴露给网关 require。

const FACTION_ORDER = ['earth', 'balon', 'maxion'];

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

  const aliveByFaction = {};
  const allFactions = {};
  for (const u of units) {
    allFactions[u.faction] = true;
    if (u.hp > 0) aliveByFaction[u.faction] = (aliveByFaction[u.faction] || 0) + 1;
  }
  const aliveFactions = Object.keys(aliveByFaction).filter((f) => aliveByFaction[f] > 0 && f !== 'neutral');

  const otherFaction = (f) => aliveFactions.find((x) => x !== f) || FACTION_ORDER.find((x) => x !== f) || '';

  for (const cond of conditions) {
    // ── 歼灭：仅剩 1 个非中立阵营存活 → 该阵营获胜 ──
    if (cond === 'annihilate') {
      const totalFactions = Object.keys(allFactions).filter((f) => f !== 'neutral').length;
      if (totalFactions >= 2 && aliveFactions.length === 1) {
        return {
          victory: true,
          winner: aliveFactions[0],
          condition: 'annihilate',
          message: `其余阵营被全歼，阵营 ${aliveFactions[0]} 获胜`,
        };
      }
    }
    // ── 斩首：某阵营全部王牌单位阵亡 → 对方获胜 ──
    else if (cond === 'assassinate') {
      const aceFactions = Object.values(aceUnits);
      for (const f of new Set(aceFactions)) {
        const fAces = rawUnits.filter((u) => aceUnits[normUnit(u).id] === f);
        const allDead = fAces.length > 0 && fAces.every((u) => normUnit(u).hp <= 0);
        if (allDead) {
          const winner = otherFaction(f);
          if (winner) {
            return { victory: true, winner, condition: 'assassinate', message: `阵营 ${f} 王牌单位被斩杀` };
          }
        }
      }
    }
    // ── 据守：轮次达到 hold_round 且占据方占领设施点 → 占据方获胜 ──
    else if (cond === 'hold_position') {
      if (facility) {
        const fq = facility.q != null ? facility.q : facility.coord && facility.coord.q;
        const fr = facility.r != null ? facility.r : facility.coord && facility.coord.r;
        const holder = facility.faction || facility.owner || facility.holder;
        if (fq != null && fr != null && holder) {
          const occupied = units.some(
            (u) => u.hp > 0 && u.faction === holder && u.q === fq && u.r === fr,
          );
          if (occupied && round >= holdRound) {
            return {
              victory: true,
              winner: holder,
              condition: 'hold_position',
              message: `阵营 ${holder} 在第 ${round} 轮占据设施点`,
            };
          }
        }
      }
    }
    // ── 占领：占领方控制多数据点格子（cells 需带 owner/faction）→ 占领方获胜 ──
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
          return { victory: true, winner: capturer, condition: 'capture', message: `阵营 ${capturer} 控制多数据点` };
        }
      }
    }
    // ── 摧毁设施：设施 hp<=0 → 攻击方获胜 ──
    else if (cond === 'destroy_facility') {
      if (facility && typeof facility.hp === 'number' && facility.hp <= 0) {
        const attacker = facility.attacker || facility.owner || facility.capturer;
        if (attacker) {
          return { victory: true, winner: attacker, condition: 'destroy_facility', message: '设施被摧毁' };
        }
      }
    }
  }

  return { victory: false };
}

module.exports = { evaluateVictory, FACTION_ORDER };
