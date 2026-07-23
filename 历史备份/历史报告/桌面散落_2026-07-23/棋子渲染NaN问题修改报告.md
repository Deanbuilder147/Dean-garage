# 棋子不显示 / 控制台刷屏 问题修改报告

> 项目：`mecha-universe-engine` 前端战场（`NewBattleView.vue`）
> 日期：2026-07-22
> 现象：部署后前端 `index-*.js` 疯狂报错，棋盘上棋子不出现；坐标算成 `NaN`，控制台刷屏。

---

## 一、问题现象

重新部署并打开战场后：

1. 控制台循环狂刷 `ReferenceError: props is not defined`
2. 修复后仍疯狂刷 `[drawBattleScene] ... first unit q/r= 12 14 screenXY= NaN NaN`
3. 棋盘上看不到任何棋子

这三个现象其实是**三层独立根因**叠加，必须逐一解决，只改一处仍会报下一个错。

---

## 二、根因与修改

### 根因 1：`ReferenceError: props is not defined`

**位置**：`frontend/src/views/NewBattleView.vue` 的 `drawBattleScene` 普通函数内

**原因**：`drawBattleScene` 是普通函数，不在 `<script setup>` 编译后的 `props` 闭包作用域内。Vue 3 的 `props` 仅在 `<script setup>` 顶层与模板编译上下文中可用，普通函数无法访问，误用即抛 `ReferenceError`。

**修改**：
```js
// 修改前
const units = props.gridData ...
// 修改后
const units = gridData.value ...
```

> 关键点：Canvas 渲染这类"纯渲染函数"应只通过 `.value` 读取已解包的响应式变量，不要依赖 `props` 闭包。

---

### 根因 2：部署未生效（仍在跑旧镜像）

**现象**：本地改了代码、`npm run build` 生成新 `dist`，但服务器控制台报的还是旧错（`index-P139oIUs.js`）。

**原因**：前端 `mecha-frontend` 的 `Dockerfile` 是 `COPY dist` 把构建产物打进镜像，**不是 volume 热挂载**。只执行 `npm run build` 而不重建镜像是无效的，线上容器仍是修复前的旧代码。

**修改（部署流程固化）**：必须走完整链路，先 rsync 源码到服务器，再在服务器构建并重建镜像：
```bash
# 1) 本地同步源码到服务器
rsync -az --delete --exclude node_modules --exclude .git --exclude dist \
  --exclude '*.db' --exclude /data --exclude '*.log' \
  -e "ssh -i ~/Desktop/watson.pem" \
  /Users/dingxuyang/CodeBuddy/20260604120036/mecha-universe-engine/ \
  root@106.54.197.69:/root/mecha-universe-engine/

# 2) 服务器构建 dist + 重建镜像
ssh -i ~/Desktop/watson.pem root@106.54.197.69 \
  "cd /root/mecha-universe-engine/frontend && npm run build"
docker compose build --no-cache mecha-gateway mecha-frontend
docker compose up -d mecha-gateway mecha-frontend
```

构建产物哈希演进：`index-P139oIUs.js`（旧错）→ `index-CBxVrKvm.js`（修 props）→ `index-BI5camc0.js`（修 NaN，当前线上）。

---

### 根因 3：`screenXY= NaN NaN`（坐标算成 NaN）

**位置**：`NewBattleView.vue` 的两个函数：
- `getUnitDrawFlat`（约 932 行）的 fallback 分支
- `drawBattleScene`（约 1665 行）调用 `pointyTopCenter` 处

**原因**：`spacingH` / `spacingV` 是 `ref()` 响应式变量，但在普通函数里被当成**数值**直接传入 `pointyTopCenter(q, r, HEX_RADIUS, spacingH, spacingV)`。响应式对象参与算术运算（`数字 * [ref 对象]`）结果恒为 `NaN`，导致 `flatX/flatY` 全是 `NaN`，等距变换后 `screenXY` 也是 `NaN`，棋子因此被判定"无坐标"而不绘制。

**修改**：
```js
// 修改前
const { flatX, flatY } = pointyTopCenter(unit.q, unit.r, HEX_RADIUS, spacingH, spacingV)
// 修改后
const { flatX, flatY } = pointyTopCenter(unit.q, unit.r, HEX_RADIUS, spacingH.value, spacingV.value)
```
`getUnitDrawFlat` 与 `drawBattleScene` 两处同样补 `.value`。

> 同类高危变量（均为 `ref`，普通函数内必须 `.value`）：`spacingH` / `spacingV` / `gridWidth` / `gridHeight`。

**附带优化**：精简 `drawBattleScene` 的日志，去掉每帧 `JSON.stringify(gridData.value)`（整个 cells 巨量 JSON）刷屏，改为只打印单位数 + 首个单位坐标：
```js
console.log('[drawBattleScene] units=', unitsWithScreenY.length,
  'first unit q/r=', first.unit.q, first.unit.r,
  'screenXY=', Math.round(fx), Math.round(fy))
```

---

## 三、最终验证

- 部署 `index-BI5camc0.js` 后，硬刷新（Cmd+Shift+R）浏览器缓存。
- `[drawBattleScene]` 日志坐标显示为**正常整数**（如 `screenXY= 412 688`），不再是 `NaN NaN`。
- 棋盘上**棋子正常出现**。
- 控制台仍会刷 `[drawBattleScene]` 日志（属正常调试输出，不影响功能，可在后续按需降级为 DEBUG 级别或移除）。

---

## 四、经验固化（防复发）

1. **普通函数 ≠ setup 闭包**：在 `<script setup>` 里把渲染/工具逻辑写成普通函数时，不能用 `props.xxx`，应通过 `xxx.value` 读已解包的响应式变量。
2. **ref 必解包**：`ref()` 在模板里自动拆箱，但在 JS 普通函数里参与运算必须显式 `.value`，否则静默产出 `NaN`。
3. **Docker 前端改代码 = 必须重建镜像**：`COPY dist` 模式下，任何前端改动都要 `npm run build` + `docker compose build --no-cache mecha-frontend` 才生效，单纯 build 目录无效。
4. **日志别刷屏**：避免每帧打印超大对象（如整个 `gridData`），否则既淹没有效信息又拖慢渲染。
