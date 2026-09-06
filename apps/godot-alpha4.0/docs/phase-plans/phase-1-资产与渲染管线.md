# 阶段 1 开发计划报告：资产与渲染管线（纯渲染沙盒）

> 范围：七视图棋子渲染、六边形战场绘制、像素锐化、坐标层级。
> 宪法红线：Canvas/3D 是单向数据管道终点，禁读 Vue ref/reactive/Store；`hex_math.gd` 唯一数学真理。

---

## 1. 维度一：alpha3.0 现状

- **七视图渲染优先**已落地：棋子 4 级降级 = 七视图 > 精灵 > 阵营 Logo > 矢量圆；上传即按七视图渲染。
- **像素锐化**已批量修：`imageSmoothingEnabled=false`，S/M/L/XL 放大保持硬朗像素边缘。
- **坐标层级**已满足：绘制按 `screenY` 升序，row/col 越大越靠前。
- **前端绘制全在 `hexDraw.js`**（逐顶点施加 ISO 仿射），战场尺寸由逻辑脚本硬性控制，禁 CSS 拉伸。
- **等距基准真相源**：`frontend/src/utils/hexUtils.js` 的 `ISO_DEFAULTS`（iso=ON, shearX=0.38, shearY=0, scaleX=1.00, scaleY=0.39, rot=-24）。

## 2. 维度二：Godot 平台优势与可复用插件

- **Godot 原生 3D + 七视图**：`Sprite3D`/`AnimatedSprite3D` 天然适配七视图（0-6 七视态）；`billboard` 模式可朝相机。比前端 Canvas 逐顶点模拟更省力。
- **像素锐化**：`ProjectSettings` 关 `rendering/textures/canvas_textures/default_texture_filter=Nearest`，全局像素风，无需逐帧设置。
- **Hex 插件参考**：`Hex Strategy Map`（Godot 4.6+ 完整六边形工具包，含渲染/寻路）可作视觉层参考，但坐标数学仍以 `hex_math.gd` 为唯一真相。
- **坐标转换净化**：Godot `Node2D/Node3D` 的 `position` 由 `hex_math.hex_to_pixel` 输出经缩放/平移矩阵变换得到；缩放/平移/等距压缩在核心公式外部进行（对齐宪法红线 §2）。

## 3. 维度三：godot4_turn_based_combat_system 启示

- 项目把战斗行为拆 `CombatComponent`，渲染与逻辑分离——印证我们 `render/`（渲染）与 `core/`（逻辑）分离。
- 其 `assets/` 管理素材的方式可参考，但我们的七视图资产工厂（4 轴动作集、16 帧）已远超其素材规模。

## 4. Godot 落地动作

1. **`render/` 渲染层单向消费**：从 `Battle3D.gd`（场景脚本）读取 `BattleStatePayload`，绝不反向读全局。
2. **七视图接入**：`Sprite3D` 按 `role`/`faction` 着色 + 七视图贴图降级链；沿用 `applySizeHp` 体型系数（S=0.9/M=1.0/L=1.1/XL=1.2）。
3. **像素锐化**：项目级 `default_texture_filter=Nearest`。
4. **坐标真相**：`render/hex_draw.gd` 仅调用 `hex_math.hex_to_pixel`，缩放/平移/ISO 在外部 `Transform2D/3D` 施加。

## 5. 验收标准

- [ ] 战场绘制尺寸由逻辑脚本硬性控制，无 CSS/Container 拉伸。
- [ ] 七视图降级链与 alpha3.0 一致（七视图>精灵>Logo>矢量圆）。
- [ ] 像素边缘与 alpha3.0 `imageSmoothingEnabled=false` 观感一致。
- [ ] `render/` 无任何 `BattleUnit` 全局单例直接引用（仅经 payload 传参）。
