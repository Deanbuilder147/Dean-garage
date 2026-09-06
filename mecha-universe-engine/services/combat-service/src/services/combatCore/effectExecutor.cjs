/**
 * EffectExecutor v3.0 — 效果执行器 (Phase 10 万能语法中枢)
 *
 * 职责:
 * 1. 根据 effects[].type 映射到具体效果处理器
 * 2. 执行词条效果（确定性公式 + 骰子驱动）
 * 3. 支持效果组合和链式执行
 * 4. Phase 10: 新增 damage_kind 分流 / 高地优势 / 手动摇骰处理器
 */

const damagePipe = require('./damagePipe.cjs');
const { splitDamageAmongTargets } = require('./damagePipe.cjs');
const buffManager = require('./buffManager.cjs');
const { getGlossaryConfig } = require('./configLoader.cjs');
// ★ 2.0B.4：装备耐久管理器（单例，与 gateway/combatBridge 共享 _state / _locks）
const equipmentDurability = require('./equipmentDurability.cjs');

class EffectExecutor {
  constructor() {
    this.handlers = {
      // 伤害相关
      instant_kill: this.handleInstantKill.bind(this),
      damage_bonus_dice: this.handleDamageBonusFixed.bind(this),
      damage_reduction: this.handleDamageReduction.bind(this),
      direct_damage: this.handleDirectDamage.bind(this),
      // ★ 契约对齐：前端/编辑器 EFFECT_TYPE.DAMAGE='damage' 与 handler 内部 key 'direct_damage'
      //   长期并存，executeSync 用 effect.type 路由，故补充别名使 type:'damage' 也能路由到真实伤害逻辑。
      damage: this.handleDirectDamage.bind(this),

      // 判定相关 — 去骰化
      duel_resolution: this.handleDuelResolution.bind(this),
      luck_resolution: this.handleLuckResolution.bind(this),
      plunder_attempt: this.handlePlunderAttempt.bind(this),

      // 行动相关
      grant_extra_turn: this.handleGrantExtraTurn.bind(this),
      block_movement: this.handleBlockMovement.bind(this),

      // 支援相关
      assist_choice: this.handleAssistChoice.bind(this),

      // 生成相关
      spawn_items: this.handleSpawnItems.bind(this),

      // Buff相关（apply_buff 旧空壳已废弃，status/buff/debuff 统一重定向到 modify_stat）
      remove_buff: this.handleRemoveBuff.bind(this),

      // 属性修改
      modify_stat: this.handleModifyStat.bind(this),

      // 特殊
      custom: this.handleCustomEffect.bind(this),

      // 隐身效果
      enter_stealth: this.handleEnterStealth.bind(this),
      exit_stealth: this.handleExitStealth.bind(this),
      stealth_attack_bonus: this.handleStealthAttackBonus.bind(this),
      stealth_evasion: this.handleStealthEvasion.bind(this),

      // Phase 10: 万能语法中枢新增
      height_advantage: this.handleHeightAdvantage.bind(this),
      terrain_kind_modifier: this.handleTerrainKindModifier.bind(this),
      manual_roll: this.handleManualRoll.bind(this),

      // ★ 2.0B.4 K1 装备锁定：钳 0 + destroyed + 移除加成，本局不可恢复（经 equipmentDurability.lockDurability）
      equipment_lock: this.handleEquipmentLock.bind(this),

      // ============================================================
      // 批次2 E/F/G/H/I/J 组零引用原子 — 全部 JSON 字段驱动，绝不硬编码 skillId
      // 统一经 _resolveEffectTargets 支持 target_scope 重定向（self/primary/area/ally/enemy/all）
      // ============================================================
      // E 组（大模型语义还原）
      resource_recovery: this.handleResourceRecovery.bind(this), // E1 资源回复（HP/能量/行动点/护盾）
      recover: this.handleResourceRecovery.bind(this),           // 编辑器别名
      recovery: this.handleResourceRecovery.bind(this),         // 存量 legacy 'recovery' 类型别名（默认回 HP）
      durability_consumption: this.handleDurabilityConsumption.bind(this), // E2 耐久度消耗
      slot_occupancy: this.handleSlotOccupancy.bind(this),       // E3 技能槽占用校验（veto）

      // F 组（状态/护盾/充能/互斥/失效）
      shield: this.handleShield.bind(this),                      // F3 护盾
      charge_layer: this.handleChargeLayer.bind(this),           // F4 充能层
      mutual_exclusion: this.handleMutualExclusion.bind(this),   // F5 互斥
      permanent_disable: this.handlePermanentDisable.bind(this), // F6 永久失效

      // G 组（秩序操控）
      action_debt: this.handleActionDebt.bind(this),             // G2 行动债
      preempt: this.handlePreempt.bind(this),                    // G3 抢占
      order_rewrite: this.handleOrderRewrite.bind(this),         // G4 序改写
      forfeit_move: this.handleForfeitMove.bind(this),           // G5 放弃移动
      skip_mobility: this.handleSkipMobility.bind(this),         // G6 跳过机动判定
      displace: this.handleDisplace.bind(this),                  // G8 位移（B.1 三分法）
      resolve_target: this.handleResolveTarget.bind(this),        // B.4 目标解析（独立原子）

      // H/I/J 组（感知/信息/所有权）
      visibility: this.handleVisibility.bind(this),              // I1 可见性变更
      selectable: this.handleSelectable.bind(this),              // I2 可选中
      scan_reveal: this.handleScanReveal.bind(this),             // I3 扫描揭示
      plunder: this.handlePlunder.bind(this),                    // J1 抢夺所有权

      // ★ 步骤4（补完计划）：67 原子清单里前端已列、引擎原本缺位的 handler
      direct_damage_split: this.handleDirectDamageSplit.bind(this), // D3 伤害均摊
      grant_revoke_action: this.handleGrantRevokeAction.bind(this), // G7 授予/剥夺行动
      limit_no_chain: this.handleLimitNoChain.bind(this),           // G8 防连锁
      map_cannon: this.handleMapCannon.bind(this),                  // H1 地图炮（origin=自身）
      aoe: this.handleAoe.bind(this),                               // H2 AOE（origin=射程内落点）
      rewrite_entry: this.handleRewriteEntry.bind(this),            // K1 词条改写词条
      trigger_entry: this.handleTriggerEntry.bind(this),             // B.3 词条联动触发
      spawn_unit: this.handleSpawnUnit.bind(this),                   // B.2 召唤生成单位
      cost_ap: this.handleCostAp.bind(this),                         // C_AP_COST 消耗行动点
      cost_energy: this.handleCostEnergy.bind(this),                 // C_ENERGY_COST 消耗能量
      cost_durability: this.handleCostDurability.bind(this),         // C_DURABILITY_COST 消耗耐久
      player_optional: this.handlePlayerOptional.bind(this),        // K3 玩家可选发动
      interrupt_window: this.handleInterruptWindow.bind(this),      // K4 打断响应窗口

      // ============================================================
      // 批次2后半程：9 个 GAP Handler 增量补全（原 doc:❌）
      // B4 三单位共线 / B8 充能叠层 / B10 冷却就绪 / C5+C6 核心表达式（route __core_expr__）
      // D4 伤害分担 / D6 护甲穿透 / D7 反伤 / G7 解除前置
      // 全部 JSON 字段驱动，绝不硬编码 skillId；平衡敏感项（D4/D6/D7）写入 _meta 标记 +
      // damagePipe 最小读取钩子（带护栏常量），不破战斗核心数值链。
      // ============================================================
      collinear: this.handleCollinear.bind(this),                    // B4 三单位共线判定
      charge_stack: this.handleChargeStack.bind(this),              // B8 充能层数=N 校验
      cooldown: this.handleCooldown.bind(this),                     // B10 冷却就绪判定
      damage_share: this.handleDamageShare.bind(this),              // D4 伤害分担（写 _meta 标记）
      armor_pierce: this.handleArmorPierce.bind(this),              // D6 护甲穿透（写 _meta 标记）
      reflect_damage: this.handleReflectDamage.bind(this),           // D7 反伤（写 _meta 标记）
      prerequisite_clear: this.handlePrerequisiteClear.bind(this),  // G7 解除前置（复用 removed_requirements）

      // M_* 修饰原子语义占位：修饰横切原子（作用域/数值域/范围等）不独立结算，
      // 仅作前端下拉/护栏派生；若被误当独立 atom 发送，安全跳过不崩溃。
      _modifier: this.handleModifierNop.bind(this),
    };
  }

  /**
   * M_* 修饰原子安全占位：修饰类语义（M_SCOPE/M_STAT/M_RANGE...）不独立产生副作用，
   * 仅承载于 DO/AFTER/COST 原子的参数内。收到独立 _modifier 请求时明确跳过，
   * 避免 atomRegistry 注册 _modifier 悬空导致 executeSync 抛 HANDLER 缺失。
   */
  handleModifierNop(effect, context) {
    context._events = context._events || [];
    context._events.push({ type: 'modifier_noop', semantic: effect._semantic || effect.type, note: '修饰原子不独立结算' });
    return { type: '_modifier', success: true, skipped: true };
  }

  /**
   * ★ 2.0B.4 K1 equipment_lock — 装备锁定（钳 0 + 标记 destroyed + 移除加成，本局不可恢复）
   * 挂载到 equipmentDurability.lockDurability，并派发 unit_stats_recalculated 事件，
   * 前端经 /state 轮询读取 unit.equipState[slot].destroyed 将该装备槽实时置灰。
   */
  handleEquipmentLock(effect, context) {
    const mgr = equipmentDurability;
    // target:'self' 锁定自身装备；否则锁定技能目标（context.target 优先，回落 targetUnit）
    const unit = (effect.target === 'self')
      ? context.unit
      : (context.target || context.targetUnit);
    const slot = effect.slot || (effect.params && effect.params.slot) || effect.slot_name;
    if (!unit || !slot) {
      context._events = context._events || [];
      context._events.push({ type: 'unit_stats_recalculated', ok: false, reason: 'missing unit/slot' });
      return { locked: false, reason: 'missing unit/slot' };
    }
    const lockRes = mgr.lockDurability(unit, slot);
    // 派发 unit_stats_recalculated 事件（前端经 /state 落库 equipState.destroyed 刷新面板）
    context._events = context._events || [];
    context._events.push({
      type: 'unit_stats_recalculated',
      unitId: unit.id || unit.unit_id,
      slot,
      destroyed: true,
      locked: true,
      durability: (lockRes && lockRes.durability != null) ? lockRes.durability : 0,
    });
    return {
      locked: true,
      slot,
      unitId: unit.id || unit.unit_id,
      durability: (lockRes && lockRes.durability != null) ? lockRes.durability : 0,
    };
  }

  async execute(effects, context) {
    if (!effects || effects.length === 0) {
      return [{ success: true, reason: 'no_effects' }];
    }

    const results = [];
    for (const effect of effects) {
      const result = await this.executeSingle(effect, context);
      results.push(result);
      if (result.interrupt || result.veto) break;
    }
    return results;
  }

  /**
   * ★ 步骤1（P0·引擎兜底）：别名重定向 —— 统一 resolve 入口
   * 抽离自 executeSingle 的存量兼容适配器，executeSync 同样调用，消除"ROLL 分支里
   * 写 type:'status'/'recovery' 静默失败"的头号断点（补完计划断点1）。
   * 同时补齐缺失别名：heal/displacement/buff/debuff。
   * @returns { handlerType:string, params:object } —— params 可能被改写（如 damage→amount）
   */
  _resolveHandlerType(type, params) {
    let handlerType = type;
    let p = params;
    if (type === 'status') {
      // 7 条存量 status 均带 target_stat/value/duration，modify_stat 原生认这些字段
      // 注：apply_buff 为空壳，故所有 status 重定向到真实有副作用的 modify_stat
      handlerType = 'modify_stat';
    } else if (type === 'damage') {
      // 2 条存量 damage 带 flat_value（负=造成伤害，正=加成），直接对 target 真实结算
      handlerType = 'direct_damage';
      p = { ...params };
      p.amount = Math.abs(Number(params.flat_value) || 0);
      p.armor_pen = params.armor_pen != null ? Number(params.armor_pen) : 0;
    } else if (type === 'recovery' || type === 'heal') {
      // 2.1 恢复主链落地 + 补 heal 别名：HP 恢复归一到真实有副作用的 resource_recovery
      handlerType = 'resource_recovery';
    } else if (type === 'displacement') {
      // 补 displacement 别名 → displace（前端命名断层修复）
      handlerType = 'displace';
    } else if (type === 'buff' || type === 'debuff' || type === 'apply_buff') {
      // 补 buff/debuff/apply_buff 别名 → modify_stat（apply_buff 旧空壳已废弃）
      handlerType = 'modify_stat';
    }
    return { handlerType, params: p };
  }

  async executeSingle(effect, context) {
    const { type, ...params } = effect;

    // ============================================================
    // ★ 存量兼容适配器（P0：修复"原子命名断层"导致的 unknown_effect_type 伪成功）
    // 迁移脚本把动作收敛成 UI 分类名 status/damage/recovery，但引擎只认具体 Handler。
    // 在此分发层做别名重定向，零破坏（不改 9 条 JSON 的 type 字段）。
    // 注：apply_buff 为空壳，故所有 status 重定向到真实有副作用的 modify_stat。
    // ============================================================
    const { handlerType, params: resolved } = this._resolveHandlerType(type, params);

    const handler = this.handlers[handlerType];
    if (!handler) {
      console.warn(`[EffectExecutor] 未知效果类型: ${type}（重定向至 ${handlerType} 仍无 Handler）`);
      return { type, success: false, reason: 'unknown_effect_type' };
    }
    try {
      return await handler(resolved, context);
    } catch (error) {
      console.error(`[EffectExecutor] 执行效果失败: ${type}`, error);
      return { type, success: false, reason: 'execution_error', error: error.message };
    }
  }

  /**
   * ★ 项9：同步执行入口（供 skillExecutor 在 executeUniversalSkill 同步签名内调用）
   * 直接同步调用 handler（async 函数在首个 await 前同步执行完副作用，combat-service 内存
   * 结算 handlers 无 IO await，故副作用在调用时即完成）。返回 { applied, log } 供战报聚合。
   */
  executeSync(effects, context) {
    const applied = [];
    if (!effects || !effects.length) return { applied, log: [] };
    for (const effect of effects) {
      const { type, ...rest } = effect;
      const params = { ...rest };
      // ★ 步骤1：同步路径同样走别名重定向（修复 executeSingle 有而 executeSync 缺的断层）
      const { handlerType, params: resolved } = this._resolveHandlerType(type, params);
      const handler = this.handlers[handlerType];
      if (!handler) {
        console.warn(`[EffectExecutor] 未知效果类型: ${type}（重定向至 ${handlerType} 仍无 Handler）`);
        applied.push({ type, success: false, reason: 'unknown_effect_type' });
        continue;
      }
      // ★ 项11：段末预检（pre-flight precheck）— 缺必填字段则跳过并告警，绝不静默成功
      const pre = this._precheck(effect);
      if (!pre.ok) {
        console.warn(`[EffectExecutor] 预检失败 ${type}: 缺 ${pre.missing.join(',')}`);
        applied.push({ type, success: false, reason: 'precheck_failed', missing: pre.missing });
        continue;
      }
      // ★ 项10：段末目标射程核查（仅提示，不阻断结算）
      this._verifyRange(effect, context);
      try {
        const result = handler(resolved, context); // 同步调用：副作用即时完成
        if (result && result.veto) {
          applied.push({ type, success: false, veto: true, reason: result.reason });
          break; // veto 中断本段后续效果
        }
        if (result && result.interrupt) {
          applied.push({ type, success: true, interrupt: true, reason: result.reason });
          break; // interrupt 中断本段后续效果（如即死已置目标 HP=0）
        }
        applied.push({ type, success: true });
      } catch (error) {
        console.error(`[EffectExecutor] 同步执行效果失败: ${type}`, error);
        applied.push({ type, success: false, reason: 'execution_error', error: error.message });
      }
    }
    return { applied, log: applied.map((a) => `${a.type}:${a.success ? 'ok' : 'fail'}`) };
  }

  /**
   * 立即斩杀 — 去骰化、无门槛：词条携带即死原子即无条件置目标 HP=0（立即死亡）。
   * 不投骰、不判定阈值 —— 即死原子命中即死，无概率、无门槛。
   * 返回 interrupt:true 让 execute/executeSync 中断本段后续效果（目标已死，无需再结算）。
   */
  handleInstantKill(params, context) {
    // target:'self' 锁定自身；否则锁定技能目标（context.target 优先，回落 targetUnit）
    const target = (params.target === 'self')
      ? context.unit
      : (context.target || context.targetUnit);
    if (!target) {
      console.warn('[EffectExecutor] instant_kill 缺少目标，跳过');
      return { type: 'instant_kill', success: false, reason: 'missing_target' };
    }

    // 立即死亡：直接置 HP=0，并同步 current_hp
    target.hp = 0;
    if ('current_hp' in target) target.current_hp = 0;
    target._meta = target._meta || {};
    target._meta.immediate_death = true;
    target._meta.dead = true;

    return {
      type: 'instant_kill',
      success: true,
      killed: true,
      result: 'target_eliminated',
      interrupt: true,
    };
  }

  /**
   * 伤害加成 — 去骰化：固定值加成
   */
  async handleDamageBonusFixed(params, context) {
    const bonus = params.fixed || params.bonus?.fixed || 4;

    if (context.damageContext) {
      context.damageContext.addStep({
        source: 'effect',
        type: 'tag_bonus',
        value: bonus,
        description: `专注射击: +${bonus}伤害`
      });
    }

    return {
      type: 'damage_bonus_dice',
      success: true,
      bonus
    };
  }

  /**
   * ★ P0 真实伤害结算（根治 damage 型存量词条"依赖 damageContext 才能生效"的空壳问题）
   * 当技能独立触发（非攻击结算内，无 damageContext）时，直接对 target 真实扣血。
   * amount 为伤害值；armor_pen 透传（此处做简单减伤：pen 越高实际伤害越接近 amount）。
   * 兼容 params.target_unit（对象）/ params.target('self'|'target'）。
   */
  async handleDirectDamage(params, context) {
    // ★ 阶段一 E/F：damage_mode 占位读取（'override'|'bonus'，默认 bonus）。
    //   注：阶段一 Segment 走 direct_damage 旁路（与谓语主伤害独立），override 与 bonus 在旁路下
    //   除战报标注外数值行为一致；真正"override 并回主伤害线"由阶段二 C 架构改造实现。
    const damageMode = params.damage_mode === 'override' ? 'override' : 'bonus';

    // ★ 阶段一 D：效果级目标重定向（target_scope）。
    //   SINGLE_ENEMY / 未声明 → 原单体逻辑；AREA_ENEMY → 敌方全体；ALL_UNITS → 除施法者外全体。
    const targetScope = params.target_scope || 'SINGLE_ENEMY';
    let targets = [];
    if (targetScope === 'AREA_ENEMY' || targetScope === 'ALL_UNITS') {
      const allUnits = (context && context.allUnits) || [];
      const caster = context && (context.attacker || context.unit);
      allUnits.forEach((u) => {
        if (!u || (caster && u.id === caster.id)) return;
        if (targetScope === 'AREA_ENEMY' && caster && u.faction === caster.faction) return; // 仅敌方
        targets.push(u);
      });
      if (targets.length === 0 && context.target) targets.push(context.target);
    } else {
      let t = params.target_unit || context.target || context.unit;
      if (!params.target_unit) {
        const sel = params.target;
        if (sel === 'self') t = context.unit;
        else if (sel === 'target') t = context.target || context.unit;
      }
      if (t) targets.push(t);
    }
    if (!targets.length) return { type: 'direct_damage', success: false, reason: 'no_target' };

    // ★ 契约对齐：伤害数值字段兼容 amount / flat_value / value 三种命名
    //   （编辑器契约用 flat_value；前端 EffectStackBuilder 生成 value；verify 脚本用 amount）。
    //   约定：伤害量取绝对值（flat_value=-2 与 amount=2 等价，均表示「造成 2 点伤害」）。
    const raw = Math.abs(Number(params.amount ?? params.flat_value ?? params.value)) || 0;
    const pen = Number(params.armor_pen) || 0;

    // ★ 阶段二 C：主伤害管线汇流（useMainPipe）。
    //   仅当调用方显式开启 context.useMainPipe（由 skillExecutor 在纯 Segment 模型词条结算时注入）
    //   时，对每个目标走 DamagePipe.calculate 真实减伤 + 暴击倍率，替代阶段一的裸占位公式。
    //   存量词条 / Branch 模型不受此分支影响（保持原裸 raw 行为，满足无回归约束）。
    const useMainPipe = context && context.useMainPipe === true;
    const attacker = (context && (context.attacker || context.unit)) || {};
    const damageKind = params.damage_kind || attacker.weaponType || 'kinetic';
    const attackType = attacker.attack_stat === 'ranged' ? 'ranged' : (params.attack_type || 'melee');
    const terrainDefs = (context && context.battleState && context.battleState.terrainDefs) || {};
    // ★ 阶段二 C + 阶段一 E：split_mode 'equal' 时，flat_value 视为「总伤害」，先按目标数拆分到每份基础值，
    //   再各自走 DamagePipe 真实减伤（保证多目标各自独立减伤，而非对总额稀释）。
    //   非均摊时每份基础值 = raw（完整 flat_value）。
    const nTargets = Math.max(1, targets.length);
    // ★ 阶段二 C + 阶段一 E 契约：split_mode 'equal' 时，flat_value 视为「总伤害」，
    //   先经 splitDamageAmongTargets 做整数均摊（余数给首个目标），保证总额守恒且分布为 [4,3,3] 形态；
    //   每个目标再各自走 DamagePipe 真实减伤（或占位公式），多目标独立减伤而非对总额稀释。
    //   非均摊时每份基础值 = raw（完整 flat_value）。
    const perTargetBase = (params.split_mode === 'equal' && targets.length > 1)
      ? splitDamageAmongTargets(raw, nTargets)
      : [raw];
    const dealOne = (defender, baseVal) => {
      if (!useMainPipe) {
        // 占位简化减伤：armor 默认 0，pen 每点抵消 5% 减免（阶段一原行为）
        return Math.round(baseVal * (1 + pen * 0.05));
      }
      const cfg = {
        attacker, defender,
        attack_type: attackType,
        damage_kind: damageKind,
        baseDamage: baseVal,
        terrainDefs,
        armor_pen: pen,
        // ★ 阶段二 C：Segment 固定伤害默认抑制随机暴击（确定性），
        //   仅当效果显式 allow_crit:true 时才放行暴击介入。
        suppressCrit: params.allow_crit !== true,
      };
      const pipeResult = damagePipe.calculate(cfg);
      return pipeResult && Number.isFinite(pipeResult.final_damage) ? pipeResult.final_damage : baseVal;
    };

    // 计算每个目标真实伤害（经主管线或占位公式）。均摊场景已由 perTargetBase 整数预拆分，无需二次均摊。
    const perTarget = targets.map((t, idx) => dealOne(t, perTargetBase[idx] ?? 0));
    const totalDealt = perTarget.reduce((s, v) => s + v, 0);

    const dealtList = [];
    targets.forEach((target, idx) => {
      const dealt = perTarget[idx] ?? 0;
      const maxHp = target.max_hp || target.hp || (target.current_hp ?? 100);
      const before = target.current_hp ?? target.hp ?? maxHp;
      const after = Math.max(0, before - dealt);
      if (target.current_hp != null) target.current_hp = after;
      else if (target.hp != null) target.hp = after;
      dealtList.push({ id: target.id, dealt, before, after });
    });

    // ★ 阶段二 C：把本次 Segment 伤害累加到 context.segDamageAccum（供 skillExecutor 汇流 finalDamage）。
    //   仅当该累加器由调用方显式初始化（_resolveRollSegments 注入）时才写，避免污染无关上下文。
    if (context && typeof context.segDamageAccum === 'number') {
      context.segDamageAccum += totalDealt;
    }

    return {
      type: 'direct_damage',
      success: true,
      damageMode,
      useMainPipe,
      targetScope,
      totalDealt,
      split: params.split_mode === 'equal' && targets.length > 1,
      targets: dealtList
    };
  }

  /**
   * 伤害减免（抗性）
   */
  async handleDamageReduction(params, context) {
    const { amount = 2, conditions, damage_kind } = params;

    if (conditions) {
      const meetsCondition = await this.checkConditions(conditions, context);
      if (!meetsCondition) {
        return { type: 'damage_reduction', success: false, reason: 'conditions_not_met' };
      }
    }

    // Phase 10: damage_kind 感知
    const attackerWeaponType = context.attacker?.weaponType || 'kinetic';
    if (damage_kind && damage_kind !== attackerWeaponType) {
      return { type: 'damage_reduction', success: true, reduction: 0, reason: 'damage_kind_mismatch' };
    }

    if (context.damageContext) {
      context.damageContext.addStep({
        source: 'effect',
        type: 'damage_reduction',
        value: -amount,
        description: `抗性: -${amount}伤害`
      });
    }

    return { type: 'damage_reduction', success: true, reduction: amount };
  }

  /**
   * 决斗判定 — 去骰化：比较 max_attack 值
   */
  async handleDuelResolution(params, context) {
    const attacker = context.attacker || {};
    const defender = context.defender || context.target || {};

    const maxA = Math.max(attacker.melee || attacker.attack || 10, attacker.ranged || 0);
    const maxB = Math.max(defender.melee || defender.attack || 10, defender.ranged || 0);

    let winner;
    if (maxA > maxB) winner = 'attacker';
    else if (maxB > maxA) winner = 'defender';
    else winner = 'tie';

    return {
      type: 'duel_resolution',
      success: true,
      statA: maxA,
      statB: maxB,
      winner,
      result: winner === 'attacker' ? 'attacker_wins' :
              winner === 'defender' ? 'defender_wins' : 'draw'
    };
  }

  /**
   * 幸运判定 — 去骰化：始终成功
   */
  async handleLuckResolution(params, context) {
    return {
      type: 'luck_resolution',
      success: true,
      lucky: true,
      result: 'gain_extra_action'
    };
  }

  /**
   * 抢夺判定 — 去骰化：确定性条件
   */
  async handlePlunderAttempt(params, context) {
    const targetWeaponAtk = context.target?.left_hand_melee ||
                            context.target?.left_hand_shooting || 0;

    if (targetWeaponAtk <= 0) {
      return { type: 'plunder_attempt', success: false, result: 'no_weapon_to_seize' };
    }

    return {
      type: 'plunder_attempt',
      success: true,
      result: 'weapon_seized',
      weapon: {
        name: context.target?.left_hand_name,
        attack: targetWeaponAtk
      }
    };
  }

  async handleGrantExtraTurn(params, context) {
    const { unitId } = params;
    const targetUnit = unitId ? context.getUnit(unitId) : context.attacker;
    if (!targetUnit) {
      return { type: 'grant_extra_turn', success: false, reason: 'unit_not_found' };
    }
    targetUnit.extraTurn = true;
    return { type: 'grant_extra_turn', success: true, unitId: targetUnit.id };
  }

  /**
   * G_block_movement：移动阻断标记。
   * 真实写入目标 unit._meta.flags.block_movement = true，使移动寻路 / ZOC 判定侧能读取该阻断标记。
   * 可选 params.duration（回合数）记入 flags 元数据，供到期清理/判定过期；缺省为持续阻断。
   */
  async handleBlockMovement(params, context) {
    const target = context.target || context.targetUnit || context.unit;
    if (!target) {
      return { type: 'block_movement', success: false, error: '无目标单位' };
    }
    target._meta = target._meta || {};
    target._meta.flags = target._meta.flags || {};
    const duration = typeof params.duration === 'number' ? params.duration : undefined;
    target._meta.flags.block_movement = true;
    if (duration !== undefined) {
      target._meta.flags.block_movement_until = (context.battle && context.battle.round || 0) + duration;
    }
    return {
      type: 'block_movement',
      success: true,
      target_id: target.id,
      duration: duration ?? null,
    };
  }

  async handleAssistChoice(params, context) {
    return { type: 'assist_choice', success: true };
  }

  async handleSpawnItems(params, context) {
    return { type: 'spawn_items', success: true, items: params.items || [] };
  }

  /**
   * B.5 驱散 / 结算清理（承接 B.6 标准 statusEffects 状态栈）。
   * - 指定 buff_key/key：精准移除匹配该 key 的可驱散实例；
   * - 未指定 key 或 scope==='all'：清除目标身上所有「可驱散」状态实例；
   * - 不可驱散防线：挂载 undispellable:true 的实例一律跳过（含全量清理）。
   * 真实就地修改 target.statusEffects，返回移除清单。
   */
  async handleRemoveBuff(params, context) {
    // 目标解析：兼容 target_unit(对象) / target('self'|'target') / 默认施法者
    let target = params.target_unit || context.unit;
    if (!params.target_unit) {
      const t = params.target;
      if (t === 'target') target = context.target || context.unit;
      else if (t === 'self') target = context.unit;
      else target = context.unit;
    }
    if (!target) return { type: 'remove_buff', success: false, reason: 'no_unit' };
    if (!Array.isArray(target.statusEffects)) target.statusEffects = [];

    const key = params.buff_key || params.key || null;
    const doClearAll = !key || params.scope === 'all';

    const removed = [];
    const kept = [];
    for (const e of target.statusEffects) {
      // 不可驱散防线：任何清理都跳过 undispellable
      if (e && e.undispellable) { kept.push(e); continue; }
      if (doClearAll) { removed.push(e); }
      else if (e && (e.key === key || e.source === key)) { removed.push(e); }
      else { kept.push(e); }
    }
    target.statusEffects = kept;

    const removedKeys = removed.map(e => e.key || e.source || (e.type || 'unknown')).filter(Boolean);
    return {
      type: 'remove_buff',
      success: true,
      removed_count: removed.length,
      removed_keys: Array.from(new Set(removedKeys)),
    };
  }

  /**
   * ★ 项9 端到端真实数值修正（根治"伪成功"隐患）
   * 将属性修改（如 stat_type:'MELEE', value:3, duration:1）转化为：
   *   1) 带 duration → 作为标准 Status 实例推入 unit.statusEffects（走双相位衰减：turn_end 保留 / turn_start 清理）
   *   2) 瞬时/永久修正 → 直接累加进 unit._meta.stat_modifiers[statType]（供 currentStats 聚合层消费）
   * 注意：context.unit 为施法者自身；若需修正目标，调用方应在 effect 上显式指定 target_unit。
   */
  async handleModifyStat(params, context) {
    // 目标解析：兼容 target_unit(对象) / target('self'|'target' 字符串) / 默认施法者
    let target = params.target_unit || context.unit;
    if (!params.target_unit) {
      const t = params.target;
      if (t === 'target') target = context.target || context.unit;
      else if (t === 'self') target = context.unit;
      else target = context.unit;
    }
    if (!target) return { type: 'modify_stat', success: false, reason: 'no_unit' };

    const statType = params.target_stat || params.stat_type || params.stat;
    const value = Number(params.value || params.amount) || 0;
    if (!statType) return { type: 'modify_stat', success: false, reason: 'missing_stat_type' };

    // 1) 带 duration：作为 stat_modifier 实例压入状态栈（B.6 叠加三规则 + op 分层）
    if (params.duration) {
      const mod = {
        type: 'stat_modifier',
        key: params.key || params.status_key || context.skillType || ('stat_' + statType),
        stat_type: statType,
        op: params.op || 'add',            // add | percent | multiplier（默认 add，向后兼容）
        value,
        duration: params.duration,
        undispellable: !!params.undispellable,
        source: context.skillType || 'modify_stat',
        expiry_phase: params.expiry_phase || 'turn_end',
      };
      const applied = buffManager.addStatModifier(target, mod);
      return { type: 'modify_stat', success: true, applied_status: applied, modified_stat: statType, value, op: mod.op };
    }

    // 2) 瞬时/永久修正
    // 2a) 永久强化：直接改 baseStats（不进栈、不可驱散）——决策：永久强化走 baseStats
    if (params.permanent) {
      target.baseStats = target.baseStats || {};
      target.baseStats[statType] = (Number(target.baseStats[statType] || 0)) + value;
      return { type: 'modify_stat', success: true, modified_stat: statType, value, permanent: true };
    }
    // 2b) 瞬时修正：累加到 unit._meta.stat_modifiers（currentStats 聚合层读取，向后兼容）
    target._meta = target._meta || {};
    target._meta.stat_modifiers = target._meta.stat_modifiers || {};
    target._meta.stat_modifiers[statType] = (target._meta.stat_modifiers[statType] || 0) + value;

    return { type: 'modify_stat', success: true, modified_stat: statType, value };
  }

  async handleCustomEffect(params, context) {
    const { execute } = params;
    if (typeof execute === 'function') {
      return await execute(params, context);
    }
    return { type: 'custom', success: false, reason: 'no_execute_function' };
  }

  // ============================================================
  // 隐身系统 — 去骰化
  // ============================================================

  async handleEnterStealth(params, context) {
    const unit = context.unit || context.attacker;
    if (!unit) return { type: 'enter_stealth', success: false, reason: 'no_unit' };

    const stealthType = params.type || 'conceal';
    const duration = params.duration || 2;

    unit.stealth = true;
    unit.stealthData = { type: stealthType, duration, appliedAt: Date.now() };

    return {
      type: 'enter_stealth',
      success: true,
      unitId: unit.id,
      stealthType,
      duration
    };
  }

  async handleExitStealth(params, context) {
    const unit = context.unit || context.attacker;
    if (!unit) return { type: 'exit_stealth', success: false, reason: 'no_unit' };
    const { reason } = params;
    const previousState = { stealth: unit.stealth, stealthData: unit.stealthData };

    unit.stealth = false;
    unit.stealthData = null;

    return {
      type: 'exit_stealth',
      success: true,
      result: 'stealth_broken',
      unitId: unit.id,
      reason: reason || 'unknown',
      previousState
    };
  }

  /**
   * 隐身攻击加成 — 去骰化：仅基础乘算
   */
  async handleStealthAttackBonus(params, context) {
    const { multiplier = 1.5 } = params;

    if (!context.damageContext) {
      return { type: 'stealth_attack_bonus', success: false, reason: 'no_damage_context' };
    }

    let bonus = 0;
    if (multiplier && multiplier > 1) {
      const baseDamage = context.damageContext.getTotal() || 0;
      bonus = Math.floor(baseDamage * (multiplier - 1));
    }

    if (bonus > 0) {
      context.damageContext.addStep({
        source: 'tag',
        type: 'stealth_bonus',
        value: bonus,
        description: `奇袭: +${bonus}伤害 (${multiplier}x)`
      });
    }

    return {
      type: 'stealth_attack_bonus',
      success: true,
      bonus,
      multiplier,
      description: `奇袭: 伤害${multiplier}x`
    };
  }

  /**
   * 隐身闪避 — 去骰化：固定概率匹配
   */
  async handleStealthEvasion(params, context) {
    const { evasionChance = 0.5 } = params;
    const evaded = Math.random() < evasionChance;

    return {
      type: 'stealth_evasion',
      success: true,
      evasionChance,
      evaded,
      result: evaded ? 'attack_evaded' : 'attack_hits',
      description: evaded ? '伪装生效: 闪避攻击' : '伪装失效: 攻击命中'
    };
  }

  // ============================================================
  // Phase 10: 万能语法中枢新增处理器
  // ============================================================

  /**
   * 高地优势加成
   * 攻击方比防御方每高1格，给予 per_diff 伤害加成
   */
  async handleHeightAdvantage(params, context) {
    const attacker = context.attacker || {};
    const defender = context.defender || context.target || {};
    const attZ = attacker.z ?? attacker.height ?? 0;
    const defZ = defender.z ?? defender.height ?? 0;
    const diff = attZ - defZ;
    const perDiff = params.per_diff ?? 0;

    if (diff <= 0 || perDiff <= 0) {
      return { type: 'height_advantage', success: true, bonus: 0, height_diff: diff };
    }

    const bonus = Math.floor(diff * perDiff);
    return {
      type: 'height_advantage',
      success: true,
      height_diff: diff,
      bonus,
      message: `高地优势 z+${diff}格, 伤害+${bonus}`
    };
  }

  /**
   * 地形伤害类型修正
   * 根据防御方所在地形的 damage_kind_modifiers 字典，对武器类型施加倍率
   */
  async handleTerrainKindModifier(params, context) {
    const weaponType = context.attacker?.weaponType || 'kinetic';
    const terrainId = context.defender?.terrain || context.target?.terrain || 'moon';

    const config = getGlossaryConfig();
    const terrains = config?.terrains || {};
    const terrainDef = terrains[terrainId] || {};
    const kindMods = terrainDef.damage_kind_modifiers || {};
    const modifier = kindMods[weaponType] || 1.0;

    return {
      type: 'terrain_kind_modifier',
      success: true,
      terrain_id: terrainId,
      damage_kind: weaponType,
      modifier,
      message: modifier !== 1.0
        ? `地形修正: ${terrainDef.name || terrainId} 对 ${weaponType} 倍率 ${modifier}`
        : ''
    };
  }

  /**
   * 手动摇骰处理器 (Phase 10 状态机接入点)
   * 当前为自动模拟，实际使用时挂起等待玩家输入
   */
  async handleManualRoll(params, context) {
    const isManual = params.is_manual_roll || false;
    if (!isManual) {
      return { type: 'manual_roll', success: true, is_manual: false, message: '自动掷骰' };
    }

    // TODO: Phase 10 - state machine hook, currently auto-roll
    const diceType = params.dice_type || '1d6';
    const successLine = params.success_line ?? 4;
    const bonusDamage = params.success_bonus_damage ?? 0;

    // Parse and roll
    const m = String(diceType).match(/^(\d+)d(\d+)$/i);
    const count = m ? parseInt(m[1]) : 1;
    const sides = m ? parseInt(m[2]) : 6;
    let roll = 0;
    for (let i = 0; i < count; i++) roll += Math.floor(Math.random() * sides) + 1;

    const isSuccess = roll >= successLine;

    return {
      type: 'manual_roll',
      success: true,
      is_manual: true,
      roll,
      diceType,
      successLine,
      isSuccess,
      bonus: isSuccess ? bonusDamage : 0,
      message: isSuccess
        ? `[手动摇骰 SUCCESS] 掷${diceType}=${roll} >= ${successLine}, 追加+${bonusDamage}`
        : `[手动摇骰 FAIL] 掷${diceType}=${roll} < ${successLine}`
    };
  }

  // ============================================================
  // 批次2 通用辅助：_meta 初始化 / 目标重定向 / 取值 / 预检 / 射程核查
  // ============================================================
  _ensureMeta(unit) {
    if (!unit) return null;
    unit._meta = unit._meta || {};
    unit._meta.charges = unit._meta.charges || {};
    unit._meta.durability = unit._meta.durability || {};
    unit._meta.charge_layers = unit._meta.charge_layers || {};
    unit._meta.flags = unit._meta.flags || {};
    unit._meta.permanently_disabled_skills = unit._meta.permanently_disabled_skills || [];
    if (unit._meta.action_debt == null) unit._meta.action_debt = 0;
    unit.statusEffects = unit.statusEffects || [];
    return unit._meta;
  }

  // 敌我判定一律走 role（红线：禁止直接比 faction）
  _isOpposite(a, b) {
    if (!a || !b) return false;
    const ra = a.role || a.faction;
    const rb = b.role || b.faction;
    return !!(ra && rb && ra !== rb);
  }

  _hexDistance(a, b) {
    if (!a || !b || a.q == null || b.q == null) return 0;
    const dq = a.q - b.q, dr = a.r - b.r;
    return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
  }

  // 段内目标重定向：把 effect.target_scope 解析为实际作用单位列表
  _resolveEffectTargets(effect, context) {
    const scope = effect.target_scope || 'primary';
    const source = context.unit || context.source || context.attacker;
    const primary = context.targetUnit || context.target || context.defender;
    const allUnits = context.allUnits || [];
    switch (scope) {
      case 'self': return [source].filter(Boolean);
      case 'primary': return [primary].filter(Boolean);
      case 'all': return allUnits.slice();
      case 'enemy':
      case 'AREA_ENEMY':
        return allUnits.filter((u) => source && this._isOpposite(u, source));
      case 'ally':
      case 'AREA_ALLY':
        return allUnits.filter((u) => source && !this._isOpposite(u, source));
      case 'area':
      case 'AREA': {
        const radius = (effect.area_radius != null) ? effect.area_radius
          : (effect.radius != null ? effect.radius : 1);
        if (!primary || primary.q == null) return [primary].filter(Boolean);
        return allUnits.filter((u) => u && u.q != null && this._hexDistance(primary, u) <= radius);
      }
      default: return [primary].filter(Boolean);
    }
  }

  _getPath(obj, path, context) {
    if (path == null) return undefined;
    if (typeof path === 'function') return path(obj, context);
    if (typeof path === 'string' && path.startsWith('context.')) {
      let cur = context;
      for (const k of path.slice(8).split('.')) cur = cur && cur[k];
      return cur;
    }
    let cur = obj;
    for (const k of String(path).split('.')) cur = cur && cur[k];
    return cur;
  }

  // JSON 字段驱动取值：value 直接值 / value_method=percent_max_hp|scale_with|ref + value_ref
  _resolveValue(effect, target, context) {
    const t = target || context.targetUnit || context.target;
    const method = effect.value_method || effect.valueMethod;
    const ref = effect.value_ref || effect.valueRef;
    if (method === 'percent_max_hp' && ref) {
      const maxHp = (t && (t.maxHp || t.max_hp)) || 100;
      const pct = Number(effect.rate != null ? effect.rate : (effect.scalar != null ? effect.scalar : 0));
      return Math.max(0, Math.round(maxHp * pct / 100));
    }
    if (method === 'scale_with' && ref) {
      const base = Number(this._getPath(effect, ref, context)) || 0;
      const scalar = Number(effect.scalar != null ? effect.scalar : (effect.rate != null ? effect.rate : 1));
      return Math.round(base * scalar);
    }
    if (method === 'ref' && ref) {
      return Number(this._getPath(effect, ref, context)) || 0;
    }
    if (effect.value != null) return Number(effect.value) || 0;
    if (effect.amount != null) return Number(effect.amount) || 0;
    return 0;
  }

  // 项11：预检必填字段
  _PRECHECK() {
    return {
      durability_consumption: ['target_kind'],
      slot_occupancy: ['slot'],
      charge_layer: ['layer_key'],
      mutual_exclusion: ['group'],
      permanent_disable: ['target_skill'],
      order_rewrite: ['from', 'to'],
      visibility: ['state'],
      selectable: ['value'],
      plunder: ['take'],
    };
  }

  _precheck(effect) {
    const map = this._PRECHECK();
    const req = map[effect.type];
    if (!req) return { ok: true };
    const missing = req.filter((f) => effect[f] == null);
    return missing.length ? { ok: false, missing } : { ok: true };
  }

  // 项10：段末射程核查（仅提示，不阻断）
  _verifyRange(effect, context) {
    if (effect.min_range == null && effect.max_range == null) return;
    const src = context.unit || context.source;
    const tgt = context.targetUnit || context.target;
    if (!src || !tgt || src.q == null || tgt.q == null) return;
    const d = this._hexDistance(src, tgt);
    const maxR = effect.max_range != null ? effect.max_range : Infinity;
    const minR = effect.min_range != null ? effect.min_range : 0;
    if (d < minR || d > maxR) {
      console.warn(`[EffectExecutor] 段末射程核查: ${effect.type} 距=${d} 超出 [${minR},${maxR}]（仅提示）`);
    }
  }

  // ============================================================
  // 批次2 E 组：大模型语义还原
  // ============================================================

  /**
   * E1 资源回复 — JSON 字段驱动：effect.resource(hp|energy|ap|shield) + value[/value_method/value_ref]
   */
  handleResourceRecovery(effect, context) {
    const targets = this._resolveEffectTargets(effect, context);
    const resource = effect.resource || 'hp';
    const logs = [];
    for (const u of targets) {
      this._ensureMeta(u);
      const val = this._resolveValue(effect, u, context);
      let applied = 0;
      switch (resource) {
        case 'hp': {
          const maxHp = u.maxHp || u.max_hp || 100;
          const before = u.hp || 0;
          u.hp = Math.min(maxHp, before + val);
          applied = u.hp - before;
          break;
        }
        case 'energy': {
          const maxE = u.maxEnergy || u.max_energy || 100;
          const before = u.energy || 0;
          u.energy = Math.min(maxE, before + val);
          applied = u.energy - before;
          break;
        }
        case 'ap':
        case 'action_point': {
          const maxAP = u.maxActionPoints != null ? u.maxActionPoints : (u.maxActionPoints || 3);
          const before = u.actionPoints != null ? u.actionPoints : (u.action_points || 0);
          u.actionPoints = Math.min(maxAP, before + val);
          applied = u.actionPoints - before;
          break;
        }
        case 'shield': {
          const before = u.shield || 0;
          u.shield = before + val;
          applied = val;
          break;
        }
        default: applied = 0;
      }
      logs.push({ unitId: u.id || u.unit_id, resource, delta: applied });
    }
    return { type: 'resource_recovery', success: true, resource, affects: logs };
  }

  /**
   * E2 耐久度消耗 — effect.target_kind(equipment|skill) + slot/skill_key + amount
   */
  handleDurabilityConsumption(effect, context) {
    const targets = this._resolveEffectTargets(effect, context);
    const kind = effect.target_kind || 'skill';
    const amount = Number(effect.amount || effect.value || 1);
    const logs = [];
    for (const u of targets) {
      this._ensureMeta(u);
      if (kind === 'equipment') {
        const slot = effect.slot || (effect.params && effect.params.slot);
        if (!slot) { logs.push({ unitId: u.id || u.unit_id, ok: false, reason: 'missing slot' }); continue; }
        const res = equipmentDurability.consumeDurability(u, slot, amount);
        logs.push({ unitId: u.id || u.unit_id, slot, left: res && res.durability });
      } else {
        const key = effect.skill_key || effect.skillId || effect.value_ref;
        if (!key) { logs.push({ unitId: u.id || u.unit_id, ok: false, reason: 'missing skill_key' }); continue; }
        const cur = u._meta.durability[key] != null ? u._meta.durability[key]
          : (u._meta.durabilityMax && u._meta.durabilityMax[key] != null ? u._meta.durabilityMax[key] : 0);
        u._meta.durability[key] = cur - amount;
        logs.push({ unitId: u.id || u.unit_id, skill_key: key, left: u._meta.durability[key] });
      }
    }
    return { type: 'durability_consumption', success: true, kind, affects: logs };
  }

  /**
   * E3 技能槽占用校验 — 释放前校验槽位占用/空置，占用不符则 veto 中断本段
   * effect.slot + effect.required(free|occupied)
   */
  handleSlotOccupancy(effect, context) {
    const unit = context.unit || context.source;
    if (!unit) return { type: 'slot_occupancy', ok: false, reason: 'no_unit' };
    const slot = effect.slot || (effect.params && effect.params.slot);
    const required = effect.required || 'free';
    if (!slot) return { type: 'slot_occupancy', ok: false, reason: 'missing slot' };
    const occupied = !!(unit._slots && unit._slots[slot]) || !!(unit.equipment && unit.equipment[slot]);
    const ok = required === 'occupied' ? occupied : !occupied;
    if (!ok) {
      return { type: 'slot_occupancy', ok: false, veto: true, reason: `slot_${slot}_${required === 'occupied' ? 'not_occupied' : 'occupied'}` };
    }
    return { type: 'slot_occupancy', ok: true, slot, required };
  }

  // ============================================================
  // 批次2 F 组：状态/护盾/充能/互斥/失效
  // ============================================================

  /**
   * F3 护盾 — effect.value + lifetime(回合) 可选
   */
  handleShield(effect, context) {
    const targets = this._resolveEffectTargets(effect, context);
    const val = this._resolveValue(effect, null, context);
    const lifetime = effect.lifetime != null ? effect.lifetime
      : (effect.duration != null ? effect.duration : null);
    const logs = [];
    for (const u of targets) {
      this._ensureMeta(u);
      u.shield = (u.shield || 0) + val;
      if (lifetime != null) {
        u._meta.flags.shield_lifetime = (u._meta.flags.shield_lifetime || 0) + lifetime;
      }
      logs.push({ unitId: u.id || u.unit_id, delta: val, shield: u.shield });
    }
    return { type: 'shield', success: true, value: val, lifetime, affects: logs };
  }

  /**
   * F4 充能层 — effect.layer_key + amount(默认1)
   */
  handleChargeLayer(effect, context) {
    const targets = this._resolveEffectTargets(effect, context);
    const layerKey = effect.layer_key || effect.layerKey || effect.value_ref || 'default_layer';
    const amount = Number(effect.amount || effect.value || 1);
    const logs = [];
    for (const u of targets) {
      this._ensureMeta(u);
      u._meta.charge_layers[layerKey] = (u._meta.charge_layers[layerKey] || 0) + amount;
      logs.push({ unitId: u.id || u.unit_id, layer: layerKey, stacks: u._meta.charge_layers[layerKey] });
    }
    return { type: 'charge_layer', success: true, layer: layerKey, amount, affects: logs };
  }

  /**
   * F5 互斥 — 同一互斥组内只保留 keep 指定的一个状态，其余移除
   * effect.group(状态源数组) + effect.keep(保留项)
   */
  handleMutualExclusion(effect, context) {
    const targets = this._resolveEffectTargets(effect, context);
    const group = effect.group || (effect.params && effect.params.group) || [];
    const keep = effect.keep || (effect.params && effect.params.keep);
    const logs = [];
    for (const u of targets) {
      this._ensureMeta(u);
      if (!Array.isArray(u.statusEffects)) continue;
      const toRemove = u.statusEffects.filter((s) => {
        const key = s.source || s.type || s.name;
        if (group.indexOf(key) === -1) return false;
        if (keep && key === keep) return false;
        return true;
      });
      u.statusEffects = u.statusEffects.filter((s) => toRemove.indexOf(s) === -1);
      logs.push({
        unitId: u.id || u.unit_id,
        removed: toRemove.map((s) => s.source || s.type),
        keep,
      });
    }
    return { type: 'mutual_exclusion', success: true, affects: logs };
  }

  /**
   * F6 永久失效 — 将技能写入目标 permanently_disabled_skills（本局不可恢复）
   * effect.target_skill(+ skill_key/skillId/value_ref 兜底)
   */
  handlePermanentDisable(effect, context) {
    const targets = this._resolveEffectTargets(effect, context);
    const skillKey = effect.target_skill || effect.skill_key || effect.skillId || effect.value_ref;
    const logs = [];
    for (const u of targets) {
      this._ensureMeta(u);
      if (!skillKey) { logs.push({ unitId: u.id || u.unit_id, ok: false, reason: 'missing skill_key' }); continue; }
      if (u._meta.permanently_disabled_skills.indexOf(skillKey) === -1) {
        u._meta.permanently_disabled_skills.push(skillKey);
      }
      logs.push({ unitId: u.id || u.unit_id, disabled: skillKey });
    }
    return { type: 'permanent_disable', success: true, affects: logs };
  }

  // ============================================================
  // 批次2 G 组：秩序操控
  // ============================================================

  /** G2 行动债 — 目标累计行动债 */
  handleActionDebt(effect, context) {
    const targets = this._resolveEffectTargets(effect, context);
    const amount = Number(effect.amount || effect.value || 1);
    const logs = [];
    for (const u of targets) {
      this._ensureMeta(u);
      u._meta.action_debt = (u._meta.action_debt || 0) + amount;
      logs.push({ unitId: u.id || u.unit_id, debt: u._meta.action_debt });
    }
    return { type: 'action_debt', success: true, amount, affects: logs };
  }

  /** G3 抢占 — 标记 preempt 并（若 battleState 提供 turnOrder）将其插入队首 */
  handlePreempt(effect, context) {
    const unit = context.unit || context.source || context.attacker;
    if (!unit) return { type: 'preempt', ok: false, reason: 'no_unit' };
    this._ensureMeta(unit);
    unit._meta.preempt = true;
    const battleState = context.battleState || context.state;
    if (battleState && Array.isArray(battleState.turnOrder)) {
      const id = unit.id || unit.unit_id;
      battleState.turnOrder = battleState.turnOrder.filter((x) => (x && (x.id || x)) !== id);
      battleState.turnOrder.unshift({ id, unit });
    }
    return { type: 'preempt', success: true, unitId: unit.id || unit.unit_id };
  }

  /** G4 序改写 — 重排 battleState.turnOrder 的 from→to */
  handleOrderRewrite(effect, context) {
    const battleState = context.battleState || context.state;
    if (!battleState || !Array.isArray(battleState.turnOrder)) {
      return { type: 'order_rewrite', ok: false, reason: 'no turnOrder' };
    }
    const from = effect.from != null ? effect.from : (effect.params && effect.params.from);
    const to = effect.to != null ? effect.to : (effect.params && effect.params.to);
    const list = battleState.turnOrder;
    if (from == null || to == null || from < 0 || from >= list.length) {
      return { type: 'order_rewrite', ok: false, reason: 'bad index' };
    }
    const [moved] = list.splice(from, 1);
    const idx = Math.max(0, Math.min(list.length, to));
    list.splice(idx, 0, moved);
    return { type: 'order_rewrite', success: true, from, to };
  }

  /** G5 放弃移动 — 目标本回合失去移动行动 */
  handleForfeitMove(effect, context) {
    const targets = this._resolveEffectTargets(effect, context);
    const logs = [];
    for (const u of targets) {
      this._ensureMeta(u);
      u._meta.flags.forfeit_move = true;
      logs.push({ unitId: u.id || u.unit_id });
    }
    return { type: 'forfeit_move', success: true, affects: logs };
  }

  /** G6 跳过机动判定 — 目标跳过机动/地形判定 */
  handleSkipMobility(effect, context) {
    const targets = this._resolveEffectTargets(effect, context);
    const logs = [];
    for (const u of targets) {
      this._ensureMeta(u);
      u._meta.flags.skip_mobility = true;
      logs.push({ unitId: u.id || u.unit_id });
    }
    return { type: 'skip_mobility', success: true, affects: logs };
  }

  /** G8 位移 — 将目标移动到指定 q/r 或按 dx/dy 偏移 */
  /**
   * B.1 位移原子（方向三分法扩展）。
   * 兼容旧式：effect.q/effect.r（绝对落点）、effect.dx/effect.dy（偏移）。
   * 新三分法（effect.mode）：
   *   - fixed6   : 固定六向（轴向 q,r 的 6 个邻居方向之一），effect.dir(0..5) + effect.steps
   *   - relative : 相对方向（释放者→目标 的指向），将目标沿「施法者→该单位」轴向推离 steps 格
   *   - random   : 随机六向，steps 格（确定性：无 seed 时取 dir=0，可经 effect.seed 扩展）
   * 六向基准向量（平顶六边形轴向 q,r）：
   *   0:(+1,0) 1:(+1,-1) 2:(0,-1) 3:(-1,0) 4:(-1,+1) 5:(0,+1)
   */
  static HEX_DIRS = [
    { dq: 1, dr: 0 }, { dq: 1, dr: -1 }, { dq: 0, dr: -1 },
    { dq: -1, dr: 0 }, { dq: -1, dr: 1 }, { dq: 0, dr: 1 },
  ];

  handleDisplace(effect, context) {
    const targets = this._resolveEffectTargets(effect, context);
    const source = context.unit || context.source || context.attacker;
    const logs = [];
    const mode = effect.mode || effect.direction_mode;

    if (mode === 'fixed6' || mode === 'relative' || mode === 'random') {
      const steps = Number(effect.steps != null ? effect.steps : (effect.distance != null ? effect.distance : 1));
      const sUnit = source || { q: 0, r: 0 };
      for (const u of targets) {
        let dir;
        if (mode === 'fixed6') {
          dir = EffectExecutor.HEX_DIRS[((Number(effect.dir) % 6) + 6) % 6];
        } else if (mode === 'random') {
          const seed = Number(effect.seed != null ? effect.seed : 0);
          dir = EffectExecutor.HEX_DIRS[((seed % 6) + 6) % 6];
        } else { // relative：施法者 → 该单位 的指向方向（取最近的六向）
          const dq = (u.q || 0) - (sUnit.q || 0);
          const dr = (u.r || 0) - (sUnit.r || 0);
          dir = this._nearestHexDir(dq, dr);
        }
        u.q = (u.q || 0) + dir.dq * steps;
        u.r = (u.r || 0) + dir.dr * steps;
        logs.push({ unitId: u.id || u.unit_id, q: u.q, r: u.r, mode });
      }
      return { type: 'displace', success: true, mode, affects: logs };
    }

    // 旧式兼容
    for (const u of targets) {
      if (effect.q != null && effect.r != null) {
        u.q = effect.q; u.r = effect.r;
      } else if (effect.dx != null || effect.dy != null) {
        u.q = (u.q || 0) + (effect.dx || 0);
        u.r = (u.r || 0) + (effect.dy || 0);
      }
      logs.push({ unitId: u.id || u.unit_id, q: u.q, r: u.r });
    }
    return { type: 'displace', success: true, affects: logs };
  }

  /** 把任意 (dq,dr) 向量映射到最近的六边形六向基准方向 */
  _nearestHexDir(dq, dr) {
    let best = EffectExecutor.HEX_DIRS[0], bestDot = -Infinity;
    for (const d of EffectExecutor.HEX_DIRS) {
      const dot = d.dq * dq + d.dr * dr; // 方向相似度（无归一也成立，取最大投影）
      if (dot > bestDot) { bestDot = dot; best = d; }
    }
    return best;
  }

  /**
   * B.4 目标解析原子（独立、可复用）。
   * 基于 范围(area_radius) + 作用域(target_scope) 解析出"在某范围内的合适作用对象"，
   * 将结果写入 context.resolvedTargets 供后续原子（位移/触发/驱散）直接消费，
   * 同时支持 effect.store_as 自定义存储键。返回解析到的单位 id 清单。
   */
  handleResolveTarget(effect, context) {
    const targets = this._resolveEffectTargets(effect, context);
    const storeKey = effect.store_as || 'resolvedTargets';
    context[storeKey] = targets.slice();
    return {
      type: 'resolve_target',
      success: true,
      store_key: storeKey,
      count: targets.length,
      unit_ids: targets.map((u) => u.id || u.unit_id),
    };
  }

  // ============================================================
  // ★ 步骤4（补完计划）：67 原子清单里前端已列、引擎缺位的 handler 补齐
  // 原则：全部 JSON 字段驱动，零硬编码 skillId；目标统一经 _resolveEffectTargets。
  // ============================================================

  /** D3 伤害均摊 — 把 total_damage 在作用域内目标间均摊（equally / weighted 按 hp 权重） */
  handleDirectDamageSplit(effect, context) {
    const targets = this._resolveEffectTargets({ ...effect, target_scope: effect.target_scope || 'area' }, context);
    const total = Number(effect.total_damage ?? effect.flat_value ?? effect.amount ?? 0);
    const minPer = Number(effect.min_per_target || 0);
    if (!targets.length || total <= 0) {
      return { type: 'direct_damage_split', ok: false, reason: 'no_targets_or_zero' };
    }
    const mode = effect.split || 'equally';
    const logs = [];
    if (mode === 'weighted') {
      const weights = targets.map((u) => Math.max(1, Number(u.hp ?? u.current_hp ?? 1)));
      const sum = weights.reduce((a, b) => a + b, 0);
      targets.forEach((u, i) => {
        const dmg = Math.max(minPer, Math.round(total * (weights[i] / sum)));
        this._applyRawDamage(u, dmg);
        logs.push({ unitId: u.id || u.unit_id, damage: dmg });
      });
    } else {
      const per = Math.max(minPer, Math.floor(total / targets.length));
      targets.forEach((u) => {
        this._applyRawDamage(u, per);
        logs.push({ unitId: u.id || u.unit_id, damage: per });
      });
    }
    return { type: 'direct_damage_split', success: true, total, affects: logs };
  }

  /** 内部：对单位直接扣血（不过 DamagePipe，供均摊等场景的确定性扣减） */
  _applyRawDamage(unit, dmg) {
    if (!unit || !(dmg > 0)) return 0;
    const cur = Number(unit.hp ?? unit.current_hp ?? 0);
    const next = Math.max(0, cur - dmg);
    if (unit.hp !== undefined) unit.hp = next;
    if (unit.current_hp !== undefined) unit.current_hp = next;
    return cur - next;
  }

  /** G7 授予/剥夺行动 — mode: grant|revoke；action: move|attack|both */
  handleGrantRevokeAction(effect, context) {
    const targets = this._resolveEffectTargets(effect, context);
    const mode = effect.mode || 'grant';
    const action = effect.action || 'move';
    const logs = [];
    for (const u of targets) {
      this._ensureMeta(u);
      const g = (u._meta.granted_actions = u._meta.granted_actions || {});
      const r = (u._meta.revoked_actions = u._meta.revoked_actions || {});
      const keys = action === 'both' ? ['move', 'attack'] : [action];
      keys.forEach((k) => {
        if (mode === 'grant') { g[k] = (g[k] || 0) + 1; delete r[k]; }
        else { r[k] = true; delete g[k]; }
      });
      logs.push({ unitId: u.id || u.unit_id, mode, action });
    }
    return { type: 'grant_revoke_action', success: true, mode, action, affects: logs };
  }

  /** G8 防连锁 — 写入 no_chain 标记与冷却，供调度层拦截连续触发 */
  handleLimitNoChain(effect, context) {
    const unit = context.unit || context.source || context.attacker;
    if (!unit) return { type: 'limit_no_chain', ok: false, reason: 'no_unit' };
    this._ensureMeta(unit);
    unit._meta.flags.no_chain = effect.no_chain !== false;
    const cd = Number(effect.cooldown || 0);
    if (cd > 0) {
      unit._meta.chain_cooldown = cd;
    }
    return { type: 'limit_no_chain', success: true, no_chain: unit._meta.flags.no_chain, cooldown: cd };
  }

  /**
   * H1 地图炮 — origin 恒为发动者自身，按 direction/shape/length/width 计算覆盖格，
   * 命中格上的单位由上层（skillExecutor AOE 路由）结算伤害；此 handler 只负责
   * 计算并写回 context.aoeCells，保证「原点=自身」这一唯一判据被引擎承认。
   */
  handleMapCannon(effect, context) {
    const unit = context.unit || context.source || context.attacker;
    if (!unit) return { type: 'map_cannon', ok: false, reason: 'no_unit' };
    const cells = [];
    const len = Math.max(1, Number(effect.length || 3));
    const width = Math.max(1, Number(effect.width || 1));
    // 手绘格优先（编辑器六向手绘 mcShapes：{dirKey:[{q,r}]}）
    const drawn = effect.mcShapes || effect.directions;
    if (drawn && typeof drawn === 'object') {
      const dirKey = String(effect.direction ?? 'right');
      const list = Array.isArray(drawn[dirKey]) ? drawn[dirKey] : [];
      list.forEach((c) => cells.push({ q: (unit.q || 0) + Number(c.q || 0), r: (unit.r || 0) + Number(c.r || 0) }));
    }
    if (!cells.length) {
      // 兜底：沿 direction 方向铺 length×width 的直线/矩形带
      const DIRS = [{ q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }];
      const dIdx = Number.isFinite(Number(effect.direction)) ? (Number(effect.direction) % 6 + 6) % 6 : 0;
      const d = DIRS[dIdx];
      const side = DIRS[(dIdx + 2) % 6];
      for (let i = 1; i <= len; i++) {
        for (let w = 0; w < width; w++) {
          cells.push({
            q: (unit.q || 0) + d.q * i + side.q * w,
            r: (unit.r || 0) + d.r * i + side.r * w,
          });
        }
      }
    }
    context.aoeCells = cells;
    context.aoeOrigin = { q: unit.q, r: unit.r, kind: 'self' };
    return { type: 'map_cannon', success: true, origin: 'self', cells: cells.length };
  }

  /**
   * H2 AOE — origin 为射程内落点（impact_point），按 shape/spread/inner_radius 覆盖。
   * 落点由 context.impactPoint（前端点击/网关传入）提供，缺失时回落到目标格。
   */
  handleAoe(effect, context) {
    const origin = context.impactPoint
      || (context.target ? { q: context.target.q, r: context.target.r } : null)
      || (context.unit ? { q: context.unit.q, r: context.unit.r } : null);
    if (!origin) return { type: 'aoe', ok: false, reason: 'no_origin' };
    const spread = Math.max(0, Number(effect.spread ?? effect.radius ?? 1));
    const inner = Math.max(0, Number(effect.inner_radius || 0));
    const cells = [];
    for (let dq = -spread; dq <= spread; dq++) {
      for (let dr = Math.max(-spread, -dq - spread); dr <= Math.min(spread, -dq + spread); dr++) {
        const dist = (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
        if (dist < inner) continue;
        cells.push({ q: origin.q + dq, r: origin.r + dr });
      }
    }
    context.aoeCells = cells;
    context.aoeOrigin = { ...origin, kind: 'impact_point' };
    return { type: 'aoe', success: true, origin: 'impact_point', cells: cells.length };
  }

  /** K1 词条改写词条 — 解锁/解除前置约束，写入施法者 _meta */
  handleRewriteEntry(effect, context) {
    const unit = context.unit || context.source || context.attacker;
    if (!unit) return { type: 'rewrite_entry', ok: false, reason: 'no_unit' };
    this._ensureMeta(unit);
    unit._meta.unlocked_skills = unit._meta.unlocked_skills || [];
    const unlock = effect.unlock;
    const list = Array.isArray(unlock) ? unlock : (unlock ? [unlock] : []);
    list.forEach((k) => { if (k && !unit._meta.unlocked_skills.includes(k)) unit._meta.unlocked_skills.push(k); });
    if (effect.remove_requirement) {
      unit._meta.removed_requirements = unit._meta.removed_requirements || [];
      const rr = Array.isArray(effect.remove_requirement) ? effect.remove_requirement : [effect.remove_requirement];
      rr.forEach((k) => { if (k && !unit._meta.removed_requirements.includes(k)) unit._meta.removed_requirements.push(k); });
    }
    if (effect.prerequisite) {
      unit._meta.entry_prerequisites = unit._meta.entry_prerequisites || {};
      unit._meta.entry_prerequisites[String(effect.prerequisite)] = true;
    }
    return { type: 'rewrite_entry', success: true, unlocked: list };
  }

  /**
   * B.3 词条联动触发原子（区别于 K1 改写型）。
   * 联动执行「已存在词条」的效果（词条本体必须来自词条库，满足原子模型约束）。
   * 递归护栏（防死循环 / 自触发）：
   *   - context.entryCallStack：Set<string>，记录当前调用链上的 entry_key，重复即环路 → CIRCULAR_ENTRY_TRIGGER
   *   - context.entryDepth：硬上限 2，超过 → 阻断
   */
  _collectEntryEffects(entry) {
    if (!entry) return [];
    if (Array.isArray(entry.effects) && entry.effects.length) return entry.effects;
    // 兼容 v2 tree：从各 segment 收集 effects
    if (Array.isArray(entry.tree)) {
      const out = [];
      for (const seg of entry.tree) {
        if (seg && Array.isArray(seg.effects)) out.push(...seg.effects);
      }
      return out;
    }
    return [];
  }

  handleTriggerEntry(effect, context) {
    const entryKey = effect.entry_key || effect.key;
    if (!entryKey) return { type: 'trigger_entry', success: false, reason: 'no_entry_key' };

    // 递归护栏：初始化调用链
    const callStack = context.entryCallStack || new Set();
    const depth = Number(context.entryDepth || 0);
    if (depth >= 2) {
      return { type: 'trigger_entry', success: false, reason: 'ENTRY_DEPTH_EXCEEDED', entry_key: entryKey, depth };
    }
    if (callStack.has(entryKey)) {
      return { type: 'trigger_entry', success: false, reason: 'CIRCULAR_ENTRY_TRIGGER', entry_key: entryKey };
    }

    const cfg = getGlossaryConfig();
    const entry = cfg && cfg.skills ? cfg.skills[entryKey] : null;
    if (!entry) return { type: 'trigger_entry', success: false, reason: 'entry_not_found', entry_key: entryKey };

    const effects = this._collectEntryEffects(entry);
    if (!effects.length) return { type: 'trigger_entry', success: true, applied: 0, reason: 'entry_has_no_effects', entry_key: entryKey };

    // 建立子 context：继承原 context，压入本 entry 到调用栈
    const childCtx = Object.assign({}, context);
    childCtx.entryCallStack = new Set(callStack);
    childCtx.entryCallStack.add(entryKey);
    childCtx.entryDepth = depth + 1;

    const sub = this.executeSync(effects, childCtx);
    const subApplied = Array.isArray(sub) ? sub : (sub && sub.applied) || [];
    const applied = subApplied.filter((r) => r && r.success).length;
    return {
      type: 'trigger_entry',
      success: true,
      entry_key: entryKey,
      applied,
      depth: childCtx.entryDepth,
    };
  }

  /**
   * B.2 召唤 / 生成单位原子（时序同步）。
   * 直接构造最小 BattleUnit（含 q,r,role,_meta,statusEffects,baseStats,currentStats），
   * 同步注册进战场三处：allUnits 数组、battleState.units(Map)、battleState.turnOrder(按 role 推送 id)，
   * 避免「注册晚于 set」导致的时序错乱。
   */
  handleSpawnUnit(effect, context) {
    const source = context.unit || context.source || context.attacker;
    const q = Number(effect.q != null ? effect.q : (source ? (source.q || 0) + 1 : 0));
    const r = Number(effect.r != null ? effect.r : (source ? (source.r || 0) : 0));
    const id = effect.unit_id || `summon_${Date.now()}_${Math.floor(Math.random() * 1e4)}`;
    const role = effect.role || 'summoned';
    const baseStats = Object.assign({ hp: Number(effect.hp) || 1, melee_attack: 0 }, effect.base_stats || {});

    const unit = {
      id,
      q, r,
      role,
      faction: effect.faction || (source ? source.faction : 'neutral'),
      hp: baseStats.hp,
      current_hp: baseStats.hp,
      baseStats: Object.assign({}, baseStats),
      currentStats: Object.assign({}, baseStats),
      statusEffects: [],
      _meta: { flags: {}, charge_layers: {}, durability: {}, permanently_disabled_skills: [], is_summoned: true },
      skills: effect.skills || [],
    };

    // 同步注册进三处
    if (Array.isArray(context.allUnits)) context.allUnits.push(unit);
    const bs = context.battleState;
    if (bs) {
      if (bs.units && typeof bs.units.set === 'function') bs.units.set(id, unit);
      else if (bs.units && Array.isArray(bs.units)) bs.units.push(unit);
      if (Array.isArray(bs.turnOrder) && !bs.turnOrder.includes(id)) bs.turnOrder.push(id);
    }

    return { type: 'spawn_unit', success: true, unit_id: id, q, r, role, faction: unit.faction };
  }

  /**
   * C_AP_COST 消耗行动点（真实扣减，下限 0）。
   * 兼容 unit.ap / unit.action_points 两种字段名；amount 缺省 1。
   */
  handleCostAp(effect, context) {
    const targets = this._resolveEffectTargets(effect, context);
    const amount = Number(effect.amount != null ? effect.amount : 1);
    const logs = [];
    for (const u of targets) {
      const field = u.ap != null ? 'ap' : (u.action_points != null ? 'action_points' : null);
      if (!field) { logs.push({ unitId: u.id || u.unit_id, skipped: 'no_ap_field' }); continue; }
      const before = u[field];
      u[field] = Math.max(0, before - amount);
      logs.push({ unitId: u.id || u.unit_id, field, before, after: u[field] });
    }
    return { type: 'cost_ap', success: true, amount, affects: logs };
  }

  /**
   * C_ENERGY_COST 消耗能量（真实扣减，下限 0）。energy 字段缺失仅记录跳过。
   */
  handleCostEnergy(effect, context) {
    const targets = this._resolveEffectTargets(effect, context);
    const amount = Number(effect.amount != null ? effect.amount : 1);
    const logs = [];
    for (const u of targets) {
      if (typeof u.energy !== 'number') { logs.push({ unitId: u.id || u.unit_id, skipped: 'no_energy_field' }); continue; }
      const before = u.energy;
      u.energy = Math.max(0, before - amount);
      logs.push({ unitId: u.id || u.unit_id, before, after: u.energy });
    }
    return { type: 'cost_energy', success: true, amount, affects: logs };
  }

  /**
   * C_DURABILITY_COST 消耗耐久（真实扣减，下限 0）。
   * slot 默认 'body'；优先扣 _meta.durability[slot]，回退到 <slot>_durability 装备字段。
   */
  handleCostDurability(effect, context) {
    const targets = this._resolveEffectTargets(effect, context);
    const amount = Number(effect.amount != null ? effect.amount : 1);
    const slot = effect.slot || 'body';
    const logs = [];
    for (const u of targets) {
      const metaKey = (u._meta && u._meta.durability && u._meta.durability[slot] != null)
        ? { obj: u._meta.durability, key: slot }
        : (u[`${slot}_durability`] != null ? { obj: u, key: `${slot}_durability` } : null);
      if (!metaKey) { logs.push({ unitId: u.id || u.unit_id, skipped: 'no_durability_field', slot }); continue; }
      const before = metaKey.obj[metaKey.key];
      metaKey.obj[metaKey.key] = Math.max(0, before - amount);
      logs.push({ unitId: u.id || u.unit_id, slot, before, after: metaKey.obj[metaKey.key] });
    }
    return { type: 'cost_durability', success: true, amount, slot, affects: logs };
  }

  /**
   * K3 玩家可选发动 — 挂起等待玩家确认。引擎侧不阻塞结算，写入 pending_prompt
   * 事件由 /state 下发，前端弹确认框；未确认时按 default_action 处理（默认放行）。
   */
  handlePlayerOptional(effect, context) {
    const unit = context.unit || context.source || context.attacker;
    context._events = context._events || [];
    context._events.push({
      type: 'player_prompt',
      unitId: unit ? (unit.id || unit.unit_id) : null,
      prompt: effect.prompt || '是否发动该词条？',
      optional: effect.player_optional !== false,
    });
    return { type: 'player_optional', success: true, prompt: effect.prompt || '' };
  }

  /** K4 打断响应窗口 — 开启一个 N 回合的响应窗口，供反应型词条挂载 */
  handleInterruptWindow(effect, context) {
    const unit = context.unit || context.source || context.attacker;
    if (!unit) return { type: 'interrupt_window', ok: false, reason: 'no_unit' };
    this._ensureMeta(unit);
    const turns = Math.max(1, Number(effect.interrupt_window || 1));
    unit._meta.interrupt_window = turns;
    context._events = context._events || [];
    context._events.push({
      type: 'interrupt_window_opened',
      unitId: unit.id || unit.unit_id,
      turns,
    });
    return { type: 'interrupt_window', success: true, turns };
  }

  // ============================================================
  // 批次2 H/I/J 组：感知 / 信息 / 所有权
  // ============================================================

  /** I1 可见性变更 — effect.state(hidden|visible|reveal) */
  handleVisibility(effect, context) {
    const targets = this._resolveEffectTargets(effect, context);
    const state = effect.state || (effect.params && effect.params.state) || 'visible';
    const logs = [];
    for (const u of targets) {
      this._ensureMeta(u);
      u._meta.flags.visibility = state;
      if (state === 'visible' || state === 'reveal') u._meta.flags.scanned = true;
      if (state === 'hidden') u._meta.flags.scanned = false;
      logs.push({ unitId: u.id || u.unit_id, state });
    }
    return { type: 'visibility', success: true, state, affects: logs };
  }

  /** I2 可选中 — effect.value(bool) */
  handleSelectable(effect, context) {
    const targets = this._resolveEffectTargets(effect, context);
    const value = effect.value !== undefined ? effect.value : (effect.params && effect.params.value);
    const logs = [];
    for (const u of targets) {
      this._ensureMeta(u);
      u._meta.flags.selectable = !!value;
      logs.push({ unitId: u.id || u.unit_id, selectable: !!value });
    }
    return { type: 'selectable', success: true, value: !!value, affects: logs };
  }

  /** I3 扫描揭示 — 以主目标/施法者为圆心 range 内揭示敌方 */
  handleScanReveal(effect, context) {
    const allUnits = context.allUnits || [];
    const center = context.targetUnit || context.target || context.unit;
    const radius = effect.range != null ? effect.range : (effect.radius != null ? effect.radius : 3);
    const revealFaction = effect.reveal_faction || effect.revealFaction || 'enemy';
    const logs = [];
    for (const u of allUnits) {
      if (!u || u.q == null || !center || center.q == null) continue;
      if (this._hexDistance(center, u) > radius) continue;
      this._ensureMeta(u);
      if (revealFaction === 'enemy' && !this._isOpposite(u, center)) continue;
      u._meta.flags.scanned = true;
      u._meta.flags.visibility = 'visible';
      logs.push({ unitId: u.id || u.unit_id });
    }
    return { type: 'scan_reveal', success: true, radius, revealed: logs };
  }

  /** J1 抢夺所有权 — 转移目标装备槽/战利品到施法者 */
  handlePlunder(effect, context) {
    const target = context.targetUnit || context.target || context.defender;
    const caster = context.unit || context.source || context.attacker;
    if (!target || !caster) return { type: 'plunder', ok: false, reason: 'missing unit' };
    const take = effect.take || (effect.params && effect.params.take) || 'loot';
    const slot = effect.slot || (effect.params && effect.params.slot);
    const logs = [];
    if (take === 'equipment' && slot) {
      const tgtEq = (target.equipment = target.equipment || {});
      const cstEq = (caster.equipment = caster.equipment || {});
      const item = tgtEq[slot];
      if (item) {
        cstEq[slot] = item;
        delete tgtEq[slot];
        logs.push({ slot, from: target.id || target.unit_id, to: caster.id || caster.unit_id });
      }
    } else {
      const tgtLoot = (target.loot = target.loot || []);
      const cstLoot = (caster.loot = caster.loot || []);
      if (tgtLoot.length) {
        cstLoot.push(...tgtLoot.splice(0));
        logs.push({ loot: cstLoot.length });
      }
    }
    return { type: 'plunder', success: true, affects: logs };
  }

  // ============================================================
  // 批次2后半程 GAP 补全：B4 / B8 / B10 / D4 / D6 / D7 / G7
  // 全部 JSON 字段驱动，绝不硬编码 skillId；平衡敏感项写入 _meta 标记，
  // 由 damagePipe 最小读取钩子（带护栏常量）在结算侧生效。
  // ============================================================

  /**
   * B4 三单位共线 — 校验 source/primary/第三参照点是否落在同一直线（六角 axial 共线）。
   * effect.ref_q/ref_r（或 ref_unit 取第三单位）作为共线判定第三点；
   * 命中返回 collinear:true 并把判定结果写入 source._meta.flags.collinear。
   */
  handleCollinear(effect, context) {
    const source = context.unit || context.source || context.attacker;
    const primary = context.targetUnit || context.target || context.defender;
    if (!source || !primary) return { type: 'collinear', ok: false, reason: 'missing anchor' };
    const refQ = effect.ref_q != null ? effect.ref_q
      : (effect.params && effect.params.ref_q);
    const refR = effect.ref_r != null ? effect.ref_r
      : (effect.params && effect.params.ref_r);
    // 若无显式第三点，取 allUnits 中第三个与 source/primary 不重合的单位
    let rq = refQ, rr = refR;
    if (rq == null || rr == null) {
      const third = (context.allUnits || []).find((u) =>
        u && u !== source && u !== primary && u.q != null);
      if (third) { rq = third.q; rr = third.r; }
    }
    if (rq == null || rr == null) return { type: 'collinear', ok: false, reason: 'no third point' };
    // 六角 axial 共线：三点满足 (q1-q2)*(r2-r3) == (q2-q3)*(r1-r2)
    const collinear = (source.q - primary.q) * (primary.r - rr) ===
                      (primary.q - rq) * (source.r - primary.r);
    this._ensureMeta(source);
    source._meta.flags.collinear = collinear;
    return { type: 'collinear', success: true, collinear, ref: { q: rq, r: rr } };
  }

  /**
   * B8 充能叠层 — 校验某充能层是否达到 N 层门槛（不满足则 veto / 不触发）。
   * effect.layer_key + effect.threshold(N)；如未达标写入 _meta.flags.charge_met=false 供调度拦截。
   */
  handleChargeStack(effect, context) {
    const unit = context.unit || context.source || context.attacker;
    if (!unit) return { type: 'charge_stack', ok: false, reason: 'no unit' };
    const layerKey = effect.layer_key || effect.layerKey || effect.value_ref || 'default_layer';
    const threshold = Number(effect.threshold != null ? effect.threshold
      : (effect.params && effect.params.threshold) || 1);
    this._ensureMeta(unit);
    const stacks = (unit._meta.charge_layers && unit._meta.charge_layers[layerKey]) || 0;
    const met = stacks >= threshold;
    unit._meta.flags.charge_met = met;
    unit._meta.flags.charge_stack = stacks;
    return { type: 'charge_stack', success: true, layer: layerKey, stacks, threshold, met };
  }

  /**
   * B10 冷却就绪 — 校验目标词条是否脱离冷却（cooldown_ready=true 才放行）。
   * effect.skill_key 指定被校验词条；读取 target._meta.cooldowns[skill_key]。
   */
  handleCooldown(effect, context) {
    const unit = context.unit || context.source || context.attacker;
    if (!unit) return { type: 'cooldown', ok: false, reason: 'no unit' };
    const skillKey = effect.skill_key || effect.skillKey || effect.value_ref;
    this._ensureMeta(unit);
    const cd = (unit._meta.cooldowns = unit._meta.cooldowns || {});
    const remaining = skillKey ? (cd[skillKey] || 0) : 0;
    const ready = remaining <= 0;
    unit._meta.flags.cooldown_ready = ready;
    if (skillKey && ready && effect.reset_on_ready) cd[skillKey] = 0;
    return { type: 'cooldown', success: true, skillKey, remaining, ready };
  }

  /**
   * D4 伤害分担 — 将后续受到的伤害按 ratio 分摊给 allies（写入 _meta 标记，结算侧生效）。
   * effect.ratio(0~MAX_SHARE_RATIO) + effect.target_scope(分担池：ally/area)。
   * 带护栏：ratio 超出上限自动 clamp，避免一击被无限转移导致平衡崩塌。
   */
  handleDamageShare(effect, context) {
    const targets = this._resolveEffectTargets(effect, context);
    const raw = Number(effect.ratio != null ? effect.ratio
      : (effect.params && effect.params.ratio) || 0);
    const MAX_SHARE_RATIO = 0.8; // ★ 护栏：最高分担 80%，保留 20% 自承，防平衡崩塌
    const ratio = Math.max(0, Math.min(MAX_SHARE_RATIO, raw));
    const pool = effect.pool_scope || effect.target_scope || 'ally';
    const logs = [];
    for (const u of targets) {
      this._ensureMeta(u);
      u._meta.damage_share = { ratio, pool };
      logs.push({ unitId: u.id || u.unit_id, ratio, pool });
    }
    return { type: 'damage_share', success: true, ratio, pool, affects: logs };
  }

  /**
   * D6 护甲穿透 — 将无视护甲比例写入 _meta（结算侧 damagePipe 读取）。
   * effect.ratio(0~MAX_PIERCE_RATIO)；护栏：最高穿透 80%，保留 20% 护甲价值，防全穿透失衡。
   */
  handleArmorPierce(effect, context) {
    const targets = this._resolveEffectTargets(effect, context);
    const raw = Number(effect.ratio != null ? effect.ratio
      : (effect.params && effect.params.ratio) || 0);
    const MAX_PIERCE_RATIO = 0.8; // ★ 护栏：最高穿透 80%
    const ratio = Math.max(0, Math.min(MAX_PIERCE_RATIO, raw));
    const logs = [];
    for (const u of targets) {
      this._ensureMeta(u);
      u._meta.armor_pierce = Math.max(u._meta.armor_pierce || 0, ratio);
      logs.push({ unitId: u.id || u.unit_id, armor_pierce: u._meta.armor_pierce });
    }
    return { type: 'armor_pierce', success: true, ratio, affects: logs };
  }

  /**
   * D7 反伤 — 将受击后反弹比例写入 _meta（结算侧 damagePipe 读取）。
   * effect.ratio(0~MAX_REFLECT_RATIO) + effect.guard(最大反弹层数，防递归)；
   * 结算侧反射时自减 guard，归零即停，杜绝无限反伤链式崩溃。
   */
  handleReflectDamage(effect, context) {
    const targets = this._resolveEffectTargets(effect, context);
    const raw = Number(effect.ratio != null ? effect.ratio
      : (effect.params && effect.params.ratio) || 0);
    const MAX_REFLECT_RATIO = 1.0;
    const ratio = Math.max(0, Math.min(MAX_REFLECT_RATIO, raw));
    const guard = Math.max(1, Number(effect.guard != null ? effect.guard
      : (effect.params && effect.params.guard) || 3)); // ★ 护栏：默认最多反弹 3 层
    const logs = [];
    for (const u of targets) {
      this._ensureMeta(u);
      u._meta.reflect_damage = { ratio, guard };
      logs.push({ unitId: u.id || u.unit_id, ratio, guard });
    }
    return { type: 'reflect_damage', success: true, ratio, guard, affects: logs };
  }

  /**
   * G7 解除前置 — 清除目标词条的进入前置要求（removed_requirements 写入 _meta）。
   * 复用 rewrite_entry 同款 removed_requirements 机制，确保解锁态与移除前置一致可见。
   * effect.prerequisite(数组或单值) 指定要解除的前置键。
   */
  handlePrerequisiteClear(effect, context) {
    const unit = context.unit || context.source || context.attacker;
    if (!unit) return { type: 'prerequisite_clear', ok: false, reason: 'no unit' };
    this._ensureMeta(unit);
    unit._meta.removed_requirements = unit._meta.removed_requirements || [];
    const pre = effect.prerequisite || (effect.params && effect.params.prerequisite);
    const list = Array.isArray(pre) ? pre : (pre ? [pre] : []);
    list.forEach((k) => { if (k && !unit._meta.removed_requirements.includes(k)) unit._meta.removed_requirements.push(k); });
    // 同步清除已锁定的 entry_prerequisites
    if (unit._meta.entry_prerequisites) {
      list.forEach((k) => { delete unit._meta.entry_prerequisites[String(k)]; });
    }
    return { type: 'prerequisite_clear', success: true, cleared: list };
  }

  /**
   * 条件检查（简化版）
   */
  async checkConditions(conditions, context) {
    if (!conditions) return true;
    return true;
  }
}

module.exports = new EffectExecutor();
