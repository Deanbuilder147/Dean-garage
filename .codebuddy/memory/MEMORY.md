# 项目长期记忆

## 词条库数据结构 (v5.0, Phase 10-11)

词条库中枢配置位于 `/root/original-project/services/combat-service/src/config/glossary-skill-config.json`，版本 v5.0。
Phase 10 引入"主谓宾定状补"万能语法插槽，Phase 11 完成所有预定任务（WebSocket掷骰/技能预览/分步向导/装备DKM/AI生成器）。
最新 Git: 52a7939。

### 通用字段 (每技能必有)
- `target_filter`: "enemy"|"ally"|"self"|"all" — 施放对象
- `cast_range`: number — 施放距离(格)，供 BFS 寻路
- `aoe_radius`: number — 0=单体, >0=六边形溅射半径
- `base_damage`: number — 基础伤害值
- `status_effects`: string[] — 附加效果 (burn/stun/disable/slow/poison/freeze)

### CRUD 机制
- 添加: saveConfig 深度合并新 key
- 删除: `_delete_skills: ["key1"]` 指令，configLoader.deleteSkills() 原子处理
- 更新: saveConfig 深度合并

## 战棋开发终极宪法 v2.0

### 三条红线
1. Canvas 是单向数据管道的终点，严禁读取 Vue ref/reactive 或全局 Store
2. hexUtils.js 是唯一数学真理，坐标转换纯净化
3. 禁止无上下文幽灵函数，依赖必须显式传入

### 等距视角基准 (Phase 9.6 标准等距平行投影)
iso=ON, shearX=0.25, shearY=0.44 (仅配置保留，不参与 Y 轴计算), scaleX=1.00, scaleY=0.39, rot=-24
单元=64×72, 间距=H103% V79% O51%

### CTM 标准公式 (Phase 9.7, 2026-06-21)
正向 CTM: `ctx.transform(scaleX, 0, shearX, scaleY, 0, 0)`  — 标准等距平行投影
  等效: screenX = scale*(scaleX*flatX + shearX*flatY) + offsetX
        screenY = scale*(scaleY*flatY) + offsetY  ← 锁死: 仅依赖 flatY

逆向拾取 (canvasPosToHex — 原子化刚性逆推):
  ① r = round(flatY / (1.5 * HEX_RADIUS * spacingV))  ← Even-R 刚性步长
  ② flatX = (worldX - shearX * flatY) / scaleX        ← shearX 回代
  ③ q = round((flatX/spacingH - evenOffset(r)) / (sqrt(3)*HEX_RADIUS))

性质:
  - shearX 滑块全响应 (X 轴等距纵深感)
  - R=0 行 screenY ≡ offsetY (绝对水平地平线)
  - 列斜率恒定 = shearX*scaleY/(scaleX*sqrt(3)), 首尾列绝对平行
  - 鼠标拾取: 9/9 正逆往返, 刚性步长对账通过
  - 无 rotationAngle, 无 shearY 参与 screenY
  - canvasPosToWorld 仅用于缩放锚点 (zoomIn/zoomOut/wheel/zoomReset)
  - zoomReset 锚点使用 wx/wy (CTM坐标), 非 x/y (flat坐标)

### 3D 视角锁定
- 地图编辑器 (NewBattlefieldView): 保留滑块 + 保存按钮
- 战场端 (NewBattleView): 无滑块 UI，仅静默拉取 _view 配置

## 服务器信息
- 地址: 106.54.197.69
- 用户: root
- 密钥: /Users/dingxuyang/Desktop/watson.pem
- 前端: port 8081 (mecha-frontend)
- Combat API: port 3004 (mecha-combat)

## 容器架构
- mecha-frontend: nginx + Vue3 SPA (dist/)
- mecha-combat: Node.js (combat-service)
- 其他: mecha-battle-db, mecha-hangar, mecha-auth, mecha-comm, mecha-map

## 可破坏生态单元 (Phase 9.5)

### glossary-skill-config.json 地形
可破坏地形 (4种):
| 地形 | HP | 破坏后 | 防御 | move_cost |
|------|-----|--------|------|-----------|
| forest | 3 | plain | 15 | 2 |
| fortress | 5 | plain | 30 | 1 |
| crystal | 2 | plain | 5 | 2 |
| city_building | 4 | rubble | 25 | 1 |

不可破坏: moon, plain, mountain, water, ruins, rubble

### damagePipe.cjs 地形伤害管道
- `calculateTerrainDamage(attacker, terrainCell, terrainDefs)` — 计算伤害
  - 基础伤害 = attack * 0.8, explosive/beam 武器 * 1.0
  - 返回 {damage, hp_before, hp_after, destroyed, new_terrain_id, new_move_cost}
- `applyTerrainDamage(attacker, terrainCell, terrainDefs)` — 原地退化

### terrainMovement.cjs 可破坏支持
- `isDestructible(terrainId)` / `getTerrainMaxHp(terrainId)` / `getDestroyedTransformTo(terrainId)`
- `applyTerrainDestruction(terrainMap, q, r, terrainDefs)` — 执行退化 + 更新 move_cost

## 部署流程
1. 本地编写 patch 脚本 → fix_scripts/
2. `deploy_project_preparation` 上传 → /root/fix_scripts_{timestamp}/
3. cp 到 /root/original-project/ → python3 执行
4. `npm run build` (frontend)
5. `docker compose build` → `docker stop/rm` → `docker compose up -d`
6. combat-service 需 `docker compose build` 而非 restart (配置在容器内)
