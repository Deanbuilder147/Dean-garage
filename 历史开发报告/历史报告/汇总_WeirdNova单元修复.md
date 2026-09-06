# 汇总 · WeirdNova 单元修复

> 合并归纳自（原始明细见 `机甲战棋/历史报告/`）：
> - WeirdNova移动问题报告.md
> - WeirdNova攻击0伤_诊断报告_cce39656.md
> - WeirdNova攻击掉血_诊断报告_cce39656.md
> - WeirdNova移动力_诊断报告_cce39656.md
> - WeirdNova移动力修复_Review报告.md
>
> 生成日期：2026-07-27

## 一、现状结论

WeirdNova 单元的多项异常已完成诊断与修复并部署：

| 问题 | 根因 | 处置 | 状态 |
|---|---|---|---|
| 移动力显示为 0 / 偏低 | `computeMobility` 未按单位类型换算 | 已实现 `computeMobility(parts)`：机体 `max(5,ceil(机动/2))`、载具/背包 `ceil(机动/3)`，并部署 | ✅ 已部署 |
| 攻击 0 伤 | 伤害管道武器惩罚/抗性误判 | 已修复（damagePipe `_calcWeaponPenalty` + 装备/技能 `damage_kind_modifiers` 泛化减伤） | ✅ 已部署 |
| 攻击掉血异常 | 词条/状态效果叠加 | 已修复并 Review | ✅ 已部署 |
| 移动卡顿/路径异常 | 寻路加权 | 已修复并 Review | ✅ 已部署 |

## 二、残留注意

- 所有修复**待真实战局浏览器 E2E 验证**：在带 WeirdNova 单位的实际战斗中确认移动力显示、攻击伤害、移动手感符合预期。
- 若后续出现新异常，优先复用 `computeMobility` 与 `damagePipe` 的泛化分支排查，勿再加硬编码特例。
