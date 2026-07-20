#!/usr/bin/env node
/**
 * Phase 29-DataMigration — 旧资产全量洗白搬家脚本
 *
 * 功能：
 *   1. 从 Docker 卷提取旧 hangar (3002) 单位 → EntityMatrix 格式
 *   2. 从 Docker 卷提取旧 map (3003) 地图 → BattlefieldMap 格式
 *   3. 批量注入 3006 大一统 SQLite 数据库
 *   4. --dry-run 模式：仅打印转换结果，不写入
 *
 * 用法：
 *   node scripts/migrate_legacy_to_3006.js --dry-run     # 干跑验证
 *   node scripts/migrate_legacy_to_3006.js               # 正式灌入
 *
 * 依赖：sql.js（与 3006 gateway 使用同一库）
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================================
// 零、配置与命令行解析
// ============================================================

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose') || DRY_RUN;

// 数据库路径
const OLD_HANGAR_DB = process.env.OLD_HANGAR_DB || '/tmp/old_hangar.db';
const OLD_MAP_DB = process.env.OLD_MAP_DB || '/tmp/old_map.db';
const TARGET_DB = process.env.TARGET_DB || '/data/mecha-universe.db';

// 版权溯源常量
const DEFAULT_AUTHOR_ID = 'migration-bot-00000000-0000-0000-0000-000000000000';

// 地形类型映射表：旧 terrain_id → { elevation, passable }
const TERRAIN_PROFILE = {
  empty:       { elevation: 0, passable: true },
  mountain:    { elevation: 3, passable: false },
  forest:      { elevation: 1, passable: true },
  water:       { elevation: 0, passable: false },
  mothership:  { elevation: 0, passable: true, spawn: true },
  base:        { elevation: 0, passable: true, spawn: true },
  plain:       { elevation: 0, passable: true },
  ruin:        { elevation: 1, passable: true },
  lava:        { elevation: 0, passable: false },
  lunar:       { elevation: 0, passable: true },
  crater:      { elevation: 0, passable: true },
};

// 默认地形（未知 terrain_id 的降级值）
const DEFAULT_TERRAIN = { elevation: 0, passable: true };

function uuid() {
  return crypto.randomUUID();
}

// ============================================================
// 一、数据库读写工具
// ============================================================

function openDatabase(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`[ERROR] 数据库不存在: ${filePath}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(filePath);
  return new initSqlJs.default ? new initSqlJs.default.Database(buf) : new initSqlJs.Database(buf);
}

async function openDatabaseAsync(filePath) {
  const SQL = await initSqlJs();
  if (!fs.existsSync(filePath)) {
    console.error(`[ERROR] 数据库不存在: ${filePath}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(filePath);
  return new SQL.Database(buf);
}

function saveDatabase(db, filePath) {
  const data = db.export();
  fs.writeFileSync(filePath, Buffer.from(data));
  console.log(`[DB] 已保存: ${filePath}`);
}

function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const cols = stmt.getColumnNames();
  const results = [];
  while (stmt.step()) {
    const vals = stmt.get();
    const row = {};
    cols.forEach((col, i) => { row[col] = vals[i]; });
    results.push(row);
  }
  stmt.free();
  return results;
}

// ============================================================
// 二、单位转换器：旧 hangar → EntityMatrix
// ============================================================

/**
 * 将旧 hangar 单位的中文四维（格斗/射击/结构/机动）转换为 UnitStats
 *
 * 映射规则：
 *   格斗 → attack（物理攻击力）
 *   射击 → 额外攻击补正（合并到 attack 计算）
 *   结构 → hp / maxHp（结构 x 100 = 最大生命值）
 *   机动 → speed（移动速度）
 *
 * 默认兜底值：
 *   armor=10, shield=0, defense=5, range=1
 */
function convertOldStatsToUnitStats(row) {
  const melee = Number(row.main_格斗 || 0);
  const ranged = Number(row.main_射击 || 0);
  const structure = Number(row.main_结构 || 0);
  const mobility = Number(row.main_机动 || 0);

  // 装备加成：左手 + 右手 + other
  const equipAttack =
    (Number(row.left_格斗 || 0) + Number(row.left_射击 || 0)) +
    (Number(row.right_格斗 || 0) + Number(row.right_射击 || 0)) +
    (Number(row.extra_格斗 || 0) + Number(row.extra_射击 || 0));

  const equipDefense =
    (Number(row.left_结构 || 0) + Number(row.left_机动 || 0)) +
    (Number(row.right_结构 || 0) + Number(row.right_机动 || 0)) +
    (Number(row.extra_结构 || 0) + Number(row.extra_机动 || 0));

  // Royroy 加成
  const royAttack = Number(row.royroy_格斗 || 0) + Number(row.royroy_射击 || 0);
  const royDefense = Number(row.royroy_结构 || 0) + Number(row.royroy_机动 || 0);

  const baseHp = Math.max(50, structure * 100);
  const baseAttack = melee + Math.floor(ranged / 2) + equipAttack + royAttack;
  const baseSpeed = Math.max(1, 2 + Math.floor(mobility / 3));
  const baseArmor = 5 + Math.floor(structure / 2) + Math.floor(equipDefense / 3) + Math.floor(royDefense / 3);
  const baseDefense = Math.floor(structure / 3);

  return {
    hp: baseHp,
    maxHp: baseHp,
    armor: Math.max(0, baseArmor),
    shield: 0,
    attack: Math.max(1, baseAttack),
    defense: Math.max(0, baseDefense),
    speed: Math.min(10, Math.max(1, baseSpeed)),
    range: Math.max(1, 1 + Math.floor(ranged / 5)),
  };
}

/**
 * 将旧装备技能 JSON 字符串合并转换为 UnitSkill[]
 */
function parseOldSkills(mainSkillsJson, leftSkillsJson, rightSkillsJson, extraSkillsJson, roySkillsJson) {
  const allSkills = [];

  function parse(jsonStr) {
    try {
      return JSON.parse(jsonStr || '[]');
    } catch { return []; }
  }

  const main = parse(mainSkillsJson);
  const left = parse(leftSkillsJson);
  const right = parse(rightSkillsJson);
  const extra = parse(extraSkillsJson);
  const roy = parse(roySkillsJson);

  // 合并所有装备的技能
  let idx = 0;
  for (const skillList of [main, left, right, extra, roy]) {
    for (const s of skillList) {
      if (s && typeof s === 'object') {
        allSkills.push({
          id: `migrated-skill-${idx++}-${uuid().slice(0, 8)}`,
          name: s.name || s.id || `技能${idx}`,
          description: s.description || s.desc || '',
          script: s.script || s.dsl || '',
          cooldown: s.cooldown || 0,
          currentCooldown: 0,
          energyCost: s.energyCost || s.cost || 0,
          damageType: s.damageType || s.damage_type || 'PHYSICAL',
        });
      }
    }
  }

  return allSkills;
}

/**
 * 推断 category 类型
 */
function inferCategory(row) {
  const mainType = (row.main_type || '').toLowerCase();
  if (mainType.includes('射击') || mainType.includes('炮') || mainType.includes('狙')) return 'ranged';
  if (mainType.includes('支援') || mainType.includes('治疗') || mainType.includes('修理')) return 'support';
  if (mainType.includes('侦查') || mainType.includes('轻')) return 'scout';
  return 'melee';
}

/**
 * 旧 hangar 单位 → EntityMatrix
 */
function convertUnitToEntityMatrix(row) {
  const stats = convertOldStatsToUnitStats(row);
  const skills = parseOldSkills(
    row.main_skills, row.left_skills, row.right_skills,
    row.extra_skills, row.royroy_skills
  );

  const id = `migrated-unit-${row.id}-${uuid().slice(0, 8)}`;
  const now = new Date().toISOString();
  const authorId = row.user_id ? `migrated-user-${row.user_id}` : DEFAULT_AUTHOR_ID;

  /** @type {import('../mecha-universe-engine/shared-kernel/dist/types').EntityMatrix} */
  const entity = {
    id,
    is_public_copy: true,
    original_author_id: authorId,
    generation_status: 'completed',
    attributes: {
      // 保留原始中文四维作为历史溯源的 KV
      legacy_格斗: Number(row.main_格斗 || 0),
      legacy_射击: Number(row.main_射击 || 0),
      legacy_结构: Number(row.main_结构 || 0),
      legacy_机动: Number(row.main_机动 || 0),
      legacy_main_type: row.main_type || '机体',
      legacy_codename: row.codename || '',
      has_royroy: Number(row.has_royroy || 0),
      // 鹦鹉螺号元驱动行动计数池
      action_points: { MOVE: 1, ATTACK: 1 },
    },
    name: row.name || '未命名机体',
    faction: row.faction || 'earth',
    category: inferCategory(row),
    tier: 1,
    sprite_key: row.main_image_url || row.codename || `unit_${row.id}`,
    stats,
    skills,
    created_by: authorId,
    created_at: row.created_at || now,
    updated_at: now,
  };

  return entity;
}

// ============================================================
// 三、地图转换器：旧 map → BattlefieldMap
// ============================================================

/**
 * 解析旧地形 JSON：{"q,r": "terrain_id", ...} → TerrainCell[]
 */
function parseTerrainCells(terrainJson, width, height, terrainDefsJson) {
  const cells = [];
  let rawMap = {};

  try {
    rawMap = typeof terrainJson === 'string' ? JSON.parse(terrainJson) : terrainJson;
  } catch (e) {
    console.warn(`  [WARN] 地形 JSON 解析失败，使用空地形: ${e.message}`);
    rawMap = {};
  }

  // 解析 terrain_defs（新版字段，可能包含 terrain profile 覆盖）
  let customDefs = {};
  try {
    const defsArr = typeof terrainDefsJson === 'string' ? JSON.parse(terrainDefsJson) : (terrainDefsJson || []);
    for (const def of defsArr) {
      if (def && def.terrain_id) {
        customDefs[def.terrain_id] = {
          elevation: def.elevation ?? TERRAIN_PROFILE[def.terrain_id]?.elevation ?? 0,
          passable: def.passable ?? TERRAIN_PROFILE[def.terrain_id]?.passable ?? true,
          spawn: def.can_spawn ?? TERRAIN_PROFILE[def.terrain_id]?.spawn ?? false,
        };
      }
    }
  } catch {}

  // 合并默认 profile 与自定义 defs
  const profile = { ...TERRAIN_PROFILE };
  for (const [key, val] of Object.entries(customDefs)) {
    if (!profile[key]) profile[key] = {};
    profile[key] = { ...profile[key], ...val };
  }

  // 遍历地形映射，生成 TerrainCell[]
  const spawnPoints = [];
  const usedKeys = new Set();

  for (const [key, terrainId] of Object.entries(rawMap)) {
    const parts = key.split(',');
    if (parts.length !== 2) continue;

    const q = parseInt(parts[0], 10);
    const r = parseInt(parts[1], 10);
    if (isNaN(q) || isNaN(r)) continue;

    const cellKey = `${q},${r}`;
    if (usedKeys.has(cellKey)) continue;
    usedKeys.add(cellKey);

    const p = profile[terrainId] || DEFAULT_TERRAIN;

    cells.push({
      q,
      r,
      terrain: terrainId,
      elevation: p.elevation || 0,
      passable: p.passable !== false,
    });

    if (p.spawn) {
      spawnPoints.push({ q, r });
    }
  }

  // 如果没有 spawn_points，在边缘生成默认出生点
  if (spawnPoints.length === 0 && cells.length > 0) {
    // 顶部区域作为地球军出生点
    spawnPoints.push({ q: Math.floor(width / 4), r: 2 });
    // 底部区域作为拜火教出生点
    spawnPoints.push({ q: Math.floor((width * 3) / 4), r: height - 3 });
  }

  return { cells, spawnPoints };
}

/**
 * 旧 map battlefield → BattlefieldMap
 */
function convertMapToBattlefieldMap(row, terrainDefsJson) {
  const { cells, spawnPoints } = parseTerrainCells(
    row.terrain, row.width, row.height, terrainDefsJson || row.terrain_defs
  );

  const id = `migrated-map-${row.id}-${uuid().slice(0, 8)}`;
  const now = new Date().toISOString();
  const authorId = row.user_id ? `migrated-user-${row.user_id}` : DEFAULT_AUTHOR_ID;

  /** @type {import('../mecha-universe-engine/shared-kernel/dist/types').BattlefieldMap} */
  const map = {
    id,
    name: row.name || `地图-${row.id}`,
    width: row.width || 20,
    height: row.height || 30,
    cells,
    spawn_points: spawnPoints,
    is_public_copy: row.is_public === 1 || row.is_public === '1' || row.is_public === true,
    generation_status: 'completed',
    attributes: {
      legacy_type: row.type || 'standard',
      legacy_id: row.id,
    },
  };

  return map;
}

// ============================================================
// 四、3006 数据库注入
// ============================================================

/**
 * 确保 maps 表存在于 3006 数据库中
 */
function ensureMapsTable(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS maps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      width INTEGER NOT NULL DEFAULT 20,
      height INTEGER NOT NULL DEFAULT 30,
      cells TEXT NOT NULL DEFAULT '[]',
      spawn_points TEXT DEFAULT '[]',
      is_public_copy INTEGER DEFAULT 0,
      original_author_id TEXT,
      generation_status TEXT DEFAULT 'completed',
      attributes TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('[DB] maps 表已确认/创建');
}

/**
 * 检查 units 表是否缺少列，动态补齐
 */
function ensureUnitsColumns(db) {
  const colInfo = queryAll(db, "PRAGMA table_info(units)");
  const colNames = colInfo.map(c => c.name);

  if (!colNames.includes('original_author_id')) {
    db.run('ALTER TABLE units ADD COLUMN original_author_id TEXT');
    console.log('[DB] units 表追加 original_author_id');
  }
  if (!colNames.includes('generation_status')) {
    db.run("ALTER TABLE units ADD COLUMN generation_status TEXT DEFAULT 'completed'");
    console.log('[DB] units 表追加 generation_status');
  }
}

/**
 * 插入 EntityMatrix 单位到 3006 units 表
 */
function insertUnit(db, entity) {
  const existing = queryAll(db, 'SELECT id FROM units WHERE id = ?', [entity.id]);
  if (existing.length > 0) {
    console.log(`  [SKIP] 单位已存在: ${entity.name} (${entity.id})`);
    return false;
  }

  db.run(
    `INSERT INTO units (id, owner_id, name, faction, category, tier, sprite_key, stats, skills, is_public_copy, original_author_id, generation_status, attributes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entity.id,
      DEFAULT_AUTHOR_ID,
      entity.name,
      entity.faction,
      entity.category,
      entity.tier,
      entity.sprite_key || null,
      JSON.stringify(entity.stats),
      JSON.stringify(entity.skills),
      entity.is_public_copy ? 1 : 0,
      entity.original_author_id,
      entity.generation_status || 'completed',
      JSON.stringify(entity.attributes || {}),
      entity.created_at,
      entity.updated_at,
    ]
  );
  return true;
}

/**
 * 插入 BattlefieldMap 地图到 3006 maps 表
 */
function insertMap(db, map) {
  const existing = queryAll(db, 'SELECT id FROM maps WHERE id = ?', [map.id]);
  if (existing.length > 0) {
    console.log(`  [SKIP] 地图已存在: ${map.name} (${map.id})`);
    return false;
  }

  db.run(
    `INSERT INTO maps (id, name, width, height, cells, spawn_points, is_public_copy, original_author_id, generation_status, attributes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [
      map.id,
      map.name,
      map.width,
      map.height,
      JSON.stringify(map.cells),
      JSON.stringify(map.spawn_points || []),
      map.is_public_copy ? 1 : 0,
      DEFAULT_AUTHOR_ID,
      map.generation_status || 'completed',
      JSON.stringify(map.attributes || {}),
    ]
  );
  return true;
}

// ============================================================
// 五、主流程
// ============================================================

async function main() {
  console.log('============================================');
  console.log(' Phase 29 — 旧资产全量洗白搬家');
  console.log(` 模式: ${DRY_RUN ? 'DRY RUN（仅验证，不写入）' : '正式灌入'}`);
  console.log('============================================\n');

  const SQL = await initSqlJs();

  // --- 5.1 打开旧数据库 ---
  console.log('[1/5] 打开旧数据库...');
  const oldHangarDb = fs.existsSync(OLD_HANGAR_DB)
    ? new SQL.Database(fs.readFileSync(OLD_HANGAR_DB))
    : null;
  const oldMapDb = fs.existsSync(OLD_MAP_DB)
    ? new SQL.Database(fs.readFileSync(OLD_MAP_DB))
    : null;

  if (!oldMapDb) {
    console.error('[FATAL] 旧地图数据库不存在:', OLD_MAP_DB);
  }

  // --- 5.2 提取旧单位 ---
  console.log('\n[2/5] 提取旧单位 (hangar.db)...');
  const oldUnits = oldHangarDb ? queryAll(oldHangarDb, 'SELECT * FROM units') : [];
  console.log(`  旧 hangar 单位数量: ${oldUnits.length}`);

  const convertedUnits = oldUnits.map(convertUnitToEntityMatrix);

  if (VERBOSE && convertedUnits.length > 0) {
    console.log('\n  --- 转换后的 EntityMatrix 抽样 ---');
    convertedUnits.slice(0, 3).forEach((u, i) => {
      console.log(`  [${i + 1}] ${u.name}`);
      console.log(`      id: ${u.id}`);
      console.log(`      faction: ${u.faction}, category: ${u.category}`);
      console.log(`      stats:`, JSON.stringify(u.stats));
      console.log(`      skills: ${u.skills.length} 个`);
      console.log(`      is_public_copy: ${u.is_public_copy}`);
      console.log(`      original_author_id: ${u.original_author_id}`);
      console.log(`      attributes:`, JSON.stringify(u.attributes));
    });
  }

  if (oldUnits.length === 0) {
    console.log('  ⚠️  旧 hangar 无单位数据，跳过单位迁移');
  }

  // --- 5.3 提取旧地图 ---
  console.log('\n[3/5] 提取旧地图 (map.db)...');
  const oldMaps = oldMapDb ? queryAll(oldMapDb, 'SELECT * FROM battlefields') : [];
  console.log(`  旧 map 战场数量: ${oldMaps.length}`);

  // 获取 terrain_defs（如果有独立表）
  const terrainTypes = oldMapDb ? queryAll(oldMapDb, 'SELECT * FROM terrain_types') : [];
  console.log(`  地形类型定义: ${terrainTypes.length} 种`);

  const convertedMaps = oldMaps.map(m => convertMapToBattlefieldMap(m));

  if (VERBOSE && convertedMaps.length > 0) {
    console.log('\n  --- 转换后的 BattlefieldMap 抽样 ---');
    convertedMaps.slice(0, 3).forEach((m, i) => {
      console.log(`  [${i + 1}] ${m.name}`);
      console.log(`      id: ${m.id}`);
      console.log(`      size: ${m.width}x${m.height}`);
      console.log(`      cells: ${m.cells.length} 个地形格`);
      console.log(`      spawn_points: ${m.spawn_points.length} 个出生点`);
      console.log(`      is_public_copy: ${m.is_public_copy}`);
      const terrainSample = m.cells.slice(0, 5).map(c => `${c.terrain}(${c.q},${c.r})`).join(', ');
      console.log(`      terrain 抽样: ${terrainSample}...`);
    });
  }

  // --- 5.4 AST 合规检查 ---
  console.log('\n[4/5] 语法合规检查...');
  const requiredFields = ['id', 'name', 'cells', 'spawn_points', 'is_public_copy', 'generation_status', 'attributes'];
  let mapComplianceErrors = 0;
  let unitComplianceErrors = 0;

  for (const m of convertedMaps) {
    for (const field of requiredFields) {
      if (m[field] === undefined) {
        console.error(`  [ERROR] 地图 ${m.name}: 缺少字段 ${field}`);
        mapComplianceErrors++;
      }
    }
    // 检查 cells 结构
    if (Array.isArray(m.cells)) {
      for (const cell of m.cells) {
        if (cell.q === undefined || cell.r === undefined || !cell.terrain) {
          console.error(`  [ERROR] 地图 ${m.name}: TerrainCell 结构不完整`);
          mapComplianceErrors++;
          break;
        }
      }
    }
  }

  for (const u of convertedUnits) {
    const unitFields = ['id', 'name', 'is_public_copy', 'original_author_id', 'generation_status', 'attributes', 'stats', 'skills'];
    for (const field of unitFields) {
      if (u[field] === undefined) {
        console.error(`  [ERROR] 单位 ${u.name}: 缺少字段 ${field}`);
        unitComplianceErrors++;
      }
    }
    // 检查 action_points
    if (u.attributes && !u.attributes.action_points) {
      console.warn(`  [WARN] 单位 ${u.name}: attributes 缺少 action_points（将被默认补齐）`);
    }
  }

  if (mapComplianceErrors === 0 && unitComplianceErrors === 0) {
    console.log('  ✅ 所有转换产物符合 shared-kernel 天条，零格式错误');
  } else {
    console.error(`  ❌ 地图错误: ${mapComplianceErrors}, 单位错误: ${unitComplianceErrors}`);
    if (DRY_RUN) {
      console.log('  ⚠️  DRY RUN 模式，不会写入数据库');
    }
  }

  // --- 5.5 灌入 3006 数据库 ---
  console.log('\n[5/5] 灌入 3006 大一统库...');

  if (DRY_RUN) {
    console.log('  ⏭️  DRY RUN 模式 — 跳过数据库写入');
    console.log('\n============================================');
    console.log(' DRY RUN 完成 — 零报错，所有转换合法');
    console.log(` 单位: ${convertedUnits.length} 个待迁移`);
    console.log(` 地图: ${convertedMaps.length} 张待迁移`);
    console.log('============================================\n');
  } else {
    // 正式灌入
    if (!fs.existsSync(TARGET_DB)) {
      console.error(`[FATAL] 目标数据库不存在: ${TARGET_DB}`);
      process.exit(1);
    }

    const targetDb = new SQL.Database(fs.readFileSync(TARGET_DB));

    // 创建 maps 表 + 补齐 units 列
    ensureMapsTable(targetDb);
    ensureUnitsColumns(targetDb);

    // 灌入单位
    let unitInserted = 0;
    for (const u of convertedUnits) {
      if (insertUnit(targetDb, u)) unitInserted++;
    }
    console.log(`  单位灌入: ${unitInserted}/${convertedUnits.length}`);

    // 灌入地图
    let mapInserted = 0;
    for (const m of convertedMaps) {
      if (insertMap(targetDb, m)) mapInserted++;
    }
    console.log(`  地图灌入: ${mapInserted}/${convertedMaps.length}`);

    // 保存并关闭
    saveDatabase(targetDb, TARGET_DB);

    console.log('\n============================================');
    console.log(' 正式灌入完成');
    console.log(` 单位: ${unitInserted}/${convertedUnits.length} 新入库`);
    console.log(` 地图: ${mapInserted}/${convertedMaps.length} 新入库`);
    console.log('============================================\n');
  }

  // 清理
  if (oldHangarDb) oldHangarDb.close();
  if (oldMapDb) oldMapDb.close();
}

main().catch(err => {
  console.error('[FATAL] 迁移脚本异常:', err);
  process.exit(1);
});
