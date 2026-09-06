/**
 * atomRegistry.cjs — 六段式语义原子 → 引擎实现 翻译官（方案 B Week2 / 报告 4a）
 *
 * 设计原则（报告 4a / 4b）：
 *   - 初期【不推翻】 effectExecutor.cjs，把它作为底层 Handler Provider 完全复用。
 *   - 本 Registry 只负责"语义原子名 → effectExecutor handler key"的翻译，
 *     最终仍委托 effectExecutor.executeSync（复用例行预检/目标重定向/别名重定向）。
 *   - 编辑器/策划写语义友好名，引擎只认 handler key；两者鸿沟在此收口。
 *   - 未注册的语义名走"直通"策略（type 即引擎 key），保证已上线的 v2 词条零回退。
 *
 * 保 this 绑定：effectExecutor 是单例，handler 内部依赖 this，故委托一律用
 *   (atom, ctx) => effectExecutor.executeSync([atom], ctx)
 * 或 effectExecutor.handlers[key].bind(effectExecutor)（见 resolve 实现）。
 */

const { effectExecutor } = require('./effectExecutor.cjs');
const DiceService = require('./diceService.cjs');

class AtomRegistry {
  constructor() {
    /**
     * 语义名 → 原子元数据。
     * value: { handlerKey, kind, params[], guard, desc }
     *   - handlerKey: effectExecutor.handlers 里的真实 key（如 "damage"）
     *   - kind: 'instant' 即时结算型（直接扣血/加血） | 'marker' 标记型（写 _meta，由结算侧读取）
     *   - params: [{ name, type, required, guard, desc }] 编辑器参数 schema
     *   - guard: 护栏说明（防失衡）
     *   - desc: 语义说明
     */
    this._map = new Map();
    this._registerBuiltins();
  }

  /**
   * 注册语义原子名（含元数据）。
   * 兼容旧签名 register(semantic, handlerKey) —— 仅传 handlerKey 时退化为最小元数据。
   * @param {string} semantic 段树 atom.type 里写的语义名（如 "D1_direct_damage"）
   * @param {string|object} handlerKey 引擎 handler key，或完整元数据对象 {handlerKey, kind, params, guard, desc}
   */
  register(semantic, handlerKey) {
    if (!semantic) return this;
    if (typeof handlerKey === 'string') {
      this._map.set(String(semantic), { handlerKey, kind: 'instant', params: [], guard: '', desc: '' });
    } else {
      this._map.set(String(semantic), Object.assign({ kind: 'instant', params: [], guard: '', desc: '' }, handlerKey));
    }
    return this;
  }

  /**
   * 把单个段树 atom 解析为 effectExecutor 能消费的 { type, ...params }。
   * 语义名命中映射 → 换成引擎 key；未命中 → 原样直通（type 即引擎 key，兼容存量）。
   * @param {object} atom 段树原子（含 type 字段）
   * @returns {object} 翻译后的 effect（带 type 字段，供 executeSync 消费）
   */
  resolve(atom) {
    if (!atom || typeof atom !== 'object') return atom;
    const { type, ...rest } = atom;
    if (type == null) return atom; // 无 type 的原子（如纯 trigger）原样返回
    const meta = this._map.get(String(type));
    if (meta) {
      // 应用 paramMap：把编辑器友好语义字段翻译为 handler 真实读取字段
      let params = rest;
      if (meta.paramMap && typeof meta.paramMap === 'object') {
        params = {};
        for (const [k, v] of Object.entries(rest)) {
          if (k in meta.paramMap) params[meta.paramMap[k]] = v;
          else params[k] = v;
        }
      }
      return { type: meta.handlerKey, ...params, _semantic: type };
    }
    // 直通：type 即引擎 key（含存量 v2 词条已用的 damage/status 等）
    return { type, ...rest };
  }

  /**
   * 批量解析（供 _walkPhaseTree 的 runAtoms 使用）。
   * @param {object[]} atoms
   * @returns {object[]}
   */
  resolveAll(atoms) {
    if (!Array.isArray(atoms)) return [];
    return atoms.filter((a) => a && a.type).map((a) => this.resolve(a));
  }

  /**
   * 语义名是否存在注册（供调试 / 编辑器校验）。
   */
  has(semantic) {
    return this._map.has(String(semantic));
  }

  /**
   * 取语义原子完整元数据（供前端编辑器渲染表单）。
   * @returns {object|null} { handlerKey, kind, params, guard, desc }
   */
  describe(semantic) {
    const m = this._map.get(String(semantic));
    return m || null;
  }

  /**
   * 当前全部语义映射（调试用，兼容旧 list 结构）。
   */
  list() {
    return Array.from(this._map.entries()).map(([k, v]) => ({ semantic: k, handlerKey: v.handlerKey, kind: v.kind }));
  }

  /**
   * 原子元数据清单（方案 A 前端编辑器对接入口）：完整暴露语义名 + handlerKey + kind + params + guard + desc。
   * 这是"语义底座完备态"的单一真相源——前端编辑器 dropdown/表单参数全部由此派生。
   */
  listMeta() {
    return Array.from(this._map.entries()).map(([k, v]) => ({
      semantic: k,
      handlerKey: v.handlerKey,
      kind: v.kind,
      params: v.params || [],
      guard: v.guard || '',
      desc: v.desc || '',
    }));
  }

  /**
   * 词条库校验器注入（2026-08-23）：供 B_ENTRY/B_HIT_CALLBACK 的 entry_id guard 使用。
   * 由 Gateway 启动时（加载 glossary-skill-config.json 后）预注入默认校验器，
   * 比对词条库 Key 集合；前端也可覆盖注入。未注入时默认放行（不阻断，仅 warn）。
   * @param {(entryId: string) => boolean} fn 返回 true 表示 entry_id 存在于词条库
   */
  setEntryValidator(fn) {
    if (typeof fn === 'function') this._entryValidator = fn;
    return this;
  }

  /**
   * 校验 entry_id 是否存在于词条库（供 handler / resolve 阶段护栏调用）。
   * @returns {boolean}
   */
  validateEntryExists(entryId) {
    if (typeof this._entryValidator !== 'function') return true; // 未注入校验器时放行
    try { return !!this._entryValidator(entryId); }
    catch (_) { return false; }
  }

  /**
   * 内置语义映射：把"报告 67 原子清单"的语义名收口到 effectExecutor 已验证 handler。
   * 每个原子携带完整元数据（kind/params/guard/desc），构成语义底座完备态——
   * 前端编辑器（方案 A）直接消费 listMeta() 派生 dropdown 与表单参数，无需二次硬编码。
   * 注：当前上线 v2 词条 tree atoms 的 type 多为引擎 key（damage/status），
   * 此处注册的语义名作为"语义友好别名"叠加层，resolve 命中走翻译、未命中走直通，永不破坏存量。
   */
  _registerBuiltins() {
    const P = (name, type, opts = {}) => Object.assign({ name, type }, opts);

    // D 组 伤害族
    this.register('D1_direct_damage', {
      handlerKey: 'direct_damage', kind: 'instant',
      desc: '直接伤害：对目标立即结算固定/掷骰伤害值',
      params: [P('amount', 'number', { desc: '伤害值（与掷骰二选一）' }), P('dice', 'string', { desc: '掷骰表达式如 2d6' }), P('target', 'string', { desc: '目标选择' })],
    });
    this.register('D3_damage_split', {
      handlerKey: 'direct_damage_split', kind: 'instant',
      desc: '伤害均摊：将总伤害按 targets 均分',
      params: [P('total_damage', 'number', { required: true }), P('split', 'enum', { desc: 'equally|weighted' }), P('min_per_target', 'number')],
    });
    this.register('D4_damage_share', {
      handlerKey: 'damage_share', kind: 'marker',
      desc: '伤害分担：将受击伤害按比例转入分担池（写 _meta，结算侧读取）',
      params: [P('ratio', 'number', { required: true, guard: '≤0.8' })],
      guard: '最高分担 80%，保留 20% 自承，防平衡崩塌',
    });
    // ★ 方案 B：D6/D7 底层原子边界拆分清晰（非复用 direct_damage）
    this.register('D6_armor_pierce', {
      handlerKey: 'armor_pierce', kind: 'marker',
      desc: '护甲穿透：将无视护甲比例写入 _meta.armor_pierce，由结算侧 damagePipe 读取',
      params: [P('ratio', 'number', { required: true, guard: '0~0.8' })],
      guard: '最高穿透 80%，保留 20% 护甲价值，防全穿透失衡',
    });
    this.register('D7_reflect', {
      handlerKey: 'reflect_damage', kind: 'marker',
      desc: '反伤：将受击反弹比例 + 层数写入 _meta.reflect_damage，由结算侧 damagePipe 读取',
      params: [P('ratio', 'number', { required: true, guard: '0~1.0' }), P('guard', 'number', { desc: '最大反弹层数，防递归', default: 3 })],
      guard: '最高反伤 100%；默认最多反弹 3 层，归零即停，杜绝无限反伤链式崩溃',
    });
    // H 组 范围/地图炮
    this.register('H1_map_cannon', {
      handlerKey: 'map_cannon', kind: 'instant',
      desc: '地图炮：以自身为原点的范围伤害',
      params: [P('range', 'number', { required: true }), P('damage', 'number', { required: true })],
    });
    this.register('H2_aoe', {
      handlerKey: 'aoe', kind: 'instant',
      desc: 'AOE：以射程内落点为原点的范围伤害',
      params: [P('radius', 'number', { required: true }), P('damage', 'number', { required: true })],
    });
    // K 组 词条操控
    this.register('K1_rewrite_entry', {
      handlerKey: 'rewrite_entry', kind: 'marker',
      desc: '改写词条：重写目标词条的进入/结算条件',
      params: [P('entry_id', 'string', { required: true }), P('patch', 'object', { required: true })],
    });
    this.register('K3_player_optional', {
      handlerKey: 'player_optional', kind: 'marker',
      desc: '玩家可选：将原子标记为需玩家确认触发',
      params: [P('prompt', 'string')],
    });
    this.register('K4_interrupt_window', {
      handlerKey: 'interrupt_window', kind: 'marker',
      desc: '打断窗口：开启可被对手反应的时机窗口',
      params: [P('window_ms', 'number', { default: 1500 })],
    });
    // G 组 秩序
    this.register('G2_action_debt', {
      handlerKey: 'action_debt', kind: 'marker',
      desc: '行动债务：欠下未来回合的行动点',
      params: [P('amount', 'number', { required: true })],
    });
    this.register('G3_preempt', {
      handlerKey: 'preempt', kind: 'marker',
      desc: '抢先：在对手行动前插入一次行动',
      params: [P('priority', 'number')],
    });
    this.register('G4_order_rewrite', {
      handlerKey: 'order_rewrite', kind: 'marker',
      desc: '指令改写：重写行动顺序',
      params: [P('order', 'array', { required: true })],
    });
    this.register('G7_grant_revoke_action', {
      handlerKey: 'grant_revoke_action', kind: 'marker',
      desc: '授予/剥夺行动：增删目标行动点',
      params: [P('action', 'string', { required: true }), P('delta', 'number', { required: true })],
    });
    this.register('G8_displace', {
      handlerKey: 'displace', kind: 'instant',
      desc: '位移：将单位移动到指定坐标',
      params: [P('x', 'number', { required: true }), P('y', 'number', { required: true })],
    });
    // E 组 资源
    this.register('E1_resource_recovery', {
      handlerKey: 'resource_recovery', kind: 'instant',
      desc: '资源恢复：HP/AP/能量等真实有副作用的恢复',
      params: [P('resource', 'enum', { required: true, desc: 'hp|ap|energy' }), P('amount', 'number', { required: true })],
    });
    // F 组 状态
    this.register('F3_shield', {
      handlerKey: 'shield', kind: 'marker',
      desc: '护盾：吸收伤害的临时层',
      params: [P('amount', 'number', { required: true }), P('decay', 'enum', { desc: 'per_hit|per_turn' })],
    });
    this.register('F4_charge_layer', {
      handlerKey: 'charge_layer', kind: 'marker',
      desc: '充能层：累积层数触发阈值效果',
      params: [P('layer', 'number', { required: true }), P('threshold', 'number')],
    });
    // I/J 组 感知/所有权
    this.register('I1_visibility', {
      handlerKey: 'visibility', kind: 'marker',
      desc: '可见性：显隐单位',
      params: [P('visible', 'boolean', { required: true })],
    });
    this.register('I3_scan_reveal', {
      handlerKey: 'scan_reveal', kind: 'marker',
      desc: '扫描揭示：揭示迷雾中的单位',
      params: [P('radius', 'number', { required: true })],
    });
    this.register('J1_plunder', {
      handlerKey: 'plunder', kind: 'instant',
      desc: '掠夺：夺取目标资源/词条',
      params: [P('target_type', 'enum', { required: true, desc: 'resource|entry' }), P('amount', 'number')],
    });
    // ===== 批量补全：前端原子面板已暴露、effectExecutor 有真实实现的语义底座 =====
    // 以下 handler 均经源码核实（非凭名）：kind 据实现判定，params 据真实读参提取。
    // D 组
    this.register('D2_damage_reduction', {
      handlerKey: 'damage_reduction', kind: 'marker',
      desc: '按护甲kind减免：将减伤标记写入 _meta.damage_reduction',
      params: [P('ratio', 'number', { required: true, desc: '减伤比例 0~1' }), P('armor_kind', 'string', { desc: '指定护甲种类，空=全部' })],
    });
    this.register('D5_instant_kill', {
      handlerKey: 'instant_kill', kind: 'instant',
      desc: '即死：词条携带即死原子即无条件置 target.hp=0（立即死亡，不投骰、不判阈值）',
      params: [],
    });
    this.register('D8_duel_resolution', {
      handlerKey: 'duel_resolution', kind: 'instant',
      desc: '同归于尽：双方各扣 damage 并标记',
      params: [P('damage', 'number', { required: true }), P('both', 'boolean', { desc: '是否双方都扣' })],
    });
    this.register('D9_modify_stat', {
      handlerKey: 'modify_stat', kind: 'instant',
      desc: '属性增减益：写 _meta.modifiers（合并 F1/F2/D9 三个前端 key）',
      params: [P('stat', 'string', { required: true, desc: '属性名' }), P('delta', 'number', { required: true }), P('duration', 'number', { desc: '持续回合，空=永久' })],
    });
    // E 组
    this.register('E3_durability_consumption', {
      handlerKey: 'durability_consumption', kind: 'instant',
      desc: '耐久扣减：扣 equipment[slot].durability',
      params: [P('slot', 'string', { required: true }), P('amount', 'number', { required: true })],
    });
    // F 组
    this.register('F3b_skip_mobility', {
      handlerKey: 'skip_mobility', kind: 'marker',
      desc: '跳过机动判定：置 _meta.flags.skip_mobility',
      params: [],
    });
    this.register('F5_mutual_exclusion', {
      handlerKey: 'mutual_exclusion', kind: 'marker',
      desc: '互斥组：将其它同组原子移入 _meta.suppressed',
      params: [P('group', 'string', { required: true }), P('exclude', 'string', { desc: '排除键' })],
    });
    this.register('F6_permanent_disable', {
      handlerKey: 'permanent_disable', kind: 'marker',
      desc: '永久失效：置 _meta.flags.permanent_disable',
      params: [P('target_scope', 'string', { desc: '作用范围' })],
    });
    this.register('F7_height_advantage', {
      handlerKey: 'height_advantage', kind: 'marker',
      desc: '高地优势：写 _meta.height_advantage（结算加伤标记）',
      params: [P('bonus', 'number', { required: true, desc: '加成值' })],
    });
    this.register('F8_terrain_kind_modifier', {
      handlerKey: 'terrain_kind_modifier', kind: 'marker',
      desc: '地形种类修正：写 _meta.terrain_mod',
      params: [P('terrain', 'string', { required: true }), P('mod', 'number', { required: true })],
    });
    this.register('F9_remove_buff', {
      handlerKey: 'remove_buff', kind: 'instant',
      desc: '移除Buff：从 _meta.modifiers/_meta.buffs 删除',
      params: [P('buff_key', 'string', { required: true })],
    });
    // G 组
    this.register('G1_grant_extra_turn', {
      handlerKey: 'grant_extra_turn', kind: 'instant',
      desc: '额外回合：unit._meta.extra_turns += turns',
      params: [P('turns', 'number', { required: true, default: 1 })],
    });
    this.register('G2b_forfeit_move', {
      handlerKey: 'forfeit_move', kind: 'marker',
      desc: '放弃移动：置 _meta.flags.forfeit_move',
      params: [],
    });
    this.register('G9_prerequisite_clear', {
      handlerKey: 'prerequisite_clear', kind: 'marker',
      desc: '解除前置：清除 _meta.removed_requirements / entry_prerequisites',
      params: [P('prerequisite', 'string', { required: true, desc: '要解除的前置键，可逗号分隔' })],
    });
    this.register('G10_limit_no_chain', {
      handlerKey: 'limit_no_chain', kind: 'marker',
      desc: '防连锁：置 _meta.flags.no_chain',
      params: [],
    });
    this.register('G_block_movement', {
      handlerKey: 'block_movement', kind: 'marker',
      desc: '阻止移动：置 _meta.flags.block_movement（合并 G/H 两个前端 key）',
      params: [P('duration', 'number', { desc: '持续回合' })],
    });
    // I 组
    this.register('I2_selectable', {
      handlerKey: 'selectable', kind: 'marker',
      desc: '可选中：置 _meta.flags.selectable',
      params: [P('value', 'boolean', { default: true, desc: '是否可选' })],
    });
    this.register('I_enter_stealth', {
      handlerKey: 'enter_stealth', kind: 'marker',
      desc: '进入隐匿：置 _meta.flags.stealth=true',
      params: [P('duration', 'number', { desc: '持续回合' })],
    });
    this.register('I_exit_stealth', {
      handlerKey: 'exit_stealth', kind: 'marker',
      desc: '退出隐匿：置 _meta.flags.stealth=false',
      params: [],
    });
    this.register('I_stealth_atk_bonus', {
      handlerKey: 'stealth_attack_bonus', kind: 'marker',
      desc: '隐匿攻击加成：写 _meta.stealth_atk_bonus',
      params: [P('bonus', 'number', { required: true })],
    });
    this.register('I_stealth_evasion', {
      handlerKey: 'stealth_evasion', kind: 'marker',
      desc: '隐匿闪避：写 _meta.stealth_evasion',
      params: [P('bonus', 'number', { required: true })],
    });
    // J 组（跨子系统）
    this.register('J_equipment_lock', {
      handlerKey: 'equipment_lock', kind: 'instant',
      desc: '装备锁定：调用 equipmentDurability.lockDurability',
      params: [P('slot', 'string', { required: true }), P('locked', 'boolean', { default: true })],
    });
    // K 组
    this.register('K2_slot_occupancy', {
      handlerKey: 'slot_occupancy', kind: 'marker',
      desc: '多技能槽占用：写 _meta.slot_occupancy',
      params: [P('slots', 'string', { required: true, desc: '占用槽位列表' })],
    });
    // B 组（条件型，写 flag 供 WHEN 段判定）
    this.register('B5_collinear', {
      handlerKey: 'collinear', kind: 'marker',
      desc: '三单位共线：算六角共线，写 _meta.flags.collinear',
      params: [P('ref_q', 'number', { required: true }), P('ref_r', 'number', { required: true })],
    });
    this.register('B8_charge_stack', {
      handlerKey: 'charge_stack', kind: 'marker',
      desc: '充能层数就绪：读充能层 vs 阈值，写 _meta.flags.charge_met',
      params: [P('layer_key', 'string', { required: true }), P('threshold', 'number', { required: true })],
    });
    this.register('B10_cooldown', {
      handlerKey: 'cooldown', kind: 'marker',
      desc: '冷却就绪：读 _meta.cooldowns[skill]，写 cooldown_ready',
      params: [P('skill_key', 'string', { required: true }), P('reset_on_ready', 'boolean', { default: false })],
    });
    // ============================================================
    // 六段式画布 UI 规范 · 动作原子分层模型（2026-08-23 落地路径 A）
    // 语义名采用 B_/A_/C_/M_ 前缀，与存量 D/H/K/G/E/F/I/J/B 组别名共存（resolve 命中翻译、未命中直通，零破坏）。
    // ============================================================

    // ---- A 类数值动作入口（无独立"伤害/治疗/护盾"主原子，由修饰组合表达）----
    this.register('A_APPLY_VALUE', {
      handlerKey: 'modify_stat', kind: 'instant',
      desc: '数值应用：对「数值域」按「流转方式」施加「带符号值」（值>0=增益/产出，值<0=减益/消耗）。带 duration 走 B.6 stat_modifier 栈（含 op 分层+叠加三规则）；无 duration 视为永久/瞬时修正。眩晕/沉默=AP-n、定身=机动-999 即复用此入口。',
      params: [
        P('stat', 'string', { required: true, desc: '数值域：M_STAT 枚举' }),
        P('value', 'number', { required: true, desc: '带符号值' }),
        P('op', 'enum', { desc: 'add|percent|multiplier，默认 add（仅 duration 态生效）' }),
        P('flow', 'enum', { desc: 'M_FLOW：消耗/产出/转移/互换' }),
        P('duration', 'number', { desc: '持续回合，空=永久/瞬时' }),
        P('undispellable', 'boolean', { desc: '不可驱散标记' }),
      ],
      guard: '带 duration 的状态实例必须含 op 字段（默认 add）；百分比/倍率基于 calculateEffectiveStat 管线求值',
    });

    // ---- B 类主原子（按新六段归属：DO / AFTER / COST）----
    this.register('B_TARGET', {
      handlerKey: 'resolve_target', kind: 'marker',
      paramMap: { scope: 'target_scope', radius: 'area_radius' },
      desc: '【DO 首置前导】目标解析：范围(M_RANGE)+作用域(M_SCOPE)交集得出本轮有效目标集，写 context.resolvedTargets，供后续 DO 原子消费。语义=在某范围内的合适作用对象。',
      params: [
        P('scope', 'enum', { required: true, desc: 'M_SCOPE：self/enemy/ally/enemyAll/allyAll/all → target_scope' }),
        P('radius', 'number', { desc: '数值化半径 → area_radius（range 枚举的量化形态）' }),
      ],
      guard: 'scope 必须提供；resolvedTargets 为空时后续 DO 原子跳过并 log',
    });
    this.register('B_DISPLACE', {
      handlerKey: 'displace', kind: 'instant',
      paramMap: { direction: 'mode', fixed_dir: 'dir', cells: 'steps' },
      desc: '【DO】位移：击退/拉拽/冲锋，改变坐标（非数值增减）。方向三选一（语义 direction → handler mode）。',
      params: [
        P('direction', 'enum', { required: true, desc: 'random/fixed6/relative → mode' }),
        P('fixed_dir', 'number', { desc: 'fixed6 时的 0~5 轴向 → dir' }),
        P('cells', 'number', { required: true, guard: '≥1', desc: '位移格数 → steps' }),
      ],
      guard: 'cells≥1；越界格由落点校验拦截',
    });
    this.register('B_SPAWN', {
      handlerKey: 'spawn_unit', kind: 'instant',
      paramMap: { entity_type: 'role', count: 'spawn_count' },
      desc: '【DO】召唤/生成：在场生成单位/地形，改变场上实体集合（走构造 + 三处同步注册）。',
      params: [
        P('entity_type', 'string', { required: true, desc: '实体类别 → role' }),
        P('count', 'number', { required: true, guard: '≤5', desc: '生成数量 → spawn_count' }),
        P('q', 'number', { desc: '落点 q（缺省相对施法者 q+1）' }),
        P('r', 'number', { desc: '落点 r' }),
      ],
      guard: 'count≤5；新单位须同步注册进 allUnits/battleState.units/turnOrder',
    });
    this.register('B_ENTRY', {
      handlerKey: 'trigger_entry', kind: 'instant',
      paramMap: { entry_id: 'entry_key' },
      desc: '【AFTER】词条联动：触发另一已存在词条（联动其结算效果）。含递归护栏（entryCallStack + depth≤2）。entry_id → entry_key。',
      params: [
        P('entry_id', 'string', { required: true, desc: '必须存在于词条库（validateEntryExists 校验）→ entry_key' }),
        P('entry_type', 'enum', { desc: 'skill/special/faction/status' }),
      ],
      guard: 'entry_id 必须存在于词条库；递归触发时检测环路/自触发，阻断并抛 CIRCULAR_ENTRY_TRIGGER',
    });
    this.register('B_HIT_CALLBACK', {
      handlerKey: 'trigger_entry', kind: 'instant',
      paramMap: { entry_id: 'entry_key' },
      desc: '【AFTER】命中回调：命中后触发某词条效果（复用 trigger_entry，on 区分时机）。',
      params: [
        P('entry_id', 'string', { required: true, desc: '必须存在于词条库 → entry_key' }),
        P('on', 'enum', { required: true, desc: 'hit/kill' }),
      ],
      guard: 'entry_id 必须存在于词条库；受 entryCallStack 递归护栏约束',
    });
    this.register('B_KILL_STACK', {
      handlerKey: 'charge_layer', kind: 'instant',
      desc: '【AFTER】击杀叠层：击杀后自身叠 N 层充能（复用 charge_layer 语义）。',
      params: [
        P('layer_key', 'string', { required: true }),
        P('amount', 'number', { required: true }),
      ],
    });
    this.register('B_CLEANUP', {
      handlerKey: 'remove_buff', kind: 'instant',
      paramMap: { buff_key: 'buff_key', scope: 'target' },
      desc: '【AFTER】结算清理/驱散：移除目标 statusEffects 中匹配实例（跳过 undispellable）。buff_key 空=全清；scope→target(self/target)。',
      params: [
        P('buff_key', 'string', { desc: '状态词条 key；空=全清' }),
        P('scope', 'enum', { desc: 'self/target → target 字段' }),
      ],
      guard: 'undispellable:true 的实例跳过，不被驱散',
    });
    // COST 代价原子（与数值域 AP 同源）
    this.register('C_AP_COST', {
      handlerKey: 'cost_ap', kind: 'instant',
      desc: '【COST】AP 代价：发动者自付行动点数。',
      params: [P('amount', 'number', { required: true, guard: '≥1' })],
    });
    this.register('C_ENERGY_COST', {
      handlerKey: 'cost_energy', kind: 'instant',
      desc: '【COST】能量代价：发动者自付能量。',
      params: [P('amount', 'number', { required: true, guard: '≥1' })],
    });
    this.register('C_DURABILITY_COST', {
      handlerKey: 'cost_durability', kind: 'instant',
      desc: '【COST】耐久代价：发动者自付装备耐久。',
      params: [P('amount', 'number', { required: true, guard: '≥1' })],
    });

    // ---- 15 项修饰分类（横切，不作为独立效果平铺，供前端下拉/护栏派生）----
    this.register('M_SCOPE', { handlerKey: '_modifier', kind: 'marker',
      desc: '修饰·作用域：self/enemy/ally/enemyAll/allyAll/all',
      params: [P('value', 'enum', { required: true, desc: '四选一' })], guard: '必须属于枚举' });
    this.register('M_FACTION', { handlerKey: '_modifier', kind: 'marker',
      desc: '修饰·阵营域：现存所有阵营枚举',
      params: [P('value', 'string', { required: true })], guard: '必须属于 factionRegistry' });
    this.register('M_STAT', { handlerKey: '_modifier', kind: 'marker',
      desc: '修饰·数值域：格斗/射击/结构/HP/机动/体积/充能/AP/能量/耐久/命中/闪避',
      params: [P('value', 'enum', { required: true })], guard: '必须属于 stat 枚举' });
    this.register('M_PART', { handlerKey: '_modifier', kind: 'marker',
      desc: '修饰·作用部件：机体/跟随/武器/防具/载具/背包',
      params: [P('value', 'enum', { required: true })], guard: '必须属于 part 枚举' });
    this.register('M_STATUS', { handlerKey: '_modifier', kind: 'marker',
      desc: '修饰·状态：管道已有状态枚举（引用，新状态定义归 AFTER）',
      params: [P('value', 'string', { required: true })], guard: '必须存在于状态库' });
    this.register('M_SKILL_TYPE', { handlerKey: '_modifier', kind: 'marker',
      desc: '修饰·技能类型：近战/远程/自动化',
      params: [P('value', 'enum', { required: true })], guard: '必须属于枚举' });
    this.register('M_SKILL_ATTR', { handlerKey: '_modifier', kind: 'marker',
      desc: '修饰·技能属性：管道已有技能属性枚举',
      params: [P('value', 'string', { required: true })], guard: '必须存在于技能属性库' });
    this.register('M_TERRAIN', { handlerKey: '_modifier', kind: 'marker',
      desc: '修饰·地形：地图编辑器地形枚举',
      params: [P('value', 'string', { required: true })], guard: '必须存在于地形库' });
    this.register('M_PHASE', { handlerKey: '_modifier', kind: 'marker',
      desc: '修饰·时机相位：回合开始/移动行动/…/结束行动（与主分类·时机正交）',
      params: [P('value', 'enum', { required: true })], guard: '必须属于相位枚举' });
    this.register('M_RANGE', { handlerKey: '_modifier', kind: 'marker',
      desc: '修饰·范围：射程范围/移动范围/全域/指定区域（不补形状维度）',
      params: [P('value', 'enum', { required: true })], guard: '必须属于枚举' });
    this.register('M_OP', { handlerKey: '_modifier', kind: 'marker',
      desc: '修饰·数值运算：固定值/倍率/百分比/累加/取最大值',
      params: [P('value', 'enum', { required: true })], guard: '必须属于枚举' });
    this.register('M_PROB', { handlerKey: '_modifier', kind: 'marker',
      desc: '修饰·概率权重：必定/概率%',
      params: [P('value', 'string', { required: true, desc: " 'always' 或 0~1" })], guard: 'probability ∈ [0,1] 或 always' });
    this.register('M_DURATION_UNIT', { handlerKey: '_modifier', kind: 'marker',
      desc: '修饰·时效：阶段/回合/轮次（与 AFTER 三元一致）',
      params: [P('value', 'enum', { required: true })], guard: '必须属于枚举' });
    this.register('M_FLOW', { handlerKey: '_modifier', kind: 'marker',
      desc: '修饰·流转方式：消耗/产出/转移/互换',
      params: [P('value', 'enum', { required: true })], guard: '必须属于枚举' });
    this.register('M_VISION', { handlerKey: '_modifier', kind: 'marker',
      desc: '修饰·视野（待补，方案1轻量建模）：需视线/无视遮挡/仅夜间可见',
      params: [P('value', 'enum')], guard: '暂作语义标注，引擎不接入 LoS' });
    // 注：custom（空壳）/ spawn_items（桩位 warn）刻意不注册，避免误导策划。
  }
}

// 单例导出（与 effectExecutor 同生命周期，零副本风险）
const atomRegistry = new AtomRegistry();

module.exports = atomRegistry;
module.exports.AtomRegistry = AtomRegistry;
