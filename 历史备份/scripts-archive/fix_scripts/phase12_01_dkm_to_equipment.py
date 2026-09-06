#!/usr/bin/env python3
"""Phase 12.1: dkm 平坦字段 → 装备对象映射
- combatResolver.js: _mapDkmToEquipment() 在 executeTurn 中映射
- damagePipe.cjs: _calcArmorReduction 扩展槽位支持 left_hand/right_hand/extra
"""

import re

BASE = '/root/original-project'

# ============ 1. combatResolver.js: 添加 _mapDkmToEquipment ============
resolver_path = f'{BASE}/services/combat-service/src/services/combatResolver.js'
with open(resolver_path, 'r') as f:
    resolver = f.read()

# 在 executeTurn 开头添加 dkm 映射调用
old_exe = '''        // Phase 10: 提取激活的技能效果 (含泛化 bonus_value)
        const activeSkillBonuses = this._extractSkillBonuses(attacker, resolvedSkill) || {};'''

new_exe = '''        // Phase 12: dkm 平坦字段 → 装备对象映射
        const attackerEquipment = this._mapDkmToEquipment(attacker);
        const defenderEquipment = this._mapDkmToEquipment(defender);

        // Phase 10: 提取激活的技能效果 (含泛化 bonus_value)
        const activeSkillBonuses = this._extractSkillBonuses(attacker, resolvedSkill) || {};'''

resolver = resolver.replace(old_exe, new_exe)

# 修改 attacker/defender 中 equipment 字段使用映射后的值
old_attacker_eq = '''                z: attacker.z ?? attacker.height ?? 0,
                height: attacker.height ?? attacker.z ?? 0,
                equipment: attacker.equipment || {}
            },'''
new_attacker_eq = '''                z: attacker.z ?? attacker.height ?? 0,
                height: attacker.height ?? attacker.z ?? 0,
                equipment: attackerEquipment
            },'''
resolver = resolver.replace(old_attacker_eq, new_attacker_eq)

old_defender_eq = '''                equipment: defender.equipment || {},
                skills: defender.skills || [],'''
new_defender_eq = '''                equipment: defenderEquipment,
                skills: defender.skills || [],'''
resolver = resolver.replace(old_defender_eq, new_defender_eq)

# 在 reset() 之后添加 _mapDkmToEquipment 方法
old_export = 'export { CombatResolver };'

new_method = '''    /**
     * Phase 12: 将平坦 dkm 字段映射为装备对象
     * unit.left_dkm_beam → equipment.left_hand.damage_kind_modifiers.beam
     */
    _mapDkmToEquipment(unit) {
        if (!unit) return {};
        // 先保留已有的 equipment（如果有）
        const eq = (unit.equipment && typeof unit.equipment === 'object') ? { ...unit.equipment } : {};
        const DAMAGE_KINDS = ['beam', 'kinetic', 'explosive', 'corrosive', 'thermal'];
        const SLOT_MAP = { left: 'left_hand', right: 'right_hand', extra: 'other' };

        for (const [flatPrefix, eqSlot] of Object.entries(SLOT_MAP)) {
            const typeKey = `${flatPrefix}_type`;
            if (!unit[typeKey] || unit[typeKey] === 'none') continue;

            const mods = {};
            let hasAny = false;
            for (const kind of DAMAGE_KINDS) {
                const val = unit[`${flatPrefix}_dkm_${kind}`];
                if (val !== undefined && val !== null && val !== 0) {
                    mods[kind] = Number(val);
                    hasAny = true;
                }
            }
            if (hasAny) {
                if (!eq[eqSlot]) eq[eqSlot] = {};
                eq[eqSlot].damage_kind_modifiers = mods;
            }
        }
        return eq;
    }

    /**
     * Phase 12: 处理外部手动摇骰结果（实例方法，供 WebSocket/HTTP 调用）
     * @param {string} turnId - 战斗回合 ID
     * @param {Object} rollResult
     */
    processManualRollResult(turnId, rollResult) {
        const pending = CombatResolver._manualRollPending.get(turnId);
        if (!pending) {
            console.warn(`[Phase12] 未找到挂起的手动摇骰 turnId=${turnId}`);
            return false;
        }
        clearTimeout(pending.timeout);
        CombatResolver._manualRollPending.delete(turnId);
        const isSuccess = rollResult.roll >= (rollResult.successLine ?? 4);
        const bonus = isSuccess ? (rollResult.bonus_damage ?? rollResult.bonus ?? 0) : 0;
        pending.resolve({
            roll: rollResult.roll,
            diceType: rollResult.dice_type || '1d6',
            successLine: rollResult.success_line ?? 4,
            isSuccess,
            bonus
        });
        return true;
    }

export { CombatResolver };'''

resolver = resolver.replace(old_export, new_method)

# 修改 reset() 中的 manualRollPending 引用为静态存储
old_reset_roll = '''        this.manualRollPending.forEach(({ reject, timeout }) => {
            clearTimeout(timeout);
            reject(new Error('战斗重置'));
        });
        this.manualRollPending.clear();'''

new_reset_roll = '''        if (CombatResolver._manualRollPending) {
            CombatResolver._manualRollPending.forEach(({ reject, timeout }) => {
                clearTimeout(timeout);
                reject(new Error('战斗重置'));
            });
            CombatResolver._manualRollPending.clear();
        }'''

if old_reset_roll in resolver:
    resolver = resolver.replace(old_reset_roll, new_reset_roll)

with open(resolver_path, 'w') as f:
    f.write(resolver)
print('[OK] combatResolver.js: _mapDkmToEquipment + processManualRollResult 更新完成')

# ============ 2. damagePipe.cjs: 扩展 _calcArmorReduction 槽位 ============
pipe_path = f'{BASE}/services/combat-service/src/services/combatCore/damagePipe.cjs'
with open(pipe_path, 'r') as f:
    pipe = f.read()

# 扩展装备槽位列表
old_slots = "        for (const slot of ['full_armor', 'coating', 'shield_gen', 'reactive_armor']) {"
new_slots = "        // Phase 12: 扩展槽位支持手部/其它装备\n        for (const slot of ['full_armor', 'coating', 'shield_gen', 'reactive_armor', 'left_hand', 'right_hand', 'other']) {"

pipe = pipe.replace(old_slots, new_slots)

with open(pipe_path, 'w') as f:
    f.write(pipe)
print('[OK] damagePipe.cjs: _calcArmorReduction 槽位扩展完成')
