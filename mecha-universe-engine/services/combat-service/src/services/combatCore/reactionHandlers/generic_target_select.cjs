/**
 * generic_target_select.cjs — A9 / H1 通用「目标被选中」预检（批次1 · 1.1）
 *
 * 将 on_target_selected 从 duel 卡硬绑定中解放出来，成为**通用触发器**：
 * 任何技能 / 原子都可在 on_target_selected 上挂载行为，本文件仅做通用合法性闸门，
 * 不含任何 duel 专属逻辑（duel 仍由 duel.cjs 的 duelCheck 另行驱动）。
 *
 * 注册表为 last-wins，本文件按文件名字母序（g < d）晚于 duel.cjs 加载，
 * 故 on_target_selected 的最终 handler 归属此处（duel.cjs 已移除该 register）。
 *
 * ctx 契约见 index.cjs：需 caster / target。
 * 返回 { ok, reason }：ok=false 时调用方（决斗预检端点）应拒绝发动。
 */
const { register } = require('./index.cjs');

function _uid(u) {
  return u == null ? null : String(u.id != null ? u.id : u.unit_id);
}

function genericTargetSelected(ctx) {
  const caster = ctx && ctx.caster;
  const target = ctx && ctx.target;

  if (!caster || !target) return { ok: false, reason: 'MISSING_UNIT' };
  if (caster._destroyed || (typeof caster.hp === 'number' && caster.hp <= 0)) {
    return { ok: false, reason: 'CASTER_DOWN' };
  }
  if (target._destroyed || (typeof target.hp === 'number' && target.hp <= 0)) {
    return { ok: false, reason: 'TARGET_DOWN' };
  }
  // 自杀式选择：同一单位不可自选为目标
  if (_uid(caster) && _uid(caster) === _uid(target)) {
    return { ok: false, reason: 'SELF_TARGET' };
  }
  return { ok: true, reason: null };
}

register('on_target_selected', genericTargetSelected);

module.exports = { genericTargetSelected };
