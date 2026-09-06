/**
 * Database Migration: Add missing equipment columns
 * Adds defense, resistance, and extra equipment slot columns to battle_units table
 */

import db from '../db.js';

console.log('=== 数据库迁移：添加装备属性列 ===\n');

// 添加左手防具属性
console.log('添加左手防具属性列...');
try {
  db.db.exec(`ALTER TABLE battle_units ADD COLUMN left_hand_defense INTEGER DEFAULT 0`);
  console.log('  ✅ left_hand_defense');
} catch (e) {
  console.log('  ⚠️  left_hand_defense 已存在');
}

try {
  db.db.exec(`ALTER TABLE battle_units ADD COLUMN left_hand_resistance TEXT`);
  console.log('  ✅ left_hand_resistance');
} catch (e) {
  console.log('  ⚠️  left_hand_resistance 已存在');
}

// 添加右手防具属性
console.log('\n添加右手防具属性列...');
try {
  db.db.exec(`ALTER TABLE battle_units ADD COLUMN right_hand_defense INTEGER DEFAULT 0`);
  console.log('  ✅ right_hand_defense');
} catch (e) {
  console.log('  ⚠️  right_hand_defense 已存在');
}

try {
  db.db.exec(`ALTER TABLE battle_units ADD COLUMN right_hand_resistance TEXT`);
  console.log('  ✅ right_hand_resistance');
} catch (e) {
  console.log('  ⚠️  right_hand_resistance 已存在');
}

// 添加额外装备槽
console.log('\n添加额外装备槽列...');
try {
  db.db.exec(`ALTER TABLE battle_units ADD COLUMN extra_type TEXT`);
  console.log('  ✅ extra_type');
} catch (e) {
  console.log('  ⚠️  extra_type 已存在');
}

try {
  db.db.exec(`ALTER TABLE battle_units ADD COLUMN extra_name TEXT`);
  console.log('  ✅ extra_name');
} catch (e) {
  console.log('  ⚠️  extra_name 已存在');
}

try {
  db.db.exec(`ALTER TABLE battle_units ADD COLUMN extra_melee INTEGER DEFAULT 0`);
  console.log('  ✅ extra_melee');
} catch (e) {
  console.log('  ⚠️  extra_melee 已存在');
}

try {
  db.db.exec(`ALTER TABLE battle_units ADD COLUMN extra_ranged INTEGER DEFAULT 0`);
  console.log('  ✅ extra_ranged');
} catch (e) {
  console.log('  ⚠️  extra_ranged 已存在');
}

try {
  db.db.exec(`ALTER TABLE battle_units ADD COLUMN extra_defense INTEGER DEFAULT 0`);
  console.log('  ✅ extra_defense');
} catch (e) {
  console.log('  ⚠️  extra_defense 已存在');
}

try {
  db.db.exec(`ALTER TABLE battle_units ADD COLUMN extra_durability INTEGER DEFAULT 0`);
  console.log('  ✅ extra_durability');
} catch (e) {
  console.log('  ⚠️  extra_durability 已存在');
}

try {
  db.db.exec(`ALTER TABLE battle_units ADD COLUMN extra_resistance TEXT`);
  console.log('  ✅ extra_resistance');
} catch (e) {
  console.log('  ⚠️  extra_resistance 已存在');
}

// 添加装备名称列（已有但补充完整）
console.log('\n添加装备名称列...');
try {
  db.db.exec(`ALTER TABLE battle_units ADD COLUMN left_hand_name TEXT`);
  console.log('  ✅ left_hand_name');
} catch (e) {
  console.log('  ⚠️  left_hand_name 已存在');
}

try {
  db.db.exec(`ALTER TABLE battle_units ADD COLUMN right_hand_name TEXT`);
  console.log('  ✅ right_hand_name');
} catch (e) {
  console.log('  ⚠️  right_hand_name 已存在');
}

console.log('\n=== 迁移完成 ===');
console.log(' battle_units 表现在包含完整的装备系统支持:');
console.log('  - 左手装备 (武器/防具)');
console.log('  - 右手装备 (武器/防具)');
console.log('  - 额外装备槽');
console.log('  - 防御值、耐久度、抗性类型');
