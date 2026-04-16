<template>
  <div class="battlefield-editor">
    <!-- 左侧工具栏 -->
    <div class="sidebar">
      <div class="sidebar-section">
        <div class="header-actions">
          <h3>战场编辑</h3>
          <button @click="goHome" class="btn-home">
            <Icon name="home" size="16" variant="default" />
            返回首页
          </button>
        </div>
        
        <!-- 新建战场 -->
        <button v-if="!currentBattlefield" @click="showCreateModal = true" class="btn-primary">
          + 新建战场
        </button>
        
        <!-- 已选中战场 -->
        <div v-else class="current-battlefield">
          <div class="battlefield-info">
            <strong>{{ currentBattlefield.name }}</strong>
            <span>{{ currentBattlefield.width }}×{{ currentBattlefield.height }}</span>
          </div>
          <div class="battlefield-actions">
            <button @click="saveBattlefield" class="btn-primary">💾 保存</button>
            <button @click="exitBattlefield" class="btn-secondary">← 返回列表</button>
          </div>
          <!-- 保存状态提示 -->
          <div v-if="saveStatus" class="save-status" :class="saveStatus">
            <span v-if="saveStatus === 'saving'">保存中...</span>
            <span v-else>{{ saveMessage }}</span>
          </div>
        </div>
      </div>

      <!-- 格子间距调整 -->
      <div v-if="currentBattlefield" class="sidebar-section">
        <div class="section-title">
          <Icon name="edit" size="16" variant="primary" />
          <h3>格子间距调整</h3>
        </div>
        <div class="spacing-controls">
          <div class="spacing-row">
            <label>水平间距</label>
            <button @click="adjustSpacing('h', -2)" class="btn-small">-2%</button>
            <span class="spacing-value">{{ Math.round(spacingH * 100) }}%</span>
            <button @click="adjustSpacing('h', 2)" class="btn-small">+2%</button>
          </div>
          <div class="spacing-row">
            <label>垂直间距</label>
            <button @click="adjustSpacing('v', -2)" class="btn-small">-2%</button>
            <span class="spacing-value">{{ Math.round(spacingV * 100) }}%</span>
            <button @click="adjustSpacing('v', 2)" class="btn-small">+2%</button>
          </div>
          <div class="spacing-row">
            <label>行偏移量</label>
            <button @click="adjustSpacing('o', -2)" class="btn-small">-2%</button>
            <span class="spacing-value">{{ Math.round(offsetFactor * 100) }}%</span>
            <button @click="adjustSpacing('o', 2)" class="btn-small">+2%</button>
          </div>
          <button @click="resetSpacing" class="btn-secondary btn-full">重置间距</button>
        </div>
      </div>

      <!-- 遮罩透明度 -->
      <div v-if="currentBattlefield" class="sidebar-section">
        <div class="section-title">
          <Icon name="palette" size="16" variant="primary" />
          <h3>遮罩透明度</h3>
        </div>
        <div class="spacing-controls">
          <div class="spacing-row">
            <label>不透明度</label>
            <button @click="adjustOpacity(-5)" class="btn-small">-5%</button>
            <span class="spacing-value">{{ Math.round(maskOpacity * 100) }}%</span>
            <button @click="adjustOpacity(5)" class="btn-small">+5%</button>
          </div>
        </div>
      </div>

      <!-- 坐标跳转 & 批量地形编辑 -->
      <div v-if="currentBattlefield" class="sidebar-section">
        <div class="section-title">
          <Icon name="map" size="16" variant="primary" />
          <h3>坐标跳转</h3>
        </div>
        <div class="coord-input">
          <input v-model="targetCoord" type="text" placeholder="如 A1" style="width: 70px;" />
          <button @click="jumpToCoord" class="btn-primary">跳转</button>
        </div>
      </div>

      <div v-if="currentBattlefield" class="sidebar-section">
        <div class="section-title">
          <Icon name="edit" size="16" variant="primary" />
          <h3>批量地形编辑</h3>
        </div>
        <div class="batch-terrain">
          <div class="form-row">
            <label>坐标范围 (如 A1:C5)</label>
            <input v-model="batchRange" type="text" placeholder="A1:C5" />
          </div>
          <div class="form-row">
            <label>目标地形</label>
            <select v-model="batchTerrainId">
              <option v-for="terrain in allTerrains" :key="terrain.id" :value="terrain.id">
                {{ terrain.name }} ({{ terrain.moveCost }}MP)
              </option>
            </select>
          </div>
          <button @click="applyBatchTerrain" class="btn-primary btn-full">应用</button>
          <div v-if="batchResult" class="batch-result" :class="{ success: batchResult.success, error: !batchResult.success }">
            {{ batchResult.message }}
          </div>
        </div>
      </div>

      <!-- 地形选择 -->
      <div v-if="currentBattlefield" class="sidebar-section">
        <div class="section-title">
          <Icon name="map" size="16" variant="primary" />
          <h3>选择地形</h3>
        </div>
        <div class="terrain-list">
          <div
            v-for="terrain in allTerrains"
            :key="terrain.id"
            class="terrain-item"
            :class="{ active: selectedTerrain === terrain.id }"
            @click="selectedTerrain = terrain.id"
          >
            <div class="terrain-color" :style="{ background: terrain.color }"></div>
            <span>{{ terrain.name }}</span>
            <span class="terrain-cost">{{ terrain.moveCost }}MP</span>
            <button @click.stop="deleteTerrain(terrain.id)" class="btn-delete" title="删除地形">
              <Icon name="delete" size="14" variant="error" />
            </button>
          </div>
        </div>
      </div>

      <!-- 自定义地形设计器 -->
      <div v-if="currentBattlefield" class="sidebar-section">
        <div @click="showCustomTerrain = !showCustomTerrain" class="section-title collapsible">
          <Icon name="edit" size="16" variant="primary" />
          <h3>自定义地形</h3>
          <Icon :name="showCustomTerrain ? 'arrowDown' : 'arrowRight'" size="14" variant="default" />
        </div>
        <div v-if="showCustomTerrain" class="custom-terrain-form">
          <div class="form-row">
            <label>地形名称</label>
            <input v-model="customTerrain.name" placeholder="输入名称" />
          </div>
          <div class="form-row">
            <label>地形颜色</label>
            <div class="color-picker">
              <input type="color" v-model="customTerrain.color" />
              <div class="color-preview" :style="{ background: customTerrain.color }"></div>
            </div>
          </div>
          <div class="form-row">
            <label>移动消耗 (MP)</label>
            <input type="number" v-model.number="customTerrain.moveCost" min="0" max="10" step="0.5" />
          </div>
          <div class="form-row">
            <label>地形血量 (0=不可破坏)</label>
            <input type="number" v-model.number="customTerrain.hp" min="0" max="100" />
          </div>
          <div class="form-row">
            <label>特殊效果</label>
            <select v-model="customTerrain.effect">
              <option value="">无</option>
              <option value="beam+1">光束武器+1</option>
              <option value="physical+1">实体武器+1</option>
              <option value="destructible">可破坏</option>
              <option value="heal">可回复HP</option>
            </select>
          </div>
          <button @click="addCustomTerrain" class="btn-primary">+ 添加地形</button>
        </div>
        
        <!-- 自定义地形列表 -->
        <div v-if="customTerrains.length > 0" class="custom-terrain-list">
          <div 
            v-for="(terrain, idx) in customTerrains" 
            :key="'custom_' + idx"
            class="terrain-item"
            :class="{ active: selectedTerrain === 'custom_' + idx }"
            @click="selectedTerrain = 'custom_' + idx"
          >
            <div class="terrain-color" :style="{ background: terrain.color }"></div>
            <span>{{ terrain.name }}</span>
            <button @click.stop="removeCustomTerrain(idx)" class="btn-delete">
              <Icon name="close" size="12" variant="error" />
            </button>
          </div>
        </div>
      </div>

      <!-- 战场列表 -->
      <div v-if="!currentBattlefield" class="sidebar-section">
        <div class="section-title">
          <Icon name="box" size="16" variant="primary" />
          <h3>已保存的战场</h3>
        </div>
        <div v-if="battlefields.length === 0" class="empty-hint">暂无保存的战场</div>
        <div v-else class="battlefield-list">
          <div 
            v-for="bf in battlefields" 
            :key="bf.id"
            class="battlefield-item"
          >
            <div class="battlefield-item-info" @click="selectBattlefield(bf)">
              <strong>{{ bf.name }}</strong>
              <span>{{ bf.width }}×{{ bf.height }}</span>
            </div>
            <div class="battlefield-item-actions">
              <button @click.stop="startBattle(bf)" class="btn-battle" title="开始战斗">
                <Icon name="sword" size="16" variant="primary" />
              </button>
              <button @click.stop="selectBattlefield(bf)" class="btn-edit" title="编辑">
                <Icon name="edit" size="16" variant="secondary" />
              </button>
              <button @click.stop="deleteBattlefield(bf.id)" class="btn-delete" title="删除">
                <Icon name="close" size="16" variant="error" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧地图区域 -->
    <div class="map-area">
      <div v-if="!currentBattlefield" class="no-battlefield">
        <p>选择或新建一个战场开始编辑</p>
      </div>
      <div v-else class="canvas-wrapper" ref="canvasWrapper">
        <div class="canvas-container" ref="canvasContainer"></div>
      </div>
      <div v-if="currentBattlefield" class="status-bar">
        <div class="zoom-controls">
          <button @click="zoomIn" class="btn-zoom" title="放大">🔍+</button>
          <span class="zoom-label">{{ Math.round(scale * 100) }}%</span>
          <button @click="zoomOut" class="btn-zoom" title="缩小">🔍−</button>
          <button @click="zoomReset" class="btn-zoom" title="重置缩放">1:1</button>
        </div>
        <span v-if="hoveredHex">悬停: {{ formatCoord(hoveredHex.q, hoveredHex.r) }}</span>
        <span>地图: {{ currentBattlefield.width }}×{{ currentBattlefield.height }}</span>
      </div>
    </div>

    <!-- 新建战场弹窗 -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal">
        <h3>新建战场</h3>
        <div class="form-row">
          <label>战场名称</label>
          <input v-model="newBattlefield.name" placeholder="输入战场名称" />
        </div>
        <div class="form-row">
          <label>地图尺寸</label>
          <select v-model="newBattlefield.preset">
            <option value="">自定义</option>
            <option value="small">小型 (15×10)</option>
            <option value="medium">中型 (20×15)</option>
            <option value="large">大型 (30×20)</option>
            <option value="huge">超大 (50×50)</option>
          </select>
        </div>
        <div v-if="!newBattlefield.preset" class="form-row-group">
          <div class="form-row half">
            <label>宽度</label>
            <input type="number" v-model.number="newBattlefield.width" min="5" max="100" />
          </div>
          <div class="form-row half">
            <label>高度</label>
            <input type="number" v-model.number="newBattlefield.height" min="5" max="100" />
          </div>
        </div>
        <div class="modal-actions">
          <button @click="showCreateModal = false" class="btn-secondary">取消</button>
          <button @click="createBattlefield" class="btn-primary">创建</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import CRTScanlines from '../components/ui/CRTScanlines.vue';
import Button from '../components/ui/Button.vue';
import Icon from '../components/ui/Icon.vue';

const router = useRouter();

// 状态
const battlefields = ref([]);
const currentBattlefield = ref(null);
const showCreateModal = ref(false);
const showCustomTerrain = ref(false);
const selectedTerrain = ref('moon');
const hoveredHex = ref(null);

// 新建战场表单
const newBattlefield = ref({
  name: '',
  width: 20,
  height: 15,
  preset: 'medium'
});

// 自定义地形表单
const customTerrain = ref({
  name: '',
  color: '#888888',
  moveCost: 1,
  hp: 0,
  effect: ''
});

const customTerrains = ref([]);

// DOM refs
const canvasContainer = ref(null);
const canvasWrapper = ref(null);

// 内置地形（可动态删除）
// 注意：mothership 和 base 是出生点地形，进入战斗时会自动提取为 spawn_points
const builtInTerrains = ref([
  { id: 'moon', name: '月面', color: '#888888', moveCost: 1, hp: 0, effect: '' },
  { id: 'space', name: '宇宙', color: '#1a1a2e', moveCost: 1, hp: 0, effect: '' },
  { id: 'fortress', name: '防御圈', color: '#9c27b0', moveCost: 5, hp: 20, effect: 'destructible' },
  { id: 'base', name: '基地', color: '#4caf50', moveCost: 1, hp: 40, effect: 'heal', isSpawnPoint: true },
  { id: 'mothership', name: '母舰', color: '#2196f3', moveCost: 1, hp: 40, effect: 'heal', isSpawnPoint: true },
  { id: 'forest', name: '森林', color: '#2e7d32', moveCost: 2, hp: 5, effect: 'beam+1' },
  { id: 'water', name: '水面', color: '#03a9f4', moveCost: 2, hp: 5, effect: 'physical+1' }
]);

const allTerrains = computed(() => [...builtInTerrains.value, ...customTerrains.value.map((t, i) => ({ ...t, id: 'custom_' + i }))]);

// ============= 六角格核心配置 =============
// 六角格尺寸（使用像素单位的格子间距）
const HEX_WIDTH = 64;    // 格子宽度
const HEX_HEIGHT = 72;   // 格子高度
const HEX_APOTHEM = HEX_WIDTH / 2;  // 边心距
const HEX_RADIUS = HEX_HEIGHT / 2;  // 外接圆半径

// 内置六边形图片
let hexImage = null;

// 画布状态
let canvas = null;
let ctx = null;
let scale = 1;
let offsetX = 60;
let offsetY = 60;

// ============= 坐标转换工具 =============

// 数字列号转字母（0→A, 1→B, ..., 25→Z, 26→AA, ...）
function colToLetter(q) {
  let result = '';
  let n = q;
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

// 字母转数字列号（A→0, B→1, ..., Z→25, AA→26, ...）
function letterToCol(str) {
  let result = 0;
  for (let i = 0; i < str.length; i++) {
    result = result * 26 + (str.charCodeAt(i) - 64);
  }
  return result - 1;
}

// 格式化坐标标签：A1, B2, ...
function formatCoord(q, r) {
  return `${colToLetter(q)}${r + 1}`;
}

// 解析坐标字符串（如 "A1"）为 {q, r}
function parseCoord(coordStr) {
  const match = coordStr.trim().match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return null;
  return { q: letterToCol(match[1].toUpperCase()), r: parseInt(match[2]) - 1 };
}

// 解析坐标范围（如 "A1:C5"）为左上角和右下角
function parseCoordRange(rangeStr) {
  const parts = rangeStr.split(':').map(s => s.trim());
  if (parts.length !== 2) return null;
  const start = parseCoord(parts[0]);
  const end = parseCoord(parts[1]);
  if (!start || !end) return null;
  return {
    minQ: Math.min(start.q, end.q),
    maxQ: Math.max(start.q, end.q),
    minR: Math.min(start.r, end.r),
    maxR: Math.max(start.r, end.r)
  };
}

// ============= 六角格数学 =============

// 坐标转像素（蜂巢偏移坐标 - 奇数行向右偏移）
function hexToPixel(q, r) {
  const x = q * HEX_WIDTH * spacingH.value + (r % 2 === 1 ? HEX_WIDTH * offsetFactor.value : 0);
  const y = r * HEX_HEIGHT * spacingV.value;
  return { x, y };
}

// 像素转坐标（逆向转换）
function pixelToHex(px, py) {
  const bfWidth = currentBattlefield.value?.width || 20;
  const bfHeight = currentBattlefield.value?.height || 15;
  
  let bestQ = 0, bestR = 0, bestDist = Infinity;
  
  // 遍历所有格子找最近的
  for (let q = -1; q <= bfWidth; q++) {
    for (let r = -1; r <= bfHeight; r++) {
      const { x, y } = hexToPixel(q, r);
      // 六边形中心点
      const cx = x + HEX_APOTHEM;
      const cy = y + HEX_RADIUS;
      // 计算距离
      const dist = Math.sqrt((cx - px) ** 2 + (cy - py) ** 2);
      if (dist < bestDist) {
        bestDist = dist;
        bestQ = q;
        bestR = r;
      }
    }
  }
  return { q: bestQ, r: bestR };
}

// 绘制六边形路径
function drawHexPath(cx, cy) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const hx = cx + HEX_RADIUS * Math.cos(angle);
    const hy = cy + HEX_RADIUS * Math.sin(angle);
    if (i === 0) ctx.moveTo(hx, hy);
    else ctx.lineTo(hx, hy);
  }
  ctx.closePath();
}

// 获取地形信息
function getTerrainById(id) {
  if (!id) return builtInTerrains.value[0];
  if (id.startsWith('custom_')) {
    const idx = parseInt(id.split('_')[1]);
    return customTerrains.value[idx] || builtInTerrains.value[0];
  }
  return allTerrains.value.find(t => t.id === id) || builtInTerrains.value[0];
}

// ============= 画布绘制 =============

function draw(highlightQ = null, highlightR = null) {
  if (!ctx || !currentBattlefield.value) return;
  
  const bfWidth = currentBattlefield.value.width;
  const bfHeight = currentBattlefield.value.height;
  
  // 清空画布
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // 保存状态
  ctx.save();
  
  // 应用缩放和平移
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  
  // 绘制所有格子
  for (let r = 0; r < bfHeight; r++) {
    for (let q = 0; q < bfWidth; q++) {
      const { x, y } = hexToPixel(q, r);
      const cx = x + HEX_APOTHEM;
      const cy = y + HEX_RADIUS;
      const key = `${q},${r}`;
      const terrainId = terrainData.value[key] || 'moon';
      const terrain = getTerrainById(terrainId);
      
      // 1. 绘制格子图片作为背景
      if (hexImage && hexImage.complete) {
        ctx.drawImage(hexImage, x, y, HEX_WIDTH, HEX_HEIGHT);
      }
      
      // 2. 绘制地形颜色遮罩（无边框）
      ctx.save();
      ctx.globalAlpha = maskOpacity.value;
      ctx.fillStyle = terrain.color;
      drawHexPath(cx, cy);
      ctx.fill();
      ctx.restore();
      
      // 3. 绘制坐标标签（字母列+数字行）
      const coordLabel = formatCoord(q, r);
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(coordLabel, cx, cy + 8);
      ctx.restore();
      
      // 4. 绘制血量
      if (terrain.hp > 0) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText(terrain.hp, cx, cy - 4);
        ctx.fillText(terrain.hp, cx, cy - 4);
      }
      
      // 5. 高亮选中格子
      if (highlightQ === q && highlightR === r) {
        ctx.strokeStyle = '#ff9800';
        ctx.lineWidth = 4;
        drawHexPath(cx, cy);
        ctx.stroke();
      }
    }
  }
  
  ctx.restore();
}

// ============= 画布初始化 =============

function initCanvas() {
  if (!canvasContainer.value || !currentBattlefield.value) {
    console.log('initCanvas skipped: container or battlefield missing');
    return;
  }
  
  const { width: bfWidth, height: bfHeight } = currentBattlefield.value;
  
  console.log('Initializing canvas:', bfWidth, 'x', bfHeight);
  
  // 清除旧画布
  canvasContainer.value.innerHTML = '';
  
  // 创建画布（根据蜂巢排列计算尺寸）
  canvas = document.createElement('canvas');
  // 蜂巢排列画布尺寸计算
  // 宽度：最后一列的x + 格子宽度 + 边距
  const lastCol = hexToPixel(bfWidth - 1, 0);
  canvas.width = lastCol.x + HEX_WIDTH + 100;
  // 高度：最后一行的y + 格子高度 + 边距（考虑奇数列偏移）
  const lastRow = hexToPixel(0, bfHeight - 1);
  canvas.height = lastRow.y + HEX_HEIGHT + 100;
  
  // 设置样式确保显示（不使用max-width避免CSS缩放导致坐标偏差）
  canvas.style.display = 'block';
  canvas.style.cursor = 'grab';
  
  console.log('Canvas size:', canvas.width, 'x', canvas.height);
  
  canvasContainer.value.appendChild(canvas);
  ctx = canvas.getContext('2d');
  
  // 初始绘制（无图片）
  scale = 1;
  offsetX = 60;
  offsetY = 60;
  draw();
  
  // 加载格子图片
  hexImage = new Image();
  hexImage.onload = () => {
    console.log('Hex image loaded');
    draw();
  };
  hexImage.onerror = () => {
    console.warn('无法加载 helix.png，将使用纯色绘制');
    hexImage = null;
  };
  hexImage.src = '/helix.png';
  
  setupCanvasEvents();
}

// 地形数据
const terrainData = ref({});

// 格子间距参数（可调）
const spacingH = ref(1.04);   // 水平间距
const spacingV = ref(0.79);   // 垂直间距
const offsetFactor = ref(0.52);  // 行偏移量
const maskOpacity = ref(0.30);   // 遮罩透明度

// 坐标跳转（字母+数字格式）
const targetCoord = ref('');

// 批量地形编辑
const batchRange = ref('');
const batchTerrainId = ref('moon');
const batchResult = ref(null);

// 调整间距
function adjustSpacing(type, delta) {
  if (type === 'h') spacingH.value = Math.max(0.5, Math.min(1.5, spacingH.value + delta / 100));
  if (type === 'v') spacingV.value = Math.max(0.5, Math.min(1.5, spacingV.value + delta / 100));
  if (type === 'o') offsetFactor.value = Math.max(0, Math.min(1, offsetFactor.value + delta / 100));
  draw();
}

function adjustOpacity(delta) {
  maskOpacity.value = Math.max(0.05, Math.min(1.0, maskOpacity.value + delta / 100));
  draw();
}

// 缩放控制
function zoomIn() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const canvasCenterX = centerX * scaleX;
  const canvasCenterY = centerY * scaleY;
  const newScale = Math.min(3, scale * 1.2);
  offsetX = canvasCenterX - (canvasCenterX - offsetX) * (newScale / scale);
  offsetY = canvasCenterY - (canvasCenterY - offsetY) * (newScale / scale);
  scale = newScale;
  draw();
}

function zoomOut() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const canvasCenterX = centerX * scaleX;
  const canvasCenterY = centerY * scaleY;
  const newScale = Math.max(0.3, scale / 1.2);
  offsetX = canvasCenterX - (canvasCenterX - offsetX) * (newScale / scale);
  offsetY = canvasCenterY - (canvasCenterY - offsetY) * (newScale / scale);
  scale = newScale;
  draw();
}

function zoomReset() {
  scale = 1;
  offsetX = 60;
  offsetY = 60;
  draw();
}

function resetSpacing() {
  spacingH.value = 1.04;
  spacingV.value = 0.79;
  offsetFactor.value = 0.52;
  maskOpacity.value = 0.30;
  draw();
}

// 跳转到指定坐标（字母+数字格式）
function jumpToCoord() {
  const coord = parseCoord(targetCoord.value);
  if (!coord) {
    alert('坐标格式错误，请输入如 A1、B3 的格式');
    return;
  }
  const bf = currentBattlefield.value;
  if (!bf) return;
  if (coord.q < 0 || coord.q >= bf.width || coord.r < 0 || coord.r >= bf.height) {
    alert('坐标超出地图范围');
    return;
  }
  // 计算目标格子的像素位置，让画布居中显示
  const { x, y } = hexToPixel(coord.q, coord.r);
  const cx = x + HEX_APOTHEM;
  const cy = y + HEX_RADIUS;
  // 将画布偏移调整到让目标格子居中
  const container = canvasContainer.value;
  if (container) {
    offsetX = container.clientWidth / 2 - cx * scale;
    offsetY = container.clientHeight / 2 - cy * scale;
    draw(coord.q, coord.r);
  }
}

// 批量设置地形
function applyBatchTerrain() {
  batchResult.value = null;
  
  if (!batchRange.value.trim()) {
    batchResult.value = { success: false, message: '请输入坐标范围' };
    return;
  }
  
  const range = parseCoordRange(batchRange.value);
  if (!range) {
    batchResult.value = { success: false, message: '坐标格式错误，请输入如 A1:C5 的格式' };
    return;
  }
  
  const bf = currentBattlefield.value;
  if (!bf) return;
  
  // 检查范围是否有效
  if (range.minQ < 0 || range.maxQ >= bf.width || range.minR < 0 || range.maxR >= bf.height) {
    batchResult.value = { success: false, message: '坐标范围超出地图边界' };
    return;
  }
  
  let count = 0;
  for (let r = range.minR; r <= range.maxR; r++) {
    for (let q = range.minQ; q <= range.maxQ; q++) {
      terrainData.value[`${q},${r}`] = batchTerrainId.value;
      count++;
    }
  }
  
  batchResult.value = { success: true, message: `已设置 ${count} 个格子` };
  draw();
}

// 鼠标事件
function setupCanvasEvents() {
  if (!canvas) return;
  
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartOffsetX = 0;
  let dragStartOffsetY = 0;
  
  // 获取鼠标相对于canvas的精确坐标（考虑CSS缩放）
  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    // CSS显示尺寸 vs canvas实际像素的比率
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    // 鼠标在canvas像素坐标系中的位置
    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;
    // 转换为世界坐标（除以内部scale和offset）
    const worldX = (canvasX - offsetX) / scale;
    const worldY = (canvasY - offsetY) / scale;
    return { worldX, worldY };
  }

  // 点击选择地形
  canvas.addEventListener('click', (e) => {
    if (isDragging) return;
    const { worldX, worldY } = getCanvasCoords(e);
    const { q, r } = pixelToHex(worldX, worldY);
    
    console.log('Click at world:', worldX, worldY, '-> hex:', q, r);
    
    if (q >= 0 && q < currentBattlefield.value.width && 
        r >= 0 && r < currentBattlefield.value.height) {
      terrainData.value[`${q},${r}`] = selectedTerrain.value;
      console.log('Set terrain:', `${q},${r}`, '=', selectedTerrain.value, '| total keys:', Object.keys(terrainData.value).length);
      draw(q, r);
    }
  });
  
  // 悬停显示
  canvas.addEventListener('mousemove', (e) => {
    const { worldX, worldY } = getCanvasCoords(e);
    const { q, r } = pixelToHex(worldX, worldY);
    
    if (q >= 0 && q < currentBattlefield.value.width && 
        r >= 0 && r < currentBattlefield.value.height) {
      hoveredHex.value = { q, r };
      draw(q, r);
    } else {
      hoveredHex.value = null;
      draw();
    }
    
    // 拖拽（使用canvas像素坐标）
    if (isDragging) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      offsetX = dragStartOffsetX + (e.clientX - dragStartX) * scaleX;
      offsetY = dragStartOffsetY + (e.clientY - dragStartY) * scaleY;
      draw();
    }
  });
  
  // 拖拽开始
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      isDragging = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartOffsetX = offsetX;
      dragStartOffsetY = offsetY;
      canvas.style.cursor = 'grabbing';
    }
  });
  
  canvas.addEventListener('mousemove', (e) => {
    if (e.buttons === 1) {
      const dx = Math.abs(e.clientX - dragStartX);
      const dy = Math.abs(e.clientY - dragStartY);
      if (dx > 5 || dy > 5) {
        isDragging = true;
      }
      if (isDragging) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        offsetX = dragStartOffsetX + (e.clientX - dragStartX) * scaleX;
        offsetY = dragStartOffsetY + (e.clientY - dragStartY) * scaleY;
        draw();
      }
    }
  });
  
  canvas.addEventListener('mouseup', () => {
    canvas.style.cursor = 'grab';
    setTimeout(() => { isDragging = false; }, 10);
  });
  
  canvas.addEventListener('mouseleave', () => {
    hoveredHex.value = null;
    isDragging = false;
    draw();
  });
  
  // 滚轮缩放
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.3, Math.min(3, scale * delta));
    
    // 以鼠标位置为中心缩放（使用canvas像素坐标）
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    
    offsetX = mouseX - (mouseX - offsetX) * (newScale / scale);
    offsetY = mouseY - (mouseY - offsetY) * (newScale / scale);
    
    scale = newScale;
    draw();
  });
}

// ============= API 操作 =============

async function loadBattlefields() {
  try {
    const res = await fetch('/api/map/battlefields');
    const data = await res.json();
    // API 返回 {battlefields: []}，需要提取数组
    battlefields.value = data.battlefields || data || [];
  } catch (err) {
    console.error('加载战场列表失败:', err);
    battlefields.value = [];
  }
}

async function createBattlefield() {
  let width = 20, height = 15;
  if (newBattlefield.value.preset) {
    const presets = {
      small: [15, 10],
      medium: [20, 15],
      large: [30, 20],
      huge: [50, 50]
    };
    [width, height] = presets[newBattlefield.value.preset] || [20, 15];
  } else {
    width = newBattlefield.value.width;
    height = newBattlefield.value.height;
  }
  
  try {
    const res = await fetch('/api/map/battlefields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newBattlefield.value.name || `战场 ${Date.now()}`,
        width,
        height,
        terrain: {}
      })
    });
    
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || '创建失败');
    }
    
    const data = await res.json();
    const bf = data.battlefield || data;
    battlefields.value.unshift(bf);
    showCreateModal.value = false;
    newBattlefield.value = { name: '', width: 20, height: 15, preset: 'medium' };
    
    // 自动选择新建的战场
    await nextTick();
    selectBattlefield(bf);
  } catch (err) {
    console.error('创建战场失败:', err);
    alert('创建战场失败: ' + err.message);
  }
}

async function selectBattlefield(bf) {
  // 如果有当前战场，先保存
  if (currentBattlefield.value) {
    await saveBattlefield();
  }
  
  // 加载战场数据
  try {
    const res = await fetch(`/api/map/battlefields/${bf.id}`);
    const data = await res.json();
    
    // 兼容 API 返回格式
    const battlefield = data.battlefield || data;
    currentBattlefield.value = battlefield;
    terrainData.value = {};
    
    // 解析 terrainData (API返回的可能是 terrain 或 terrainData)
    const terrainStr = battlefield.terrain || battlefield.terrainData;
    if (terrainStr) {
      if (typeof terrainStr === 'string') {
        try {
          const parsed = JSON.parse(terrainStr);
          // 确保是对象格式
          terrainData.value = Array.isArray(parsed) ? {} : parsed;
        } catch {
          terrainData.value = {};
        }
      } else if (Array.isArray(terrainStr)) {
        // 数据库返回的数组转为对象
        terrainData.value = {};
      } else {
        terrainData.value = terrainStr;
      }
    } else {
      terrainData.value = {};
    }
    
    console.log('Loaded battlefield:', battlefield.width, 'x', battlefield.height);
    
    await nextTick();
    initCanvas();
  } catch (err) {
    console.error('加载战场失败:', err);
  }
}

// 保存状态提示
const saveStatus = ref(''); // '' | 'saving' | 'success' | 'error'
const saveMessage = ref('');

async function saveBattlefield() {
  if (!currentBattlefield.value) return;
  
  const terrainToSave = JSON.parse(JSON.stringify(terrainData.value));
  
  saveStatus.value = 'saving';
  saveMessage.value = '';
  
  try {
    const payload = {
      name: currentBattlefield.value.name,
      terrain: terrainToSave
    };
    console.log('Saving terrain keys:', Object.keys(terrainToSave));
    
    const res = await fetch(`/api/map/battlefields/${currentBattlefield.value.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    
    if (result.error) {
      saveStatus.value = 'error';
      saveMessage.value = '保存失败: ' + result.error;
    } else {
      const updated = result.battlefield || result;
      currentBattlefield.value = updated;
      const idx = battlefields.value.findIndex(b => b.id === updated.id);
      if (idx !== -1) battlefields.value[idx] = updated;
      saveStatus.value = 'success';
      saveMessage.value = `保存成功！共 ${Object.keys(terrainToSave).length} 个地形`;
    }
  } catch (err) {
    console.error('保存失败:', err);
    saveStatus.value = 'error';
    saveMessage.value = '保存失败: ' + err.message;
  }
  
  // 3秒后自动清除提示
  setTimeout(() => {
    if (saveStatus.value !== 'saving') {
      saveStatus.value = '';
      saveMessage.value = '';
    }
  }, 3000);
}

async function exitBattlefield() {
  // 先保存当前编辑
  if (currentBattlefield.value) {
    await saveBattlefield();
  }
  // 清空状态
  currentBattlefield.value = null;
  canvas = null;
  ctx = null;
  terrainData.value = {};
  saveStatus.value = '';
  saveMessage.value = '';
  // 返回列表时重新加载，确保数据最新
  loadBattlefields();
}

async function deleteBattlefield(id) {
  if (!confirm('确定删除这个战场？')) return;
  
  try {
    await fetch(`/api/map/battlefields/${id}`, { method: 'DELETE' });
    battlefields.value = battlefields.value.filter(b => b.id !== id);
  } catch (err) {
    console.error('删除失败:', err);
  }
}

async function startBattle(bf) {
  if (!confirm(`使用「${bf.name}」开始战斗？`)) return;
  
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/combat/battles', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ battlefield_id: bf.id })
    });
    
    const data = await res.json();
    
    if (res.ok && data.battle) {
      // 跳转到战斗页面
      window.location.href = `/battle/${data.battle.id}`;
    } else {
      alert(data.error || '创建战斗失败');
    }
  } catch (err) {
    console.error('开始战斗失败:', err);
    alert('开始战斗失败，请检查是否已登录');
  }
}

// ============= 自定义地形 =============

function addCustomTerrain() {
  if (!customTerrain.value.name) {
    alert('请输入地形名称');
    return;
  }
  
  customTerrains.value.push({ ...customTerrain.value });
  customTerrain.value = { name: '', color: '#888888', moveCost: 1, hp: 0, effect: '' };
  selectedTerrain.value = 'custom_' + (customTerrains.value.length - 1);
}

function removeCustomTerrain(idx) {
  const terrainId = 'custom_' + idx;
  customTerrains.value.splice(idx, 1);
  if (selectedTerrain.value === terrainId) {
    selectedTerrain.value = 'moon';
  }
}

// 删除地形（内置或自定义）
function deleteTerrain(terrainId) {
  const terrain = allTerrains.value.find(t => t.id === terrainId);
  if (!terrain) return;
  if (!confirm(`确定删除地形「${terrain.name}」吗？\n已使用该地形的格子将变为月面。`)) return;

  // 如果当前选中就是它，切换到月面
  if (selectedTerrain.value === terrainId) {
    selectedTerrain.value = 'moon';
  }

  // 检查是否为自定义地形
  if (terrainId.startsWith('custom_')) {
    const idx = parseInt(terrainId.split('_')[1]);
    customTerrains.value.splice(idx, 1);
  } else {
    const idx = builtInTerrains.value.findIndex(t => t.id === terrainId);
    if (idx !== -1) builtInTerrains.value.splice(idx, 1);
  }

  // 扫描当前地图，将该地形替换为月面
  let replaced = 0;
    for (const key of Object.keys(terrainData.value)) {
      if (terrainData.value[key] === terrainId) {
        terrainData.value[key] = 'moon';
        replaced++;
      }
    }
    if (replaced > 0) {
      draw();
      alert(`已删除「${terrain.name}」，${replaced}个格子已替换为月面`);
  } else {
    alert(`已删除地形「${terrain.name}」`);
  }
}

// 初始化
onMounted(() => {
  loadBattlefields();
});

// 返回首页
function goHome() {
  router.push('/home');
}
</script>


<style scoped>
/* 战场编辑器 - CRT风格UI */
.battlefield-editor {
  display: flex;
  height: calc(100vh - 60px);
  background: var(--surface-base);
  color: var(--text-primary);
  position: relative;
}

/* 侧边栏 */
.sidebar {
  width: 280px;
  background: linear-gradient(180deg, var(--primary-panel) 0%, #1a2028 100%);
  padding: var(--space-4);
  overflow-y: auto;
  flex-shrink: 0;
  border-right: 1px solid var(--border-weak);
  box-shadow: var(--shadow-md);
}

.sidebar-section {
  margin-bottom: var(--space-5);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--border-weak);
}

.sidebar-section:last-child {
  border-bottom: none;
}

.sidebar-section h3 {
  margin: 0 0 var(--space-3);
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  letter-spacing: var(--tracking-normal);
  text-transform: uppercase;
}

.sidebar-section h3.collapsible {
  cursor: pointer;
  user-select: none;
  transition: color var(--transition-normal);
}

.sidebar-section h3.collapsible:hover {
  color: var(--accent-blue);
}

/* 当前战场信息 */
.current-battlefield {
  background: var(--data-inlay);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-weak);
}

.battlefield-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3);
}

.battlefield-info strong {
  color: var(--text-primary);
  font-weight: var(--font-semibold);
  font-size: var(--text-sm);
}

.battlefield-info span {
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-family: var(--font-space);
}

.battlefield-actions {
  display: flex;
  gap: var(--space-2);
}

.save-status {
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  font-size: var(--text-sm);
  animation: fadeIn 0.2s ease;
}

.save-status.saving {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.save-status.success {
  background: rgba(76, 175, 80, 0.2);
  color: var(--success);
}

.save-status.error {
  background: rgba(244, 67, 54, 0.2);
  color: var(--error);
}

/* 地形列表 */
.terrain-list, .custom-terrain-list, .battlefield-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.terrain-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: rgba(22, 27, 34, 0.6);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-normal);
  border: 1px solid var(--border-subtle);
}

.terrain-item:hover {
  background: var(--data-inlay);
  border-color: var(--border-weak);
}

.terrain-item.active {
  background: rgba(79, 172, 254, 0.1);
  border-color: rgba(79, 172, 254, 0.3);
}

.terrain-color {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-medium);
  flex-shrink: 0;
}

.terrain-item span {
  flex: 1;
  color: var(--text-primary);
  font-size: var(--text-sm);
}

.terrain-cost {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  font-family: var(--font-space);
}

/* 间距控制 */
.spacing-controls {
  background: var(--data-inlay);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-weak);
}

.spacing-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.spacing-row:last-child {
  margin-bottom: 0;
}

.spacing-row label {
  width: 80px;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-tight);
}

.spacing-value {
  width: 50px;
  text-align: center;
  font-weight: var(--font-bold);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.btn-small {
  padding: 6px 10px;
  font-size: var(--text-xs);
  background: linear-gradient(180deg, var(--data-inlay) 0%, var(--primary-panel) 100%);
  color: var(--accent-blue);
  border: 1px solid var(--border-weak);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-normal);
  font-weight: var(--font-medium);
}

.btn-small:hover {
  background: var(--data-inlay);
  color: var(--accent-blue-hover);
  border-color: rgba(79, 172, 254, 0.3);
}

.btn-full {
  width: 100%;
  margin-top: var(--space-3);
}

/* 坐标输入 */
.coord-input {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.coord-input input {
  width: 70px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-weak);
  border-radius: var(--radius-md);
  background: rgba(10, 14, 20, 0.6);
  color: var(--text-primary);
  font-size: var(--text-sm);
  text-align: center;
  font-family: var(--font-space);
  transition: all var(--transition-normal);
}

.coord-input input:focus {
  outline: none;
  border-color: var(--accent-blue);
  background: rgba(10, 14, 20, 0.8);
}

/* 批量地形编辑 */
.batch-terrain {
  background: var(--data-inlay);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-weak);
}

.batch-result {
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  text-align: center;
}

.batch-result.success {
  background: rgba(0, 242, 96, 0.15);
  color: var(--accent-green);
  border: 1px solid rgba(0, 242, 96, 0.3);
}

.batch-result.error {
  background: rgba(255, 82, 82, 0.15);
  color: var(--accent-red);
  border: 1px solid rgba(255, 82, 82, 0.3);
}

/* 自定义地形表单 */
.custom-terrain-form {
  background: var(--data-inlay);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  margin-top: var(--space-3);
  border: 1px solid var(--border-weak);
}

.form-row {
  margin-bottom: var(--space-3);
}

.form-row:last-child {
  margin-bottom: 0;
}

.form-row label {
  display: block;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin-bottom: var(--space-1);
  text-transform: uppercase;
  letter-spacing: var(--tracking-tight);
}

.form-row input, .form-row select {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-weak);
  border-radius: var(--radius-md);
  background: rgba(10, 14, 20, 0.6);
  color: var(--text-primary);
  font-size: var(--text-sm);
  transition: all var(--transition-normal);
}

.form-row input:focus, .form-row select:focus {
  outline: none;
  border-color: var(--accent-blue);
  background: rgba(10, 14, 20, 0.8);
}

.form-row-group {
  display: flex;
  gap: var(--space-3);
}

.form-row.half {
  flex: 1;
}

.color-picker {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.color-picker input[type="color"] {
  width: 50px;
  height: 36px;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  padding: 0;
  background: transparent;
}

.color-preview {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-medium);
}

/* 战场列表 */
.battlefield-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--data-inlay);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  transition: all var(--transition-normal);
}

.battlefield-item:hover {
  background: var(--primary-panel);
  border-color: var(--border-weak);
}

.battlefield-item-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
}

.battlefield-item-info strong {
  color: var(--text-primary);
  font-weight: var(--font-medium);
  font-size: var(--text-sm);
}

.battlefield-item-info span {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  font-family: var(--font-space);
}

.battlefield-item-actions {
  display: flex;
  gap: var(--space-1);
}

.btn-battle {
  background: linear-gradient(180deg, rgba(0, 242, 96, 0.2) 0%, rgba(0, 242, 96, 0.1) 100%);
  color: var(--accent-green);
  border: 1px solid rgba(0, 242, 96, 0.3);
  border-radius: var(--radius-sm);
  padding: 6px 12px;
  cursor: pointer;
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  transition: all var(--transition-normal);
}

.btn-battle:hover {
  background: linear-gradient(180deg, rgba(0, 242, 96, 0.3) 0%, rgba(0, 242, 96, 0.2) 100%);
  color: var(--accent-green-hover);
  border-color: rgba(0, 242, 96, 0.5);
}

.btn-edit {
  background: linear-gradient(180deg, rgba(79, 172, 254, 0.2) 0%, rgba(79, 172, 254, 0.1) 100%);
  color: var(--accent-blue);
  border: 1px solid rgba(79, 172, 254, 0.3);
  border-radius: var(--radius-sm);
  padding: 6px 12px;
  cursor: pointer;
  font-size: var(--text-sm);
  transition: all var(--transition-normal);
}

.btn-edit:hover {
  background: linear-gradient(180deg, rgba(79, 172, 254, 0.3) 0%, rgba(79, 172, 254, 0.2) 100%);
  color: var(--accent-blue-hover);
  border-color: rgba(79, 172, 254, 0.5);
}

.btn-delete {
  background: transparent;
  color: var(--accent-red);
  border: none;
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  cursor: pointer;
  font-size: var(--text-lg);
  font-weight: var(--font-bold);
  transition: all var(--transition-normal);
}

.btn-delete:hover {
  background: rgba(255, 82, 82, 0.1);
  color: var(--accent-red-hover);
}

.empty-hint {
  color: var(--text-muted);
  font-size: var(--text-sm);
  text-align: center;
  padding: var(--space-6);
  font-family: var(--font-space);
}

/* 地图区域 */
.map-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #05070a;
}

.no-battlefield {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: var(--text-base);
  font-family: var(--font-space);
}

.canvas-wrapper {
  flex: 1;
  overflow: hidden;
  background: #080c10;
  position: relative;
  border-left: 1px solid var(--border-weak);
}

.canvas-container {
  width: 100%;
  height: 100%;
  min-width: 100%;
  min-height: 100%;
  overflow: auto;
  position: relative;
}

.canvas-container canvas {
  image-rendering: pixelated;
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}

/* 状态栏 */
.status-bar {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  padding: var(--space-3) var(--space-4);
  background: linear-gradient(180deg, var(--primary-panel) 0%, #1a2028 100%);
  border-top: 1px solid var(--border-weak);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  font-family: var(--font-space);
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.zoom-label {
  min-width: 50px;
  text-align: center;
  color: var(--text-primary);
  font-weight: var(--font-bold);
}

.btn-zoom {
  padding: 4px 10px;
  font-size: var(--text-xs);
  background: var(--data-inlay);
  color: var(--accent-blue);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-normal);
  font-weight: var(--font-semibold);
}

.btn-zoom:hover {
  background: rgba(79, 172, 254, 0.15);
  border-color: rgba(79, 172, 254, 0.3);
}

/* 通用按钮 */
.btn-primary {
  background: linear-gradient(180deg, var(--data-inlay) 0%, var(--primary-panel) 100%);
  color: var(--accent-blue);
  border: 1px solid var(--border-medium);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  text-transform: uppercase;
  letter-spacing: var(--tracking-tight);
  transition: all var(--transition-normal);
}

.btn-primary:hover {
  background: var(--data-inlay);
  color: var(--accent-blue-hover);
  border-color: rgba(79, 172, 254, 0.3);
}

.btn-secondary {
  background: rgba(22, 27, 34, 0.9);
  color: var(--text-secondary);
  border: 1px solid var(--border-medium);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--text-sm);
  transition: all var(--transition-normal);
}

.btn-secondary:hover {
  background: var(--data-inlay);
  color: var(--text-primary);
}

/* 弹窗 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
}

.modal {
  background: linear-gradient(180deg, var(--primary-panel) 0%, #1a2028 100%);
  padding: var(--space-6);
  border-radius: var(--radius-lg);
  width: 380px;
  color: var(--text-primary);
  border: 1px solid var(--border-weak);
  box-shadow: var(--shadow-xl);
}

.modal h3 {
  margin: 0 0 var(--space-5);
  color: var(--text-primary);
  font-size: var(--text-lg);
  font-weight: var(--font-bold);
  letter-spacing: var(--tracking-normal);
}

.modal-actions {
  display: flex;
  gap: var(--space-3);
  justify-content: flex-end;
  margin-top: var(--space-5);
}
</style>
