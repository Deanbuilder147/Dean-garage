#!/usr/bin/env python3
"""Phase 12.1 v2: dkm 平坦字段 → 装备对象映射
- combatResolver.js: _mapDkmToEquipment 在 class 内部
- damagePipe.cjs: _calcArmorReduction 扩展槽位
"""

BASE = '/root/original-project'

# ============ 1. combatResolver.js ============
resolver_path = f'{BASE}/services/combat-service/src/services/combatResolver.js'
with open(resolver_path, 'r') as f:
    resolver = f.read()

# Step A: 在 class 内部 reset() 之前添加 _mapDkmToEquipment
old_reset_method = '''    reset() {
        this.fogActive = false;
        this.fireCoverageUsed = false;
        this.durability.reset();
        this.skillExecutor.resetStableForBattle();
        this.manualRollPending = new Map();
    }'''

new_reset_with_map = '''    /**
     * Phase 12: 将平坦 dkm 字段映射为装备对象
     * unit.left_dkm_beam → equipment.left_hand.damage_kind_modifiers.beam
     */
    _mapDkmToEquipment(unit) {
        if (!unit) return {};
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

    reset() {
        this.fogActive = false;
        this.fireCoverageUsed = false;
        this.durability.reset();
        this.skillExecutor.resetStableForBattle();
        this.manualRollPending = new Map();
    }'''

resolver = resolver.replace(old_reset_method, new_reset_with_map)
print('[Step A] _mapDkmToEquipment 添加到 class 内部')

# Step B: 在 executeTurn 中调用 _mapDkmToEquipment
old_exe = '''        // Phase 10: 提取激活的技能效果 (含泛化 bonus_value)
        const activeSkillBonuses = this._extractSkillBonuses(attacker, resolvedSkill) || {};'''

new_exe = '''        // Phase 12: dkm 平坦字段 → 装备对象映射
        const attackerEquipment = this._mapDkmToEquipment(attacker);
        const defenderEquipment = this._mapDkmToEquipment(defender);

        // Phase 10: 提取激活的技能效果 (含泛化 bonus_value)
        const activeSkillBonuses = this._extractSkillBonuses(attacker, resolvedSkill) || {};'''

resolver = resolver.replace(old_exe, new_exe)
print('[Step B] executeTurn 中调用 _mapDkmToEquipment')

# Step C: 替换 equipment 字段
old_att_eq = '''                z: attacker.z ?? attacker.height ?? 0,
                height: attacker.height ?? attacker.z ?? 0,
                equipment: attacker.equipment || {}
            },'''
new_att_eq = '''                z: attacker.z ?? attacker.height ?? 0,
                height: attacker.height ?? attacker.z ?? 0,
                equipment: attackerEquipment
            },'''
resolver = resolver.replace(old_att_eq, new_att_eq)

old_def_eq = '''                equipment: defender.equipment || {},
                skills: defender.skills || [],'''
new_def_eq = '''                equipment: defenderEquipment,
                skills: defender.skills || [],'''
resolver = resolver.replace(old_def_eq, new_def_eq)
print('[Step C] equipment 字段映射完成')

# Step D: 更新 resolveAttack 静态方法支持 external_roll_result
old_resolve = """CombatResolver.resolveAttack = function(attacker, target, attack_type, skill_id) {
    const res = new CombatResolver();
    return res.executeTurn(attacker, target, { attack_type, skill_id });
};"""

new_resolve = """CombatResolver.resolveAttack = function(attacker, target, attack_type, skill_id, external_roll_result) {
    const res = new CombatResolver();
    return res.executeTurn(attacker, target, { attack_type, skill_id, external_roll_result: external_roll_result || null });
};"""

resolver = resolver.replace(old_resolve, new_resolve)
print('[Step D] resolveAttack 支持 external_roll_result')

# Step E: 修改 processManualRollResult 使用静态 Map
# 先看 class 内的 processManualRollResult
old_proc = '''    processManualRollResult(turnId, rollResult) {
        const pending = this.manualRollPending.get(turnId);'''
new_proc = '''    processManualRollResult(turnId, rollResult) {
        const pending = CombatResolver._manualRollPending.get(turnId);'''
resolver = resolver.replace(old_proc, new_proc)

old_proc2 = '''        if (!pending) {
            console.warn(`[Phase11] 未找到挂起的手动摇骰 turnId=${turnId}`);
            return false;
        }
        clearTimeout(pending.timeout);
        this.manualRollPending.delete(turnId);'''
new_proc2 = '''        if (!pending) {
            console.warn(`[Phase12] 未找到挂起的手动摇骰 turnId=${turnId}`);
            return false;
        }
        clearTimeout(pending.timeout);
        CombatResolver._manualRollPending.delete(turnId);'''
resolver = resolver.replace(old_proc2, new_proc2)

# Step F: 将 constructor 中的 manualRollPending 改为静态
old_ctor = '''        this.skillExecutor.resetStableForBattle();
        this.manualRollPending = new Map();
    }'''
new_ctor = '''        this.skillExecutor.resetStableForBattle();
        CombatResolver._manualRollPending = CombatResolver._manualRollPending || new Map();
    }'''
resolver = resolver.replace(old_ctor, new_ctor)

# Step G: 更新 reset() 中的清理
old_reset_cleanup = '''        this.manualRollPending.forEach(({ reject, timeout }) => {
            clearTimeout(timeout);
            reject(new Error('战斗重置'));
        });
        this.manualRollPending.clear();'''
new_reset_cleanup = '''        if (CombatResolver._manualRollPending) {
            CombatResolver._manualRollPending.forEach(({ reject, timeout }) => {
                clearTimeout(timeout);
                reject(new Error('战斗重置'));
            });
            CombatResolver._manualRollPending.clear();
        }'''
resolver = resolver.replace(old_reset_cleanup, new_reset_cleanup)

with open(resolver_path, 'w') as f:
    f.write(resolver)
print('[OK] combatResolver.js 全部更新完成')

# ============ 2. damagePipe.cjs ============
pipe_path = f'{BASE}/services/combat-service/src/services/combatCore/damagePipe.cjs'
with open(pipe_path, 'r') as f:
    pipe = f.read()

old_slots = "        for (const slot of ['full_armor', 'coating', 'shield_gen', 'reactive_armor']) {"
new_slots = "        // Phase 12: 扩展槽位支持手部/其它装备 dkm\n        for (const slot of ['full_armor', 'coating', 'shield_gen', 'reactive_armor', 'left_hand', 'right_hand', 'other']) {"
pipe = pipe.replace(old_slots, new_slots)

with open(pipe_path, 'w') as f:
    f.write(pipe)
print('[OK] damagePipe.cjs 槽位扩展完成')
