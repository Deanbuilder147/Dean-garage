#!/usr/bin/env node
/**
 * migrate-contract-data.cjs — 契约脏数据迁移脚本（Phase 33-Contract 阶段 3 前置）
 *
 * 解决 2026-08-06 审计报告中的 P0-1（skills_by_owner 命名错位）与 P0-4（skill_key 空串）遗留存量：
 *   1. skill_key 批量回填：扫描 units.skills / units.attributes.skills_by_owner(skillsByOwner)，
 *      若 skill_key 为 null/空串，优先级 effect → name 在词条库存储 A 反查英文 key 回填。
 *   2. skillsByOwner → skills_by_owner 键名归一：平滑合并并 delete 驼峰键。
 *
 * 运行规程（严格执行）：
 *   --dry-run  (默认)  仅打印扫描报告，不动 DB、不写备份。
 *   --apply             先自动复制 <db>.YYYYMMDD.bak 物理备份，再写入。
 *
 * 设计要点：
 *   - DB 为 sql.js（WASM SQLite），必须用 sql.js 打开 + db.export() 写回。
 *   - 真实 DB 在 gateway 容器内 /data/mecha-universe.db（宿主机 /backend-gateway/data 是 0 字节空壳）。
 *   - 词条库存储 A 经 combat-service 的 configLoader.cjs 读取（getGlossaryConfig().skills）。
 *
 * 用法（在 gateway 容器内）：
 *   node scripts/migrate-contract-data.cjs --dry-run
 *   node scripts/migrate-contract-data.cjs --apply
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

// ── 路径解析（兼容容器内 /app 与宿主机两种布局）──
// 真实 DB 在 gateway 容器内为 /data/mecha-universe.db（/app/data 是 0 字节空壳，仅作挂载占位）。
// 优先使用真实存在且非空的 DB 路径。
function resolveDbPath() {
  const candidates = [
    '/data/mecha-universe.db',
    path.join(__dirname, '..', 'data', 'mecha-universe.db'),
    path.join(__dirname, '..', '..', 'data', 'mecha-universe.db'),
  ];
  for (const c of candidates) {
    try {
      const st = fs.statSync(c);
      if (st.size > 0) return c; // 非空即采用
    } catch { /* not present */ }
  }
  // 兜底：返回第一个存在项或 /data 默认路径
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}
const DB_PATH = resolveDbPath();
const APP_ROOT = DB_PATH.includes('/data/mecha-universe.db') && fs.existsSync('/app') && fs.existsSync('/app/services')
  ? '/app'
  : path.dirname(path.dirname(DB_PATH));
const COMBAT_SERVICE_ROOT = path.join(APP_ROOT, 'services', 'combat-service');

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');
const APPLY = args.includes('--apply');

// ── 加载 sql.js（容器 / 宿主 node_modules 均可）──
// sql.js 是 WASM 模块：require 返回 initSqlJs 函数，需调用（返回 Promise）得到 SQL 构造器。
async function loadSqlJs() {
  try {
    const initSqlJs = require('sql.js');
    return await initSqlJs();
  } catch (e) {
    console.error('[MIGRATE] 无法加载 sql.js:', e.message);
    process.exit(2);
  }
}

// ── 加载词条库存储 A（name → key 反查字典）──
function loadGlossaryNameToKey() {
  try {
    const loaderPath = path.join(COMBAT_SERVICE_ROOT, 'src', 'services', 'combatCore', 'configLoader.cjs');
    const req = createRequire(loaderPath);
    const cfg = req(loaderPath).getGlossaryConfig();
    const map = new Map();
    if (cfg && cfg.skills && typeof cfg.skills === 'object') {
      // 存储 A 的 skills 是「英文 key → 词条对象」的字典，每条含 name(中文展示名)/label。
      for (const [key, s] of Object.entries(cfg.skills)) {
        if (!s) continue;
        if (s.name) map.set(String(s.name).trim(), key);
        if (s.label) map.set(String(s.label).trim(), key);
        if (s.effect) map.set(String(s.effect).trim(), key);
      }
    }
    console.log(`[MIGRATE] 词条库存储 A 载入：${map.size} 条 name/label/effect→key 映射`);
    return map;
  } catch (e) {
    console.error('[MIGRATE] 读取词条库失败:', e.message);
    process.exit(3);
  }
}

// ── 判断某技能是否需要回填 ──
function skillNeedsKey(s) {
  return !s || (s.skill_key === null || s.skill_key === undefined || String(s.skill_key).trim() === '');
}

// ── 反查 key：优先 effect，次选 name ──
function resolveKey(s, glossary) {
  const effect = s && s.effect ? String(s.effect).trim() : '';
  const name = s && s.name ? String(s.name).trim() : '';
  const byEffect = effect ? glossary.get(effect) : null;
  if (byEffect) return { key: byEffect, via: 'effect' };
  const byName = name ? glossary.get(name) : null;
  if (byName) return { key: byName, via: 'name' };
  return null;
}

// ── 方案 B：为孤儿技能生成规范 Slug 外键 custom_<slug> ──
// 先尝试中文名 → 拼音/ascii 直译（简易映射表覆盖常见字），失败则回退 base64 短哈希，
// 保证满足 EnglishKey 正则（小写字母开头 + 字母/数字/下划线）。全局注册表防碰撞。
const COMMON_HANZI = {
  '浮游': 'fuyou', '炮': 'pao', '收束': 'shushu', 'mega': 'mega', '主炮': 'zhupao',
  '导弹': 'daodan', '格林': 'gelin', '机炮': 'jipao', '能量': 'nengliang', '镰刀': 'liandao',
  '光束': 'guangshu', '冲锋': 'chongfeng', '枪': 'qiang', '火神': 'huoshen', '撞角': 'zhuangjiao',
  '拳击': 'quanji', '反重力': 'fanzhongli', '羽翼': 'yuuyi', '蝠翼': 'fuyi', '护盾': 'hudun',
  '撕裂': 'silie', '诱捕': 'youbu', '格斗': 'gedou', '射击': 'sheji', '电磁': 'dianci',
  '突刺': 'tuci', '盾': 'dun', '冲拳': 'chongquan', '三联': 'sanlian', '二连': 'erlian',
  '激光': 'jiguang', '鲟鱼': 'xunyu', '加农': 'jianong', '溅射': 'jianshe', '撕扯': 'siche',
  '旧日': 'jiuri', '回响': 'huixiang', '移动': 'yidong', '补给': 'budi', '单元': 'danyuan',
  '七式': 'qishi', '重刃': 'zhongren', '有线': 'youxian', '式双发': 'shishuangfa', '双发': 'shuangfa',
  'd': 'd', 'field': 'field', '长': 'chang', '柄': 'bing',
};
function hanziToSlug(text) {
  let out = '';
  for (const ch of text) {
    if (/[a-zA-Z0-9]/.test(ch)) out += ch.toLowerCase();
    else if (COMMON_HANZI[ch]) out += COMMON_HANZI[ch];
    else out += '';
  }
  out = out.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return out;
}
function generateCustomKey(s, registry) {
  const effect = s && s.effect ? String(s.effect).trim() : '';
  const name = s && s.name ? String(s.name).trim() : '';
  let base = hanziToSlug(name) || hanziToSlug(effect);
  if (!base) {
    // 兜底：用 name 的短哈希避免碰撞（仍满足英文小写开头）
    const h = Buffer.from(name || effect || String(Math.random())).toString('base64')
      .replace(/[^a-z0-9]/g, '').slice(0, 8);
    base = 's' + h;
  }
  let key = `custom_${base}`;
  let i = 2;
  while (registry.has(key)) { key = `custom_${base}_${i++}`; }
  registry.add(key);
  return key;
}

// ── 扫描 + 清洗一个技能对象 ──
// 返回 { changed, newKey, via: 'effect'|'name'|'custom' }
function processSkill(s, glossary, stats, ownerLabel, slugRegistry) {
  if (!skillNeedsKey(s)) return { changed: false };
  stats.nullKeySkills++;
  const hit = resolveKey(s, glossary);
  if (hit) {
    stats.repairedSkills++;
    stats.byVia[hit.via] = (stats.byVia[hit.via] || 0) + 1;
    return { changed: true, newKey: hit.key, via: hit.via };
  }
  // 方案 B：孤儿技能自动生成 custom_<slug>
  const ck = generateCustomKey(s, slugRegistry);
  stats.orphans.push({
    owner: ownerLabel,
    effect: s.effect || null,
    name: s.name || null,
    generated_key: ck,
  });
  return { changed: true, newKey: ck, via: 'custom' };
}

function main() {
  console.log(`[MIGRATE] 模式: ${DRY_RUN ? 'DRY-RUN（仅预览，不写库）' : 'APPLY（将写入 DB）'}`);
  console.log(`[MIGRATE] DB 路径: ${DB_PATH}`);

  if (!fs.existsSync(DB_PATH)) {
    console.error('[MIGRATE] DB 文件不存在:', DB_PATH);
    process.exit(4);
  }

  const glossary = loadGlossaryNameToKey();
  return loadSqlJs().then((SQL) => {
  const fileBuf = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(fileBuf);

  // 校验 units 表存在
  const tblCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='units'");
  if (!tblCheck.length) {
    console.error('[MIGRATE] units 表不存在，终止');
    process.exit(5);
  }

  const stats = {
    totalUnits: 0,
    unitsWithSkillsArray: 0,
    unitsWithOwnerMap: 0,
    nullKeySkills: 0,
    repairedSkills: 0,
    byVia: {},
    customFilled: 0,
    camelRenamedUnits: 0,
    orphans: [],
  };

  const slugRegistry = new Set();

  const rows = db.exec('SELECT id, name, skills, attributes FROM units');
  const units = rows.length ? rows[0].values : [];
  stats.totalUnits = units.length;

  // 收集所有待写回的变更
  const pendingWrites = []; // { id, newSkills, newAttributes }

  for (const row of units) {
    const id = row[0];
    const unitName = row[1];
    let skillsRaw = row[2];
    let attrRaw = row[3];

    // ── 1. units.skills（顶级技能数组）──
    let skillsArr = null;
    if (skillsRaw) {
      try { skillsArr = JSON.parse(skillsRaw); } catch { skillsArr = null; }
    }
    if (Array.isArray(skillsArr) && skillsArr.length) {
      stats.unitsWithSkillsArray++;
      let changed = false;
      const newArr = skillsArr.map((s) => {
        const r = processSkill(s, glossary, stats, `unit:${unitName || id}`, slugRegistry);
        if (r.changed) { changed = true; return { ...s, skill_key: r.newKey }; }
        return s;
      });
      if (changed) pendingWrites.push({ id, skillField: 'skills', value: JSON.stringify(newArr) });
    }

    // ── 2. units.attributes.skills_by_owner / skillsByOwner ──
    let attr = null;
    if (attrRaw) {
      try { attr = JSON.parse(attrRaw); } catch { attr = null; }
    }
    if (attr && typeof attr === 'object') {
      let ownerMap = attr.skills_by_owner || attr.skillsByOwner;
      const hadCamel = Object.prototype.hasOwnProperty.call(attr, 'skillsByOwner');

      if (ownerMap && typeof ownerMap === 'object') {
        stats.unitsWithOwnerMap++;
        let changed = false;
        const renamed = {};
        for (const slot of Object.keys(ownerMap)) {
          const list = Array.isArray(ownerMap[slot]) ? ownerMap[slot] : [];
          const newList = list.map((s) => {
            const r = processSkill(s, glossary, stats, `unit:${unitName || id}#${slot}`, slugRegistry);
            if (r.changed) { changed = true; return { ...s, skill_key: r.newKey }; }
            return s;
          });
          renamed[slot] = newList;
        }
        if (hadCamel) {
          // 归一：删除驼峰键，统一为 snake_case
          delete attr.skillsByOwner;
          attr.skills_by_owner = renamed;
          changed = true;
          stats.camelRenamedUnits++;
        } else if (changed) {
          attr.skills_by_owner = renamed;
        }
        if (changed) {
          pendingWrites.push({ id, skillField: 'attributes', value: JSON.stringify(attr) });
        }
      }
    }
  }

  db.close();

  // ── 输出报告 ──
  console.log('\n================== 存量脏数据扫描报告 ==================');
  console.log(`扫描单位总数            : ${stats.totalUnits}`);
  console.log(`含 skills 数组的单位    : ${stats.unitsWithSkillsArray}`);
  console.log(`含 owner 技能映射的单位 : ${stats.unitsWithOwnerMap}`);
  console.log(`skill_key 为空的技能数  : ${stats.nullKeySkills}`);
  console.log(`  其中可反查回填        : ${stats.repairedSkills}` +
    (stats.repairedSkills ? ` (effect:${stats.byVia.effect || 0} / name:${stats.byVia.name || 0})` : ''));
  console.log(`  ⚠ 孤儿技能(方案B补全)  : ${stats.orphans.length}` +
    (stats.orphans.length ? ` (生成 custom_<slug> 占位 key，详见 orphans-glossary.json)` : ''));
  console.log(`驼峰键归一(skillsByOwner): ${stats.camelRenamedUnits}`);
  console.log('------------------------------------------------------');
  if (stats.orphans.length) {
    console.log('孤儿技能清单（已生成占位 key，待存储 A 补全效果）:');
    for (const o of stats.orphans) {
      console.log(`  · ${o.generated_key} <= owner=${o.owner} | name=${o.name ?? '∅'} | effect=${o.effect ?? '∅'}`);
    }
    console.log('------------------------------------------------------');
  }
  console.log(`待写回单位变更数        : ${pendingWrites.length}`);
  console.log('======================================================');

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] 未做任何修改。确认无误后运行: node scripts/migrate-contract-data.cjs --apply');
    return;
  }

  if (!APPLY) return;

  if (!pendingWrites.length) {
    console.log('\n[APPLY] 无需变更，跳过写入。');
    return;
  }

  // ── 方案 C：导出 orphans-glossary.json 补全清册（与写库解耦）──
  const orphansExport = {
    _comment: '方案 B+C 产出：孤儿技能占位 key 与中文展示名映射。后续在存储 A（glossary-skill-config.json）的 skills 下补齐对应 key 的特殊效果（effects[]）即可，无需再动数据库字段。',
    generatedAt: new Date().toISOString(),
    skills: {},
  };
  for (const o of stats.orphans) {
    orphansExport.skills[o.generated_key] = {
      name: o.name || o.effect || '',
      effect: o.effect || '',
      source_owner: o.owner,
      effects: [], // 待补全
    };
  }
  const exportPath = path.join(path.dirname(DB_PATH), 'orphans-glossary.json');
  fs.writeFileSync(exportPath, JSON.stringify(orphansExport, null, 2));
  console.log(`\n[APPLY] 已导出词条补全清册: ${exportPath}（${stats.orphans.length} 条）`);

  // ── 物理备份 ──
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const bakPath = `${DB_PATH}.${stamp}.bak`;
  fs.copyFileSync(DB_PATH, bakPath);
  console.log(`[APPLY] 已备份: ${bakPath}`);

  // ── 写回 ──
  const db2 = new SQL.Database(fs.readFileSync(DB_PATH));
  const stmtSkills = db2.prepare('UPDATE units SET skills = ? WHERE id = ?');
  const stmtAttr = db2.prepare('UPDATE units SET attributes = ? WHERE id = ?');
  db2.run('BEGIN TRANSACTION');
  for (const w of pendingWrites) {
    if (w.skillField === 'skills') stmtSkills.run([w.value, w.id]);
    else stmtAttr.run([w.value, w.id]);
  }
  db2.run('COMMIT');
  stmtSkills.free();
  stmtAttr.free();

  const out = db2.export();
  db2.close();
  fs.writeFileSync(DB_PATH, Buffer.from(out));
  console.log(`[APPLY] 已写入 ${pendingWrites.length} 条单位变更到 ${DB_PATH}`);
  console.log('[APPLY] 迁移完成。建议重启 gateway 容器使内存数据一致: docker compose restart mecha-gateway');
  });
}

main().catch((e) => {
  console.error('[MIGRATE] 执行失败:', e);
  process.exit(1);
});
