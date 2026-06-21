const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat,
  HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber, PageBreak
} = require('docx');

const border = { style: BorderStyle.SINGLE, size: 1, color: "AAAAAA" };
const borders = { top: border, bottom: border, left: border, right: border };
const headerShading = { fill: "1B3A5C", type: ShadingType.CLEAR };
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };

function headerCell(text, width) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: headerShading,
    margins: cellMargins,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, bold: true, font: "Arial", size: 20, color: "FFFFFF" })]
    })]
  });
}

function cell(text, width, opts = {}) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: opts.shading || undefined,
    margins: cellMargins,
    children: [new Paragraph({
      children: [new TextRun({ text, font: "Arial", size: 18, ...(opts.run || {}) })]
    })]
  });
}

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text, bold: true, font: "Arial", size: 32, color: "1B3A5C" })] });
}

function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, bold: true, font: "Arial", size: 28, color: "2B579A" })] });
}

function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text, bold: true, font: "Arial", size: 24, color: "333333" })] });
}

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    ...opts,
    children: [new TextRun({ text, font: "Arial", size: 20, ...(opts.run || {}) })]
  });
}

function boldPara(text) {
  return para(text, { run: { bold: true } });
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, font: "Arial", size: 20 })]
  });
}

// ── Content ──────────────────────────────────────
const children = [];

// Title
children.push(new Paragraph({
  spacing: { after: 200 },
  children: [new TextRun({ text: "NewBattleView vs NewBattlefieldView", bold: true, font: "Arial", size: 40, color: "1B3A5C" })]
}));
children.push(new Paragraph({
  spacing: { after: 100 },
  children: [new TextRun({ text: "前端双页面对比分析报告", font: "Arial", size: 28, color: "666666" })]
}));
children.push(para("生成日期: 2026-06-19", { run: { italics: true, size: 18, color: "999999" } }));
children.push(para("分析对象: NewBattleView.vue (战场端) vs NewBattlefieldView.vue (地图编辑器端)", { run: { size: 18, color: "999999" } }));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 1. 综述 ──
children.push(h1("一、综述"));
children.push(para("两个页面均基于 Vue 3 Composition API，使用六角格战场渲染管线，共享 hexUtils.js 的核心数学基础设施。但它们在功能定位、架构复杂度、布局模式和交互逻辑上存在显著差异。"));
children.push(para(`NewBattleView.vue: 2801 行 — 完整的战斗回合制交互页面，包含阵营管理、单位选择/移动/攻击、技能释放、部署系统。`));
children.push(para(`NewBattlefieldView.vue: 607 行 — 轻量级地图编辑器，专注于地形绘制与地图导出。`));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 2. 共同区域 ──
children.push(h1("二、共同区域 (Common Ground)"));

children.push(h2("2.1 共享的 hexUtils.js 导入"));
children.push(para("两者均从 ../utils/hexUtils.js 导入以下模块："));
const sharedImports = [
  "HEX_WIDTH, HEX_HEIGHT, HEX_APOTHEM, HEX_RADIUS — 六边形几何常量",
  "DEFAULT_SPACING_H, DEFAULT_SPACING_V, DEFAULT_OFFSET_FACTOR — 间距默认值",
  "pointyTopCenter, pointyTopToHex — 尖顶六边形坐标转换核心函数",
  "drawHexPath — 六边形路径绘制",
  "UNIVERSAL_TERRAIN_MAP — 地形字典（16种地形）",
  "convertMapFormat — 地图格式转换",
  "ISO_DEFAULTS — 等距矩阵基准参数 (shearX=0.25, shearY=0.44, scaleX=1.00, scaleY=0.39)",
];
sharedImports.forEach(i => children.push(bullet(i)));

children.push(h2("2.2 Canvas 渲染管道"));
children.push(para("两者采用完全相同的 Canvas 渲染管道结构："));
children.push(bullet("Canvas 容器层级: .game-canvas-sandbox > .canvas-container > canvas"));
children.push(bullet("CTM 变换链: ctx.translate(offsetX, offsetY) → ctx.scale(scale, scale) → ctx.transform(ISO.scaleX, ISO.shearY, ISO.shearX, ISO.scaleY, 0, 0)"));
children.push(bullet("每帧调用 draw(hlQ, hlR) 进行全量重绘"));
children.push(bullet("使用沙盒容器 .game-canvas-sandbox 作为 CSS contain: layout 边界"));
children.push(bullet("坐标工具函数包装: hexToPixel(q, r) / pixelToHex(px, py)"));

children.push(h2("2.3 事件系统"));
children.push(para("两者共享相同的事件绑定范式："));
children.push(bullet("拖拽模式: mousedown 记录起点 → window.addEventListener('mousemove/mouseup') 全局绑定防止鼠标出界中断"));
children.push(bullet("_windowDragMove / _windowDragEnd 闭包变量管理拖拽生命周期"));
children.push(bullet("isDragging 标志区分点击与拖拽"));
children.push(bullet("wheel 事件处理缩放（preventDefault + 缩放到指定中心点）"));
children.push(bullet("mousemove 更新 hover 坐标 → draw(hlQ, hlR) 重绘高亮"));

children.push(h2("2.4 响应式状态"));
children.push(bullet("scale (缩放比例, 范围 0.2~3)"));
children.push(bullet("offsetX / offsetY (相机平移量)"));
children.push(bullet("hoverCoord (鼠标悬停坐标字符串)"));
children.push(bullet("canvasWrapper / canvasContainer (DOM refs)"));
children.push(bullet("ISO (等距矩阵参数引用)"));

children.push(h2("2.5 Vue 基础设施"));
children.push(bullet("useRouter / useRoute 路由访问"));
children.push(bullet("inject('sidebarActionLog') 日志管道"));
children.push(bullet("addLog(type, message) 日志记录"));
children.push(bullet("formatCoord(q, r) 坐标格式化 (colToLetter + rowIndex)"));
children.push(bullet("hexToRGBA(hex, alpha) 颜色转换工具"));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 3. 差异分析 ──
children.push(h1("三、差异分析 (Key Differences)"));

// 3.1 架构规模
children.push(h2("3.1 架构规模"));
children.push(para("代码总量差异约 4.6 倍："));
{
  const tw = [4680, 4680];
  children.push(new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: tw,
    rows: [
      new TableRow({ children: [
        headerCell("指标", tw[0]),
        headerCell("对比", tw[1]),
      ]}),
      new TableRow({ children: [
        cell("总行数", tw[0]),
        cell("2801 vs 607", tw[1]),
      ]}),
      new TableRow({ children: [
        cell("<script> 行数", tw[0]),
        cell("~1518 vs ~479", tw[1]),
      ]}),
      new TableRow({ children: [
        cell("<style> 行数", tw[0]),
        cell("~957 vs ~56", tw[1]),
      ]}),
      new TableRow({ children: [
        cell("<template> 行数", tw[0]),
        cell("~323 vs ~69", tw[1]),
      ]}),
    ]
  }));
}

// 3.2 布局
children.push(h2("3.2 布局结构"));
children.push(h3("NewBattleView (战场端) — 四面板布局"));
children.push(bullet("外层 .dm-battle-layout { display: flex; height: 100vh }"));
children.push(bullet("左: TheSidebar 组件 (侧边栏, 外部组件)"));
children.push(bullet("中: .dm-main { flex: 1 } — Canvas + 工具栏 + 底部阵营盒"));
children.push(bullet("右: .dm-action-panel (200px) — 部署/战斗动作面板"));
children.push(bullet("底: .faction-boxes — 阵营单位列表 (位于 .dm-main 底部)"));
children.push(para(""));

children.push(h3("NewBattlefieldView (编辑器端) — 单列垂直布局"));
children.push(bullet("外层 .page-container { min-height: 100vh }"));
children.push(bullet("单列 .main-content { flex-direction: column; height: 100vh; overflow: hidden }"));
children.push(bullet("从上到下: Header → 地图信息栏 → Canvas → 地形画笔调色板 → 间距控制栏 → 底部 Footer"));
children.push(para(""));

{
  const tw = [3120, 3120, 3120];
  children.push(para("关键布局差异对比:", { run: { bold: true } }));
  children.push(new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: tw,
    rows: [
      new TableRow({ children: [
        headerCell("维度", tw[0]),
        headerCell("战场端 (BV)", tw[1]),
        headerCell("编辑器端 (BF)", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("布局模式", tw[0]),
        cell("Flex 四面板", tw[1]),
        cell("单列流式", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("容器高度", tw[0]),
        cell("100vh", tw[1]),
        cell("100vh", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("主面板 CSS", tw[0]),
        cell("flex: 1; min-width: 0; min-height: 0; overflow: hidden", tw[1]),
        cell("width: 100%; max-width: 100%; min-width: 0; overflow: hidden", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("字体族", tw[0]),
        cell("Space Grotesk, Fira Code", tw[1]),
        cell("Noto Sans SC, Space Grotesk", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("背景色", tw[0]),
        cell("#0a1628", tw[1]),
        cell("#001620", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("左侧边栏", tw[0]),
        cell("TheSidebar (外部组件)", tw[1]),
        cell("无 (左侧留出 256px 给共用 Sidebar)", tw[2]),
      ]}),
    ]
  }));
}

// 3.3 数据源
children.push(h2("3.3 数据源与状态管理"));
{
  const tw = [3120, 3120, 3120];
  children.push(new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: tw,
    rows: [
      new TableRow({ children: [
        headerCell("维度", tw[0]),
        headerCell("战场端 (BV)", tw[1]),
        headerCell("编辑器端 (BF)", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("API", tw[0]),
        cell("combatAPI (战斗/单位 API)", tw[1]),
        cell("mapAPI (地图 API)", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("核心数据", tw[0]),
        cell("battleState → battlefieldState → cells + units", tw[1]),
        cell("battlefield → terrain + terrainMap", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("网格维度", tw[0]),
        cell("gridWidth/gridHeight 来自 battlefieldState", tw[1]),
        cell("gridW/gridH 来自 battlefield.value", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("默认网格", tw[0]),
        cell("10×10", tw[1]),
        cell("15×10", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("Store", tw[0]),
        cell("useUserStore (用户信息)", tw[1]),
        cell("无 Store", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("地形数据", tw[0]),
        cell("cells[].terrain (与服务端同步)", tw[1]),
        cell("terrainMap reactive (本地编辑)", tw[2]),
      ]}),
    ]
  }));
}

// 3.4 Canvas
children.push(h2("3.4 Canvas 创建方式"));
children.push(para("这是两者的关键实现差异："));
children.push(bullet("战场端: 模板中使用 <canvas ref=\"mapCanvas\"> 声明 Canvas 元素，initCanvas() 直接操作该 ref"));
children.push(bullet("编辑器端: 模板中只有 <div ref=\"canvasContainer\">，initCanvas() 通过 document.createElement('canvas') 动态创建并追加到容器"));

// 3.5 坐标系统
children.push(h2("3.5 坐标逆推逻辑"));
children.push(para("两者鼠标→世界坐标的转换算法有差异："));
children.push(h3("战场端 getWorldPos → canvasPosToWorld (两阶段)："));
children.push(bullet("getWorldPos(e): 获取 getBoundingClientRect → 像素矫正 (canvas.width/rect.width) → 调用 canvasPosToWorld(cx, cy)"));
children.push(bullet("canvasPosToWorld(cx, cy): subtract offset → divide scale → inverse ISO matrix → pointyTopToHex"));
children.push(bullet("返回 { x: flatX, y: flatY, q, r, wx: worldX, wy: worldY } — 保留中间产物供缩放锚点使用"));
children.push(h3("编辑器端 getWorldPos (单阶段)："));
children.push(bullet("getWorldPos(e): 获取 getBoundingClientRect → 像素矫正 → subtract offset → divide scale → inverse ISO matrix"));
children.push(bullet("返回 { x: flatX, y: flatY } — 不保留中间产物"));
children.push(para("结论: 战场端多保留了 wx/wy (ISO正向坐标) 供 zoomIn/zoomOut/wheel 作为缩放锚点；编辑器端不需要此功能，简化实现。", { run: { italics: true } }));

// 3.6 缩放计算
children.push(h2("3.6 缩放实现"));
{
  const tw = [3120, 3120, 3120];
  children.push(new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: tw,
    rows: [
      new TableRow({ children: [
        headerCell("维度", tw[0]),
        headerCell("战场端 (BV)", tw[1]),
        headerCell("编辑器端 (BF)", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("zoomIn/zoomOut", tw[0]),
        cell("以画布中心为锚点 → canvasPosToWorld(center) → 用 worldCenter.wx/wy 计算 offset 补偿", tw[1]),
        cell("无锚点保持 → 直接 scale.value = ns; draw() (但 initCanvas 重置 offset)", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("Wheel 缩放", tw[0]),
        cell("以鼠标位置为锚点 → getWorldPos(e) → worldPos.wx/wy → offset += (oldScale-newScale) * worldPos", tw[1]),
        cell("以鼠标位置为锚点 → mx - (mx - offsetX) * (ns/scale) 纯 2D 计算", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("zoomReset", tw[0]),
        cell("自适应: 根据内容尺寸和容器尺寸计算最佳缩放 + 居中 offset", tw[1]),
        cell("重置为 1 + isFirstDraw=true 触发重新居中", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("缩放步进", tw[0]),
        cell("×1.2 / ÷1.2", tw[1]),
        cell("×1.2 / ÷1.2 (按钮), ×1.08 / ÷0.92 (滚轮)", tw[2]),
      ]}),
    ]
  }));
}

// 3.7 渲染差异
children.push(h2("3.7 draw() 函数复杂度"));

children.push(h3("战场端 draw() — 完整战斗渲染"));
children.push(bullet("BFS 移动范围计算: 基于地形 cost 的寻路"));
children.push(bullet("战术/技能范围预览: skillRangeHexes + validTargets"));
children.push(bullet("RoyRoy 部署范围: 相邻空格的 BFS"));
children.push(bullet("单位渲染: 含头像图片加载 (unitImageCache)"));
children.push(bullet("HP/护盾条渲染"));
children.push(bullet("阵营着色"));
children.push(bullet("可选的坐标标签显示 (showCoords)"));
children.push(bullet("移动范围/技能范围/部署范围的彩色高亮叠加"));

children.push(h3("编辑器端 draw() — 纯地形渲染"));
children.push(bullet("六边形地形填充 (terrainMap → terrainDef.color)"));
children.push(bullet("六边形边框"));
children.push(bullet("坐标标签"));
children.push(bullet("悬停高亮 + 地形名称 tooltip"));
children.push(bullet("首次绘制/尺寸变化时自动重新居中"));

// 3.8 事件行为
children.push(h2("3.8 事件行为差异"));
{
  const tw = [3120, 3120, 3120];
  children.push(new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: tw,
    rows: [
      new TableRow({ children: [
        headerCell("事件", tw[0]),
        headerCell("战场端 (BV)", tw[1]),
        headerCell("编辑器端 (BF)", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("click", tw[0]),
        cell("多分支: 部署/移动/攻击/选择单位/显示格子信息", tw[1]),
        cell("单分支: 涂抹当前画笔地形", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("右键", tw[0]),
        cell("无特殊处理", tw[1]),
        cell("擦除地形 (delete terrainMap)", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("光标样式", tw[0]),
        cell("默认 'grab' → 拖拽时 'grabbing'", tw[1]),
        cell("默认 'crosshair' → 拖拽时 'grabbing'", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("mouseleave", tw[0]),
        cell("清空 hoverCoord + draw()", tw[1]),
        cell("清除 hoveredQ/hoveredR + draw() (不重置 isDragging)", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("事件绑定方式", tw[0]),
        cell("canvas.onclick + canvas.addEventListener 混合", tw[1]),
        cell("全部使用 addEventListener (更规范)", tw[2]),
      ]}),
    ]
  }));
}

// 3.9 独有功能
children.push(h2("3.9 独有功能"));

children.push(h3("战场端独有 (9 项)"));
children.push(bullet("阵营系统 (FACTION_CONFIG: earth/maxion/neutral/balon)"));
children.push(bullet("阵营角色与技能 (ROLE_SKILLS: attack/defense/ambush 每角色 2 个技能)"));
children.push(bullet("布局功能: 阵营单位列表 (.faction-boxes) + 坐标跳转输入"));
children.push(bullet("部署系统: deployPool → 点击地图放置 → finishDeployment 开始战斗"));
children.push(bullet("单位选择与动作系统: selectedUnit + actionMode (move/tactical/defend/wait)"));
children.push(bullet("回合管理: endTurn → 切换阵营行动权"));
children.push(bullet("RoyRoy 部署系统: 特殊单位相邻空格部署"));
children.push(bullet("终端日志 (terminalLogs)"));
children.push(bullet("胜利条件追踪 (victoryInfo)"));

children.push(h3("编辑器端独有 (5 项)"));
children.push(bullet("地形画笔调色板 (terrainPalette — 16 种地形)"));
children.push(bullet("左键涂抹 / 右键擦除地形"));
children.push(bullet("间距调整控件 (spacingH/spacingV 实时可调)"));
children.push(bullet("保存到后端 (saveMap → mapAPI)"));
children.push(bullet("导出 JSON (exportJSON → Blob 下载)"));

// 3.10 生命周期
children.push(h2("3.10 生命周期管理"));
{
  const tw = [3120, 3120, 3120];
  children.push(new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: tw,
    rows: [
      new TableRow({ children: [
        headerCell("维度", tw[0]),
        headerCell("战场端 (BV)", tw[1]),
        headerCell("编辑器端 (BF)", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("onMounted", tw[0]),
        cell("加载战斗状态 → 判断阶段 → 加载部署池/冷却/胜利条件 → initCanvas → setupEvents", tw[1]),
        cell("加载地图数据 → initCanvas (内部调用 setupEvents)", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("onUnmounted", tw[0]),
        cell("无 (未导入)", tw[1]),
        cell("已导入但未使用", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("watch", tw[0]),
        cell("监听 battleState.faction_turn 更新阶段文本", tw[1]),
        cell("无", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("nextTick", tw[0]),
        cell("2 次: 确保 Canvas DOM 就绪后再 initCanvas, 确保 Canvas 初始化后再 setupEvents", tw[1]),
        cell("1 次: 确保数据加载后再 initCanvas", tw[2]),
      ]}),
    ]
  }));
}

// 3.11 样式
children.push(h2("3.11 样式架构"));
{
  const tw = [3120, 3120, 3120];
  children.push(new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: tw,
    rows: [
      new TableRow({ children: [
        headerCell("维度", tw[0]),
        headerCell("战场端 (BV)", tw[1]),
        headerCell("编辑器端 (BF)", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("样式行数", tw[0]),
        cell("~957 行", tw[1]),
        cell("~56 行", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("全局 reset", tw[0]),
        cell("无 (依赖外部样式)", tw[1]),
        cell("* { margin: 0; padding: 0; box-sizing: border-box }", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("布局策略", tw[0]),
        cell("Flexbox 四面板 (display: flex)", tw[1]),
        cell("Block + Flex 单列流式", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("样式组织", tw[0]),
        cell("区域分组注释 (/* LEFT SIDEBAR */, /* MAIN CONTENT */, /* ACTION PANEL */ 等)", tw[1]),
        cell("组件级平铺 (无分组注释)", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("pointer-events", tw[0]),
        cell("工具栏/面板/按钮有 pointer-events: auto (穿透层)", tw[1]),
        cell("部分控件有 pointer-events: auto", tw[2]),
      ]}),
    ]
  }));
}

// 3.12 Spacing
children.push(h2("3.12 间距配置"));
{
  const tw = [3120, 3120, 3120];
  children.push(new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: tw,
    rows: [
      new TableRow({ children: [
        headerCell("维度", tw[0]),
        headerCell("战场端 (BV)", tw[1]),
        headerCell("编辑器端 (BF)", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("spacingH/V 可变性", tw[0]),
        cell("const — 不可变 (取 hexUtils 默认值)", tw[1]),
        cell("let — 可变 (UI 控件实时调整)", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("默认值来源", tw[0]),
        cell("DEFAULT_SPACING_H/V = 1.00/1.00", tw[1]),
        cell("DEFAULT_SPACING_H/V = 1.00/1.00 (同上)", tw[2]),
      ]}),
      new TableRow({ children: [
        cell("调整范围", tw[0]),
        cell("不可调", tw[1]),
        cell("H: 50%~150%, V: 50%~150%", tw[2]),
      ]}),
    ]
  }));
}

// 3.13 导入
children.push(h2("3.13 导入差异"));
{
  const tw = [4680, 4680];
  children.push(new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: tw,
    rows: [
      new TableRow({ children: [
        headerCell("战场端额外导入", tw[0]),
        headerCell("编辑器端额外导入", tw[1]),
      ]}),
      new TableRow({ children: [
        cell("combatAPI, hangarAPI (战斗/机库 API)", tw[0]),
        cell("mapAPI (地图 API)", tw[1]),
      ]}),
      new TableRow({ children: [
        cell("TERRAIN_COLORS (地形颜色单独引用)", tw[0]),
        cell("(与 hexUtils 一致)", tw[1]),
      ]}),
      new TableRow({ children: [
        cell("useUserStore (用户 Store)", tw[0]),
        cell("(无)", tw[1]),
      ]}),
      new TableRow({ children: [
        cell("getHexNeighbors (邻居查找)", tw[0]),
        cell("(无)", tw[1]),
      ]}),
      new TableRow({ children: [
        cell("watch, reactive", tw[0]),
        cell("onUnmounted (未使用)", tw[1]),
      ]}),
    ]
  }));
}

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 4. 差异汇总表 ──
children.push(h1("四、差异汇总表 (速查)"));

const twDetail = [2000, 3680, 3680];
const detailRows = [
  ["代码量", "2801 行", "607 行"],
  ["布局", "Flex 四面板 (左+中+右+底)", "单列垂直流式"],
  ["Canvas 创建", "模板 <canvas ref>", "document.createElement"],
  ["光标默认", "grab", "crosshair"],
  ["数据源 API", "combatAPI", "mapAPI"],
  ["核心数据", "battleState → cells + units", "battlefield → terrainMap"],
  ["默认网格", "10×10", "15×10"],
  ["缩放锚点", "ISO 逆矩阵 worldCenter.wx/wy", "纯 2D offset 插值"],
  ["Wheel 步进", "0.9 / 1.1", "0.92 / 1.08"],
  ["zoomReset", "自适应内容尺寸", "scale=1 + 重居中"],
  ["draw 复杂度", "BFS + 单位 + 技能 + HP 条", "纯地形 + 悬停"],
  ["间距可变", "不可变 (const)", "可变 (let, 50%~150%)"],
  ["阵营系统", "有 (4 阵营 + 角色技能)", "无"],
  ["部署系统", "有 (deployPool → 地图)", "无"],
  ["单位交互", "选择/移动/攻击/技能", "无 (纯地形编辑)"],
  ["回合管理", "有 (endTurn)", "无"],
  ["地形编辑", "无 (只读)", "左键涂抹 / 右键擦除"],
  ["保存/导出", "无", "saveMap (API) / exportJSON"],
  ["样式行数", "~957 行", "~56 行"],
  ["事件绑定", "onclick + addEventListener 混合", "全部 addEventListener"],
  ["onUnmounted", "无", "已导入但空置"],
  ["watch", "监听 faction_turn", "无"],
  ["字体", "Space Grotesk, Fira Code", "Noto Sans SC, Space Grotesk"],
];

const detailTableRows = [new TableRow({ children: [
  headerCell("维度", twDetail[0]),
  headerCell("战场端 (NewBattleView)", twDetail[1]),
  headerCell("编辑器端 (NewBattlefieldView)", twDetail[2]),
]})];
detailRows.forEach((row, i) => {
  const shade = i % 2 === 0 ? { fill: "F5F8FC", type: ShadingType.CLEAR } : undefined;
  detailTableRows.push(new TableRow({ children: [
    cell(row[0], twDetail[0], { run: { bold: true }, shading: shade }),
    cell(row[1], twDetail[1], { shading: shade }),
    cell(row[2], twDetail[2], { shading: shade }),
  ]}));
});
children.push(new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: twDetail,
  rows: detailTableRows,
}));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 5. 优化建议 ──
children.push(h1("五、优化建议"));

children.push(h2("5.1 可统一的部分"));
children.push(bullet("getWorldPos 函数签名: 统一战场端和编辑器端的返回值格式，建议编辑器端也返回 wx/wy 以备未来扩展"));
children.push(bullet("Canvas 创建方式: 统一使用模板声明 <canvas ref> 方式，编辑器端改为模板声明可简化 DOM 操作"));
children.push(bullet("缩放步进值: wheel 步进不一致 (0.9 vs 0.92)，建议统一为同一常量"));
children.push(bullet("draw() 中的 spacingH/spacingV: 当前两者硬编码使用本地变量，建议统一从共享配置模块读取"));

children.push(h2("5.2 编辑器端待补齐"));
children.push(bullet("缺少 onUnmounted 中的事件清理: 建议添加 window.removeEventListener 清理 _windowDragMove/_windowDragEnd"));
children.push(bullet("zoomIn/zoomOut 缺少锚点: 当前直接 scale=ns 会导致缩放中心偏移，建议参照战场端实现锚点补偿"));

children.push(h2("5.3 战场端待优化"));
children.push(bullet("事件绑定混杂: 同时使用 canvas.onclick 和 canvas.addEventListener，建议统一为 addEventListener"));
children.push(bullet("缺少 onUnmounted: 建议添加以清理 window 级事件监听器，防止内存泄漏"));
children.push(bullet("draw() 过于庞大: 可将移动范围 BFS、技能范围、单位渲染分别抽离为独立模块"));

children.push(para(""));
children.push(para("— 报告完毕 —", { alignment: AlignmentType.CENTER, run: { italics: true, color: "999999" } }));

// ── Build Document ──
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 20 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: "1B3A5C" },
        paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: "2B579A" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: "333333" },
        paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 2 } },
    ]
  },
  numbering: {
    config: [
      { reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: "前端双页面对比分析报告", font: "Arial", size: 16, color: "999999", italics: true })]
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "第 ", font: "Arial", size: 16, color: "999999" }),
            new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: "999999" })]
        })]
      })
    },
    children,
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/Users/dingxuyang/CodeBuddy/20260604120036/前端双页面对比分析报告.docx", buffer);
  console.log("OK: report generated");
}).catch(err => { console.error(err); process.exit(1); });
