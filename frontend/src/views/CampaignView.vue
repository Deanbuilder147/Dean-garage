<template>
  <!-- 剧情战役页面 - Phase 15 单机沙盒教学关卡 -->
  <div class="min-h-screen bg-cyan-950 dark:bg-slate-950 text-cyan-200">

    <!-- ============================================================ -->
    <!-- 模式 1: 战役选择列表 -->
    <!-- ============================================================ -->
    <div v-if="!inBattle" class="max-w-4xl mx-auto px-6 py-12">
      <!-- 标题 -->
      <header class="mb-12 relative">
        <div class="absolute -left-4 top-0 w-1 h-full bg-amber-500"></div>
        <h1 class="text-4xl font-black text-amber-500 uppercase tracking-[0.1em] mb-2 font-['Space_Grotesk']">
          [ CAMPAIGN_MODE ]
        </h1>
        <p class="text-cyan-400/60 font-mono text-xs">剧情战役 — 单机教学沙盒 · Phase 17 AI 战术引擎</p>
      </header>

      <!-- 加载中 -->
      <div v-if="loading" class="text-center py-20">
        <div class="animate-pulse text-amber-500 text-xl font-mono">INITIALIZING SYSTEM...</div>
      </div>

      <!-- 错误 -->
      <div v-else-if="error" class="bg-red-900/30 border border-red-500/50 p-6 mb-8">
        <p class="text-red-400 font-mono text-sm">{{ error }}</p>
        <button @click="loadCampaigns" class="mt-4 px-4 py-2 bg-amber-500 text-slate-950 text-xs font-bold">
          RETRY
        </button>
      </div>

      <!-- 战役卡片列表 -->
      <div v-else>
        <div v-for="campaign in campaigns" :key="campaign.id"
          class="group relative bg-surface-container-low border-l-4 border-amber-500/50 p-6 mb-6 hover:bg-cyan-900/30 transition-colors cursor-crosshair"
          @click="selectCampaign(campaign)">
          <div class="absolute top-4 right-4 text-[10px] text-outline font-mono opacity-40">
            CH-{{ campaign.chapter }}
          </div>
          <div class="flex justify-between items-start">
            <div class="space-y-3">
              <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-amber-500 text-4xl" data-icon="school">school</span>
                <div>
                  <h2 class="text-xl font-bold text-on-surface tracking-tighter">{{ campaign.name }}</h2>
                  <p class="text-cyan-400/60 font-mono text-[10px]">{{ campaign.chapter_name }}</p>
                </div>
              </div>
              <p class="text-on-surface-variant text-sm leading-relaxed max-w-lg">{{ campaign.description }}</p>
              <div class="flex items-center gap-4 text-[10px] font-mono">
                <span class="text-amber-500/80">
                  <span class="material-symbols-outlined text-xs align-middle" data-icon="layers">layers</span>
                  {{ campaign.stage_count }} 阶段
                </span>
                <span class="text-cyan-400/60 uppercase">
                  {{ campaign.difficulty === 'tutorial' ? '教学' : campaign.difficulty }}
                </span>
              </div>
            </div>
          </div>
          <div class="flex items-end justify-between mt-4">
            <div class="flex gap-1">
              <div v-for="i in campaign.stage_count" :key="i"
                :class="i <= campaign.stage_count ? 'bg-secondary-container' : 'bg-surface-container-highest'"
                class="w-4 h-1"></div>
            </div>
            <button class="text-xs font-bold text-amber-500 flex items-center gap-2 group-hover:translate-x-2 transition-transform uppercase">
              DEPLOY <span class="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>
          <div class="scanline"></div>
        </div>

        <!-- 暂无战役 -->
        <div v-if="campaigns.length === 0" class="text-center py-20 text-cyan-400/40 font-mono">
          <span class="material-symbols-outlined text-5xl block mb-4" data-icon="folder_off">folder_off</span>
          NO CAMPAIGNS AVAILABLE
        </div>

        <!-- 返回按钮 -->
        <div class="mt-8 text-center">
          <button @click="goHome"
            class="text-cyan-400/60 hover:text-amber-500 font-mono text-xs transition-colors flex items-center gap-2 mx-auto">
            <span class="material-symbols-outlined text-sm">arrow_back</span> RETURN TO COMMAND CENTER
          </button>
        </div>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- 模式 2: 战役战斗界面 -->
    <!-- ============================================================ -->
    <div v-else class="flex flex-col h-screen">
      <!-- 顶部信息栏 -->
      <header class="flex items-center justify-between px-6 py-2 bg-cyan-950/95 border-b border-amber-500/20 z-50">
        <div class="flex items-center gap-4">
          <button @click="exitBattle"
            class="text-cyan-400/60 hover:text-amber-500 text-xs font-mono flex items-center gap-1 transition-colors">
            <span class="material-symbols-outlined text-sm">arrow_back</span> EXIT
          </button>
          <span class="text-amber-500 font-bold text-sm tracking-wider font-['Space_Grotesk']">
            {{ currentCampaign?.name || 'CAMPAIGN' }}
          </span>
        </div>
        <div class="flex items-center gap-4 text-[10px] font-mono">
          <span class="text-cyan-400/60">回合 {{ battleState?.currentTurn || 1 }}</span>
          <span class="text-amber-500/60">阶段 {{ campaignProgress?.currentStageIndex + 1 }}/{{ campaignProgress?.totalStages }}</span>
          <span class="text-green-400">SANDBOX MODE</span>
        </div>
      </header>

      <!-- 阶段叙述面板 -->
      <div v-if="currentStage" class="bg-cyan-900/40 border-b border-amber-500/10 px-6 py-3">
        <div class="flex items-start gap-3">
          <span class="material-symbols-outlined text-amber-500 mt-0.5" data-icon="campaign">campaign</span>
          <div class="flex-1">
            <p class="text-amber-400/90 text-sm font-mono leading-relaxed">{{ currentStage.narrative }}</p>
            <p v-if="currentStage.hint" class="text-cyan-400/60 text-xs font-mono mt-1 italic">
              {{ currentStage.hint }}
            </p>
          </div>
          <div class="flex flex-col items-end gap-1 text-[10px] font-mono text-cyan-400/40">
            <span>STAGE {{ currentStage.order }}</span>
            <span>{{ currentStage.name }}</span>
          </div>
        </div>
      </div>

      <!-- 阶段完成消息 -->
      <div v-if="stageCompleteMessage" class="bg-green-900/30 border border-green-500/30 px-6 py-3 animate-pulse">
        <div class="flex items-center gap-3">
          <span class="material-symbols-outlined text-green-400" data-icon="check_circle">check_circle</span>
          <p class="text-green-300/90 text-sm font-mono">{{ stageCompleteMessage }}</p>
          <button @click="stageCompleteMessage = ''" class="ml-auto text-green-400/60 hover:text-green-300 text-xs">
            <span class="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      </div>

      <!-- 主内容区 -->
      <div class="flex-1 flex overflow-hidden">
        <!-- 左侧：战场棋盘 -->
        <div class="flex-1 p-4 overflow-auto relative">
          <div class="bg-slate-900/50 border border-cyan-800/20 rounded min-h-full p-4">
            <!-- 简易战场网格视图 -->
            <div class="text-xs font-mono text-cyan-400/40 mb-2">BATTLEFIELD: {{ battleState?.width }}x{{ battleState?.height }}</div>

            <!-- 网格渲染 -->
            <div v-if="battleState && battleState.cells" class="overflow-auto">
              <table class="border-collapse mx-auto">
                <tbody>
                  <tr v-for="r in battleState.height" :key="r">
                    <td v-for="q in battleState.width" :key="q"
                      :class="getCellClasses(q - 1, r - 1)"
                      :style="getCellStyle(q - 1, r - 1)"
                      @click="handleCellClick(q - 1, r - 1)"
                      class="w-10 h-10 border border-cyan-900/10 text-center text-[8px] font-mono cursor-crosshair transition-colors hover:border-amber-500/50 relative">
                      <!-- 单位图标 -->
                      <span v-if="getUnitAt(q - 1, r - 1)" class="relative z-10">
                        {{ getUnitAt(q - 1, r - 1).faction === 'earth' ? '⬡' : '⬠' }}
                      </span>
                      <!-- 坐标标签 -->
                      <span class="absolute bottom-0 right-1 text-[6px] text-cyan-400/20">
                        {{ q - 1 }},{{ r - 1 }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="text-center py-20 text-cyan-400/30 font-mono text-sm">
              LOADING BATTLEFIELD...
            </div>
          </div>
        </div>

        <!-- 右侧：单位信息面板 -->
        <div class="w-80 bg-cyan-950/80 border-l border-cyan-800/30 p-4 overflow-y-auto flex flex-col gap-4">
          <!-- 玩家单位 -->
          <div>
            <h3 class="text-[10px] font-mono text-amber-500/60 uppercase mb-2 tracking-wider">YOUR UNITS</h3>
            <div v-for="unit in playerUnits" :key="unit.id"
              :class="['p-3 mb-2 border cursor-pointer transition-colors', selectedUnitId === unit.id ? 'border-amber-500 bg-amber-500/10' : 'border-cyan-800/20 bg-cyan-900/20 hover:border-cyan-500/30']"
              @click="selectUnit(unit)">
              <div class="flex justify-between items-start">
                <div>
                  <p class="text-sm font-bold text-cyan-200">{{ unit.name }}</p>
                  <p class="text-[10px] text-cyan-400/40 font-mono">Lv.{{ unit.level }} · ({{ unit.q }},{{ unit.r }})</p>
                </div>
                <span :class="unit.hp > 0 ? 'text-green-400' : 'text-red-400'" class="text-xs font-mono">
                  HP {{ unit.hp }}/{{ unit.max_hp }}
                </span>
              </div>
              <!-- HP 条 -->
              <div class="mt-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                <div class="h-full bg-green-500 transition-all"
                  :style="{ width: Math.max(0, (unit.hp / unit.max_hp * 100)) + '%' }"></div>
              </div>
              <div class="flex gap-3 mt-2 text-[9px] font-mono text-cyan-400/50">
                <span>ATK {{ unit.attack || unit.melee }}</span>
                <span>DEF {{ unit.defense }}</span>
                <span>MOB {{ unit.mobility }}</span>
              </div>
              <!-- 技能列表 -->
              <div v-if="unit.skills && unit.skills.length" class="flex flex-wrap gap-1 mt-1">
                <span v-for="sk in unit.skills" :key="sk.id"
                  class="text-[8px] px-1 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400/80 rounded">
                  {{ sk.name || sk.type }}
                </span>
              </div>
              <!-- 行动状态 -->
              <div class="mt-1 text-[8px] font-mono">
                <span v-if="unit.has_moved" class="text-cyan-400/40">[MOVED]</span>
                <span v-if="unit.has_acted" class="text-cyan-400/40 ml-1">[ACTED]</span>
                <span v-if="!unit.has_moved && !unit.has_acted" class="text-green-400/60">[READY]</span>
              </div>
            </div>
          </div>

          <!-- 敌方单位 -->
          <div>
            <h3 class="text-[10px] font-mono text-red-500/60 uppercase mb-2 tracking-wider">ENEMY UNITS</h3>
            <div v-for="unit in enemyUnits" :key="unit.id"
              :class="['p-3 mb-2 border cursor-pointer transition-colors', selectedTargetId === unit.id ? 'border-red-500 bg-red-500/10' : 'border-cyan-800/20 bg-cyan-900/10 hover:border-red-500/30']"
              @click="selectTarget(unit)">
              <div class="flex justify-between items-start">
                <div>
                  <p class="text-sm font-bold text-red-300">{{ unit.name }}</p>
                  <p class="text-[10px] text-cyan-400/40 font-mono">Lv.{{ unit.level }} · ({{ unit.q }},{{ unit.r }})</p>
                </div>
                <span :class="unit.hp > 0 ? 'text-red-400' : 'text-green-400'" class="text-xs font-mono">
                  HP {{ unit.hp }}/{{ unit.max_hp }}
                </span>
              </div>
              <div class="mt-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                <div class="h-full bg-red-500 transition-all"
                  :style="{ width: Math.max(0, (unit.hp / unit.max_hp * 100)) + '%' }"></div>
              </div>
              <!-- 装备信息 (DKM 展示) -->
              <div v-if="unit.equipment" class="mt-1 text-[8px] font-mono text-cyan-400/40">
                <span v-if="unit.equipment.full_armor" class="mr-1">🛡️{{ unit.equipment.full_armor.name }}</span>
                <span v-if="unit.equipment.right_hand" class="mr-1">⚔️{{ unit.equipment.right_hand.name }}</span>
              </div>
              <!-- 技能 -->
              <div v-if="unit.skills && unit.skills.length" class="flex flex-wrap gap-1 mt-1">
                <span v-for="sk in unit.skills" :key="sk.id"
                  class="text-[8px] px-1 py-0.5 bg-red-500/10 border border-red-500/20 text-red-400/80 rounded">
                  {{ sk.name || sk.type }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部操作栏 -->
      <footer class="flex items-center justify-between px-6 py-3 bg-cyan-950/95 border-t border-amber-500/20">
        <div class="flex items-center gap-3">
          <button @click="executeMove"
            :disabled="!selectedUnitId || !selectedTargetPos"
            class="px-4 py-2 bg-cyan-800/40 border border-cyan-600/30 text-cyan-300 text-xs font-mono hover:bg-cyan-700/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            MOVE
          </button>
          <button @click="executeAttack"
            :disabled="!selectedUnitId || !selectedTargetId"
            class="px-4 py-2 bg-amber-600/30 border border-amber-500/40 text-amber-300 text-xs font-mono hover:bg-amber-600/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            ATTACK
          </button>
          <button @click="executeEndTurn"
            class="px-4 py-2 bg-cyan-800/40 border border-cyan-600/30 text-cyan-300 text-xs font-mono hover:bg-cyan-700/40 transition-colors">
            END TURN
          </button>
        </div>
        <div class="flex items-center gap-4 text-[9px] font-mono">
          <span v-if="selectedUnitId" class="text-cyan-400/60">
            SELECTED: {{ getUnitName(selectedUnitId) }}
          </span>
          <span v-if="selectedTargetId" class="text-red-400/60">
            TARGET: {{ getUnitName(selectedTargetId) }}
          </span>
          <span v-if="lastActionResult" class="text-amber-400/80 max-w-xs truncate">
            {{ lastActionResult }}
          </span>
        </div>
      </footer>

      <!-- 胜利/失败弹窗 -->
      <div v-if="showVictory" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80">
        <div class="bg-cyan-950 border-2 border-amber-500 p-10 max-w-lg text-center">
          <span class="material-symbols-outlined text-6xl text-amber-500 mb-4 block" data-icon="military_tech">military_tech</span>
          <h2 class="text-2xl font-black text-amber-500 mb-4 font-['Space_Grotesk']">MISSION COMPLETE</h2>
          <p class="text-cyan-300/80 text-sm mb-6">教学关卡全部完成！你已掌握核心战术。</p>
          <div v-if="campaignRewards" class="mb-6 text-left font-mono text-xs text-cyan-400/70 space-y-1">
            <p>💰 奖励: {{ campaignRewards.credits }} 信用点</p>
            <p>⭐ 经验: {{ campaignRewards.xp }} XP</p>
            <p v-if="campaignRewards.unlock_chapter">🔓 解锁: 第{{ campaignRewards.unlock_chapter }}章</p>
          </div>
          <button @click="exitBattle" class="px-8 py-3 bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400 transition-colors">
            RETURN TO BASE
          </button>
        </div>
      </div>

      <div v-if="showDefeat" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80">
        <div class="bg-cyan-950 border-2 border-red-500/50 p-10 max-w-lg text-center">
          <span class="material-symbols-outlined text-6xl text-red-400 mb-4 block" data-icon="skull">skull</span>
          <h2 class="text-2xl font-black text-red-400 mb-4 font-['Space_Grotesk']">UNIT DESTROYED</h2>
          <p class="text-cyan-300/80 text-sm mb-6">你的单位已被击毁。请重新挑战。</p>
          <button @click="restartCampaign" class="px-8 py-3 bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400 transition-colors">
            RETRY
          </button>
          <button @click="exitBattle" class="px-8 py-3 ml-4 bg-transparent border border-cyan-600/30 text-cyan-400/60 font-bold text-sm hover:bg-cyan-900/30 transition-colors">
            RETURN TO BASE
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
// ============================================================
// Phase 17 WebSocket 隔离锁：战役沙盒 100% REST API 闭环
// 严禁引入 socketService / WebSocket / Socket.io
// 所有战斗操作 (Move/Attack/EndTurn) 仅走 REST 端点
// 违规红线：任何 joinRoom / join_battle 调用将导致白屏
// ============================================================
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

// ============================================================
// 状态
// ============================================================

const loading = ref(true)
const error = ref(null)
const campaigns = ref([])
const inBattle = ref(false)
const currentCampaign = ref(null)
const currentCampaignId = ref(null)
const battleState = ref(null)
const campaignProgress = ref({ currentStageIndex: 0, totalStages: 0 })
const currentStage = ref(null)
const stageCompleteMessage = ref('')
const selectedUnitId = ref(null)
const selectedTargetId = ref(null)
const selectedTargetPos = ref(null) // { q, r }
const lastActionResult = ref('')
const showVictory = ref(false)
const showDefeat = ref(false)
const campaignRewards = ref(null)

// ============================================================
// 计算属性
// ============================================================

const playerUnits = computed(() => {
    if (!battleState.value || !battleState.value.units) return []
    return battleState.value.units.filter(u => u.faction === 'earth' && u.hp > 0)
})

const enemyUnits = computed(() => {
    if (!battleState.value || !battleState.value.units) return []
    return battleState.value.units.filter(u => u.faction !== 'earth')
})

// ============================================================
// API 调用 (100% REST，严禁 WebSocket)
// ============================================================

const API_BASE = import.meta.env.VITE_COMBAT_API || 'http://localhost:3004/api'

function getToken() {
    return localStorage.getItem('token') || ''
}

async function apiCall(path, options = {}) {
    const url = `${API_BASE}${path}`
    const res = await fetch(url, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`
        },
        ...options
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(err.error || `HTTP ${res.status}`)
    }
    return res.json()
}

// ============================================================
// 战役列表加载
// ============================================================

async function loadCampaigns() {
    loading.value = true
    error.value = null
    try {
        const data = await apiCall('/campaign/list')
        campaigns.value = data.campaigns || []
    } catch (e) {
        error.value = `加载战役失败: ${e.message}`
        console.error('[Campaign] 加载列表失败:', e)
    } finally {
        loading.value = false
    }
}

// ============================================================
// 战役选择与启动
// ============================================================

async function selectCampaign(campaign) {
    currentCampaignId.value = campaign.id

    // 获取战役详情（获取阶段剧本）
    try {
        const data = await apiCall(`/campaign/${campaign.id}`)
        currentCampaign.value = data.campaign
    } catch (e) {
        error.value = `获取战役详情失败: ${e.message}`
        return
    }

    // 为教学关卡使用预设玩家单位（实际使用时应从格纳库获取）
    const playerUnits = [
        {
            id: 'tutorial_player_alpha',
            name: '试作型·破城锤',
            faction: 'earth',
            hp: 120,
            max_hp: 120,
            attack: 14,
            melee: 14,
            ranged: 8,
            defense: 10,
            mobility: 6,
            weaponType: 'kinetic',
            armorType: 'normal',
            shield: 0,
            level: 5,
            equipment: {
                right_hand: {
                    name: '爆裂战锤',
                    weaponType: 'kinetic',
                    damage_kind: 'explosive',
                    attack_bonus: 3,
                    durability: 8
                },
                left_hand: {
                    name: '战术盾牌',
                    armorType: 'normal',
                    defense_bonus: 3,
                    durability: 6
                }
            },
            skills: [
                { id: 'skill_focused_fire', type: 'focused_fire', active: true, name: '专注射击' },
                { id: 'skill_block', type: 'block', active: true, name: '格挡' }
            ]
        }
    ]

    // 启动关卡
    try {
        const result = await apiCall(`/campaign/${campaign.id}/start`, {
            method: 'POST',
            body: JSON.stringify({ playerUnits })
        })

        if (!result.success) {
            error.value = result.error || '启动关卡失败'
            return
        }

        campaignProgress.value = {
            currentStageIndex: result.campaignState.currentStageIndex || 0,
            totalStages: result.campaignState.stageCount || 0
        }

        currentStage.value = result.campaignState.currentStage || null
        inBattle.value = true

        // 加载战场状态
        await refreshBattleState()
    } catch (e) {
        error.value = `启动关卡失败: ${e.message}`
        console.error('[Campaign] 启动失败:', e)
    }
}

// ============================================================
// 战场状态刷新
// ============================================================

async function refreshBattleState() {
    if (!currentCampaignId.value) return
    try {
        const data = await apiCall(`/campaign/${currentCampaignId.value}/state`)
        if (data.success) {
            battleState.value = data.battleState
            if (data.campaign) {
                campaignProgress.value = {
                    currentStageIndex: data.campaign.currentStageIndex,
                    totalStages: currentCampaign.value?.stages?.length || 0
                }
                currentStage.value = data.campaign.currentStage
            }
        }
    } catch (e) {
        console.error('[Campaign] 刷新状态失败:', e)
    }
}

// ============================================================
// 战斗操作
// ============================================================

function selectUnit(unit) {
    selectedUnitId.value = unit.id
    selectedTargetPos.value = null
}

function selectTarget(unit) {
    selectedTargetId.value = unit.id
    selectedTargetPos.value = { q: unit.q, r: unit.r }
}

function handleCellClick(q, r) {
    // 点击格子：如果有选中单位，设置目标位置
    if (selectedUnitId.value) {
        selectedTargetPos.value = { q, r }
        // 检查该格子是否有敌方单位
        const enemy = enemyUnits.value.find(u => u.q === q && u.r === r)
        if (enemy) {
            selectedTargetId.value = enemy.id
        }
    }
}

function getUnitAt(q, r) {
    if (!battleState.value || !battleState.value.units) return null
    return battleState.value.units.find(u => u.q === q && u.r === r)
}

function getUnitName(id) {
    if (!battleState.value || !battleState.value.units) return id
    const unit = battleState.value.units.find(u => u.id === id || u.unit_id === id)
    return unit ? unit.name : id
}

function getTerrainAt(q, r) {
    if (!battleState.value || !battleState.value.cells) return null
    const cell = battleState.value.cells.find(c => c.q === q && c.r === r)
    return cell ? cell.terrain : 'moon'
}

const TERRAIN_COLORS = {
    moon: '#1a1a2e',
    plain: '#2d4a1e',
    mountain: '#4a3728',
    water: '#1a3a5c',
    forest: '#1a3a1a',
    ruins: '#3a3a3a',
    rubble: '#5a4a3a',
    city_building: '#6a4a1a',
    fortress: '#3a3a5a',
    crystal: '#3a2a6a'
}

const TERRAIN_LABELS = {
    city_building: '🏢',
    water: '🌊',
    rubble: '🧱',
    mountain: '⛰️',
    forest: '🌲',
    plain: '·',
    moon: '·',
    ruins: '🗿',
    fortress: '🏰',
    crystal: '💎'
}

function getCellStyle(q, r) {
    const terrain = getTerrainAt(q, r)
    const color = TERRAIN_COLORS[terrain] || '#1a1a2e'
    return { backgroundColor: color }
}

function getCellClasses(q, r) {
    const unit = getUnitAt(q, r)
    const isSelected = selectedTargetPos.value && selectedTargetPos.value.q === q && selectedTargetPos.value.r === r
    const classes = []
    if (isSelected) classes.push('ring-2 ring-amber-500')
    if (unit && unit.faction === 'earth') classes.push('bg-blue-900/30')
    if (unit && unit.faction !== 'earth') classes.push('bg-red-900/30')
    return classes
}

async function executeMove() {
    if (!selectedUnitId.value || !selectedTargetPos.value) return

    try {
        const result = await apiCall(`/campaign/${currentCampaignId.value}/move`, {
            method: 'POST',
            body: JSON.stringify({
                unit_id: selectedUnitId.value,
                q: selectedTargetPos.value.q,
                r: selectedTargetPos.value.r
            })
        })

        if (result.success) {
            lastActionResult.value = `${getUnitName(selectedUnitId.value)} → (${selectedTargetPos.value.q},${selectedTargetPos.value.r})`
        } else {
            lastActionResult.value = `移动失败: ${result.error}`
        }

        selectedTargetPos.value = null
        await refreshBattleState()
    } catch (e) {
        lastActionResult.value = `移动错误: ${e.message}`
    }
}

async function executeAttack() {
    if (!selectedUnitId.value || !selectedTargetId.value) return

    try {
        const result = await apiCall(`/campaign/${currentCampaignId.value}/attack`, {
            method: 'POST',
            body: JSON.stringify({
                attacker_id: selectedUnitId.value,
                defender_id: selectedTargetId.value,
                attack_type: 'melee'
            })
        })

        if (result.success) {
            const dmg = result.final_damage || (result.damage_pipe?.final_damage) || 0
            lastActionResult.value = `攻击造成 ${dmg} 伤害`

            // 检查地形破坏
            if (result.terrainResult) {
                lastActionResult.value += ` | ${result.terrainResult.message}`
                stageCompleteMessage.value = result.terrainResult.message
            }

            // 检查阶段推进
            if (result.campaignProgress) {
                if (result.campaignProgress.stageChanged) {
                    if (result.campaignProgress.completed) {
                        if (result.campaignProgress.victory) {
                            showVictory.value = true
                            campaignRewards.value = currentCampaign.value?.rewards
                        }
                    } else {
                        // 阶段推进
                        if (result.campaignProgress.onCompleteMessage) {
                            stageCompleteMessage.value = result.campaignProgress.onCompleteMessage
                        }
                        campaignProgress.value.currentStageIndex = result.campaignProgress.currentStageIndex
                    }
                }
            }
        } else {
            lastActionResult.value = `攻击失败: ${result.error}`
        }

        selectedTargetId.value = null
        await refreshBattleState()

        // 更新当前阶段
        if (currentCampaign.value && campaignProgress.value.currentStageIndex < (currentCampaign.value.stages?.length || 0)) {
            currentStage.value = currentCampaign.value.stages[campaignProgress.value.currentStageIndex]
        }
    } catch (e) {
        lastActionResult.value = `攻击错误: ${e.message}`
    }
}

async function executeEndTurn() {
    try {
        const result = await apiCall(`/campaign/${currentCampaignId.value}/end-turn`, {
            method: 'POST'
        })

        if (result.success) {
            lastActionResult.value = `回合 ${result.turn || '?'} 结束`

            // 显示 AI 行动摘要
            if (result.aiTurn?.actions?.length > 0) {
                const summary = result.aiTurn.actions.map(a =>
                    a.action === 'attack' || a.action === 'attack_after_move'
                        ? `[AI] ${a.unit} → ${a.target}: ${a.damage}伤害`
                        : a.action === 'move'
                        ? `[AI] ${a.unit} 移动到 (${a.toQ},${a.toR})`
                        : `[AI] ${a.detail}`
                ).join(' | ')
                if (summary) lastActionResult.value += ' ' + summary
            }

            if (result.campaignProgress) {
                if (result.campaignProgress.stageChanged) {
                    if (result.campaignProgress.completed) {
                        if (result.campaignProgress.victory) {
                            showVictory.value = true
                            campaignRewards.value = currentCampaign.value?.rewards
                        }
                    } else if (result.campaignProgress.onCompleteMessage) {
                        stageCompleteMessage.value = result.campaignProgress.onCompleteMessage
                    }
                    campaignProgress.value.currentStageIndex = result.campaignProgress.currentStageIndex
                }
            }
        }

        await refreshBattleState()

        // 更新当前阶段
        if (currentCampaign.value && campaignProgress.value.currentStageIndex < (currentCampaign.value.stages?.length || 0)) {
            currentStage.value = currentCampaign.value.stages[campaignProgress.value.currentStageIndex]
        }

        // 检查失败条件
        if (playerUnits.value.length === 0) {
            showDefeat.value = true
        }
    } catch (e) {
        lastActionResult.value = `结束回合错误: ${e.message}`
    }
}

// ============================================================
// 退出与清理
// ============================================================

async function exitBattle() {
    try {
        await apiCall(`/campaign/${currentCampaignId.value}/cleanup`, { method: 'POST' })
    } catch (e) {
        console.warn('[Campaign] 清理失败:', e.message)
    }
    resetBattle()
    await loadCampaigns()
}

function resetBattle() {
    inBattle.value = false
    battleState.value = null
    currentCampaignId.value = null
    selectedUnitId.value = null
    selectedTargetId.value = null
    selectedTargetPos.value = null
    lastActionResult.value = ''
    stageCompleteMessage.value = ''
    showVictory.value = false
    showDefeat.value = false
    campaignRewards.value = null
    currentStage.value = null
}

async function restartCampaign() {
    showDefeat.value = false
    try {
        await apiCall(`/campaign/${currentCampaignId.value}/cleanup`, { method: 'POST' })
    } catch (e) { /* ignore */ }
    // 重新选择当前战役
    const campaign = currentCampaign.value
    if (campaign && campaigns.value.find(c => c.id === campaign.id)) {
        resetBattle()
        await selectCampaign({ id: campaign.id, ...campaign })
    }
}

function goHome() {
    router.push('/home')
}

// ============================================================
// 生命周期
// ============================================================

onMounted(() => {
    loadCampaigns()
})
</script>

<style scoped>
.scanline {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(255, 176, 0, 0.02) 2px,
        rgba(255, 176, 0, 0.02) 4px
    );
    pointer-events: none;
}

.bg-surface-container-low {
    background-color: rgba(8, 51, 68, 0.3);
}

.text-on-surface {
    color: #e0f0ff;
}

.text-on-surface-variant {
    color: #8ab4d0;
}

.text-outline {
    color: #4a7a9a;
}
</style>
