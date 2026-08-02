/**
 * 地形移动消耗表 — 方案A：以 glossary terrains 为单一真相源。
 *
 * 真实移动路径 combat.ts /move → tsFindPath → terrainCost(tid) 现在优先读取
 * glossary 配置里该地形的 move_cost（与掩体防御修正 _getTerrainDefenseBonus 同源，
 * 均经 configLoader.getGlossaryConfig() 读取），使「自定义地形管理」里调整的 move_cost
 * 对真实寻路即时生效。TERRAIN_COST 仅作兜底（glossary 缺失/读取失败时使用）。
 *
 * 历史：此前 TERRAIN_COST 与前端 hexUtils.js 的 UNIVERSAL_TERRAIN_MAP.cost、glossary.move_cost
 * 是三份互不同步的数据；方案A 后，移动消耗以 glossary.move_cost 为准。
 */
import { createRequire } from 'module';

const nodeRequire = createRequire(import.meta.url);

// 与掩体减伤(_getTerrainDefenseBonus)共用同一读取函数，保证地形战斗参数同源
let _getGlossaryConfig: (() => any) | null = null;
try {
  _getGlossaryConfig = nodeRequire(
    '../../services/combat-service/src/services/combatCore/configLoader.cjs'
  ).getGlossaryConfig;
} catch {
  _getGlossaryConfig = null;
}

// 兜底硬编码表（glossary 缺字段或读取失败时回退，保持不变）
export const TERRAIN_COST: Record<string, number> = {
  space: 1,
  moon: 1,
  lunar: 1,
  void: 999, // 留白：不可通行
  empty: 1,
  fortress: 5,
  base: 1,
  mothership: 1,
  forest: 2,
  desert: 1.5,
  water: 2.5,
  mountain: 3,
  wall: 99,
  repair_station: 1,
  spawn_earth: 0,
  spawn_maxion: 0,
  spawn: 0,
  // Phase 29-GlossaryMerge: 词条库复活地形，与 glossary-skill-config.json terrains 对齐
  plain: 1,
  ruins: 2,
  crystal: 2,
  rubble: 2,
  city_building: 1,
};

/**
 * 取某地形的移动消耗。
 * 方案A：优先 glossary terrains[tid].move_cost（单一真相源）；未知/缺失回退 TERRAIN_COST；
 * 再缺失回退 1。wall/99、void/999 由调用方判定为不可通行。
 */
export function terrainCost(terrain?: string | null): number {
  if (!terrain) return 1;
  if (_getGlossaryConfig) {
    try {
      const terrains = _getGlossaryConfig()?.terrains;
      const def = terrains && terrains[terrain];
      if (def && typeof def.move_cost === 'number') {
        return def.move_cost;
      }
    } catch {
      // 读取异常则走兜底
    }
  }
  const c = TERRAIN_COST[terrain];
  return c === undefined || c === null ? 1 : c;
}
