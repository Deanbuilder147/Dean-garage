# 尖顶六角格（Even-R Offset）战棋开发终极宪法 (v2.0)

## 一、 核心架构红线：数据、逻辑与渲染三层分离
为了保证“地图编辑器”与“战场指挥”未来顺利分拆，项目必须严格执行以下隔离标准：

### 🧱 1. 渲染管线沙盒化 (Sandbox Isolation)
* 所有的 Canvas 渲染必须是“单向数据管道的终点”。Canvas 模块严禁主动读取 Vue 的 ref/reactive 响应式状态或全局 Store。
* Canvas 必须由逻辑脚本硬性控制 `canvas.width` 和 `canvas.height`。
* 严禁利用外部 CSS 的 Flex 布局、百分比（width: 100%）强行拉伸 Canvas，防止画布像素形变导致悬停失效。

### 🔄 2. 坐标转换纯净化 (Pure Transformation Contract)
* `hexUtils.js` 是唯一的数学真理。所有关于尖顶六边形 Even-R 错位的几何常量（HEX_WIDTH=64, HEX_HEIGHT=72）必须统一从 hexUtils 导入，严禁在页面组件内私自硬编码。
* 核心坐标转换函数（`pixelToHex` / `hexToPixel`）必须保持 1.0 标准倍率的绝对纯净。
* 任何关于缩放（scale）、平移（offsetX/Y）以及等距压缩（scale(1, 0.5)）的形变，必须在核心公式外部（传入前或输出后）进行矩阵逆运算，严禁污染核心公式内部：
  - 【渲染时】：2D标准坐标 -> 乘以 scale -> 加上 offsetX/Y ->（若开启伪3D则 Y*0.5）-> 绘制。
  - 【点击时】：鼠标原生像素 -> 减去 offsetX/Y -> 除以 scale ->（若开启伪3D则 Y/0.5）-> 核心公式逆推。

### 📡 3. 显式依赖与数据解耦 (Explicit Dependency)
* 严禁在任何重构代码中编写无上下文的“幽灵函数”（如原先报错的 `getTerrainById`）。
* 如果 Canvas 渲染需要查询地形配置，该配置字典（如 TERRAIN_MAP 16种配置）必须作为**参数**（options/config）在初始化时显式传入，保证组件零外部依赖。

---

## 二、 模块重构四阶段工作流 (Work Flow)
在修改或新增任何棋盘/编辑器功能时，Agent 必须按照以下步骤分阶段输出代码，拒绝一次性提供混合大片代码：

* **【Phase 1: 协议结构定义】**：优先明确数据结构。如需解决编辑器 {"q,r":id} 与战斗端 [{q,r,terrain}] 的不一致，先写出转换层（Converter）的 JSON 契约。
* **【Phase 2: 纯粹逻辑实现】**：重构或编写完全脱离 DOM、Canvas、Vue 上下文的纯 JS 数学算法（如优化后的 Even-R 寻路与点击判定）。
* **【Phase 3: 独立沙盒渲染】**：实现 Canvas 的单向绘制逻辑，使其只认 Phase 1 的标准数据源。
* **【Phase 4: UI 隔离与事件绑定】**：在 Vue 中重构 HTML 布局。外层网页 UI 必须包裹在独立的浮动层中（z-index 高于 Canvas），且空白区域通过 CSS `pointer-events: none;` 进行点击穿透隔离，防止改动网页 UI 布局时发生物理碰撞或误触画布。