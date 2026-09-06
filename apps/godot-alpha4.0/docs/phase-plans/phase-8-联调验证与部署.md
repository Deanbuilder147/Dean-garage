# 阶段 8 开发计划报告：联调验证与部署

> 范围：端到端联调、结算管线 9 阶段对齐验证、部署上线、文档收口。
> 映射：全阶段（0-7）的集成验收与上线。

---

## 1. 维度一：alpha3.0 现状

- **部署纪律（强约束）**：单一入口 8081（`mecha-frontend` nginx 反代 `/api`→gateway 3006、`/socket.io`→comm 3005）；`http://106.54.197.69:8081` 唯一入口，严禁新建子端口。
- **服务器**：`106.54.197.69` / `root` / 密钥 `~/Desktop/watson.pem`；项目 `/root/mecha-universe-engine/`；4 容器 gateway/comm/frontend/battle-db（**无独立 combat 容器**，战斗逻辑打包进 gateway）。
- **gateway 运行时用宿主机 rsync 同步 `backend-gateway/dist`**；改 `src/*.ts` 须先服务器 `npm run build` 再 `docker compose build --no-cache`。
- **磁盘满事故**：`docker builder prune -f` 释放；构建报 `ENOSPC` 先查 `df -h /`。
- **风格真相源**：`glossary-theme.css`（琥珀）为全局标准，绿色 `.tactical-*` 死代码。

## 2. 维度二：Godot 平台优势与可复用插件

- **Godot 导出**：Godot 4 一键导出 Windows/Linux/macOS/Web；Web 导出可挂 8081 同一 nginx 或独立静态托管（但**遵守单一入口纪律**，不新增验证端口）。
- **导出模板**：`Godot Editor` → `Project → Export` 管理导出模板，CI 可脚本化。
- **无插件需求**：联调验证靠 `EventBus` 信号日志 + 后端接口比对。

## 3. 维度三：godot4_turn_based_combat_system 启示

- 其偏教学单机构建，无生产部署经验；我们的 Docker + 单一入口纪律是其不具备的，无需借鉴。

## 4. Godot 落地动作

1. **联调基准**：以 `结算管线-原子触发时机对齐表.md` 的 9 阶段×8 时机为验收矩阵，逐阶段核对 Godot 表现层与后端点火一致。
2. **关键验证项**：
   - 阶段 6 机动/姿态差值（后端补完后 HUD 显示）
   - 阶段 8 反击链/三路分流（Godot 须正确播放多次结算表现）
   - 枚举收口（阶段 0）：`EventBus` 时机信号 ⊆ `Enums.TIMING`
3. **部署**：Godot Web 导出挂 8081 同一入口（或独立静态域，但验证仍走 8081）；后端改动走既有 rsync+build+rebuild 流程。
4. **文档收口**：本阶段报告 + 阶段 0-7 报告 + 对齐表，统一纳入迁移计划索引（见迁移计划「阶段报告索引」章节）。

## 5. 验收标准

- [ ] 9 阶段×8 时机验收矩阵全部通过（阶段 6/8 缺口项标注后端依赖）。
- [ ] Godot Web 构建经 8081 入口可访问，资产哈希匹配。
- [ ] 全阶段报告与对齐表在迁移计划文档互链完整。
