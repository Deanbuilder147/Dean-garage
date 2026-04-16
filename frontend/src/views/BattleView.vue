<template>
  <div class="battle-container">
    <header class="battle-header">
      <div class="turn-info">
        <span class="turn-number">第 {{ battleState?.turn_number || 1 }} 回合</span>
        <span class="faction-name">{{ getFactionName(battleState?.current_faction) }}</span>
      </div>
      <div class="phase-info">
        {{ getPhaseName(battleState?.phase) }}
      </div>
      <UIButton variant="secondary" @click="$router.back()">退出战斗</UIButton>
    </header>

    <div class="battle-content">
      <main ref="canvasContainer" class="battle-canvas"></main>

      <aside class="battle-sidebar">
        <!-- 出生点选择阶段 -->
        <div v-if="battleState?.phase === 'spawn_selection'" class="phase-panel">
          <div class="phase-title">
            <Icon name="home" size="20" variant="primary" />
            <h3>出生点选择</h3>
          </div>
          <div class="spawn-selection-info">
            <p class="current-player">当前选择: <strong>{{ currentSpawnPlayerName }}</strong></p>
            <p class="hint">点击地图上的母舰或基地作为出生点</p>
          </div>
          <div class="spawn-order">
            <h4>选择顺序</h4>
            <div v-for="(player, idx) in battleState?.spawnOrder" :key="idx"
                 :class="['spawn-order-item', { 'current': idx === battleState?.currentSpawnIndex, 'done': player.hasSelected }]">
              <span class="order-num">{{ idx + 1 }}</span>
              <span class="faction-badge" :class="player.faction">{{ getFactionName(player.faction) }}</span>
              <span class="status">{{ player.hasSelected ? '✓ 已选' : (idx === battleState?.currentSpawnIndex ? '选择中...' : '等待') }}</span>
            </div>
          </div>
        </div>

        <!-- 出生点部署阶段 -->
        <div v-if="battleState?.phase === 'spawn_deployment'" class="phase-panel">
          <div class="phase-title">
            <Icon name="rocket" size="20" variant="primary" />
            <h3>单位部署</h3>
          </div>
          <p class="hint">将单位拖拽到出生点进行部署</p>

          <div class="deployment-panel">
            <h4>我的出生点</h4>
            <div v-if="mySpawnPoint" class="spawn-point-display" :style="getSpawnPointStyle(mySpawnPoint)">
              <div class="spawn-point-label">{{ mySpawnPoint.type === 'mothership' ? '母舰' : '基地' }}</div>
              <div class="spawn-point-pos">{{ formatPosition(mySpawnPoint) }}</div>
            </div>

            <h4>待部署单位</h4>
            <div class="undeployed-units">
              <div v-for="unit in undeployedUnits" :key="unit.id"
                   class="unit-card-draggable"
                   draggable="true"
                   @dragstart="handleDragStart($event, unit)">
                <img :src="unit.image || '/default-unit.png'" class="unit-thumb" />
                <span class="unit-name">{{ unit.name }}</span>
              </div>
            </div>

            <UIButton variant="primary" @click="endDeploymentPhase" :disabled="!canEndDeployment" class="deploy-btn">
              完成部署
            </UIButton>
          </div>
        </div>

        <!-- 战术阶段 -->
        <div v-if="battleState?.phase === 'tactical'" class="phase-panel">
          <div class="phase-title">
            <Icon name="attack" size="20" variant="primary" />
            <h3>战术阶段</h3>
          </div>
          <p class="hint">部署Royroy，准备战斗</p>

          <div class="tactical-actions">
            <UIButton
              variant="primary"
              @click="startRoyroyDeploy"
              :disabled="!canDeployRoyroy"
              class="tactical-btn"
            >
              <Icon name="robot" size="16" variant="default" style="margin-right: 6px;" />
              部署 Royroy
            </UIButton>

            <div v-if="isDeployingRoyroy" class="royroy-deploy-hint">
              <p>点击主机体周围1格内的位置部署Royroy</p>
              <UIButton variant="secondary" @click="cancelRoyroyDeploy" size="small">取消</UIButton>
            </div>

            <UIButton variant="secondary" @click="endTacticalPhase">
              结束战术阶段
            </UIButton>
          </div>

          <div class="royroy-status">
            <h4>Royroy状态</h4>
            <div v-for="unit in myUnitsWithRoyroy" :key="unit.id" class="royroy-item">
              <span class="unit-name">{{ unit.name }}</span>
              <Tag :variant="unit.royroy_deployed ? 'green' : 'default'">
                {{ unit.royroy_deployed ? '已部署' : '待部署' }}
              </Tag>
            </div>
          </div>
        </div>

        <!-- 战斗日志 -->
        <div class="combat-log" v-if="!['spawn_selection', 'spawn_deployment', 'tactical'].includes(battleState?.phase)">
          <h3>战斗日志</h3>
          <div class="log-entries">
            <div v-for="(log, i) in battleState?.battle_log || []" :key="i" class="log-entry">
              <div v-if="log.type === 'fog_system'" class="log-entry-fog">
                <Icon name="earth" size="16" variant="primary" style="margin-right: 8px;" />
                <span class="log-fog-message">{{ getFogMessage(log) }}</span>
              </div>
              <div v-else>
                {{ log.type }}: {{ log.attacker }} → {{ log.target }}
              </div>
            </div>
          </div>
        </div>

        <!-- 移动/行动阶段 -->
        <div class="action-panel" v-if="!['spawn_selection', 'spawn_deployment', 'tactical'].includes(battleState?.phase)">
          <h3>操作</h3>

          <div v-if="battleState?.phase === 'deployment'">
            <p>回合开始 - 请部署Royroy</p>
            <UIButton variant="secondary" @click="skipDeployment">跳过部署</UIButton>
          </div>

          <div v-if="battleState?.phase === 'move'">
            <p>选择要移动的单位</p>
            <UIButton variant="primary" @click="endTurn">结束回合</UIButton>
          </div>

          <div v-if="battleState?.phase === 'action'">
            <p>战术行动阶段</p>
            <div class="action-buttons">
              <UIButton variant="primary" @click="selectAttack">攻击</UIButton>
              <UIButton 
                v-if="canUseArtillery" 
                variant="warning" 
                @click="showArtilleryModal = true"
              >
                <Icon name="star" size="16" variant="default" style="margin-right: 6px;" />
                火力覆盖
              </UIButton>
              <UIButton variant="secondary" @click="endTurn">结束回合</UIButton>
            </div>
          </div>
        </div>
      </aside>
    </div>

    <!-- 攻击选择弹窗 -->
    <div v-if="showAttackModal" class="modal-overlay">
      <Card class="modal-card">
        <h3>选择攻击目标</h3>

        <div class="target-list">
          <div
            v-for="target in enemyUnits"
            :key="target.id"
            class="target-option"
            @click="executeAttack(target)"
          >
            <div class="target-name">{{ target.name }}</div>
            <div class="target-hp">HP: {{ target.hp }}/{{ target.max_hp }}</div>
          </div>
        </div>

        <UIButton variant="secondary" @click="showAttackModal = false">取消</UIButton>
      </Card>
    </div>

    <!-- 奇袭弹窗 -->
    <div v-if="showSurpriseModal" class="modal-overlay">
      <Card class="modal-card surprise-modal">
        <div class="modal-title">
          <Icon name="star" size="24" variant="warning" />
          <h3>奇袭机会!</h3>
        </div>

        <div class="surprise-info">
          <p><strong>攻击者:</strong> {{ surpriseData?.attacker_name }}</p>
          <p><strong>目标:</strong> {{ surpriseData?.target_name }}</p>
        </div>

        <div v-if="surpriseCandidates.length > 0" class="surprise-candidates">
          <h4>可执行奇袭的单位:</h4>
          <div
            v-for="unit in surpriseCandidates"
            :key="unit.id"
            class="candidate-unit"
          >
            <span class="unit-name">{{ unit.name }}</span>
            <Tag variant="blue" size="small">距离: {{ unit.distance }}</Tag>
          </div>
        </div>

        <div class="surprise-options">
          <UIButton variant="primary" @click="chooseSurprise('replace')">
            <Icon name="sword" size="16" variant="default" style="margin-right: 6px;" />
            顶替攻击 (取消原攻击)
          </UIButton>
          <UIButton variant="primary" @click="chooseSurprise('counter')">
            <Icon name="shield" size="16" variant="default" style="margin-right: 6px;" />
            先制攻击 (原攻击继续)
          </UIButton>
          <UIButton variant="danger" @click="chooseSurprise('giveup')">
            <Icon name="close" size="16" variant="default" style="margin-right: 6px;" />
            放弃
          </UIButton>
        </div>

        <div class="surprise-timer">
          <Icon name="warning" size="16" /> 剩余时间: {{ surpriseTimer }}秒
        </div>
      </Card>
    </div>

    <!-- 火力覆盖弹窗 -->
    <div v-if="showArtilleryModal" class="modal-overlay">
      <Card class="modal-card artillery-modal">
        <div class="modal-title">
          <Icon name="earth" size="24" variant="warning" />
          <h3>火力覆盖</h3>
        </div>

        <div class="artillery-info">
          <p>选择火力覆盖的中心点（5×5范围，范围内所有单位-5HP）</p>
          <p class="warning-text">⚠️ 全局只能使用一次</p>
        </div>

        <div v-if="selectedUnit" class="artillery-center">
          <p><strong>中心点:</strong> 选中单位位置 ({{ selectedUnit.q }}, {{ selectedUnit.r }})</p>
          <Tag :variant="getFactionVariant(selectedUnit.faction)">
            {{ getFactionName(selectedUnit.faction) }}
          </Tag>
        </div>

        <div class="artillery-options">
          <UIButton 
            variant="warning" 
            @click="executeArtillery"
            :disabled="!selectedUnit"
          >
            <Icon name="star" size="16" variant="default" style="margin-right: 6px;" />
            确认发动
          </UIButton>
          <UIButton variant="secondary" @click="showArtilleryModal = false">取消</UIButton>
        </div>
      </Card>
    </div>

    <!-- 增援弹窗 -->
    <div v-if="showSupportModal" class="modal-overlay">
      <Card class="modal-card support-modal">
        <div class="modal-title">
          <Icon name="moon" size="24" variant="warning" />
          <h3>拜隆增援</h3>
        </div>

        <div class="support-info">
          <p><strong>{{ supportData?.target_name }}</strong> 受到伤害！</p>
          <p>附近的拜隆单位可以分担伤害（50% + 50%）</p>
        </div>

        <div v-if="supportUnits.length > 0" class="support-units">
          <h4>可增援单位:</h4>
          <div
            v-for="unit in supportUnits"
            :key="unit.id"
            class="support-unit"
            @click="executeSupport(unit.id)"
          >
            <span class="unit-name">{{ unit.name }}</span>
            <Tag variant="blue" size="small">HP: {{ unit.hp }}/{{ unit.max_hp }}</Tag>
          </div>
        </div>

        <div class="support-options">
          <UIButton variant="secondary" @click="giveupSupport">放弃增援</UIButton>
        </div>
      </Card>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import { io } from 'socket.io-client';
import * as PIXI from 'pixi.js';
import UIButton from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Tag from '@/components/ui/Tag.vue';
import Icon from '@/components/ui/Icon.vue';

const route = useRoute();

const battleId = route.params.id;
const canvasContainer = ref(null);
const battleState = ref(null);
const selectedUnit = ref(null);
const showAttackModal = ref(false);
const showSurpriseModal = ref(false);
const showArtilleryModal = ref(false);
const showSupportModal = ref(false);
const surpriseData = ref(null);
const surpriseTimer = ref(10);
const surpriseCandidates = ref([]);
const currentAttackData = ref(null); // 保存当前攻击数据
const supportData = ref(null);
const supportUnits = ref([]);
const isDeployingRoyroy = ref(false);
const draggedUnit = ref(null);
const mySelectedUnits = ref([]);

let app = null;
let socket = null;

// 监听阶段变化，高亮不同元素
watch(() => battleState.value?.phase, (newPhase) => {
  if (app && battleState.value) {
    renderBattlefield();
  }
});

const enemyUnits = computed(() => {
  if (!battleState.value?.units) return [];
  // 简化：假设玩家是地球联合
  return battleState.value.units.filter(u => u.faction !== 'earth');
});

// 是否可以使用火力覆盖
const canUseArtillery = computed(() => {
  return battleState.value?.current_faction === 'earth' &&
         !battleState.value?.earthArtilleryUsed;
});

function getFactionVariant(faction) {
  const variants = {
    earth: 'green',
    balon: 'blue',
    maxion: 'purple'
  };
  return variants[faction] || 'default';
}

function getFogMessage(log) {
  const effects = {
    exposed: '马克西翁单位已暴露，可以被选中攻击',
    cooperative: '马克西翁单位可协同攻击，伤害+2',
    hidden: '马克西翁单位保持隐匿状态'
  };
  
  return `[骰子结果: ${log.roll}] ${effects[log.effect] || log.message}`;
}

// 检查单位是否隐匿
function isUnitHidden(unit) {
  if (unit.faction !== 'maxion') return false;
  if (battleState.value?.fogEffect !== 'hidden') return false;
  if (unit.dealtDamageLastTurn) return false;
  
  return true;
}

function getFactionName(faction) {
  const names = {
    earth: '地球联合',
    balon: '拜隆',
    maxion: '马克西翁'
  };
  return names[faction] || faction || '未知';
}

function getPhaseName(phase) {
  const names = {
    spawn_selection: '出生点选择阶段',
    spawn_deployment: '单位部署阶段',
    tactical: '战术阶段',
    deployment: '部署阶段',
    move: '移动阶段',
    action: '战术行动阶段'
  };
  return names[phase] || '未知阶段';
}

// 获取当前出生点选择玩家名称
const currentSpawnPlayerName = computed(() => {
  const player = battleState.value?.spawnOrder?.[battleState.value?.currentSpawnIndex];
  return player ? getFactionName(player.faction) : '等待中...';
});

// 获取我的出生点
const mySpawnPoint = computed(() => {
  // 简化：假设当前玩家是第一个玩家，实际应该从用户信息获取
  const currentUserId = getCurrentUserId();
  const playerSpawn = battleState.value?.spawnOrder?.find(p => p.playerId === currentUserId);
  return playerSpawn?.spawnPoint || null;
});

// 未部署的单位
const undeployedUnits = computed(() => {
  const deployedIds = new Set(battleState.value?.units?.map(u => u.id) || []);
  return mySelectedUnits.value?.filter(u => !deployedIds.has(u.id)) || [];
});

// 是否可以结束部署
const canEndDeployment = computed(() => {
  return undeployedUnits.value.length === 0;
});

// 可以部署Royroy的单位
const myUnitsWithRoyroy = computed(() => {
  const currentUserId = getCurrentUserId();
  return battleState.value?.units?.filter(u =>
    u.playerId === currentUserId && u.has_royroy
  ) || [];
});

// 是否可以部署Royroy
const canDeployRoyroy = computed(() => {
  return battleState.value?.phase === 'tactical' &&
         myUnitsWithRoyroy.value.some(u => !u.royroy_deployed);
});

// 获取当前用户ID
function getCurrentUserId() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.userId || payload.id;
  } catch (e) {
    return null;
  }
}

// 格式化位置
function formatPosition(pos) {
  if (!pos) return '';
  const col = String.fromCharCode(65 + pos.q);
  return `${col}${pos.r + 1}`;
}

// 获取出生点样式
function getSpawnPointStyle(spawnPoint) {
  if (!spawnPoint) return {};
  return {
    borderColor: spawnPoint.type === 'mothership' ? '#4facfe' : '#00f260'
  };
}

async function loadBattle() {
  try {
    const token = localStorage.getItem('token');
    const response = await axios.get(`/api/battles/${battleId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    battleState.value = response.data.battle.battlefield_state;
    nextTick(() => initBattleCanvas());
  } catch (err) {
    console.error('加载战斗失败:', err);
  }
}

function initBattleCanvas() {
  if (!canvasContainer.value || !battleState.value) return;

  const width = canvasContainer.value.clientWidth;
  const height = canvasContainer.value.clientHeight;

  app = new PIXI.Application();

  app.init({
    width,
    height,
    backgroundColor: 0x0a0e14,
    antialias: true
  }).then(() => {
    canvasContainer.value.appendChild(app.canvas);
    renderBattlefield();
  });
}

function renderBattlefield() {
  if (!app || !battleState.value) return;

  app.stage.removeChildren();

  const { width: bfWidth, height: bfHeight, cells, units, phase, spawnOrder, currentSpawnIndex } = battleState.value;

  const hexSize = 30;
  const hexWidth = hexSize * 2;
  const hexHeight = Math.sqrt(3) * hexSize;

  const graphics = new PIXI.Graphics();
  app.stage.addChild(graphics);

  // 出生点选择阶段：获取当前玩家
  const currentSpawnPlayer = phase === 'spawn_selection' ? spawnOrder?.[currentSpawnIndex] : null;
  const currentUserId = getCurrentUserId();
  const isMyTurn = currentSpawnPlayer?.playerId === currentUserId;

  // 绘制格子
  cells.forEach(cell => {
    const x = cell.q * hexWidth * 0.75;
    const y = cell.r * hexHeight + (cell.q % 2) * (hexHeight / 2);

    let fillColor = 0x151a21;
    let borderColor = 0x20262f;
    let isSpawnPoint = false;

    // 根据地形的不同显示
    if (cell.terrain === 'mothership') {
      fillColor = 0x4facfe;
      isSpawnPoint = true;
    } else if (cell.terrain === 'base') {
      fillColor = 0x00f260;
      isSpawnPoint = true;
    } else if (cell.terrain === 'lunar') {
      fillColor = 0x20262f;
    }

    // 出生点选择阶段：高亮可选择的出生点
    if (phase === 'spawn_selection' && isSpawnPoint && isMyTurn) {
      // 检查是否已被占用
      const isOccupied = spawnOrder?.some((p, idx) =>
        idx !== currentSpawnIndex && p.spawnPoint?.q === cell.q && p.spawnPoint?.r === cell.r
      );
      if (!isOccupied) {
        borderColor = 0xffeb3b; // 黄色边框高亮
        fillColor = 0x4facfe;   // 更亮的蓝色
      }
    }

    // 显示已选择的出生点
    if (phase === 'spawn_selection' || phase === 'spawn_deployment') {
      const selectedBy = spawnOrder?.find(p =>
        p.spawnPoint?.q === cell.q && p.spawnPoint?.r === cell.r
      );
      if (selectedBy) {
        borderColor = selectedBy.faction === 'earth' ? 0x00f260 :
                      selectedBy.faction === 'balon' ? 0xe040fb : 0xff9800;
        fillColor = selectedBy.faction === 'earth' ? 0x00f260 :
                    selectedBy.faction === 'balon' ? 0x9c27b0 : 0xf57c00;
      }
    }

    graphics.lineStyle(2, borderColor);
    graphics.beginFill(fillColor);

    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const px = x + hexSize * Math.cos(angle);
      const py = y + hexSize * Math.sin(angle);

      if (i === 0) graphics.moveTo(px, py);
      else graphics.lineTo(px, py);
    }

    graphics.closePath();
    graphics.endFill();

    // 绘制出生点标记
    if (isSpawnPoint) {
      const typeLabel = new PIXI.Text(cell.terrain === 'mothership' ? '母舰' : '基地', {
        fontSize: 10,
        fill: '#fff'
      });
      typeLabel.x = x - typeLabel.width / 2;
      typeLabel.y = y - 5;
      app.stage.addChild(typeLabel);
    }

    // 出生点选择阶段：可点击的格子
    if (phase === 'spawn_selection' && isSpawnPoint && isMyTurn) {
      const cellArea = new PIXI.Graphics();
      cellArea.beginFill(0xffffff, 0.001); // 几乎透明
      cellArea.drawCircle(0, 0, hexSize * 0.9);
      cellArea.endFill();
      cellArea.x = x;
      cellArea.y = y;
      cellArea.eventMode = 'static';
      cellArea.cursor = 'pointer';
      cellArea.on('pointerdown', () => selectSpawnPoint(cell.q, cell.r));
      app.stage.addChild(cellArea);
    }

    // 出生点部署阶段：可拖拽部署的区域
    if (phase === 'spawn_deployment') {
      const mySpawn = spawnOrder?.find(p => p.playerId === currentUserId);
      if (mySpawn?.spawnPoint?.q === cell.q && mySpawn?.spawnPoint?.r === cell.r) {
        // 绘制可部署区域标识
        const deployMarker = new PIXI.Graphics();
        deployMarker.lineStyle(3, 0x00f260);
        deployMarker.drawCircle(0, 0, hexSize * 0.7);
        deployMarker.x = x;
        deployMarker.y = y;
        app.stage.addChild(deployMarker);

        // 使区域可接收拖拽
        const dropZone = new PIXI.Graphics();
        dropZone.beginFill(0x00f260, 0.3);
        dropZone.drawCircle(0, 0, hexSize * 0.9);
        dropZone.endFill();
        dropZone.x = x;
        dropZone.y = y;
        dropZone.eventMode = 'static';
        dropZone.on('pointerup', () => handleDropOnSpawn(cell.q, cell.r));
        app.stage.addChild(dropZone);
      }
    }
  });

  // 绘制单位
  units.forEach(unit => {
    const x = unit.q * hexWidth * 0.75;
    const y = unit.r * hexHeight + (unit.q % 2) * (hexHeight / 2);

    const unitGraphic = new PIXI.Graphics();

    // 根据阵营选择颜色
    const colors = { earth: 0x00f260, balon: 0xe040fb, maxion: 0xff9800 };
    const color = colors[unit.faction] || 0x888888;

    // 检查隐匿状态
    const hidden = isUnitHidden(unit);

    unitGraphic.beginFill(color);
    unitGraphic.drawCircle(0, 0, 20);
    unitGraphic.endFill();

    // 隐匿效果：半透明
    if (hidden) {
      unitGraphic.alpha = 0.4;
    }

    // 绘制HP条
    const hpRatio = unit.hp / unit.max_hp;
    unitGraphic.beginFill(0x20262f);
    unitGraphic.drawRect(-15, 25, 30, 5);
    unitGraphic.endFill();

    unitGraphic.beginFill(hpRatio > 0.5 ? 0x00f260 : hpRatio > 0.25 ? 0xff9800 : 0xf44336);
    unitGraphic.drawRect(-15, 25, 30 * hpRatio, 5);
    unitGraphic.endFill();

    // 隐匿图标
    if (hidden) {
      const hiddenIcon = new PIXI.Text('👁️', {
        fontSize: 12,
        fill: '#fff'
      });
      hiddenIcon.x = -hiddenIcon.width / 2;
      hiddenIcon.y = -18;
      unitGraphic.addChild(hiddenIcon);
    }

    // 名称
    const label = new PIXI.Text(unit.name?.substring(0, 3) || 'Unit', {
      fontSize: 10,
      fill: '#fff'
    });
    label.x = -label.width / 2;
    label.y = -5;
    unitGraphic.addChild(label);

    unitGraphic.x = x;
    unitGraphic.y = y;

    // 点击事件
    unitGraphic.eventMode = 'static';
    unitGraphic.cursor = 'pointer';
    unitGraphic.on('pointerdown', () => selectUnit(unit));

    app.stage.addChild(unitGraphic);

    // 绘制Royroy
    if (unit.royroy_deployed) {
      const royroyGraphic = new PIXI.Graphics();
      royroyGraphic.beginFill(0xffff00);
      royroyGraphic.drawCircle(0, 0, 12);
      royroyGraphic.endFill();
      royroyGraphic.x = unit.royroy_q * hexWidth * 0.75;
      royroyGraphic.y = unit.royroy_r * hexHeight + (unit.royroy_q % 2) * (hexHeight / 2);

      app.stage.addChild(royroyGraphic);
    }
  });
}

function selectUnit(unit) {
  selectedUnit.value = unit;

  if (battleState.value?.phase === 'action') {
    showAttackModal.value = true;
  }
}

// 选择出生点
async function selectSpawnPoint(q, r) {
  try {
    const token = localStorage.getItem('token');
    const response = await axios.post(`/api/battles/${battleId}/select-spawn`, {
      q,
      r
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    battleState.value = response.data.state;
    renderBattlefield();
  } catch (err) {
    alert(err.response?.data?.error || '选择出生点失败');
  }
}

// 拖拽开始
function handleDragStart(event, unit) {
  draggedUnit.value = unit;
}

// 拖拽放置到出生点
async function handleDropOnSpawn(q, r) {
  if (!draggedUnit.value) return;

  try {
    const token = localStorage.getItem('token');
    const response = await axios.post(`/api/battles/${battleId}/deploy-unit`, {
      unit_id: draggedUnit.value.id,
      q,
      r
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    battleState.value = response.data.state;
    draggedUnit.value = null;
    renderBattlefield();
  } catch (err) {
    alert(err.response?.data?.error || '部署单位失败');
  }
}

// 结束部署阶段
async function endDeploymentPhase() {
  try {
    const token = localStorage.getItem('token');
    const response = await axios.post(`/api/battles/${battleId}/end-deployment`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });

    battleState.value = response.data.state;
    renderBattlefield();
  } catch (err) {
    alert(err.response?.data?.error || '结束部署失败');
  }
}

// 开始Royroy部署
function startRoyroyDeploy() {
  isDeployingRoyroy.value = true;
  // TODO: 在画布上高亮可部署位置
}

// 取消Royroy部署
function cancelRoyroyDeploy() {
  isDeployingRoyroy.value = false;
}

// 结束战术阶段
async function endTacticalPhase() {
  try {
    const token = localStorage.getItem('token');
    const response = await axios.post(`/api/battles/${battleId}/end-tactical`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });

    battleState.value = response.data.state;
    renderBattlefield();
  } catch (err) {
    alert(err.response?.data?.error || '结束战术阶段失败');
  }
}

function selectAttack() {
  showAttackModal.value = true;
}

async function executeAttack(target) {
  showAttackModal.value = false;
  currentAttackData.value = {
    target_id: target.id,
    attack_type: 'melee'
  };

  try {
    const token = localStorage.getItem('token');
    const response = await axios.post(`/api/battles/${battleId}/attack`, {
      attacker_id: selectedUnit.value.id,
      target_id: target.id,
      attack_type: 'melee' // 简化：默认近战
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // 检查是否触发奇袭
    if (response.data.surprise_triggered) {
      // 奇袭触发，显示选择弹窗
      surpriseData.value = response.data.surprise_info;
      surpriseCandidates.value = response.data.surprise_info.candidates;
      showSurpriseModal.value = true;
      
      // 启动倒计时
      startSurpriseTimer();
      
      // 更新战斗状态但不重新渲染（等待用户选择）
      battleState.value = response.data.state;
    } else if (response.data.support_triggered) {
      // 增援触发，显示选择弹窗
      supportData.value = {
        target_id: target.id,
        target_name: target.name
      };
      supportUnits.value = response.data.support_units;
      showSupportModal.value = true;
      
      // 更新战斗状态但不重新渲染（等待用户选择）
      battleState.value = response.data.state;
    } else {
      // 正常攻击完成
      battleState.value = response.data.state;
      renderBattlefield();
    }
  } catch (err) {
    alert('攻击失败');
  }
}

// 执行火力覆盖
async function executeArtillery() {
  if (!selectedUnit.value) {
    alert('请先选择一个单位作为中心点');
    return;
  }

  showArtilleryModal.value = false;

  try {
    const token = localStorage.getItem('token');
    const response = await axios.post(`/api/battles/${battleId}/action`, {
      actionType: 'artillery',
      params: {
        centerQ: selectedUnit.value.q,
        centerR: selectedUnit.value.r
      }
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    battleState.value = response.data.state;
    renderBattlefield();
    alert('火力覆盖发动成功！');
  } catch (err) {
    alert(err.response?.data?.error || '火力覆盖发动失败');
  }
}

// 执行增援
async function executeSupport(supportUnitId) {
  showSupportModal.value = false;

  try {
    const token = localStorage.getItem('token');
    const response = await axios.post(`/api/battles/${battleId}/support`, {
      targetId: supportData.value.target_id,
      supportUnitId
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    battleState.value = response.data.state;
    renderBattlefield();
  } catch (err) {
    alert(err.response?.data?.error || '增援失败');
  }
}

// 放弃增援
async function giveupSupport() {
  showSupportModal.value = false;
  supportData.value = null;
  supportUnits.value = [];
}

function skipDeployment() {
  // 兼容旧版本的部署跳过
  if (battleState.value) {
    battleState.value.phase = 'move';
  }
}

async function endTurn() {
  try {
    const token = localStorage.getItem('token');
    const response = await axios.post(`/api/battles/${battleId}/end-turn`, {
      currentFaction: battleState.value.currentFaction
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    battleState.value = response.data.state;
    renderBattlefield();
  } catch (err) {
    console.error('结束回合失败:', err);
  }
}

let surpriseTimerInterval = null;

function startSurpriseTimer() {
  surpriseTimer.value = 10;
  
  if (surpriseTimerInterval) {
    clearInterval(surpriseTimerInterval);
  }
  
  surpriseTimerInterval = setInterval(() => {
    surpriseTimer.value--;
    if (surpriseTimer.value <= 0) {
      clearInterval(surpriseTimerInterval);
      chooseSurprise('giveup'); // 超时自动放弃
    }
  }, 1000);
}

async function chooseSurprise(type) {
  showSurpriseModal.value = false;
  
  if (surpriseTimerInterval) {
    clearInterval(surpriseTimerInterval);
  }

  try {
    const token = localStorage.getItem('token');
    
    if (type === 'giveup') {
      // 放弃奇袭
      const response = await axios.post(`/api/battles/${battleId}/surprise-choice`, {
        choice: 'giveup',
        original_attacker_id: selectedUnit.value.id,
        target_id: currentAttackData.value.target_id,
        attack_type: currentAttackData.value.attack_type
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      battleState.value = response.data.state;
      renderBattlefield();
    } else if (type === 'replace' || type === 'counter') {
      // 需要选择奇袭单位
      if (surpriseCandidates.value.length === 1) {
        // 只有一个候选，自动选择
        await executeSurpriseChoice(type, surpriseCandidates.value[0].id);
      } else {
        // 多个候选，让用户选择（这里简化为默认选第一个）
        await executeSurpriseChoice(type, surpriseCandidates.value[0].id);
      }
    }
  } catch (err) {
    console.error('奇袭选择失败:', err);
    alert('奇袭选择失败');
  }
}

async function executeSurpriseChoice(choice, surpriseUnitId) {
  try {
    const token = localStorage.getItem('token');
    const response = await axios.post(`/api/battles/${battleId}/surprise-choice`, {
      choice,
      surprise_unit_id: surpriseUnitId,
      original_attacker_id: selectedUnit.value.id,
      target_id: currentAttackData.value.target_id,
      attack_type: currentAttackData.value.attack_type
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    battleState.value = response.data.state;
    renderBattlefield();
  } catch (err) {
    console.error('执行奇袭失败:', err);
    alert('执行奇袭失败');
  }
}

function chooseSurpriseOld(type) {
  showSurpriseModal.value = false;
  if (socket) {
    socket.emit('surprise-choice', { battleId, choice: type });
  }
}

function setupSocket() {
  const token = localStorage.getItem('token');

  socket = io({
    auth: { token }
  });

  socket.emit('join-battle', battleId);

  socket.on('unit-moved', (data) => {
    // 更新其他玩家的移动
    renderBattlefield();
  });

  socket.on('surprise-timer-start', (data) => {
    surpriseTimer.value = data.duration;
    showSurpriseModal.value = true;

    const interval = setInterval(() => {
      surpriseTimer.value--;
      if (surpriseTimer.value <= 0) {
        clearInterval(interval);
        showSurpriseModal.value = false;
      }
    }, 1000);
  });

  socket.on('surprise-choice-made', (data) => {
    if (data.choice !== 'giveup') {
      // 重新加载战斗状态
      loadBattle();
    }
  });
}

onMounted(() => {
  loadBattle();
  setupSocket();
});

onUnmounted(() => {
  if (socket) {
    socket.emit('leave-battle', battleId);
    socket.disconnect();
  }
  if (app) {
    app.destroy(true);
  }
});
</script>

<style scoped>
.battle-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--surface);
}

.battle-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: var(--surface-container);
  position: relative;
}

/* 使用色调层级代替边框 */
.battle-header::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 1px;
  background: linear-gradient(
    90deg, 
    transparent, 
    var(--surface-container-highest) 20%, 
    var(--surface-container-highest) 80%, 
    transparent
  );
}

.turn-info {
  display: flex;
  gap: 16px;
  align-items: center;
}

.turn-number {
  font-family: 'Space Grotesk', monospace, sans-serif;
  font-size: 16px;
  font-weight: 700;
  color: var(--on-surface);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.faction-name {
  padding: 6px 16px;
  background: var(--surface-container-lowest);
  border-left: 3px solid var(--primary);
  color: var(--primary);
  font-family: 'Space Grotesk', monospace, sans-serif;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.phase-info {
  color: var(--secondary);
  font-family: 'Space Grotesk', monospace, sans-serif;
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.battle-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.battle-canvas {
  flex: 1;
  background: var(--surface);
  position: relative;
}

.battle-sidebar {
  width: 320px;
  padding: 20px;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 使用色调层级分隔侧边栏 */
.battle-sidebar::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 1px;
  background: linear-gradient(
    180deg, 
    transparent, 
    var(--surface-container-highest) 20%, 
    var(--surface-container-highest) 80%, 
    transparent
  );
}

.combat-log {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  margin-top: 20px;
}

.combat-log h3 {
  font-family: 'Space Grotesk', monospace, sans-serif;
  color: var(--tertiary);
  margin-bottom: 16px;
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.log-entries {
  flex: 1;
  overflow-y: auto;
  font-family: 'Space Mono', monospace, sans-serif;
  font-size: 12px;
  color: var(--outline);
}

.log-entry {
  padding: 10px 12px;
  position: relative;
  margin-bottom: 8px;
  background: var(--surface-container-highest);
  transition: all 0.2s steps(4);
}

.log-entry::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--outline-variant);
  transition: all 0.2s steps(4);
}

.log-entry:hover {
  transform: translateX(4px);
  background: var(--surface-container);
}

.log-entry:hover::before {
  background: var(--tertiary);
  width: 3px;
}

.log-entry-fog {
  display: flex;
  align-items: center;
  padding: 12px;
  background: var(--surface-container-highest);
  border-left: 3px solid var(--primary);
}

.log-fog-message {
  font-family: 'Space Mono', monospace, sans-serif;
  font-size: 12px;
  color: var(--on-surface);
  line-height: 1.4;
}

.action-panel {
  margin-top: 20px;
  padding-top: 20px;
  position: relative;
}

.action-panel::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(
    90deg, 
    transparent, 
    var(--surface-container-highest) 20%, 
    var(--surface-container-highest) 80%, 
    transparent
  );
}

.action-panel h3 {
  font-family: 'Space Grotesk', monospace, sans-serif;
  color: var(--primary);
  margin-bottom: 16px;
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.action-buttons {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  width: 400px;
  max-height: 80vh;
  overflow-y: auto;
  position: relative;
}

.modal h3 {
  font-family: 'Space Grotesk', monospace, sans-serif;
  color: var(--secondary);
  margin-bottom: 20px;
  font-size: 18px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.target-list {
  max-height: 300px;
  overflow-y: auto;
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.target-option {
  padding: 16px;
  background: var(--surface-container-highest);
  position: relative;
  cursor: pointer;
  transition: all 0.2s steps(4);
  border: none;
}

.target-option::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--outline-variant);
  transition: all 0.2s steps(4);
}

.target-option:hover {
  transform: translateX(4px);
  background: var(--surface-container);
}

.target-option:hover::before {
  background: var(--error);
  width: 4px;
}

.target-name {
  font-family: 'Space Grotesk', monospace, sans-serif;
  color: var(--on-surface);
  margin-bottom: 6px;
  font-weight: 700;
  font-size: 14px;
}

.target-hp {
  font-family: 'Space Mono', monospace, sans-serif;
  color: var(--outline);
  font-size: 12px;
}

.surprise-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 20px 0;
}

.surprise-timer {
  text-align: center;
  color: var(--secondary);
  font-family: 'Space Grotesk', monospace, sans-serif;
  font-size: 20px;
  font-weight: 700;
  padding: 12px;
  background: var(--surface-container-highest);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

/* 阶段面板样式 */
.phase-panel {
  padding: 20px;
  background: var(--surface-container);
  margin-bottom: 16px;
  position: relative;
  overflow: hidden;
}

.phase-panel::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 1px;
  background: linear-gradient(
    90deg, 
    transparent, 
    var(--surface-container-highest) 20%, 
    var(--surface-container-highest) 80%, 
    transparent
  );
}

.phase-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.phase-title h3 {
  font-family: 'Space Grotesk', monospace, sans-serif;
  color: var(--primary);
  font-size: 16px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 0;
}

.phase-panel h3 {
  font-family: 'Space Grotesk', monospace, sans-serif;
  color: var(--primary);
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.modal-title h3 {
  font-family: 'Space Grotesk', monospace, sans-serif;
  color: var(--secondary);
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

/* 出生点选择阶段 */
.spawn-selection-info {
  margin-bottom: 16px;
}

.spawn-selection-info .current-player {
  color: var(--on-surface);
  font-family: 'Space Grotesk', monospace, sans-serif;
  font-size: 14px;
  margin-bottom: 8px;
  font-weight: 700;
}

.spawn-selection-info .hint {
  color: var(--outline);
  font-family: 'Space Mono', monospace, sans-serif;
  font-size: 12px;
}

.spawn-order {
  margin-top: 16px;
}

.spawn-order h4 {
  font-family: 'Space Grotesk', monospace, sans-serif;
  color: var(--outline);
  font-size: 12px;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.spawn-order-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--surface-container-highest);
  position: relative;
  margin-bottom: 8px;
  transition: all 0.2s steps(4);
}

.spawn-order-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--outline-variant);
  transition: all 0.2s steps(4);
}

.spawn-order-item.current {
  transform: translateX(4px);
  background: var(--surface-container);
}

.spawn-order-item.current::before {
  background: var(--secondary);
  width: 4px;
}

.spawn-order-item.done {
  opacity: 0.5;
}

.spawn-order-item .order-num {
  width: 24px;
  height: 24px;
  background: var(--surface-container-low);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Space Grotesk', monospace, sans-serif;
  font-size: 12px;
  color: var(--on-surface);
  font-weight: 700;
}

.spawn-order-item.current .order-num {
  background: var(--secondary);
  color: var(--on-primary);
}

.faction-badge {
  padding: 4px 12px;
  font-family: 'Space Grotesk', monospace, sans-serif;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--surface-container-highest);
  color: var(--on-surface);
}

.faction-badge.earth {
  border-left: 2px solid var(--faction-earth);
  color: var(--faction-earth);
}

.faction-badge.balon {
  border-left: 2px solid var(--faction-balon);
  color: var(--faction-balon);
}

.faction-badge.maxion {
  border-left: 2px solid var(--faction-maxion);
  color: var(--faction-maxion);
}

.spawn-order-item .status {
  font-family: 'Space Mono', monospace, sans-serif;
  font-size: 11px;
  color: var(--outline);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* 部署阶段 */
.deployment-panel {
  margin-top: 12px;
}

.deployment-panel h4 {
  font-family: 'Space Grotesk', monospace, sans-serif;
  color: var(--outline);
  font-size: 12px;
  margin: 16px 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.spawn-point-display {
  padding: 16px;
  background: var(--surface-container-highest);
  text-align: center;
  position: relative;
  overflow: hidden;
}

.spawn-point-display::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: var(--primary);
}

.spawn-point-label {
  color: var(--primary);
  font-family: 'Space Grotesk', monospace, sans-serif;
  font-weight: 700;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.spawn-point-pos {
  color: var(--outline);
  font-family: 'Space Mono', monospace, sans-serif;
  font-size: 12px;
  margin-top: 6px;
}

.undeployed-units {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 240px;
  overflow-y: auto;
}

.unit-card-draggable {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--surface-container-highest);
  position: relative;
  cursor: grab;
  transition: all 0.2s steps(4);
  border: none;
}

.unit-card-draggable::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--outline-variant);
  transition: all 0.2s steps(4);
}

.unit-card-draggable:hover {
  transform: translateX(4px);
  background: var(--surface-container);
}

.unit-card-draggable:hover::before {
  background: var(--tertiary);
  width: 4px;
}

.unit-card-draggable:active {
  cursor: grabbing;
}

.unit-thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  background: var(--surface-container-low);
  image-rendering: pixelated;
}

.unit-card-draggable .unit-name {
  font-family: 'Space Grotesk', monospace, sans-serif;
  color: var(--on-surface);
  font-size: 14px;
  font-weight: 700;
}

/* 战术阶段 */
.tactical-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tactical-btn {
  background: var(--secondary);
  color: var(--on-primary);
  border-color: var(--secondary);
}

.tactical-btn:hover:not(:disabled) {
  transform: translateY(2px);
}

.tactical-btn:disabled {
  background: var(--surface-container-low);
  color: var(--outline);
  border-color: var(--outline-variant);
  box-shadow: none;
  transform: none;
}

.royroy-deploy-hint {
  padding: 12px;
  background: var(--surface-container-highest);
  margin-bottom: 12px;
  border-left: 2px solid var(--secondary);
}

.royroy-deploy-hint p {
  color: var(--secondary);
  font-family: 'Space Mono', monospace, sans-serif;
  font-size: 12px;
  margin-bottom: 8px;
}

.cancel-btn {
  background: var(--surface-container-low);
  border-color: var(--outline-variant);
  color: var(--outline);
  font-size: 12px;
  padding: 8px 16px;
}

.cancel-btn:hover {
  background: var(--surface-container-highest);
  border-color: var(--outline);
}

.royroy-status {
  margin-top: 20px;
  padding-top: 16px;
  position: relative;
}

.royroy-status::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(
    90deg, 
    transparent, 
    var(--surface-container-highest) 20%, 
    var(--surface-container-highest) 80%, 
    transparent
  );
}

.royroy-status h4 {
  font-family: 'Space Grotesk', monospace, sans-serif;
  color: var(--outline);
  font-size: 12px;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.royroy-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--surface-container-highest);
  position: relative;
  margin-bottom: 8px;
  transition: all 0.2s steps(4);
}

.royroy-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--outline-variant);
}

.royroy-item:hover {
  transform: translateX(4px);
  background: var(--surface-container);
}

.royroy-item .unit-name {
  font-family: 'Space Grotesk', monospace, sans-serif;
  color: var(--on-surface);
  font-size: 14px;
  font-weight: 700;
}

.status-badge {
  padding: 4px 12px;
  font-family: 'Space Grotesk', monospace, sans-serif;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-badge.deployed {
  background: rgba(0, 255, 65, 0.1);
  color: var(--primary);
}

.status-badge.standby {
  background: var(--surface-container-low);
  color: var(--outline);
}

/* 奇袭弹窗样式 */
.surprise-modal {
  max-width: 500px;
}

.surprise-info {
  background: var(--surface-container-highest);
  padding: 12px;
  margin: 16px 0;
  border-left: 3px solid var(--tertiary);
}

.surprise-info p {
  margin: 6px 0;
  font-family: 'Space Mono', monospace, sans-serif;
  font-size: 13px;
  color: var(--on-surface);
}

.surprise-candidates {
  margin: 16px 0;
}

.surprise-candidates h4 {
  font-family: 'Space Grotesk', monospace, sans-serif;
  color: var(--outline);
  font-size: 12px;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.candidate-unit {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--surface-container);
  margin-bottom: 8px;
  position: relative;
  transition: all 0.2s steps(4);
}

.candidate-unit::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--tertiary);
  transition: all 0.2s steps(4);
}

.candidate-unit:hover {
  transform: translateX(4px);
  background: var(--surface-container-low);
}

.candidate-unit:hover::before {
  width: 4px;
  background: var(--tertiary);
}

.candidate-unit .unit-name {
  font-family: 'Space Grotesk', monospace, sans-serif;
  font-size: 14px;
  font-weight: 700;
  color: var(--on-surface);
}

/* 火力覆盖弹窗 */
.artillery-modal {
  max-width: 450px;
}

.artillery-info {
  background: var(--surface-container-highest);
  padding: 12px;
  margin: 16px 0;
  border-left: 3px solid var(--warning);
}

.artillery-info p {
  margin: 6px 0;
  font-family: 'Space Mono', monospace, sans-serif;
  font-size: 13px;
  color: var(--on-surface);
}

.artillery-info .warning-text {
  color: var(--warning);
  font-weight: 700;
  margin-top: 8px;
}

.artillery-center {
  background: var(--surface-container-low);
  padding: 12px;
  margin: 16px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.artillery-center p {
  margin: 0;
  font-family: 'Space Mono', monospace, sans-serif;
  font-size: 13px;
  color: var(--on-surface);
}

.artillery-options {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

/* 增援弹窗 */
.support-modal {
  max-width: 450px;
}

.support-info {
  background: var(--surface-container-highest);
  padding: 12px;
  margin: 16px 0;
  border-left: 3px solid var(--primary);
}

.support-info p {
  margin: 6px 0;
  font-family: 'Space Mono', monospace, sans-serif;
  font-size: 13px;
  color: var(--on-surface);
}

.support-info strong {
  color: var(--error);
}

.support-units {
  margin: 16px 0;
  max-height: 300px;
  overflow-y: auto;
}

.support-units h4 {
  font-family: 'Space Grotesk', monospace, sans-serif;
  color: var(--outline);
  font-size: 12px;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.support-unit {
  padding: 16px;
  background: var(--surface-container-highest);
  position: relative;
  cursor: pointer;
  transition: all 0.2s steps(4);
  border: none;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.support-unit::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--primary);
  transition: all 0.2s steps(4);
}

.support-unit:hover {
  transform: translateX(4px);
  background: var(--surface-container-low);
}

.support-unit:hover::before {
  width: 4px;
  background: var(--primary);
}

.support-unit .unit-name {
  font-family: 'Space Grotesk', monospace, sans-serif;
  font-size: 14px;
  font-weight: 700;
  color: var(--on-surface);
}

.support-options {
  margin-top: 20px;
}
</style>
