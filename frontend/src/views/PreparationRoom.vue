<template>
  <div class="preparation-room">
    <CRTScanlines />
    
    <!-- 顶部：战场信息 -->
    <header class="room-header">
      <div class="header-left">
        <UIButton variant="secondary" @click="leaveRoom">← 返回</UIButton>
      </div>
      <div class="header-center">
        <h1 class="battlefield-name font-space">{{ roomState.battlefield?.name || '整备室' }}</h1>
        <p class="battlefield-size" v-if="roomState.battlefield">
          {{ roomState.battlefield.width }}×{{ roomState.battlefield.height }}
        </p>
      </div>
      <div class="header-right">
        <div class="room-id font-space">房间 #{{ roomId }}</div>
      </div>
    </header>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-container">
      <div class="loading-spinner"></div>
      <p>加载房间信息...</p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="error-container">
      <div class="error-wrapper">
        <Icon name="close" size="20" variant="error" />
        <p>{{ error }}</p>
      </div>
      <UIButton variant="primary" @click="loadRoomInfo">重试</UIButton>
      <UIButton variant="secondary" @click="leaveRoom">返回首页</UIButton>
    </div>

    <!-- 主内容 -->
    <main v-else class="room-main">
      <!-- AI设置面板（仅房主可见）- 移到顶部显眼位置 -->
      <section v-if="isHost" class="ai-settings-section">
        <div class="ai-settings-header">
          <h2 class="section-title">
            <span class="ai-icon">🤖</span>
            AI对战设置
          </h2>
          <button 
            v-if="!showAISettings" 
            class="toggle-ai-btn"
            @click="showAISettings = true"
          >
            + 添加AI对手
          </button>
        </div>

        <!-- AI设置表单 -->
        <div v-if="showAISettings" class="ai-settings-form">
          <div class="ai-form-row">
            <div class="ai-form-group">
              <label class="ai-form-label">选择AI阵营</label>
              <div class="ai-factions-grid">
                <button
                  v-for="faction in availableAIFactions"
                  :key="faction.id"
                  class="ai-faction-btn"
                  :class="{ selected: aiConfig.faction === faction.id }"
                  @click="aiConfig.faction = faction.id"
                >
                  <span class="faction-icon">{{ faction.icon }}</span>
                  <span class="faction-name">{{ faction.name }}</span>
                </button>
                <span v-if="availableAIFactions.length === 0" class="ai-form-hint">
                  所有阵营已被玩家占用
                </span>
              </div>
            </div>
          </div>

          <div class="ai-form-row">
            <div class="ai-form-group">
              <label class="ai-form-label">选择AI难度</label>
              <div class="ai-difficulty-grid">
                <button
                  v-for="diff in aiDifficulties"
                  :key="diff.id"
                  class="ai-difficulty-btn"
                  :class="{ selected: aiConfig.difficulty === diff.id }"
                  @click="aiConfig.difficulty = diff.id"
                >
                  <span class="diff-name">{{ diff.name }}</span>
                  <span class="diff-desc">{{ diff.description }}</span>
                </button>
              </div>
            </div>
          </div>

          <div class="ai-form-actions">
            <button class="ai-confirm-btn" @click="addAIPlayer">
              确认添加
            </button>
            <button class="ai-cancel-btn" @click="showAISettings = false">
              取消
            </button>
          </div>
        </div>

        <!-- 已添加的AI列表 -->
        <div v-if="aiPlayers.length > 0" class="ai-players-list">
          <div class="ai-player-cards">
            <div 
              v-for="ai in aiPlayers" 
              :key="ai.userId"
              class="ai-player-card"
            >
              <div class="ai-player-info">
                <span class="ai-player-icon">{{ getFactionIcon(ai.faction) }}</span>
                <span class="ai-player-name">{{ ai.username }}</span>
                <span class="ai-player-diff">{{ getDifficultyName(ai.difficulty) }}</span>
              </div>
              <button 
                class="ai-remove-btn"
                @click="removeAIPlayer(ai.userId)"
              >
                移除
              </button>
            </div>
          </div>
        </div>
      </section>
      
      <!-- 阵营选择区域 -->
      <section class="factions-section">
        <h2 class="section-title">选择阵营</h2>
        <div class="factions-grid">
          <!-- 地球联合 -->
          <div
            class="faction-card"
            :class="{
              'selected': myFaction === 'earth',
              'occupied': isFactionTaken('earth') && myFaction !== 'earth',
              'disabled': isFactionTaken('earth') && myFaction !== 'earth'
            }"
            @click="selectFaction('earth')"
          >
            <div class="faction-header">
              <Icon name="earth" size="24" />
              <h3 class="faction-name">地球联合</h3>
              <span v-if="!isFactionTaken('earth')" class="status-badge available">可选</span>
              <span v-else-if="myFaction === 'earth'" class="status-badge mine">已选</span>
              <span v-else class="status-badge occupied">已被选</span>
            </div>
            <div class="faction-body">
              <div v-if="myFaction === 'earth'" class="my-faction">
                <span class="you-label">你的阵营</span>
              </div>
              <div v-else-if="isFactionTaken('earth')" class="occupied-by">
                <span class="player-name">{{ getPlayerByFaction('earth')?.username }}</span>
                <span v-if="getPlayerByFaction('earth')?.is_ready || getPlayerByFaction('earth')?.isReady" class="ready-mark">✓</span>
              </div>
              <div v-else class="faction-desc">
                人类最后的希望，科技与传统并存
              </div>
            </div>
          </div>
          
          <!-- 拜隆帝国 -->
          <div
            class="faction-card"
            :class="{
              'selected': myFaction === 'bylon',
              'occupied': isFactionTaken('bylon') && myFaction !== 'bylon',
              'disabled': isFactionTaken('bylon') && myFaction !== 'bylon'
            }"
            @click="selectFaction('bylon')"
          >
            <div class="faction-header">
              <Icon name="moon" size="24" />
              <h3 class="faction-name">拜隆帝国</h3>
              <span v-if="!isFactionTaken('bylon')" class="status-badge available">可选</span>
              <span v-else-if="myFaction === 'bylon'" class="status-badge mine">已选</span>
              <span v-else class="status-badge occupied">已被选</span>
            </div>
            <div class="faction-body">
              <div v-if="myFaction === 'bylon'" class="my-faction">
                <span class="you-label">你的阵营</span>
              </div>
              <div v-else-if="isFactionTaken('bylon')" class="occupied-by">
                <span class="player-name">{{ getPlayerByFaction('bylon')?.username }}</span>
                <span v-if="getPlayerByFaction('bylon')?.is_ready || getPlayerByFaction('bylon')?.isReady" class="ready-mark">✓</span>
              </div>
              <div v-else class="faction-desc">
                月面的古老帝国，神秘而强大
              </div>
            </div>
          </div>
          
          <!-- 马克西翁 -->
          <div
            class="faction-card"
            :class="{
              'selected': myFaction === 'maxion',
              'occupied': isFactionTaken('maxion') && myFaction !== 'maxion',
              'disabled': isFactionTaken('maxion') && myFaction !== 'maxion'
            }"
            @click="selectFaction('maxion')"
          >
            <div class="faction-header">
              <Icon name="star" size="24" />
              <h3 class="faction-name">马克西翁</h3>
              <span v-if="!isFactionTaken('maxion')" class="status-badge available">可选</span>
              <span v-else-if="myFaction === 'maxion'" class="status-badge mine">已选</span>
              <span v-else class="status-badge occupied">已被选</span>
            </div>
            <div class="faction-body">
              <div v-if="myFaction === 'maxion'" class="my-faction">
                <span class="you-label">你的阵营</span>
              </div>
              <div v-else-if="isFactionTaken('maxion')" class="occupied-by">
                <span class="player-name">{{ getPlayerByFaction('maxion')?.username }}</span>
                <span v-if="getPlayerByFaction('maxion')?.is_ready || getPlayerByFaction('maxion')?.isReady" class="ready-mark">✓</span>
              </div>
              <div v-else class="faction-desc">
                星际贸易联盟，灵活多变
              </div>
            </div>
          </div>
        </div>
      </section>
      
      <!-- 配置面板：选择阵营后显示 -->
      <section v-if="myFaction" class="config-section">
        <!-- 出生点选择 -->
        <div class="config-block">
          <h3 class="config-title">
            <span class="config-icon">📍</span>
            选择出生点
            <span class="required-mark">*</span>
          </h3>
          <div class="spawn-points-grid">
            <div 
              v-for="point in spawnPoints" 
              :key="`${point.q},${point.r}`"
              class="spawn-point-card"
              :class="{ 
                selected: selectedSpawn?.q === point.q && selectedSpawn?.r === point.r,
                [point.type]: true
              }"
              @click="selectSpawn(point)"
            >
              <div class="spawn-type-icon">
                {{ point.type === 'mothership' ? '🚀' : '🏰' }}
              </div>
              <div class="spawn-info">
                <span class="spawn-name">
                  {{ point.type === 'mothership' ? '母舰' : '基地' }}
                </span>
                <span class="spawn-coord">{{ formatCoord(point.q, point.r) }}</span>
              </div>
              <div v-if="point.faction" class="spawn-faction">
                {{ getFactionIcon(point.faction) }}
              </div>
            </div>
          </div>
          <p v-if="spawnPoints.length === 0" class="empty-hint">
            该战场没有预设出生点，请等待房主设置
          </p>
        </div>
        
        <!-- 棋子选择 -->
        <div class="config-block">
          <h3 class="config-title">
            <span class="config-icon">🤖</span>
            选择棋子
            <span class="count-badge">{{ selectedUnits.length }}/{{ MAX_UNITS }}</span>
          </h3>
          <div class="units-grid">
            <div 
              v-for="unit in myUnits" 
              :key="unit.id"
              class="unit-card"
              :class="{ 
                selected: selectedUnits.includes(unit.id),
                disabled: !selectedUnits.includes(unit.id) && selectedUnits.length >= MAX_UNITS
              }"
              @click="toggleUnit(unit.id)"
            >
              <div class="unit-image">
                <img v-if="unit.image" :src="unit.image" :alt="unit.name" />
                <div v-else class="unit-placeholder">
                  <Icon name="robot" size="32" />
                </div>
              </div>
              <div class="unit-info">
                <span class="unit-name">{{ unit.name }}</span>
                <span class="unit-type">{{ unit.type }}</span>
              </div>
              <div v-if="selectedUnits.includes(unit.id)" class="selected-mark">
                <Icon name="check" size="16" />
              </div>
            </div>
          </div>
          <p v-if="myUnits.length === 0" class="empty-hint">
            你还没有创建棋子，请先前往棋子编辑器创建
          </p>
        </div>
        
        <!-- 操作按钮 -->
        <div class="action-block">
          <button 
            @click="ready"
            class="ready-btn"
            :class="{ ready: isReady }"
            :disabled="!canReady || readying"
          >
            <span v-if="readying">准备中...</span>
            <span v-else-if="isReady">
              <Icon name="check" size="14" />
              已准备
            </span>
            <span v-else>准备就绪</span>
          </button>

          <!-- 房主开始按钮 -->
          <button
            v-if="isHost"
            @click="startBattle"
            class="start-btn"
            :disabled="!canStart || starting"
          >
            <span v-if="starting">开始中...</span>
            <span v-else>
              <Icon name="sword" size="14" />
              开始战斗
            </span>
          </button>
        </div>
        
        <!-- 准备状态提示 -->
        <div class="status-block">
          <div class="ready-status">
            <span class="ready-count">
              {{ readyCount }}/{{ roomState.players?.length || 1 }} 玩家已准备
            </span>
            <div class="ready-bar">
              <div 
                class="ready-progress" 
                :style="{ width: (readyCount / (roomState.players?.length || 1) * 100) + '%' }"
              ></div>
            </div>
          </div>
          <p v-if="!canReady && !isReady" class="hint-text">
            <span v-if="!selectedSpawn">请选择出生点</span>
            <span v-else-if="selectedUnits.length === 0">请至少选择一个棋子</span>
          </p>
        </div>
      </section>
      
      <!-- 未选择阵营时的提示 -->
      <section v-else class="no-faction-section">
        <div class="hint-box">
          <span class="hint-icon">👆</span>
          <p>请先选择一个阵营加入战斗</p>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUserStore } from '../stores/user';
import UIButton from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Tag from '@/components/ui/Tag.vue';
import CRTScanlines from '@/components/ui/CRTScanlines.vue';
import Icon from '@/components/ui/Icon.vue';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

// 常量
const MAX_UNITS = 4;
const POLL_INTERVAL = 3000; // 轮询间隔

// 从路由获取房间ID
const roomId = computed(() => route.params.roomId);

// 状态
const loading = ref(true);
const error = ref(null);
const readying = ref(false);
const starting = ref(false);

// 房间状态
const roomState = ref({
  room: null,
  battlefield: null,
  players: [],
  spawn_points: []
});

// 玩家选择
const myFaction = ref(null);
const selectedSpawn = ref(null);
const selectedUnits = ref([]);
const isReady = ref(false);
const myUnits = ref([]);

// AI设置相关
const showAISettings = ref(false);
const aiPlayers = ref([]);
const aiConfig = ref({
  faction: null,
  difficulty: 'normal',
  unit_ids: []
});
const aiFactions = ref([
  { id: 'earth', name: '地球联合', icon: '🌍' },
  { id: 'bylon', name: '拜隆帝国', icon: '🌙' },
  { id: 'maxion', name: '马克西翁', icon: '⭐' }
]);
const aiDifficulties = ref([
  { id: 'easy', name: '简单', description: '伤害-20%，承伤+20%' },
  { id: 'normal', name: '普通', description: '标准AI' },
  { id: 'hard', name: '困难', description: '伤害+10%，承伤-10%' }
]);

// 轮询定时器
let pollTimer = null;

// 计算属性：是否房主
const isHost = computed(() => {
  return roomState.value.room?.host_user_id === userStore.user?.id;
});

// 计算属性：是否可以准备
const canReady = computed(() => {
  return selectedSpawn.value && selectedUnits.value.length > 0;
});

// 计算属性：是否可以开始战斗
const canStart = computed(() => {
  if (!isHost.value) return false;
  const players = roomState.value?.players || [];
  // 所有玩家（包括AI）都准备好
  return players.every(p => p.is_ready || p.isReady);
});

// 计算属性：已准备玩家数（兼容后端返回 isReady 和前端期望 is_ready）
const readyCount = computed(() => {
  const players = roomState.value?.players || [];
  return players.filter(p => p.is_ready || p.isReady).length;
});

// 计算属性：出生点列表
const spawnPoints = computed(() => {
  return roomState.value.spawn_points || [];
});

// 计算属性：可用的AI阵营（排除已被玩家占用的）
const availableAIFactions = computed(() => {
  const takenFactions = roomState.value.players.map(p => p.faction);
  return aiFactions.value.filter(f => !takenFactions.includes(f.id));
});

// 检查阵营是否已被占用
function isFactionTaken(faction) {
  return roomState.value.players.some(p => p.faction === faction);
}

// 获取某阵营的玩家
function getPlayerByFaction(faction) {
  return roomState.value.players.find(p => p.faction === faction);
}

// 获取阵营图标
function getFactionIcon(faction) {
  const icons = {
    earth: '🌍',
    bylon: '🌙',
    maxion: '⭐'
  };
  return icons[faction] || '❓';
}

// 获取难度名称
function getDifficultyName(difficulty) {
  const names = {
    easy: '简单',
    normal: '普通',
    hard: '困难'
  };
  return names[difficulty] || difficulty;
}

// 格式化坐标
function formatCoord(q, r) {
  const colToLetter = (n) => {
    let result = '';
    while (n >= 0) {
      result = String.fromCharCode(65 + (n % 26)) + result;
      n = Math.floor(n / 26) - 1;
    }
    return result;
  };
  return `${colToLetter(q)}${r + 1}`;
}

// 加载房间信息
async function loadRoomInfo() {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/comm/rooms/${roomId.value}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await res.json();
    
    if (res.ok) {
      roomState.value = {
        room: data.room,
        battlefield: data.battlefield,
        players: data.players || [],
        spawn_points: data.spawn_points || []
      };
      
      // 更新AI玩家列表
      aiPlayers.value = data.players?.filter(p => p.is_ai) || [];
      
      // 找到自己的玩家信息
      const myPlayer = data.players?.find(p => p.user_id === userStore.user?.id);
      if (myPlayer) {
        myFaction.value = myPlayer.faction;
        isReady.value = myPlayer.is_ready;
        if (myPlayer.spawn_point) {
          selectedSpawn.value = JSON.parse(myPlayer.spawn_point);
        }
        if (myPlayer.unit_ids) {
          selectedUnits.value = JSON.parse(myPlayer.unit_ids);
        }
      }
      
      // 如果战斗已开始，跳转
      if (data.room?.status === 'fighting' && data.battle_id) {
        router.push(`/battle/${data.battle_id}`);
        return;
      }
      
      error.value = null;
    } else {
      error.value = data.error || '加载房间失败';
    }
  } catch (err) {
    console.error('加载房间信息失败:', err);
    error.value = '网络错误，请检查后端服务';
  } finally {
    loading.value = false;
  }
}

// 加载用户的棋子
async function loadMyUnits() {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/hangar/units', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await res.json();
    
    if (res.ok) {
      myUnits.value = data.units || [];
    }
  } catch (err) {
    console.error('加载棋子失败:', err);
  }
}

// 选择阵营
async function selectFaction(faction) {
  if (isFactionTaken(faction) && myFaction.value !== faction) return;
  if (isReady.value) return; // 已准备不能换阵营
  
  // 根据阵营确定座位号
  const factionToSeat = { 'earth': 1, 'bylon': 2, 'maxion': 3 };
  const seatNumber = factionToSeat[faction];
  
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/comm/rooms/${roomId.value}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ faction, seat_number: seatNumber })
    });
    
    const data = await res.json();
    
    if (res.ok) {
      myFaction.value = faction;
      // 清除之前的选择
      selectedSpawn.value = null;
      selectedUnits.value = [];
      await loadRoomInfo();
    } else {
      alert(data.error || '选择阵营失败');
    }
  } catch (err) {
    console.error('选择阵营失败:', err);
    alert('网络错误');
  }
}

// 添加AI玩家
async function addAIPlayer() {
  if (!aiConfig.value.faction) {
    alert('请选择AI阵营');
    return;
  }

  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/comm/rooms/${roomId.value}/ai`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        faction: aiConfig.value.faction,
        difficulty: aiConfig.value.difficulty,
        unit_ids: aiConfig.value.unit_ids
      })
    });

    const data = await res.json();

    if (res.ok) {
      // 重置表单
      aiConfig.value = { faction: null, difficulty: 'normal', unit_ids: [] };
      showAISettings.value = false;
      // 刷新房间信息
      await loadRoomInfo();
    } else {
      alert(data.error || '添加AI失败');
    }
  } catch (err) {
    console.error('添加AI失败:', err);
    alert('网络错误');
  }
}

// 移除AI玩家
async function removeAIPlayer(aiPlayerId) {
  if (!confirm('确定要移除这个AI玩家吗？')) return;

  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/comm/rooms/${roomId.value}/ai/${aiPlayerId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (res.ok) {
      await loadRoomInfo();
    } else {
      const data = await res.json();
      alert(data.error || '移除AI失败');
    }
  } catch (err) {
    console.error('移除AI失败:', err);
    alert('网络错误');
  }
}

// 选择出生点
function selectSpawn(point) {
  if (isReady.value) return;
  selectedSpawn.value = point;
}

// 切换棋子选择
function toggleUnit(unitId) {
  if (isReady.value) return;
  
  const index = selectedUnits.value.indexOf(unitId);
  if (index > -1) {
    selectedUnits.value.splice(index, 1);
  } else if (selectedUnits.value.length < MAX_UNITS) {
    selectedUnits.value.push(unitId);
  }
}

// 准备就绪
async function ready() {
  if (!canReady.value || readying.value) return;
  
  readying.value = true;
  
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/comm/rooms/${roomId.value}/ready`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        spawn_point: selectedSpawn.value,
        unit_ids: selectedUnits.value
      })
    });
    
    const data = await res.json();
    
    if (res.ok) {
      isReady.value = data.isReady;
      // 直接更新 players 列表（避免等待 loadRoomInfo）
      if (data.players) {
        roomState.value.players = data.players;
      }
      await loadRoomInfo();
    } else {
      alert(data.error || '准备失败');
    }
  } catch (err) {
    console.error('准备失败:', err);
    alert('网络错误');
  } finally {
    readying.value = false;
  }
}

// 开始战斗（房主）
async function startBattle() {
  if (!canStart.value || starting.value) return;
  
  starting.value = true;
  
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/comm/rooms/${roomId.value}/start`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await res.json();
    
    if (res.ok && data.battle_id) {
      // 传递房间ID和选中的单位到战斗页面
      router.push({
        path: `/battle/${data.battle_id}`,
        query: {
          roomId: roomId.value,
          fromPreparation: 'true'
        }
      });
    } else {
      alert(data.error || '开始战斗失败');
    }
  } catch (err) {
    console.error('开始战斗失败:', err);
    alert('网络错误');
  } finally {
    starting.value = false;
  }
}

// 离开房间
async function leaveRoom() {
  try {
    const token = localStorage.getItem('token');
    await fetch(`/api/comm/rooms/${roomId.value}/leave`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  } catch (err) {
    console.error('离开房间失败:', err);
  }
  
  router.push('/home');
}

// 轮询更新
function startPolling() {
  pollTimer = setInterval(() => {
    loadRoomInfo();
  }, POLL_INTERVAL);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// 初始化
onMounted(async () => {
  // 确保用户信息已加载（页面刷新后需要重新获取）
  if (!userStore.user) {
    await fetchCurrentUser();
  }
  loadRoomInfo();
  loadMyUnits();
  startPolling();
});

// 获取当前用户信息
async function fetchCurrentUser() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (res.ok) {
      const data = await res.json();
      userStore.setUser(data.user);
    }
  } catch (e) {
    console.error('获取用户信息失败:', e);
  }
}

onUnmounted(() => {
  stopPolling();
});
</script>

<style scoped>
@import '@/styles/variables.css';
@import '@/styles/utilities.css';

.preparation-room {
  min-height: 100vh;
  background: var(--surface);
  position: relative;
}

/* 头部 */
.room-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: #252545;
  border-bottom: 4px solid #444;
}

.header-left,
.header-right {
  flex: 0 0 auto;
}

.header-center {
  flex: 1;
  text-align: center;
}

.back-btn {
  background: #4a4a6a;
  border: 4px solid #666;
  color: #fff;
  padding: 8px 16px;
  font-size: 14px;
  cursor: pointer;
  font-family: 'Courier New', monospace;
  transition: all 0.2s;
}

.back-btn:hover {
  background: #5a5a7a;
}

.battlefield-name {
  margin: 0;
  font-size: 20px;
  color: #fff;
  font-family: 'Courier New', monospace;
}

.battlefield-size {
  margin: 4px 0 0;
  font-size: 13px;
  color: #888;
}

.room-id {
  background: #333;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  color: #888;
  font-family: 'Courier New', monospace;
}

/* 加载和错误状态 */
.loading-container,
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  gap: 16px;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 4px solid #333;
  border-top-color: #4a9eff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-container button {
  margin: 0 8px;
}

/* 主内容 */
.room-main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

.section-title {
  font-size: 18px;
  color: #4a9eff;
  margin: 0 0 16px;
  font-family: 'Courier New', monospace;
}

/* 阵营区域 */
.factions-section {
  margin-bottom: 32px;
}

.factions-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.faction-card {
  background: #252545;
  border: 4px solid #444;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}

.faction-card:hover:not(.disabled) {
  border-color: #4a9eff;
  transform: translateY(-2px);
}

.faction-card.selected {
  border-color: #4caf50;
  box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.3);
}

.faction-card.occupied {
  opacity: 0.7;
}

.faction-card.disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.faction-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: #1a1a2e;
  border-bottom: 2px solid #333;
}

.faction-icon {
  font-size: 28px;
}

.faction-name {
  flex: 1;
  margin: 0;
  font-size: 16px;
  color: #fff;
}

.status-badge {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: bold;
}

.status-badge.available {
  background: #2e7d32;
  color: #fff;
}

.status-badge.mine {
  background: #4caf50;
  color: #fff;
}

.status-badge.occupied {
  background: #666;
  color: #ccc;
}

.faction-body {
  padding: 20px;
  text-align: center;
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.my-faction .you-label {
  background: #4caf50;
  color: #fff;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: bold;
}

.occupied-by {
  display: flex;
  align-items: center;
  gap: 8px;
}

.player-name {
  font-size: 14px;
  color: #ccc;
}

.ready-mark {
  background: #4caf50;
  color: #fff;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.faction-desc {
  font-size: 13px;
  color: #888;
}

/* 配置区域 */
.config-section {
  background: #252545;
  border: 4px solid #444;
  border-radius: 8px;
  padding: 24px;
}

.config-block {
  margin-bottom: 32px;
}

.config-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  color: #fff;
  margin: 0 0 16px;
}

.config-icon {
  font-size: 20px;
}

.required-mark {
  color: #f44336;
}

.count-badge {
  background: #333;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  color: #888;
  margin-left: auto;
}

/* 出生点 */
.spawn-points-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

.spawn-point-card {
  background: #1a1a2e;
  border: 3px solid #444;
  border-radius: 6px;
  padding: 16px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.spawn-point-card:hover {
  border-color: #4a9eff;
}

.spawn-point-card.selected {
  border-color: #4caf50;
  background: rgba(76, 175, 80, 0.1);
}

.spawn-point-card.mothership {
  border-left-color: #2196f3;
}

.spawn-point-card.base {
  border-left-color: #4caf50;
}

.spawn-type-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.spawn-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.spawn-name {
  font-size: 14px;
  color: #fff;
  font-weight: bold;
}

.spawn-coord {
  font-size: 12px;
  color: #888;
  font-family: 'Courier New', monospace;
}

.spawn-faction {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 16px;
}

/* 棋子选择 */
.units-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}

.unit-card {
  background: #1a1a2e;
  border: 3px solid #444;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.unit-card:hover:not(.disabled) {
  border-color: #4a9eff;
}

.unit-card.selected {
  border-color: #4caf50;
  background: rgba(76, 175, 80, 0.1);
}

.unit-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.unit-image {
  height: 80px;
  background: #252545;
  display: flex;
  align-items: center;
  justify-content: center;
}

.unit-image img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.unit-placeholder {
  font-size: 36px;
}

.unit-info {
  padding: 10px;
  text-align: center;
}

.unit-name {
  display: block;
  font-size: 13px;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.unit-type {
  display: block;
  font-size: 11px;
  color: #888;
  margin-top: 4px;
}

.selected-mark {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  background: #4caf50;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 14px;
}

/* 操作按钮 */
.action-block {
  display: flex;
  gap: 16px;
  justify-content: center;
  margin-bottom: 24px;
}

.ready-btn,
.start-btn {
  padding: 16px 48px;
  font-size: 18px;
  font-weight: bold;
  border: 4px solid;
  cursor: pointer;
  font-family: 'Courier New', monospace;
  transition: all 0.2s;
}

.ready-btn {
  background: #4a4a6a;
  border-color: #666;
  color: #fff;
}

.ready-btn:hover:not(:disabled) {
  background: #5a5a7a;
}

.ready-btn.ready {
  background: #2e7d32;
  border-color: #4caf50;
}

.ready-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.start-btn {
  background: #c62828;
  border-color: #f44336;
  color: #fff;
}

.start-btn:hover:not(:disabled) {
  background: #d32f2f;
}

.start-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 状态区域 */
.status-block {
  text-align: center;
}

.ready-status {
  margin-bottom: 12px;
}

.ready-count {
  font-size: 14px;
  color: #888;
}

.ready-bar {
  width: 100%;
  max-width: 400px;
  height: 8px;
  background: #333;
  border-radius: 4px;
  margin: 8px auto 0;
  overflow: hidden;
}

.ready-progress {
  height: 100%;
  background: linear-gradient(90deg, #4caf50, #8bc34a);
  transition: width 0.3s;
}

.hint-text {
  color: #f44336;
  font-size: 13px;
}

/* 未选择阵营提示 */
.no-faction-section {
  background: #252545;
  border: 4px solid #444;
  border-radius: 8px;
  padding: 48px;
  text-align: center;
}

.hint-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.hint-icon {
  font-size: 48px;
}

.hint-box p {
  font-size: 16px;
  color: #888;
}

.empty-hint {
  text-align: center;
  color: #666;
  padding: 32px;
}

/* 按钮样式 */
.btn-primary {
  background: #2e7d32;
  border: 4px solid #4caf50;
  color: #fff;
  padding: 12px 24px;
  font-size: 14px;
  cursor: pointer;
  font-family: 'Courier New', monospace;
}

.btn-secondary {
  background: #4a4a6a;
  border: 4px solid #666;
  color: #fff;
  padding: 12px 24px;
  font-size: 14px;
  cursor: pointer;
  font-family: 'Courier New', monospace;
}

/* 响应式 */
@media (max-width: 900px) {
  .factions-grid {
    grid-template-columns: 1fr;
  }
  
  .action-block {
    flex-direction: column;
  }
  
  .ready-btn,
  .start-btn {
    width: 100%;
  }
}

/* AI设置面板 */
.ai-settings-section {
  margin-top: 32px;
  padding: 20px;
  background: #1e1e3f;
  border: 2px solid #3a3a5a;
  border-radius: 8px;
}

.ai-settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.ai-settings-header .section-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-icon {
  font-size: 20px;
}

.toggle-ai-btn {
  padding: 10px 20px;
  background: #4a9eff;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  transition: all 0.2s;
}

.toggle-ai-btn:hover {
  background: #3a8eef;
}

.ai-settings-form {
  background: #252545;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.ai-form-row {
  margin-bottom: 20px;
}

.ai-form-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-form-label {
  font-size: 14px;
  color: #aaa;
  font-weight: bold;
}

.ai-factions-grid {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.ai-faction-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 20px;
  background: #1a1a2e;
  border: 3px solid #444;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 100px;
}

.ai-faction-btn:hover {
  border-color: #4a9eff;
}

.ai-faction-btn.selected {
  border-color: #4caf50;
  background: rgba(76, 175, 80, 0.1);
}

.ai-faction-btn .faction-icon {
  font-size: 28px;
}

.ai-faction-btn .faction-name {
  font-size: 13px;
  color: #fff;
}

.ai-difficulty-grid {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.ai-difficulty-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 20px;
  background: #1a1a2e;
  border: 3px solid #444;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 120px;
}

.ai-difficulty-btn:hover {
  border-color: #4a9eff;
}

.ai-difficulty-btn.selected {
  border-color: #4caf50;
  background: rgba(76, 175, 80, 0.1);
}

.ai-difficulty-btn .diff-name {
  font-size: 15px;
  color: #fff;
  font-weight: bold;
}

.ai-difficulty-btn .diff-desc {
  font-size: 11px;
  color: #888;
}

.ai-units-hint {
  font-size: 13px;
  color: #888;
  padding: 10px;
  background: #1a1a2e;
  border-radius: 4px;
}

.ai-form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 20px;
}

.ai-confirm-btn {
  padding: 10px 24px;
  background: #4caf50;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  font-weight: bold;
  transition: all 0.2s;
}

.ai-confirm-btn:hover {
  background: #45a049;
}

.ai-cancel-btn {
  padding: 10px 24px;
  background: #555;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  transition: all 0.2s;
}

.ai-cancel-btn:hover {
  background: #666;
}

/* AI玩家列表 */
.ai-players-list {
  margin-top: 20px;
}

.ai-list-title {
  font-size: 14px;
  color: #aaa;
  margin-bottom: 12px;
  font-weight: bold;
}

.ai-player-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-player-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #1a1a2e;
  border: 2px solid #444;
  border-radius: 6px;
}

.ai-player-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ai-player-icon {
  font-size: 24px;
}

.ai-player-name {
  font-size: 15px;
  color: #fff;
  font-weight: bold;
}

.ai-player-diff {
  font-size: 12px;
  color: #888;
  padding: 2px 8px;
  background: #333;
  border-radius: 4px;
}

.ai-remove-btn {
  width: 28px;
  height: 28px;
  background: #d32f2f;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.ai-remove-btn:hover {
  background: #b71c1c;
}

@media (max-width: 600px) {
  .room-header {
    flex-direction: column;
    gap: 12px;
    text-align: center;
  }
  
  .header-center {
    order: -1;
  }
  
  .spawn-points-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .units-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
