/**
 * 地形移动消耗表 — 与前端 src/utils/hexUtils.js 的 UNIVERSAL_TERRAIN_MAP.cost 对齐。
 * 这是后端唯一地形消耗真理（前端仍是 hexUtils.js），修改任一处须同步另一处。
 *
 * 规则：
 *  - 普通地形 1 点/格
 *  - 特殊地形更高（fortress 5 / forest 2 / mountain 3 / water 2.5 / desert 1.5 / ruins|crystal|rubble 2）
 *  - wall = 99 视为不可通行
 *  - spawn 类 = 0（出生点不消耗）
 */
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

/** 取某地形的移动消耗；未知地形默认 1，wall/99 由调用方判定为不可通行。 */
export function terrainCost(terrain?: string | null): number {
  if (!terrain) return 1;
  const c = TERRAIN_COST[terrain];
  return c === undefined || c === null ? 1 : c;
}
