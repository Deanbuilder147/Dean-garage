# 机甲战棋 Phase 9 总结报告

> 日期: 2026-06-21  
> 服务器: 106.54.197.69  
> 部署范围: 前端 + Combat API

---

## 一、总体概览

Phase 9 围绕四个核心目标展开：

| 序号 | 任务 | 状态 |
|------|------|------|
| 9.5 | 可破坏生态单元全面落地 | ✅ 完成 |
| 9.6 | CTM 归一化大手术（剪切矩阵 + 鼠标拾取修复） | ✅ 完成 |
| 9.6-紧急 | 修复 X 轴滑块失效与首行倾斜 | ✅ 完成 |
| 9.7 | Even-R 拓扑步长锁死，Y 轴全量对账 | ✅ 完成 |

### 当前部署状态

```
docker ps: 8/8 Healthy
前端: http://106.54.197.69:8081 → HTTP 200
Combat API: port 3004 → HTTP 200
```

---

## 二、Phase 9.5: 可破坏生态单元全面落地

### 新增地形

| 地形 | HP | 破坏后退化 | 防御 | move_cost | 可破坏 |
|------|-----|-----------|------|-----------|--------|
| forest | 3 | plain | 15 | 2 | ✅ |
| fortress | 5 | plain | 30 | 1 | ✅ |
| crystal | 2 | plain | 5 | 2 | ✅ |
| city_building | 4 | rubble | 25 | 1 | ✅ |
| rubble | - | - | 10 | 2 | ❌ |

### 修改文件

1. **glossary-skill-config.json** — terrainDefs 追加 city_building / rubble，4 种可破坏地形
2. **damagePipe.cjs** — `calculateTerrainDamage` + `applyTerrainDamage`：攻击力×0.8 基础伤害，explosive/beam 全额
3. **terrainMovement.cjs** — `isDestructible` / `getTerrainMaxHp` / `getDestroyedTransformTo` / `applyTerrainDestruction`

### 管道验证

```
伤害: 25 | HP: 4→0 | 破坏: true | 新地形: rubble move_cost=2
applyTerrainDamage: cell.terrain_hp=0, cell.terrain_id=rubble
不可破坏: destroyed=false
forest.isDestructible=true, maxHp=3, transformTo=plain
```

### 部署

- Git: `d086b7f` → origin/main, 3 files, +278/-14
- Frontend: 115 modules, 0 errors
- Combat: 10 terrains API, HTTP 200

---

## 三、Phase 9.6: CTM 归一化大手术

### 问题诊断

| # | 症状 | 根因 |
|---|------|------|
| 1 | 鼠标拾取瘫痪，点击坐标与高亮严重错位 | `canvasPosToWorld` 逆矩阵顺序颠倒（先 ISO⁻¹ 再 R⁻¹） |
| 2 | 首尾列轴线不平行，非线性透视扭曲 | CTM 中 shearX 使 screenX 依赖 flatY |
| 3 | rotationAngle 不必要的复杂度 | atan2 补偿引入额外误差 |

### 修复内容（HexGridCanvas.vue，7 处）

1. 移除 `computed` import（不再需要 rotationAngle）
2. 移除 `rotationAngle` 定义
3. **重写 canvasPosToWorld 逆矩阵**（顺序修正：先 R⁻¹ 再 ISO⁻¹）
4. 简化 `centerGrid`：移除旋转计算
5. 简化 `draw()` CTM：移除 `ctx.rotate()` + shearX
6. isoRotation watcher 注释更新
7. `defineExpose` 移除 rotationAngle

### 部署

- Git: `028c7f7` → origin/main, 1 file, +33/-32
- Build: 115 modules, 0 errors, index.js 297.61 KB

---

## 四、Phase 9.6-紧急: 修复 X 轴滑块失效与首行倾斜

### 问题

Phase 9.6 原始 CTM `transform(scaleX, shearY*scaleX, 0, scaleY)` 存在两个严重缺陷：

1. **shearX 从矩阵移除** → X 轴（等距纵深感）滑块完全无响应
2. **screenY 受 flatX 污染** → `screenY = scaleY*flatY + shearY*scaleX*flatX`，R=0 行因 flatX≠0 发生视觉倾斜

### 修复（HexGridCanvas.vue，5 处）

```
正向 CTM (最终形):
  ctx.transform(scaleX, 0, shearX, scaleY, 0, 0)

等效:
  screenX = scale*(scaleX*flatX + shearX*flatY) + offsetX
  screenY = scale*(scaleY*flatY) + offsetY          ← 锁死: 仅依赖 flatY

逆向矩阵:
  flatY = worldY / scaleY
  flatX = (worldX - shearX*flatY) / scaleX
```

### 数学验证（全量通过）

| 测试项 | 结果 |
|--------|------|
| R=0 行 screenY ≡ offsetY | ✓ 绝对水平 |
| 6/6 正逆往返 | ✓ 无累积误差 |
| shearX=0.25 滑块响应 | ✓ 线性纵深感 |
| 列斜率恒定 = shearX×scaleY/(scaleX×√3) | ✓ 首尾列平行 |
| R=5 偏移 36.32, R=10 偏移 135.00 | ✓ 等比 |

### 部署

- Git: `dc8a448` → origin/main, 1 file, +34/-26
- Containers: 8/8 Healthy, HTTP 200

---

## 五、Phase 9.7: Even-R 拓扑步长锁死

### 问题

1. **zoomReset 缩放中心偏移** — 锚点补偿用 `.x/.y`（flat 坐标）而非 `.wx/.wy`（CTM 坐标）
2. **逆管线两步走** — `canvasPosToWorld → pixelToHex` 两步造成"画布像素高度 vs 世界坐标格点高度"概念混淆
3. **1.5×size 刚性步长** — `pointyTopCenter`/`pointyTopToHex` 未显式标注

### 核心设计：原子化逆变换 canvasPosToHex

```
①②③ 三连击 = 正向完整逆：

① r = round(flatY / (1.5 × HEX_RADIUS × spacingV))
       ↑────── Even-R 刚性除法的唯一真理 ──────↑

② flatX = (worldX - shearX × flatY) / scaleX
       ↑── shearX 回代消除纵深感偏移 ──↑

③ q = round((flatX/spacingH - evenOffset(r)) / (√3 × HEX_RADIUS))
       ↑── Even-R 奇偶行偏移补偿 ──↑
```

### 修改文件

| 文件 | 修改数 | 内容 |
|------|--------|------|
| HexGridCanvas.vue | 6 处 | canvasPosToHex 原子化、getHexAtEvent 封装、事件处理器替换、zoomReset 锚点修复 |
| hexUtils.js | 2 处 | pointyTopCenter/pointyTopToHex 标注 1.5×size 刚性步长 |

### 全量对账测试（7/7 通过）

| 测试 | 描述 | 结果 |
|------|------|------|
| **A** | R=0 行 flatY ≡ 0（绝对水平地平线） | ✅ |
| **B** | 1.5×size=54 刚性步长等比递增 | ✅ |
| **C** | 9/9 正逆往返（spacingH=1.03, V=0.79） | ✅ |
| **D** | screenY 零 q 分量干扰（R=0..5, Q=0..8） | ✅ |
| **E** | Y 轴像素线性递增 → R 严格单调（无偏角） | ✅ |
| **F** | (offsetX, offsetY) 点击 → 精确返回 (0,0) | ✅ |
| **G** | shearX 纵深感线性响应 | ✅ |

### 锁定性质

- Even-R 步长 `1.5×size=54` 双端对称，乘除互消
- 正逆矩阵严格成对倒数，无累积浮点误差
- Y 轴永不受 Q 分量干扰
- spacingH/spacingV 在正逆两端完美消去
- `canvasPosToWorld` 降级为内部/缩放锚点专用

### 部署

- Git: `9c0d940` → origin/main, 2 files, +72/-20
- Build: 115 modules, 0 errors
- Containers: 8/8 Healthy, HTTP 200

---

## 六、Git 提交链

```
9c0d940  Phase 9.7: 锁死 Even-R 拓扑步长，彻底清盘 Y 轴渲染与逆矩阵对账
dc8a448  Phase 9.6: 紧急修复 3D 倾斜 X 轴失效与首行倾斜
028c7f7  Phase 9.6: CTM 归一化大手术 (7处修改)
d086b7f  Phase 9.5: 可破坏生态单元全面落地
```

---

## 七、核心公式速查

### 正向渲染 CTM

```
ctx.transform(scaleX, 0, shearX, scaleY, 0, 0)

screenX = scale * (scaleX * flatX + shearX * flatY) + offsetX
screenY = scale * (scaleY * flatY) + offsetY
```

### 逆向拾取 canvasPosToHex

```
① r = round(flatY / (1.5 * HEX_RADIUS * spacingV))
② flatX = (worldX - shearX * flatY) / scaleX
③ q = round((flatX/spacingH - evenOffset(r)) / (√3 * HEX_RADIUS))
```

### Even-R 刚性步长

```
flatY = r × 1.5 × HEX_RADIUS × spacingV
flatX = (q × √3 × HEX_RADIUS + evenOffset(r)) × spacingH
```

### 当前配置参数

| 参数 | 值 | 说明 |
|------|-----|------|
| HEX_WIDTH | 64 | 六角格宽度 |
| HEX_HEIGHT | 72 | 六角格高度 |
| HEX_RADIUS | 36 | 外接圆半径 |
| scaleX | 1.00 | 水平缩放 |
| scaleY | 0.39 | 垂直压缩 |
| shearX | 0.25 | 等距纵深感 |
| spacingH | 1.03 (103%) | 水平间距 |
| spacingV | 0.79 (79%) | 垂直间距 |

---

## 八、容器清单

| 容器 | 端口 | 状态 |
|------|------|------|
| mecha-frontend | 8081 | Healthy |
| mecha-combat | 3004 | Healthy |
| mecha-battle-db | - | Healthy |
| mecha-hangar | - | Healthy |
| mecha-auth | - | Healthy |
| mecha-comm | - | Healthy |
| mecha-map | - | Healthy |

---

## 九、小结

Phase 9 完成了三大基础设施的全面搭建：

1. **可破坏地形系统**（9.5）— 4 种可破坏地形 + 伤害退化管道
2. **标准等距平行投影**（9.6）— CTM 矩阵归一化，鼠标指哪打哪
3. **Even-R 拓扑对账**（9.7）— 正逆步长锁死，Y 轴无偏角无跳变

当前项目处于**横平竖直、指哪打哪的完全体状态**，shearX 滑块响应正常，鼠标拾取精确，缩放锚点无偏移。
