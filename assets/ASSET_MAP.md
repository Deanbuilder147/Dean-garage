# 素材交付清单（SVG → 前端直接使用）

把 SVG 放进本目录，按下方命名约定 + 这张表标注用途，AI 会直接在前端按状态/页面落地。

## 一、目录结构（推荐）
```
assets/
  hex/            # 六边形相关（导航组合、母题）
    nav-idle.svg
    nav-hover.svg
    nav-selected.svg
  title/          # 页面标题横幅
    page-title.svg
  bg/             # 背景层
    bg-base.svg
    bg-grid.svg
  icon/           # 图标（可选）
    home.svg
    hangar.svg
  ASSET_MAP.md    # 本清单
```

## 二、命名约定
- 同一元素多状态：`{用途}-{状态}.svg`，状态词固定为 `idle / hover / selected / disabled`。
- 颜色若写死在 SVG 里：每种颜色/主题单独一个文件（如 `nav-selected-green.svg`、`nav-selected-purple.svg`）。
- 颜色若用变量：SVG 内 `fill="currentColor"` 或 `fill="var(--c1)"`，由 CSS 注入，则只需一个文件。

## 三、交付时请标注（直接对话说也行）
对每批文件说明：
1. **用途**：对应哪个组件/页面（如"导航组合 5 项"、"各页顶部标题"）。
2. **状态映射**：哪个文件 = 常态/悬停/选中。
3. **尺寸**：SVG 实际像素（如六边形 96×108），我按数落地不猜。
4. **文字**：标题/导航文字是写死在 SVG 里（我接字体）还是需动态替换（我留插槽）。
5. **颜色方案**：写死色 → 列出每文件色值；变量色 → 列出 `--c1/--c2` 对应语义。

## 四、前端落地规则（AI 侧）
- `nav-*.svg` → 注册为 `AssetHex` 组件，按 `idle/hover/selected` 状态切换。
- `page-title.svg` → `PageTitle` 组件，文字动态传入。
- `bg-*.svg` → 按 z 层叠铺底（base 在下、grid 在上）。
- 多主题色：优先用 CSS 变量注入；若你给了分离文件，则用文件切换。

## 五、示例填写
```
nav-idle.svg      → 导航六边形 常态，96×108，青蓝描边，文字写死"首页/格纳库…"
nav-hover.svg     → 悬停，描边变亮+光晕加倍
nav-selected.svg  → 选中，绿光 #00ff88
page-title.svg    → 各页标题横幅，文字动态
bg-base.svg       → 背景底图，cover 铺底
bg-grid.svg       → 网格单元格层，opacity .5
```
