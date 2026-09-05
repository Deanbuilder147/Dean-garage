// ================================================================
// battle/glossary/atomGroups.js
// 语义原子面板数据（从 GlossaryStudio.vue L1624-1757 逐字抽出，13 组 / 90 个原子）
// 约束（源注释 L1620-1623）：
//   ★ effectType 必须是引擎 effectExecutor handler 真名（或已注册别名），
//     写回词条时直接作为 effect.type，禁止再用 UI 分类名(status/damage/meta/cost)。
//   fields: [{ key, label, type:'number'|'text'|'bool'|'select'|'json', options?, default, fixed? }]
//   数字字段支持「固定值 / 公式」双模。
// 纯数据，不 import vue。
// ================================================================

export const atomGroups = [
  { grp: 'A', title: 'A · 触发时机 WHEN', enTitle: 'Trigger Timing', atoms: [
    { grp: 'A', key: 'on_attacked', label: 'A1 受击时', enLabel: 'On Attacked', effectType: 'trigger', st: 'ok', fields: [{ key: 'source', label: '来袭类型', type: 'select', options: ['any', 'melee', 'ranged'], default: 'any' }] },
    { grp: 'A', key: 'on_damage_dealt', label: 'A2 造成伤害后', enLabel: 'On Damage Dealt', effectType: 'trigger', st: 'ok', fields: [{ key: 'source', label: '伤害来源', type: 'select', options: ['self'], default: 'self' }, { key: 'min_damage', label: '最低伤害门槛', type: 'number', default: 0 }] },
    { grp: 'A', key: 'post_melee_damage', label: 'A3 近战伤害结算后', enLabel: 'Post Melee Damage', effectType: 'trigger', st: 'ok', fields: [{ key: 'attack_stat', label: '攻击属性', type: 'select', options: ['melee'], default: 'melee' }] },
    { grp: 'A', key: 'on_kill', label: 'A4 击杀时', enLabel: 'On Kill', effectType: 'trigger', st: 'ok', fields: [{ key: 'source', label: '击杀者', type: 'select', options: ['self'], default: 'self' }] },
    { grp: 'A', key: 'on_attack_start', label: 'A5 攻击开始时', enLabel: 'On Attack Start', effectType: 'trigger', st: 'ok', fields: [] },
    { grp: 'A', key: 'on_target_selected', label: 'A6 目标选定时', enLabel: 'On Target Selected', effectType: 'trigger', st: 'ok', fields: [{ key: 'gate', label: '可否决选定', type: 'bool', default: false }] },
    { grp: 'A', key: 'on_turn_start', label: 'A7 回合开始', enLabel: 'On Turn Start', effectType: 'trigger', st: 'alias', fields: [{ key: 'faction', label: '所属阵营', type: 'text', default: 'self 自身' }] },
    { grp: 'A', key: 'on_round_start', label: 'A8 轮次开始', enLabel: 'On Round Start', effectType: 'trigger', st: 'alias', fields: [{ key: 'from_round', label: '生效起始轮', type: 'number', default: 1 }] },
    { grp: 'A', key: 'on_ally_attacked', label: 'A9 友军受击时', enLabel: 'On Ally Attacked', effectType: 'trigger', st: 'ok', fields: [{ key: 'radius', label: '感知半径·格', type: 'number', default: 99 }] },
    { grp: 'A', key: 'on_move_path', label: 'A10 移动路径计算时', enLabel: 'On Move Path', effectType: 'trigger', st: 'ok', fields: [] },
    { grp: 'A', key: 'on_airdrop_received', label: 'A11 获得空投时', enLabel: 'On Airdrop Received', effectType: 'trigger', st: 'ok', fields: [{ key: 'from_round', label: '生效起始轮', type: 'number', default: 2 }] },
    { grp: 'A', key: 'on_step_point', label: 'A12 踩点时', enLabel: 'On Step Point', effectType: 'trigger', st: 'ok', fields: [{ key: 'point_type', label: '标记点类型', type: 'text', default: 'recon 侦察点' }] },
    { grp: 'A', key: 'manual', label: '手动释放', enLabel: 'Manual', effectType: 'trigger', st: 'ok', fields: [{ key: 'phase', label: '可释放相位', type: 'select', options: ['any', 'turn_start', 'turn_end'], default: 'any' }] }
  ] },
  { grp: 'B', title: 'B · 条件门槛 IF', enTitle: 'Condition Gate', atoms: [
    { grp: 'B', key: 'in_range', label: 'B1 射程内', enLabel: 'In Range', effectType: 'condition', st: 'ok', fields: [{ key: 'from', label: '起点', type: 'select', options: ['self'], default: 'self' }, { key: 'to', label: '终点', type: 'select', options: ['target'], default: 'target' }, { key: 'min_range', label: '最小射程·格', type: 'number', default: 1 }, { key: 'max_range', label: '最大射程·格', type: 'number', default: 3 }] },
    { grp: 'B', key: 'mutual_in_range', label: 'B2 互在射程', enLabel: 'Mutual In Range', effectType: 'condition', st: 'ok', fields: [{ key: 'a', label: '对比方A', type: 'select', options: ['self'], default: 'self' }, { key: 'b', label: '对比方B', type: 'select', options: ['target'], default: 'target' }] },
    { grp: 'B', key: 'hp_compare', label: 'B3 HP 阈值', enLabel: 'HP Compare', effectType: 'condition', st: 'ok', fields: [{ key: 'subject', label: '判定对象', type: 'select', options: ['target'], default: 'target' }, { key: 'op', label: '比较符', type: 'select', options: ['<', '<=', '>', '>=', '=='], default: '>' }, { key: 'value', label: '阈值', type: 'number', default: 5 }, { key: 'is_percent', label: '按百分比', type: 'bool', default: false }] },
    { grp: 'B', key: 'stat_compare', label: 'B4 属性对比', enLabel: 'Stat Compare', effectType: 'condition', st: 'ok', fields: [{ key: 'a', label: '对比方A', type: 'select', options: ['self'], default: 'self' }, { key: 'b', label: '对比方B', type: 'select', options: ['target'], default: 'target' }, { key: 'stat', label: '对比属性', type: 'select', options: ['melee', 'shooting', 'mobility'], default: 'melee' }, { key: 'op', label: '比较符', type: 'select', options: ['>'], default: '>' }] },
    { grp: 'B', key: 'collinear', label: 'B5 三单位共线', enLabel: 'Collinear', effectType: 'collinear', st: 'ok', fields: [{ key: 'align', label: '共线轴向', type: 'select', options: ['any', 'horizontal', 'diagonal'], default: 'any' }, { key: 'count', label: '并列单位数', type: 'number', default: 3 }, { key: 'faction', label: '阵营要求', type: 'select', options: ['same', 'enemy', 'any'], default: 'same' }] },
    { grp: 'B', key: 'terrain_match', label: 'B6 地形匹配', enLabel: 'Terrain Match', effectType: 'condition', st: 'ok', fields: [{ key: 'terrain', label: '地形', type: 'select', options: ['plain', 'forest', 'mountain', 'water', 'ruin', 'crystal', 'moon'], default: 'plain' }] },
    { grp: 'B', key: 'damage_kind_match', label: 'B7 伤害种类匹配', enLabel: 'Damage Kind Match', effectType: 'condition', st: 'ok', fields: [{ key: 'kind', label: '伤害种类', type: 'select', options: ['kinetic', 'beam'], default: 'kinetic' }] },
    { grp: 'B', key: 'charge_stack', label: 'B8 充能层数就绪', enLabel: 'Charge Stack', effectType: 'charge_stack', st: 'ok', fields: [{ key: 'charge_layers', label: '所需充能层数', type: 'number', default: 3 }, { key: 'consume', label: '发动后消耗', type: 'bool', default: true }] },
    { grp: 'B', key: 'not_in_scan', label: 'B9 不在扫描范围', enLabel: 'Not In Scan', effectType: 'condition', st: 'ok', fields: [{ key: 'radius', label: '敌方扫描半径·格', type: 'number', default: 2 }] },
    { grp: 'B', key: 'cooldown', label: 'B10 冷却就绪', enLabel: 'Cooldown', effectType: 'cooldown', st: 'ok', fields: [{ key: 'cooldown', label: '冷却回合数', type: 'number', default: 1 }, { key: 'scope', label: '作用域', type: 'select', options: ['self', 'skill'], default: 'skill' }] }
  ] },
  { grp: 'C', title: 'C · 数值生成与判定 ROLL', enTitle: 'Roll & Resolution', atoms: [
    { grp: 'C', key: 'roll_none', label: 'C1 无判定', enLabel: 'Roll None', effectType: 'roll_segment', st: 'ok', fields: [] },
    { grp: 'C', key: 'roll_segments', label: 'C2 单数值二分', enLabel: 'Roll Segments', effectType: 'roll_segment', st: 'ok', fields: [{ key: 'method', label: '生成方式', type: 'select', options: ['dice', 'spinner', 'card', 'rps'], default: 'dice' }, { key: 'sides', label: '骰面数', type: 'number', default: 6 }] },
    { grp: 'C', key: 'roll_segments_m', label: 'C3 单数值多段', enLabel: 'Roll Segments Multi', effectType: 'roll_segment', st: 'ok', fields: [{ key: 'method', label: '生成方式', type: 'select', options: ['dice'], default: 'dice' }, { key: 'sides', label: '骰面数', type: 'number', default: 6 }, { key: 'segment_count', label: '分段数量', type: 'number', default: 3 }] },
    { grp: 'C', key: 'duel_resolution', label: 'C4 对抗数值', enLabel: 'Duel Resolution', effectType: 'roll_segment', st: 'ok', fields: [{ key: 'a', label: '对抗方A', type: 'select', options: ['self'], default: 'self' }, { key: 'b', label: '对抗方B', type: 'select', options: ['target'], default: 'target' }, { key: 'compare', label: '胜负比较', type: 'select', options: ['>', '>='], default: '>' }, { key: 'tie', label: '平局处理', type: 'select', options: ['mutual_destruction', 'none'], default: 'mutual_destruction' }] },
    { grp: 'C', key: 'damage_bonus_dice', label: 'C5 数值参与运算', enLabel: 'Damage Bonus Dice', effectType: 'roll_segment', st: 'ok', fields: [{ key: 'bind_to', label: '结果绑定字段', type: 'text', default: 'flat_value 伤害数值' }, { key: 'base', label: '基数', type: 'number', default: 0 }, { key: 'coefficient', label: '系数', type: 'number', default: 1 }] },
    { grp: 'C', key: 'roll_segments_color', label: 'C6 数值分色', enLabel: 'Roll Segments Color', effectType: 'roll_segment', st: 'ok', fields: [{ key: 'palette', label: '色板', type: 'text', default: 'red 红,black 黑' }, { key: 'mapping', label: '点数→颜色映射', type: 'text', default: '1-3:red;4-6:black' }] },
    { grp: 'C', key: 'roll_check_compare_to', label: 'C7 数值 vs 动态值', enLabel: 'Roll Check Compare To', effectType: 'roll_segment', st: 'ok', fields: [{ key: 'op', label: '比较符', type: 'select', options: ['>='], default: '>=' }, { key: 'compare_to', label: '动态比较对象', type: 'text', default: 'target.hp 目标剩余生命' }] },
    { grp: 'C', key: 'manual_roll', label: '手动掷骰', enLabel: 'Manual Roll', effectType: 'roll_segment', st: 'ok', fields: [{ key: 'prompt', label: '提示文案', type: 'text', default: '请掷骰' }] }
  ] },
  { grp: 'D', title: 'D · 效果·伤害 DO', enTitle: 'Damage', atoms: [
    { grp: 'D', key: 'direct_damage', label: 'D1 伤害加减值', enLabel: 'Direct Damage', effectType: 'direct_damage', st: 'ok', fields: [{ key: 'damage_mode', label: '伤害模式', type: 'select', options: [{ label: '固定值', value: 'flat' }, { label: '覆盖', value: 'override' }, { label: '倍率', value: 'multiplier' }], default: 'flat' }, { key: 'flat_value', label: '伤害数值·负为减', type: 'number', default: 10 }, { key: 'fixed_rate_multiplier', label: '伤害倍率', type: 'number', default: 1 }, { key: 'armor_pen', label: '护甲穿透', type: 'number', default: 0 }] },
    { grp: 'D', key: 'damage_reduction', label: 'D2 按 kind 减免', enLabel: 'Damage Reduction', effectType: 'damage_reduction', st: 'ok', fields: [{ key: 'kind', label: '伤害种类', type: 'select', options: ['kinetic', 'beam'], default: 'kinetic' }, { key: 'flat_reduction', label: '固定减免值', type: 'number', default: 3 }, { key: 'rate', label: '减免系数', type: 'number', default: 1 }] },
    { grp: 'D', key: 'direct_damage_split', label: 'D3 伤害均摊', enLabel: 'Direct Damage Split', effectType: 'direct_damage_split', st: 'ok', fields: [{ key: 'total_damage', label: '待均摊总伤害', type: 'number', default: 10 }, { key: 'split', label: '均摊方式', type: 'select', options: ['equally', 'weighted'], default: 'equally' }, { key: 'target_scope', label: '作用范围', type: 'select', options: ['area'], default: 'area' }, { key: 'min_per_target', label: '每目标最低伤害', type: 'number', default: 0 }] },
    { grp: 'D', key: 'damage_share', label: 'D4 伤害分担', enLabel: 'Damage Share', effectType: 'damage_share', st: 'ok', fields: [{ key: 'ratio', label: '分担比例', type: 'number', default: 0.5 }, { key: 'scope', label: '承接方', type: 'select', options: ['ally', 'self'], default: 'ally' }] },
    { grp: 'D', key: 'instant_kill', label: 'D5 即死', enLabel: 'Instant Kill', effectType: 'instant_kill', st: 'ok', fields: [] },
    { grp: 'D', key: 'armor_pierce', label: 'D6 护甲穿透', enLabel: 'Armor Pierce', effectType: 'armor_pierce', st: 'ok', fields: [{ key: 'pierce_ratio', label: '穿透比例', type: 'number', default: 0.5 }, { key: 'min_armor', label: '保留护甲下限比', type: 'number', default: 0.2 }] },
    { grp: 'D', key: 'reflect_damage', label: 'D7 伤害反伤', enLabel: 'Reflect Damage', effectType: 'reflect_damage', st: 'ok', fields: [{ key: 'ratio', label: '反伤比例', type: 'number', default: 0.5 }, { key: 'guard', label: '递归防护层', type: 'number', default: 3 }] },
    { grp: 'D', key: 'duel_resolution_k', label: 'D8 同归于尽', enLabel: 'Duel Resolution Mutual', effectType: 'duel_resolution', st: 'ok', fields: [{ key: 'targets', label: '同归对象', type: 'text', default: 'self 自身,enemy 敌方' }] },
    { grp: 'D', key: 'modify_stat_delay', label: 'D9 延迟易伤标记', enLabel: 'Modify Stat Delayed', effectType: 'modify_stat', st: 'ok', fields: [{ key: 'target_stat', label: '修改属性', type: 'text', default: 'DMG_TAKEN 受到伤害' }, { key: 'value', label: '增减值', type: 'number', default: 5 }, { key: 'delay', label: '延迟回合数', type: 'number', default: 1 }, { key: 'duration', label: '持续回合数', type: 'number', default: 1 }] }
  ] },
  { grp: 'E', title: 'E · 效果·资源 DO', enTitle: 'Resource', atoms: [
    { grp: 'E', key: 'resource_recovery', label: 'E1 HP 回复', enLabel: 'Resource Recovery', effectType: 'resource_recovery', st: 'ok', fields: [{ key: 'resource', label: '回复资源', type: 'select', options: ['hp', 'energy', 'ap', 'shield'], default: 'hp' }, { key: 'amount', label: '回复量', type: 'number', default: 8 }, { key: 'by', label: '计算方式', type: 'select', options: ['flat', 'stat_coeff', 'terrain'], default: 'flat' }, { key: 'coefficient', label: '系数', type: 'number', default: 1 }] },
    { grp: 'E', key: 'resource_recovery_d', label: 'E2 装备耐久回复', enLabel: 'Resource Recovery Durability', effectType: 'resource_recovery', st: 'ok', fields: [{ key: 'resource', label: '回复资源', type: 'text', default: 'equipment_durability 装备耐久' }, { key: 'amount', label: '回复量', type: 'number', default: 1 }] },
    { grp: 'E', key: 'durability_consumption', label: 'E3 耐久扣减', enLabel: 'Durability Consumption', effectType: 'durability_consumption', st: 'ok', fields: [{ key: 'value', label: '扣减值', type: 'number', default: 1 }, { key: 'slot', label: '装备槽位', type: 'select', options: ['weapon', 'armor'], default: 'weapon' }] },
    // ★ 2026-09-02 新增 COST 代价三原子（后端 C_AP_COST / C_ENERGY_COST / C_DURABILITY_COST，
    //   handleCostAp / handleCostEnergy / 耐久 均为真实扣减实现，下限 0；guard amount≥1）
    { grp: 'E', key: 'cost_ap', label: 'E4 AP 代价', enLabel: 'Cost AP', effectType: 'cost_ap', st: 'ok', fields: [{ key: 'amount', label: '消耗 AP', type: 'number', default: 1 }] },
    { grp: 'E', key: 'cost_energy', label: 'E5 能量代价', enLabel: 'Cost Energy', effectType: 'cost_energy', st: 'ok', fields: [{ key: 'amount', label: '消耗能量', type: 'number', default: 1 }] },
    { grp: 'E', key: 'cost_durability', label: 'E6 耐久代价', enLabel: 'Cost Durability', effectType: 'cost_durability', st: 'ok', fields: [{ key: 'amount', label: '消耗耐久', type: 'number', default: 1 }] }
  ] },
  { grp: 'F', title: 'F · 效果·状态 DO', enTitle: 'Status', atoms: [
    { grp: 'F', key: 'modify_stat', label: 'F1 属性增减益', enLabel: 'Modify Stat', effectType: 'modify_stat', st: 'ok', fields: [{ key: 'target_stat', label: '修改属性', type: 'select', options: ['melee', 'shooting', 'mobility', 'defense'], default: 'melee' }, { key: 'value', label: '增减值', type: 'number', default: 2 }, { key: 'duration', label: '持续回合数', type: 'number', default: 2 }] },
    { grp: 'F', key: 'modify_stat_m', label: 'F2 机动差项修正', enLabel: 'Modify Stat Mobility', effectType: 'modify_stat', st: 'ok', fields: [{ key: 'target_stat', label: '修改属性', type: 'text', default: 'MOBILITY 机动值' }, { key: 'value', label: '增减值', type: 'number', default: -2 }, { key: 'stacks', label: '叠加层数', type: 'number', default: 1 }] },
    { grp: 'F', key: 'skip_mobility', label: 'F3 跳过机动判定', enLabel: 'Skip Mobility', effectType: 'skip_mobility', st: 'ok', fields: [{ key: 'scope', label: '生效范围', type: 'select', options: ['this_attack', 'this_turn'], default: 'this_attack' }] },
    { grp: 'F', key: 'charge_layer', label: 'F4 充能层（N 次）', enLabel: 'Charge Layer', effectType: 'charge_layer', st: 'ok', fields: [{ key: 'charge_layers', label: '充能总层数', type: 'number', default: 3 }, { key: 'consume_per_use', label: '每次消耗层数', type: 'number', default: 1 }, { key: 'on_event', label: '消耗触发事件', type: 'text', default: 'on_damage_dealt 造成伤害后' }] },
    { grp: 'F', key: 'mutual_exclusion', label: 'F5 互斥组', enLabel: 'Mutual Exclusion', effectType: 'mutual_exclusion', st: 'ok', fields: [{ key: 'mutex_group', label: '互斥组名', type: 'text', default: 'g1' }, { key: 'priority', label: '优先级', type: 'number', default: 0 }] },
    { grp: 'F', key: 'permanent_disable', label: 'F6 永久失效', enLabel: 'Permanent Disable', effectType: 'permanent_disable', st: 'ok', fields: [{ key: 'target_entry', label: '目标词条ID', type: 'text', default: '' }, { key: 'scope', label: '失效范围', type: 'select', options: ['self', 'entry'], default: 'self' }] },
    { grp: 'F', key: 'shield', label: '护盾', enLabel: 'Shield', effectType: 'shield', st: 'ok', fields: [{ key: 'value', label: '护盾值', type: 'number', default: 5 }, { key: 'duration', label: '持续回合数', type: 'number', default: 2 }] }
  ] },
  { grp: 'G', title: 'G · 效果·行动 DO/COST', enTitle: 'Action & Cost', atoms: [
    { grp: 'G', key: 'grant_extra_turn', label: 'G1 额外回合', enLabel: 'Grant Extra Turn', effectType: 'grant_extra_turn', st: 'ok', fields: [{ key: 'count', label: '额外回合数', type: 'number', default: 1 }, { key: 'no_chain', label: '禁止连锁', type: 'bool', default: true }] },
    { grp: 'G', key: 'forfeit_move', label: 'G2 放弃移动', enLabel: 'Forfeit Move', effectType: 'forfeit_move', st: 'ok', fields: [{ key: 'requires_unmoved', label: '需本回合未移动', type: 'bool', default: true }] },
    { grp: 'G', key: 'action_debt', label: 'G3 预支行动', enLabel: 'Action Debt', effectType: 'action_debt', st: 'ok', fields: [{ key: 'action', label: '预支行动', type: 'select', options: ['attack', 'move'], default: 'attack' }, { key: 'debt_turns', label: '欠账回合数', type: 'number', default: 1 }] },
    { grp: 'G', key: 'action_debt_turn', label: 'G4 预支回合', enLabel: 'Action Debt Turn', effectType: 'action_debt', st: 'ok', fields: [{ key: 'scope', label: '欠账范围', type: 'text', default: 'turn 整回合', fixed: true }, { key: 'skip_next_turn', label: '跳过下回合', type: 'bool', default: true }] },
    { grp: 'G', key: 'preempt', label: 'G5 抢占顶替', enLabel: 'Preempt', effectType: 'preempt', st: 'ok', fields: [{ key: 'from', label: '被抢占方', type: 'select', options: ['target'], default: 'target' }, { key: 'mode', label: '抢占模式', type: 'select', options: ['takeover', 'first_strike'], default: 'takeover' }] },
    { grp: 'G', key: 'order_rewrite', label: 'G6 行动序改写', enLabel: 'Order Rewrite', effectType: 'order_rewrite', st: 'ok', fields: [{ key: 'unit', label: '被改写单位', type: 'select', options: ['self'], default: 'self' }, { key: 'position', label: '新排位序号', type: 'number', default: 0 }] },
    { grp: 'G', key: 'prerequisite_clear', label: 'G7 解除前置约束', enLabel: 'Prerequisite Clear', effectType: 'prerequisite_clear', st: 'ok', fields: [{ key: 'remove_requirement', label: '解除的前置词条ID', type: 'text', default: '' }, { key: 'scope', label: '解除范围', type: 'select', options: ['self', 'entry'], default: 'self' }] },
    { grp: 'G', key: 'limit_no_chain', label: 'G8 防连锁', enLabel: 'Limit No Chain', effectType: 'limit_no_chain', st: 'ok', fields: [{ key: 'no_chain', label: '禁止连锁', type: 'bool', default: true }, { key: 'cooldown', label: '冷却回合数', type: 'number', default: 1 }] },
    { grp: 'G', key: 'block_movement', label: '阻止移动', enLabel: 'Block Movement', effectType: 'block_movement', st: 'ok', fields: [{ key: 'duration', label: '持续回合数', type: 'number', default: 1 }] },
    { grp: 'G', key: 'grant_revoke_action', label: 'G9 授予/剥夺行动', enLabel: 'Grant Revoke Action', effectType: 'grant_revoke_action', st: 'ok', fields: [{ key: 'action', label: '行动类型', type: 'text', default: 'attack 攻击|move 移动|defend 防御' }, { key: 'delta', label: '增减量(+增/-剥)', type: 'number', default: 1 }] },
    // ★ 2026-09-02 新增 AFTER 后效三原子（后端 B_ENTRY / B_HIT_CALLBACK / B_CLEANUP 均已真实实现）
    //   注：B_ENTRY 与 B_HIT_CALLBACK **共用 handlerKey 'trigger_entry'**，byHandler 会互相覆盖，
    //       故这两个原子**显式声明 semantic**，依赖回填逻辑的「硬编码优先」分支（if (a.semantic) return）。
    //       cleanup 的 handlerKey 'remove_buff' 唯一，semantic 由 atom-meta 自动回填为 B_CLEANUP。
    { grp: 'G', key: 'trigger_entry', label: 'G10 词条联动', enLabel: 'Trigger Entry', effectType: 'trigger_entry', semantic: 'B_ENTRY', st: 'ok', fields: [{ key: 'entry_id', label: '联动词条 ID', type: 'text', default: '' }, { key: 'entry_type', label: '词条类型', type: 'select', options: ['skill', 'special', 'faction', 'status'], default: 'skill' }] },
    { grp: 'G', key: 'hit_callback', label: 'G11 命中/击杀回调', enLabel: 'Hit Callback', effectType: 'trigger_entry', semantic: 'B_HIT_CALLBACK', st: 'ok', fields: [{ key: 'entry_id', label: '回调词条 ID', type: 'text', default: '' }, { key: 'on', label: '触发时机', type: 'select', options: ['hit', 'kill'], default: 'hit' }] },
    { grp: 'G', key: 'cleanup', label: 'G12 驱散/结算清理', enLabel: 'Cleanup', effectType: 'remove_buff', st: 'ok', fields: [{ key: 'buff_key', label: '状态词条 key', type: 'text', default: '' }, { key: 'scope', label: '清理范围', type: 'select', options: ['self', 'target'], default: 'target' }] }
  ] },
  { grp: 'H', title: 'H · 效果·空间 DO', enTitle: 'Space', atoms: [
    { grp: 'H', key: 'map_cannon', label: 'H1 地图炮（自身原点·定向）', enLabel: 'Map Cannon', effectType: 'map_cannon', st: 'ok', fields: [
      { key: 'origin', label: '原点', type: 'text', default: 'self 发动者自身', fixed: true },
      { key: 'direction', label: '发动方向', type: 'select', options: ['0~5', 'all'], default: '0~5' },
      { key: 'shape', label: '覆盖形状', type: 'select', options: ['line', 'sector', 'cone', 'custom'], default: 'line' },
      { key: 'length', label: '延伸长度·格', type: 'number', default: 3 },
      { key: 'width', label: '展开宽度·格', type: 'number', default: 1 },
      { key: 'mcShapes', label: '六向手绘格', type: 'json', default: '' },
      { key: 'friendly_fire', label: '波及友军', type: 'bool', default: false }
    ] },
    { grp: 'H', key: 'aoe', label: 'H2 AOE（落点在射程内）', enLabel: 'AOE', effectType: 'aoe', st: 'ok', fields: [
      { key: 'origin', label: '原点', type: 'text', default: 'impact_point 射程内落点', fixed: true },
      { key: 'cast_range', label: '可选落点射程·格', type: 'number', default: 3 },
      { key: 'shape', label: '覆盖形状', type: 'select', options: ['circle', 'ring', 'line', 'sector', 'cone', 'custom'], default: 'circle' },
      { key: 'spread', label: '覆盖半径·格', type: 'number', default: 2 },
      { key: 'direction', label: '朝向', type: 'select', options: ['none', '0~5'], default: 'none' },
      { key: 'inner_radius', label: '内圈盲区·格', type: 'number', default: 0 },
      { key: 'friendly_fire', label: '波及友军', type: 'bool', default: false }
    ] },
    { grp: 'H', key: 'displace', label: 'H3 强制位移', enLabel: 'Displace', effectType: 'displace', st: 'ok', fields: [{ key: 'mode', label: '位移模式', type: 'select', options: ['push', 'pull', 'teleport'], default: 'push' }, { key: 'distance', label: '位移距离·格', type: 'number', default: 2 }, { key: 'to', label: '指定落点坐标', type: 'text', default: '' }] },
    { grp: 'H', key: 'block_movement_zoc', label: 'H4 共线阻挡', enLabel: 'Block Movement ZOC', effectType: 'block_movement', st: 'ok', fields: [{ key: 'count', label: '构成阻挡单位数', type: 'number', default: 3 }, { key: 'force_detour', label: '强制绕行', type: 'bool', default: true }] },
    { grp: 'H', key: 'scan_reveal', label: 'H5 区域揭示', enLabel: 'Scan Reveal', effectType: 'scan_reveal', st: 'ok', fields: [{ key: 'radius', label: '揭示半径·格', type: 'number', default: 3 }, { key: 'duration', label: '持续回合数', type: 'number', default: 1 }] },
    // ★ 2026-09-02 改造：spawn_items（后端 handleSpawnItems 为**空壳**）→ spawn_unit（handleSpawnUnit 真实实现，
    //   走 createBattleUnit 工厂 + 三处同步注册；paramMap: entity_type→role, count→spawn_count）。
    //   存量词条中 spawn_items 使用数 = 0，改造无数据风险。
    { grp: 'H', key: 'spawn_unit', label: 'H6 生成单位', enLabel: 'Spawn Unit', effectType: 'spawn_unit', st: 'ok', fields: [{ key: 'entity_type', label: '实体类别', type: 'text', default: '' }, { key: 'count', label: '生成数量', type: 'number', default: 1 }, { key: 'q', label: '落点 q', type: 'number', default: 0 }, { key: 'r', label: '落点 r', type: 'number', default: 0 }] }
  ] },
  { grp: 'I', title: 'I · 效果·信息 DO', enTitle: 'Information', atoms: [
    { grp: 'I', key: 'visibility', label: 'I1 可见性', enLabel: 'Visibility', effectType: 'visibility', st: 'ok', fields: [{ key: 'state', label: '可见状态', type: 'select', options: ['visible', 'hidden'], default: 'visible' }, { key: 'duration', label: '持续回合·0永久', type: 'number', default: 0 }] },
    { grp: 'I', key: 'selectable', label: 'I2 可选中性', enLabel: 'Selectable', effectType: 'selectable', st: 'ok', fields: [{ key: 'selectable', label: '可被选中', type: 'bool', default: false }, { key: 'expiry', label: '失效条件', type: 'select', options: ['on_attack', 'duration'], default: 'on_attack' }] },
    { grp: 'I', key: 'scan_reveal_r', label: 'I3 扫描范围', enLabel: 'Scan Reveal Range', effectType: 'scan_reveal', st: 'ok', fields: [{ key: 'radius', label: '扫描半径·格', type: 'number', default: 2 }, { key: 'by', label: '计算方式', type: 'select', options: ['flat', 'stat_coeff'], default: 'flat' }] },
    { grp: 'I', key: 'enter_stealth', label: '进入隐匿', enLabel: 'Enter Stealth', effectType: 'enter_stealth', st: 'ok', fields: [{ key: 'duration', label: '持续回合数', type: 'number', default: 2 }] },
    { grp: 'I', key: 'exit_stealth', label: '退出隐匿', enLabel: 'Exit Stealth', effectType: 'exit_stealth', st: 'ok', fields: [{ key: 'trigger_on', label: '退出触发条件', type: 'select', options: ['on_attack', 'on_move', 'manual', 'immediate'], default: 'on_attack' }] },
    { grp: 'I', key: 'stealth_attack_bonus', label: '隐匿攻击加成', enLabel: 'Stealth Attack Bonus', effectType: 'stealth_attack_bonus', st: 'ok', fields: [{ key: 'bonus', label: '伤害加成值', type: 'number', default: 3 }] },
    { grp: 'I', key: 'stealth_evasion', label: '隐匿闪避', enLabel: 'Stealth Evasion', effectType: 'stealth_evasion', st: 'ok', fields: [{ key: 'bonus', label: '闪避加成值', type: 'number', default: 2 }] }
  ] },
  { grp: 'J', title: 'J · 效果·所有权 DO', enTitle: 'Ownership', atoms: [
    { grp: 'J', key: 'plunder', label: 'J1 装备抢夺转移', enLabel: 'Plunder', effectType: 'plunder', st: 'ok', fields: [{ key: 'item', label: '抢夺物类型', type: 'select', options: ['weapon', 'armor'], default: 'weapon' }, { key: 'to', label: '归属方', type: 'select', options: ['self'], default: 'self' }, { key: 'threshold', label: '抢夺成功阈值', type: 'number', default: 4 }] },
    { grp: 'J', key: 'equipment_lock', label: '装备锁定', enLabel: 'Equipment Lock', effectType: 'equipment_lock', st: 'ok', fields: [{ key: 'slot', label: '锁定槽位', type: 'select', options: ['weapon', 'armor'], default: 'weapon' }] }
  ] },
  { grp: 'K', title: 'K · 元能力 COST/META', enTitle: 'Meta Ability', atoms: [
    { grp: 'K', key: 'rewrite_entry', label: 'K1 词条改写词条', enLabel: 'Rewrite Entry', effectType: 'rewrite_entry', st: 'ok', fields: [{ key: 'unlock', label: '解锁词条ID', type: 'text', default: '' }, { key: 'prerequisite', label: '前置词条ID', type: 'text', default: '' }, { key: 'remove_requirement', label: '解除前置约束', type: 'text', default: '' }] },
    { grp: 'K', key: 'slot_occupancy', label: 'K2 多技能槽占用', enLabel: 'Slot Occupancy', effectType: 'slot_occupancy', st: 'ok', fields: [{ key: 'slots', label: '占用槽位数', type: 'number', default: 2 }] },
    { grp: 'K', key: 'player_optional', label: 'K3 玩家可选发动', enLabel: 'Player Optional', effectType: 'player_optional', st: 'ok', fields: [{ key: 'player_optional', label: '由玩家决定发动', type: 'bool', default: true }, { key: 'prompt', label: '询问提示文案', type: 'text', default: '' }] },
    { grp: 'K', key: 'interrupt_window', label: 'K4 打断响应窗口', enLabel: 'Interrupt Window', effectType: 'interrupt_window', st: 'ok', fields: [{ key: 'interrupt_window', label: '响应窗口回合数', type: 'number', default: 1 }] }
  ] },
  { grp: 'W', title: 'W · 目标定义', enTitle: 'Targeting', atoms: [
    { grp: 'W', key: 'target_self', label: 'W1 作用于自身', enLabel: 'Target Self', effectType: 'target_selection', st: 'alias', fields: [{ key: 'target_type', label: '目标类型', type: 'select', options: ['SELF'], default: 'SELF' }] },
    { grp: 'W', key: 'target_single_enemy', label: 'W2 单体敌方', enLabel: 'Target Single Enemy', effectType: 'target_selection', st: 'alias', fields: [{ key: 'target_type', label: '目标类型', type: 'select', options: ['SINGLE_ENEMY'], default: 'SINGLE_ENEMY' }] },
    { grp: 'W', key: 'target_area_enemy', label: 'W3 群体敌方', enLabel: 'Target Area Enemy', effectType: 'target_selection', st: 'alias', fields: [{ key: 'target_type', label: '目标类型', type: 'select', options: ['AREA_ENEMY'], default: 'AREA_ENEMY' }] },
    { grp: 'W', key: 'target_single_ally', label: 'W4 单体友方', enLabel: 'Target Single Ally', effectType: 'target_selection', st: 'alias', fields: [{ key: 'target_type', label: '目标类型', type: 'select', options: ['SINGLE_ALLY'], default: 'SINGLE_ALLY' }] },
    { grp: 'W', key: 'target_area_ally', label: 'W5 群体友方', enLabel: 'Target Area Ally', effectType: 'target_selection', st: 'alias', fields: [{ key: 'target_type', label: '目标类型', type: 'select', options: ['AREA_ALLY'], default: 'AREA_ALLY' }] },
    { grp: 'W', key: 'target_all', label: 'W6 全场单位', enLabel: 'Target All', effectType: 'target_selection', st: 'alias', fields: [{ key: 'target_type', label: '目标类型', type: 'select', options: ['ALL_UNITS'], default: 'ALL_UNITS' }] },
    // ★ 2026-09-02 新增：运行时目标解析（后端 B_TARGET / handlerKey resolve_target，已真实实现）
    //   ⚠️ 与 W1–W6 的 target_selection **语义不同，勿混用**：
    //     · target_selection（W1–W6）= 编辑器「目标定义」，由契约字段 draft.target.type 承载，引擎侧无 handler
    //     · resolve_target（本原子）  = 引擎「运行时目标解析」，写 context.resolvedTargets 供后续 DO 原子消费
    //   paramMap: scope→target_scope, radius→area_radius（scope 必填）
    { grp: 'W', key: 'resolve_target', label: 'W7 目标解析（运行时）', enLabel: 'Resolve Target', effectType: 'resolve_target', st: 'ok', fields: [{ key: 'scope', label: '作用域', type: 'select', options: ['self', 'enemy', 'ally', 'enemyAll', 'allyAll', 'all'], default: 'enemy' }, { key: 'radius', label: '数值化半径·格', type: 'number', default: 1 }] }
  ] },
  { grp: 'X', title: '其他 · 引擎已有未列', enTitle: 'Engine Extras', atoms: [
    { grp: 'F', key: 'height_advantage', label: '高地优势', enLabel: 'Height Advantage', effectType: 'height_advantage', st: 'ok', fields: [{ key: 'bonus', label: '高地加成值', type: 'number', default: 1 }] },
    { grp: 'F', key: 'terrain_kind_modifier', label: '地形种类修正', enLabel: 'Terrain Kind Modifier', effectType: 'terrain_kind_modifier', st: 'ok', fields: [{ key: 'terrain', label: '地形', type: 'select', options: ['plain', 'forest', 'mountain', 'water', 'ruin', 'crystal', 'moon'], default: 'plain' }, { key: 'modifier', label: '修正系数', type: 'number', default: 1 }] },
    { grp: 'C', key: 'luck_resolution', label: '幸运判定', enLabel: 'Luck Resolution', effectType: 'roll_segment', st: 'ok', fields: [{ key: 'segments', label: '分段映射表', type: 'json', default: '' }] },
    { grp: 'F', key: 'remove_buff', label: '移除 Buff', enLabel: 'Remove Buff', effectType: 'remove_buff', st: 'ok', fields: [{ key: 'buff_id', label: '要移除增益ID', type: 'text', default: '' }] },
    { grp: 'F', key: 'custom', label: '自定义效果', enLabel: 'Custom', effectType: 'custom', st: 'ok', fields: [{ key: 'payload', label: '自定义载荷', type: 'json', default: '' }] }
  ] }
]

/** 扁平化成单个原子数组，便于搜索 */
export const ALL_ATOMS = atomGroups.flatMap(g => g.atoms.map(a => ({ ...a, groupTitle: g.title })))

/** 按 key 查原子定义 */
export function atomByKey(key) {
  return ALL_ATOMS.find(a => a.key === key) || null
}
