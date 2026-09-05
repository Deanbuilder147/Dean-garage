<template>
  <div class="mobile-battle-container">
    <!-- 战场部署过场控制条（动画画在引擎 Canvas 上） -->
    <div v-if="deployAnimOn" style="position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9100;display:flex;gap:8px;">
      <button @click="replayDeployAnim(hexGrid)" style="font:13px/1 system-ui;color:#cfeaff;background:rgba(16,32,52,.9);border:1px solid rgba(54,197,240,.4);border-radius:8px;padding:9px 12px;cursor:pointer;">↺ 重播</button>
      <button @click="deployGhostOn = !deployGhostOn" :style="deployGhostOn ? 'font:13px/1 system-ui;color:#fff;background:rgba(16,32,52,.9);border:1px solid #36c5f0;border-radius:8px;padding:9px 12px;cursor:pointer;' : 'font:13px/1 system-ui;color:#cfeaff;background:rgba(16,32,52,.9);border:1px solid rgba(54,197,240,.4);border-radius:8px;padding:9px 12px;cursor:pointer;'">透视</button>
      <button @click="finishDeployAnim(hexGrid)" style="font:13px/1 system-ui;font-weight:600;color:#fff;background:linear-gradient(135deg,#1b6fb0,#36c5f0);border:none;border-radius:8px;padding:9px 12px;cursor:pointer;">开始战斗</button>
    </div>
    <!-- 顶部信息条 -->
    <div class="mb-topbar">
      <button class="mb-back" @click="goBack">‹ 返回</button>
      <div class="mb-turn">
        <span class="mb-phase">{{ turnInfo.phase === 'deploy' ? '部署' : '战斗' }}</span>
        <span class="mb-round">第 {{ turnInfo.round }} 轮 · 第 {{ turnInfo.turn }} 回合</span>
        <span class="mb-active" :class="{ mine: turnInfo.isMyTurn }">
          {{ turnInfo.isMyTurn ? '我方行动' : (turnInfo.activeFaction || '—') + ' 行动' }}
        </span>
      </div>
      <button class="mb-end" @click="endTurn" :disabled="!turnInfo.isMyTurn">结束回合</button>
    </div>

    <!-- 战场画布 -->
    <HexGridCanvasEngine
      ref="hexGrid"
      class="mobile-canvas"
      :grid-data="gridData"
      :draw-fn="drawBattleScene"
      :show-coords="false"
      :show-hover="true"
      :use-terrain-cache="false"
      :fit-all-on-mount="true"
      :iso-config="isoConfig"
      :extrude="false"
      :enable-touch="true"
      @cell-clicked="onHexClick"
    />

    <!-- 选中单位信息 + 行动栏 -->
    <transition name="mb-up">
      <div class="mb-actionbar" v-if="selectedUnit">
        <div class="mb-unitcard">
          <div class="mb-uc-name" :style="{ color: factionColor(selectedUnit.faction) }">{{ selectedUnit.name }}</div>
          <div class="mb-uc-hp">
            <div class="mb-hp-track"><div class="mb-hp-fill" :style="{ width: hpPct(selectedUnit) + '%', background: hpPct(selectedUnit) > 40 ? '#5be35b' : '#ff5a5a' }"></div></div>
            <span>{{ selectedUnit.hp }}/{{ selectedUnit.maxHp }}</span>
          </div>
          <div class="mb-uc-meta">移 {{ selectedUnit.moveRange || selectedUnit.mobility }} · 攻 {{ selectedUnit.attack }} · 防 {{ selectedUnit.defense }}</div>
        </div>
        <div class="mb-actions">
          <button class="mb-btn" :class="{ on: actionMode==='move' }" @click="enterMove" :disabled="!isMine(selectedUnit)">移动</button>
          <button class="mb-btn" :class="{ on: actionMode==='attack' }" @click="enterAttack" :disabled="!isMine(selectedUnit) || !attackSkills.length">攻击</button>
        </div>
      </div>
    </transition>

    <!-- 技能选择抽屉（攻击模式） -->
    <transition name="mb-up">
      <div class="mb-sheet" v-if="actionMode==='attack'">
        <div class="mb-sheet-title">选择技能攻击</div>
        <div class="mb-skill-list">
          <button
            v-for="sk in attackSkills"
            :key="sk.id || sk.key || sk.name"
            class="mb-skill"
            :class="{ on: selectedSkill && (selectedSkill.id||selectedSkill.key) === (sk.id||sk.key) }"
            @click="pickSkill(sk)"
          >{{ sk.name || sk.key }}<small v-if="sk.cast_range"> 射程{{ sk.cast_range }}</small></button>
        </div>
        <div class="mb-sheet-hint" v-if="selectedSkill">已选「{{ selectedSkill.name || selectedSkill.key }}」，点击敌方单位发动</div>
      </div>
    </transition>

    <!-- 提示条 -->
    <div class="mb-toast" v-if="toast">{{ toast }}</div>
  </div>
</template>

<script setup>
/**
 * MobileBattleView.vue — 移动端战斗界面（MVP，2026-08-20）
 * 复用：useBattleState（拉取+同步）、normalizeBattleState、drawBattleUnits、HexGridCanvasEngine。
 * 交互：点己方单位选中 → 底部【移动/攻击】；移动模式点格发起移动；攻击模式选技能后点敌方发起攻击。
 */
import { ref, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import HexGridCanvasEngine from '../components/HexGridCanvasEngine.vue'
import { ISO_DEFAULTS } from '../utils/hexUtils.js'
import { useBattleState } from '../battle/useBattleState.js'
import { drawBattleUnits } from '../battle/drawUnits.js'
import { useBattleDeploy } from '@/battle/useBattleDeploy.js'
import { combatAPI } from '../api/client.js'
import { isUnitDead } from '../battle/normalizeBattle.js'

const hexGrid = ref(null)
const route = useRoute()
const router = useRouter()
const battleId = route.params.id

const {
  battleState, allUnits, myFaction, turnInfo, loading, error, refresh,
} = useBattleState({ battleId, useSocket: true })

const isoConfig = computed(() => ({ ...ISO_DEFAULTS }))
const selectedUnit = ref(null)
const actionMode = ref('')          // '' | 'move' | 'attack'
const selectedSkill = ref(null)
const toast = ref('')
let toastTimer = null
function showToast(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2200)
}

// gridData 从战局 map 注水（与 PC 版同源逻辑）
const gridData = computed(() => {
  const map = battleState.value?.map
  const raw = map?.cells
  const w = map?.width ?? battleState.value?.width
  const h = map?.height ?? battleState.value?.height
  if (raw && Array.isArray(raw) && w && h) {
    return {
      width: Number(w), height: Number(h),
      cells: raw.map(c => ({ q: c.q, r: c.r, terrain: c.terrain || 'plain' })),
      topologyParam: { spacingH: 1.0, spacingV: 1.0, offsetFactor: 0.0 },
    }
  }
  // 兜底：按单位坐标推算最小尺寸
  const qs = allUnits.value.filter(u => u.q !== undefined).map(u => u.q)
  const rs = allUnits.value.filter(u => u.r !== undefined).map(u => u.r)
  const minW = qs.length ? Math.max(...qs) + 1 : 12
  const minH = rs.length ? Math.max(...rs) + 1 : 12
  return {
    width: minW, height: minH, cells: [],
    topologyParam: { spacingH: 1.0, spacingV: 1.0, offsetFactor: 0.0 },
  }
})

// 战场部署过场（画在引擎 Canvas 上，与 iso 地形像素级重合）
const {
  deploying: deployAnimOn,
  deployGhost: deployGhostOn,
  drawDeploy: drawDeployAnim,
  startDeploy: startDeployAnim,
  finishDeploy: finishDeployAnim,
  replayDeploy: replayDeployAnim,
  bindAutoStart: bindDeployAutoStart,
} = useBattleDeploy(gridData)
bindDeployAutoStart(hexGrid)

// 绘制：调用共享绘制函数
function drawBattleScene(ctx, opts) {
  if (deployAnimOn.value) { drawDeployAnim(ctx); return }
  drawBattleUnits(ctx, {
    units: allUnits.value,
    selectedId: selectedUnit.value?.id,
    highlightCells: highlightCells.value,
    gridData: gridData.value,
  })
}

// 高亮格（移动范围 / 攻击目标范围）
const highlightCells = computed(() => {
  const set = new Set()
  const u = selectedUnit.value
  if (!u || u.q === undefined) return set
  if (actionMode.value === 'move') {
    const range = u.moveRange || u.mobility || 0
    for (let dq = -range; dq <= range; dq++) {
      for (let dr = -range; dr <= range; dr++) {
        if (Math.abs(dq) + Math.abs(dr) + Math.abs(-dq - dr) <= range * 2) {
          set.add(`${u.q + dq},${u.r + dr}`)
        }
      }
    }
  } else if (actionMode.value === 'attack' && selectedSkill.value?.cast_range) {
    const range = Number(selectedSkill.value.cast_range) || 0
    for (let dq = -range; dq <= range; dq++) {
      for (let dr = -range; dr <= range; dr++) {
        if (Math.abs(dq) + Math.abs(dr) + Math.abs(-dq - dr) <= range * 2) {
          set.add(`${u.q + dq},${u.r + dr}`)
        }
      }
    }
  }
  return set
})

// 选中单位的攻击技能（用于攻击模式列表）
const attackSkills = computed(() => {
  const u = selectedUnit.value
  if (!u) return []
  const list = Array.isArray(u.skills) ? u.skills : []
  return list.filter(s => (s.attack_type || s.type || '').includes('attack') || s.cast_range != null || s.damage != null)
})

function factionColor(f) {
  return ({ earth: '#4a9eff', maxion: '#ff5a5a', balon: '#ffb74a' })[f] || '#9aa7b5'
}
function hpPct(u) {
  if (typeof u.hp !== 'number' || !u.maxHp) return 100
  return Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100))
}
function isMine(u) {
  return u && String(u.faction) === String(myFaction.value)
}
function unitAt(q, r) {
  return allUnits.value.find(u => u.q === q && u.r === r && !isUnitDead(u))
}

// 点击格子
function onHexClick({ q, r }) {
  const target = unitAt(q, r)
  if (actionMode.value === 'attack' && selectedUnit.value && selectedSkill.value) {
    if (target && !isMine(target)) { doAttack(target); return }
    showToast('请点击敌方单位')
    return
  }
  if (actionMode.value === 'move' && selectedUnit.value) {
    if (target && isMine(target)) { selectUnit(target); return }
    if (highlightCells.value.has(`${q},${r}`)) { doMove(q, r); return }
    showToast('请点击高亮格移动')
    return
  }
  // 普通点选
  if (target) { selectUnit(target); actionMode.value = ''; selectedSkill.value = null }
  else { selectedUnit.value = null; actionMode.value = ''; selectedSkill.value = null }
}

function selectUnit(u) {
  selectedUnit.value = u
  actionMode.value = ''
  selectedSkill.value = null
}
function enterMove() {
  if (!selectedUnit.value || !isMine(selectedUnit.value)) return
  actionMode.value = 'move'
  selectedSkill.value = null
}
function enterAttack() {
  if (!selectedUnit.value || !isMine(selectedUnit.value)) return
  if (!attackSkills.value.length) { showToast('该单位无可用技能'); return }
  actionMode.value = 'attack'
  selectedSkill.value = attackSkills.value[0]
}
function pickSkill(sk) { selectedSkill.value = sk }

async function doMove(q, r) {
  const u = selectedUnit.value
  if (!u) return
  try {
    await combatAPI.move(battleId, { unit_id: String(u.id), q, r })
    actionMode.value = ''
    showToast('移动成功')
    await refresh()
  } catch (e) {
    showToast('移动失败：' + (e?.response?.data?.error || e.message))
  }
}

async function doAttack(target) {
  const u = selectedUnit.value
  const sk = selectedSkill.value
  if (!u || !target || !sk) return
  try {
    const payload = {
      attacker_id: String(u.id),
      target_id: String(target.id),
      attack_type: 'skill',
      skill_id: sk.id ?? null,
      skill_key: sk.key ?? null,
      skill_name: sk.name ?? null,
    }
    await combatAPI.attack(battleId, payload)
    actionMode.value = ''
    selectedSkill.value = null
    showToast('攻击完成')
    await refresh()
  } catch (e) {
    showToast('攻击失败：' + (e?.response?.data?.error || e.message))
  }
}

async function endTurn() {
  try {
    await combatAPI.endTurn(battleId)
    actionMode.value = ''
    selectedUnit.value = null
    showToast('已结束回合')
    await refresh()
  } catch (e) {
    showToast('结束回合失败：' + (e?.response?.data?.error || e.message))
  }
}

function goBack() {
  router.back()
}

// 战局变化后，若选中单位已阵亡则清空
watch(allUnits, () => {
  if (selectedUnit.value && isUnitDead(selectedUnit.value)) {
    selectedUnit.value = null
    actionMode.value = ''
  }
}, { deep: true })
</script>

<style scoped>
.mobile-battle-container {
  position: fixed; inset: 0; background: #0a0f14; overflow: hidden;
  touch-action: none; overscroll-behavior: none; user-select: none; -webkit-user-select: none;
  color: #e6edf3; font-family: system-ui, sans-serif;
}
.mobile-canvas { width: 100%; height: 100%; display: block; touch-action: none; }

.mb-topbar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 20;
  display: flex; align-items: center; gap: 8px; padding: 10px 12px;
  background: rgba(8, 22, 44, 0.82); backdrop-filter: blur(6px);
  border-bottom: 1px solid rgba(74, 158, 255, 0.25);
}
.mb-back, .mb-end {
  background: rgba(74,158,255,0.15); color: #cfe3ff; border: 1px solid rgba(74,158,255,0.4);
  border-radius: 8px; padding: 6px 10px; font-size: 13px;
}
.mb-end:disabled { opacity: 0.4; }
.mb-turn { flex: 1; display: flex; flex-direction: column; line-height: 1.25; }
.mb-phase { font-size: 11px; color: #7fa8d8; }
.mb-round { font-size: 13px; }
.mb-active { font-size: 12px; color: #9aa7b5; }
.mb-active.mine { color: #5be35b; }

.mb-actionbar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
  background: rgba(8, 22, 44, 0.92); backdrop-filter: blur(8px);
  border-top: 1px solid rgba(74, 158, 255, 0.3); padding: 12px 14px 16px;
}
.mb-unitcard { margin-bottom: 10px; }
.mb-uc-name { font-size: 15px; font-weight: 600; }
.mb-uc-hp { display: flex; align-items: center; gap: 8px; margin: 4px 0; font-size: 12px; }
.mb-hp-track { flex: 1; height: 7px; background: rgba(255,255,255,0.12); border-radius: 4px; overflow: hidden; }
.mb-hp-fill { height: 100%; transition: width 0.25s; }
.mb-uc-meta { font-size: 11px; color: #9aa7b5; }
.mb-actions { display: flex; gap: 10px; }
.mb-btn {
  flex: 1; padding: 12px 0; border-radius: 10px; font-size: 15px; font-weight: 600;
  background: rgba(74,158,255,0.18); color: #cfe3ff; border: 1px solid rgba(74,158,255,0.4);
}
.mb-btn.on { background: #4a9eff; color: #06121f; }
.mb-btn:disabled { opacity: 0.35; }

.mb-sheet {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 25;
  background: rgba(8, 22, 44, 0.95); backdrop-filter: blur(8px);
  border-top: 1px solid rgba(74, 158, 255, 0.3); padding: 14px 14px 18px;
  max-height: 50vh; overflow-y: auto;
}
.mb-sheet-title { font-size: 13px; color: #7fa8d8; margin-bottom: 8px; }
.mb-skill-list { display: flex; flex-direction: column; gap: 8px; }
.mb-skill {
  text-align: left; padding: 12px 14px; border-radius: 10px; font-size: 15px;
  background: rgba(74,158,255,0.12); color: #e6edf3; border: 1px solid rgba(74,158,255,0.3);
}
.mb-skill.on { background: #4a9eff; color: #06121f; }
.mb-skill small { color: inherit; opacity: 0.7; }
.mb-sheet-hint { margin-top: 10px; font-size: 12px; color: #9aa7b5; }

.mb-toast {
  position: fixed; left: 50%; top: 64px; transform: translateX(-50%); z-index: 30;
  background: rgba(0,0,0,0.8); color: #fff; padding: 8px 16px; border-radius: 20px; font-size: 13px;
}

.mb-up-enter-active, .mb-up-leave-active { transition: transform 0.2s, opacity 0.2s; }
.mb-up-enter-from, .mb-up-leave-to { transform: translateY(100%); opacity: 0; }
</style>
