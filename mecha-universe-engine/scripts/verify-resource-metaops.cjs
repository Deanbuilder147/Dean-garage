/**
 * verify-resource-metaops.cjs
 * 验证《待实装深化内容清单》核心战斗结算与资源闭环：
 *   项3 资源扣减初始化与结算闭环
 *   项9 roll.segments[].effects[] 接通结算
 *   项4/5/6 meta_ops 闭环（unlock / dual_slot / permanent_disable）
 *
 * 运行：node scripts/verify-resource-metaops.cjs
 * 退出码 0=全绿，1=有失败。
 */
const path = require('path');
const SkillExecutor = require(path.join(__dirname, '..', 'services', 'combat-service', 'src', 'services', 'combatCore', 'skillExecutor.cjs'));

let pass = 0, fail = 0;
const log = (ok, name, detail) => {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} :: ${detail || ''}`); }
};

const mkUnit = (over = {}) => Object.assign({ id: 'u1', hp: 100, max_hp: 100, _meta: {}, q: 0, r: 0 }, over);
const mkTarget = (over = {}) => Object.assign({ id: 't1', hp: 100, max_hp: 100, _meta: {}, q: 1, r: 0 }, over);

const executor = new SkillExecutor();

console.log('\n=== 项3：资源扣减初始化与结算闭环 ===');
{
  // cost.charges = { initial: 2 }，按 skill_key 索引
  const unit = mkUnit();
  const def = {
    label: '充能技', action_type: 'attack', dice_type: '1d6',
    cost: { charges: { initial: 2 } },
    base_damage: 10,
  };
  const r1 = executor.executeUniversalSkill('zz_charge_test_001', unit, mkTarget(), {}, def);
  log(r1.triggered === true, '首次施放成功', JSON.stringify(r1));
  log(unit._meta.charges && unit._meta.charges.zz_charge_test_001 === 1, '首次后剩余充能=1', JSON.stringify(unit._meta.charges));
  const r2 = executor.executeUniversalSkill('zz_charge_test_001', unit, mkTarget(), {}, def);
  log(r2.triggered === true && unit._meta.charges.zz_charge_test_001 === 0, '二次后剩余充能=0', JSON.stringify(unit._meta.charges));
  const r3 = executor.executeUniversalSkill('zz_charge_test_001', unit, mkTarget(), {}, def);
  log(r3.triggered === false, '三次充能耗尽拦截', JSON.stringify(r3));
}
{
  // cost.durability 数字写法兼容
  const unit = mkUnit();
  const def = { label: '耐久技', action_type: 'attack', dice_type: '1d6', cost: { durability: 1 }, base_damage: 5 };
  const r1 = executor.executeUniversalSkill('dur_skill', unit, mkTarget(), {}, def);
  const r2 = executor.executeUniversalSkill('dur_skill', unit, mkTarget(), {}, def);
  log(r1.triggered === true && unit._meta.durability.dur_skill === 0, '耐久初始=1，首次后=0', JSON.stringify(unit._meta.durability));
  log(r2.triggered === false, '耐久耗尽拦截', JSON.stringify(r2));
}

console.log('\n=== 项9：roll.segments[].effects[] 接通结算 ===');
{
  const unit = mkUnit();
  const target = mkTarget({ atk_buff: 0 });
  const uf = {
    label: '掷骰触发技', action_type: 'attack', dice_type: '1d6',
    roll: { segments: [ { lower: 2, upper: 4, label: '中段', effects: [ { type: 'enter_stealth', stealthType: 'conceal' } ] } ] },
  };
  // 直接调用 _resolveRollSegments，固定点数 V=3 落入 [2,4]
  const out = executor._resolveRollSegments('seg_skill', unit, target, uf, 3, {});
  log(out.applied === 1, '段内 effects 经效果执行器结算 applied=1', JSON.stringify(out));
  log(unit.stealth === true, 'source 被施加隐身（效果副作用生效）', JSON.stringify({ stealth: unit.stealth }));
  log(!unit._meta.permanently_disabled_skills || unit._meta.permanently_disabled_skills.length === 0, '无永久失效写入', JSON.stringify(unit._meta));
}
{
  // V=5 不落入 [2,4]，无效果
  const unit = mkUnit();
  const target = mkTarget();
  const uf = { label: 'x', action_type: 'attack', dice_type: '1d6', roll: { segments: [ { lower: 2, upper: 4, label: 'm', effects: [ { type: 'enter_stealth', stealthType: 'conceal' } ] } ] } };
  const out = executor._resolveRollSegments('seg_skill', unit, target, uf, 5, {});
  log(out.applied === 0 && unit.stealth !== true, 'V=5 不匹配段，无效果', JSON.stringify(out));
}

console.log('\n=== 项9+modify_stat：真实数值修正端到端（根治伪成功） ===');
{
  // 瞬时修正：命中段内 modify_stat 直接写入 unit._meta.stat_modifiers
  const unit = mkUnit({ _meta: { stat_modifiers: {} } });
  const target = mkTarget();
  const uf = {
    label: '属性修正技', action_type: 'attack', dice_type: '1d6',
    roll: { segments: [ { lower: 2, upper: 4, label: '中段', effects: [ { type: 'modify_stat', stat_type: 'MELEE', value: 3 } ] } ] },
  };
  const out = executor._resolveRollSegments('zz_modstat_inst_010', unit, target, uf, 3, {});
  log(out.applied === 1, '段内 modify_stat 经效果执行器结算 applied=1', JSON.stringify(out));
  log(unit._meta.stat_modifiers.MELEE === 3, '瞬时修正累加到 stat_modifiers.MELEE=3', JSON.stringify(unit._meta.stat_modifiers));
}
{
  // 带 duration：作为 stat_modifier status 推入 statusEffects（双相位衰减挂载点）
  const unit = mkUnit({ statusEffects: [] });
  const target = mkTarget();
  const uf = {
    label: '持续修正技', action_type: 'attack', dice_type: '1d6',
    roll: { segments: [ { lower: 1, upper: 6, label: '全段', effects: [ { type: 'modify_stat', stat_type: 'MOBILITY', value: -5, duration: 2 } ] } ] },
  };
  const out = executor._resolveRollSegments('zz_modstat_dur_011', unit, target, uf, 3, {});
  log(out.applied === 1, '带 duration 的 modify_stat 结算 applied=1', JSON.stringify(out));
  const st = (unit.statusEffects || []).find((s) => s.type === 'stat_modifier' && s.stat_type === 'MOBILITY');
  log(!!st && st.value === -5 && st.duration === 2 && st.expiry_phase === 'turn_end',
    'stat_modifier status 挂载正确（value=-5, duration=2, turn_end 衰减）', JSON.stringify(st));
  log(unit._meta.stat_modifiers == null || unit._meta.stat_modifiers.MOBILITY == null,
    '带 duration 不污染瞬时修正表', JSON.stringify(unit._meta.stat_modifiers));
}
{
  // 修正目标单位：effect.target_unit 指向 target
  const unit = mkUnit({ _meta: {} });
  const target = mkTarget({ _meta: { stat_modifiers: {} } });
  const uf = {
    label: '修正目标技', action_type: 'attack', dice_type: '1d6',
    roll: { segments: [ { lower: 1, upper: 6, label: 'a', effects: [ { type: 'modify_stat', stat_type: 'DEFENSE', value: 8, target_unit: target } ] } ] },
  };
  executor._resolveRollSegments('zz_modstat_tgt_012', unit, target, uf, 3, {});
  log(target._meta.stat_modifiers.DEFENSE === 8 && (unit._meta.stat_modifiers == null || unit._meta.stat_modifiers.DEFENSE == null),
    'target_unit 指定时只修正目标单位', JSON.stringify({ t: target._meta.stat_modifiers, u: unit._meta.stat_modifiers }));
}
{
  // 前端表单结构对齐：target:'target' 字符串语义（编辑器 MODIFY_STAT 表单产出），应修正 context.target 而非施法者
  const unit = mkUnit({ _meta: { stat_modifiers: {} } });
  const target = mkTarget({ _meta: { stat_modifiers: {} } });
  const uf = {
    label: '前端结构对齐', action_type: 'attack', dice_type: '1d6',
    roll: { segments: [ { lower: 1, upper: 6, label: 'a', effects: [ { type: 'modify_stat', stat_type: 'RANGE', value: 2, duration: 0, target: 'target' } ] } ] },
  };
  executor._resolveRollSegments('zz_modstat_form_013', unit, target, uf, 3, { unit, target });
  log(target._meta.stat_modifiers.RANGE === 2 && (unit._meta.stat_modifiers.RANGE == null),
    "前端表单 target:'target' 只修正敌方目标（瞬时，stat_modifiers.RANGE=2）", JSON.stringify({ t: target._meta.stat_modifiers, u: unit._meta.stat_modifiers }));
}

console.log('\n=== 项5：dual_slot 双槽双路由 ===');
{
  const unit = mkUnit();
  const target = mkTarget();
  const uf = {
    label: '双槽技', action_type: 'attack', dice_type: '1d6',
    meta_ops: { dual_slot: true },
    roll: { segments: [ { lower: 1, upper: 6, label: '全段', effects: [ { type: 'enter_stealth', stealthType: 'conceal' } ] } ] },
  };
  const out = executor._resolveRollSegments('dual_skill', unit, target, uf, 3, {});
  log(out.applied === 2, '双槽：效果路由执行两遍 applied=2', JSON.stringify(out));
  log(unit.stealth === true, '双槽效果副作用生效 (stealth=true)', JSON.stringify({ stealth: unit.stealth }));
}
{
  // cost.slots===2 等价于双槽
  const unit = mkUnit();
  const target = mkTarget();
  const uf = { label: 'x', action_type: 'attack', dice_type: '1d6', cost: { slots: 2 }, roll: { segments: [ { lower: 1, upper: 6, label: 'a', effects: [ { type: 'enter_stealth', stealthType: 'conceal' } ] } ] } };
  const out = executor._resolveRollSegments('slot2', unit, target, uf, 3, {});
  log(out.applied === 2, 'cost.slots=2 双路由 applied=2', JSON.stringify(out));
}

console.log('\n=== 项4：unlock 解锁校验与触发 ===');
{
  // requires_unlock：未解锁拦截
  const unit = mkUnit();
  const def = { label: '锁技', action_type: 'attack', dice_type: '1d6', meta_ops: { requires_unlock: true }, base_damage: 5 };
  const r = executor.executeUniversalSkill('zz_locked_test_002', unit, mkTarget(), {}, def);
  log(r.triggered === false, '未解锁技能拦截结算', JSON.stringify(r));
  // unlock 触发：施放时写入 unlocked_skills
  const unit2 = mkUnit();
  const def2 = { label: '解锁器', action_type: 'attack', dice_type: '1d6', meta_ops: { unlock: ['zz_locked_test_002'] }, base_damage: 5 };
  const r2 = executor.executeUniversalSkill('zz_unlocker_test_003', unit2, mkTarget(), {}, def2);
  log(r2.triggered === true && unit2._meta.unlocked_skills.includes('zz_locked_test_002'), 'unlock 触发写入 unlocked_skills', JSON.stringify(unit2._meta.unlocked_skills));
  // 解锁后可施放
  const r3 = executor.executeUniversalSkill('zz_locked_test_002', unit2, mkTarget(), {}, def);
  log(r3.triggered === true, '已解锁后技能可施放', JSON.stringify(r3));
}

console.log('\n=== 项6：permanent_disable 永久失效闭环 ===');
{
  // 通过 segments 触发 permanent_disable_target，目标该技能被永久失效
  const target = mkUnit({ id: 'tvictim', _meta: {} });
  const unit = mkUnit();
  const uf = { label: 'x', action_type: 'attack', dice_type: '1d6', roll: { segments: [ { lower: 1, upper: 6, label: 'a', effects: [ { type: 'modify_stat', stat: 'atk_buff', amount: 0, permanent_disable_target: 'zz_victim_test_004' } ] } ] } };
  executor._resolveRollSegments('disabler', unit, target, uf, 3, {});
  log(target._meta.permanently_disabled_skills.includes('zz_victim_test_004'), 'permanent_disable_target 写入目标永久失效列表', JSON.stringify(target._meta.permanently_disabled_skills));
  // 该技能后续被拦截
  const victimDef = { label: '受害者技', action_type: 'attack', dice_type: '1d6', base_damage: 5 };
  const r = executor.executeUniversalSkill('zz_victim_test_004', target, mkTarget(), {}, victimDef);
  log(r.triggered === false, '永久失效技能拦截结算', JSON.stringify(r));
}

console.log('\n=== 项3+combatIntegrator 注入钩子 ===');
{
  const integ = require(path.join(__dirname, '..', 'services', 'combat-service', 'src', 'services', 'combatCore', 'combatIntegrator.cjs')); // 单例实例
  // 仅验证方法存在且对无技能单位零副作用
  const unit = mkUnit({ skills: [] });
  integ._initUnitSkillMeta(unit);
  log(unit._meta && Array.isArray(unit._meta.charges) === false, '_initUnitSkillMeta 对空技能单位安全', JSON.stringify(unit._meta));
}

console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail === 0 ? 0 : 1);
