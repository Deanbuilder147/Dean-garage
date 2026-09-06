<template>
  <div v-if="report" class="attack-report-overlay">
    <div class="attack-report-card">
      <div class="ar-header" :class="{ blocked: blocked }">
        <span class="ar-title">{{ blocked ? '⚠ 攻击被拦截' : '⚔ 战斗结算' }}</span>
        <button class="ar-confirm" @click="emit('close')">确认</button>
      </div>

      <div class="ar-body">
        <!-- 左：攻击方（右下视图） -->
        <div class="ar-unit ar-attacker">
          <div class="ar-unit-name">
            {{ attacker.name || '攻击方' }}
            <span v-if="attacker.size" class="ar-size-chip" :class="'size-' + sizeKey(attacker.size)">{{ sizeLabel(attacker.size) }}</span>
          </div>
          <div class="ar-unit-tag" :style="{ background: facInfo(attacker.faction).color }">
            {{ facInfo(attacker.faction).label }}
          </div>
          <div class="ar-sprite">
            <img v-if="viewUrl(attacker, 2, 0)" :src="viewUrl(attacker, 2, 0)" alt="攻击方右下视图" />
            <div v-else class="ar-sprite-ph">右下视图</div>
          </div>
          <div class="ar-hp">
            <div class="ar-hp-bar">
              <div class="ar-hp-fill" :style="{ width: hpPct(attacker) + '%', background: hpColor(hpPct(attacker)) }"></div>
            </div>
            <div class="ar-hp-text">HP {{ attacker.hp ?? 0 }} / {{ attacker.maxHp ?? 0 }}</div>
          </div>
        </div>

        <div class="ar-vs">{{ blocked ? '🚫' : 'VS' }}</div>

        <!-- 右：防御方（左下视图） -->
        <div class="ar-unit ar-defender">
          <div class="ar-unit-name">
            {{ target.name || '防御方' }}
            <span v-if="target.size" class="ar-size-chip" :class="'size-' + sizeKey(target.size)">{{ sizeLabel(target.size) }}</span>
          </div>
          <div class="ar-unit-tag" :style="{ background: facInfo(target.faction).color }">
            {{ facInfo(target.faction).label }}
          </div>
          <div class="ar-sprite">
            <img v-if="viewUrl(target, 3, 0)" :src="viewUrl(target, 3, 0)" alt="防御方左下视图" />
            <div v-else class="ar-sprite-ph">左下视图</div>
          </div>
          <div class="ar-hp">
            <div class="ar-hp-bar">
              <div class="ar-hp-fill" :style="{ width: hpPct(target) + '%', background: hpColor(hpPct(target)) }"></div>
            </div>
            <div class="ar-hp-text">HP {{ target.hp ?? 0 }} / {{ target.maxHp ?? 0 }}</div>
          </div>
        </div>
      </div>

      <!-- 体型克制横幅：防守方更大 → 绿（防御减伤）；攻击方更大 → 蓝（机动补偿） -->
      <div v-if="report.sizeBanner" class="ar-size-banner ar-size-def">
        🛡 体型克制：防守方体型更大（{{ sizeLabel(report.sizeBanner.defenderSize) }} ▷ {{ sizeLabel(report.sizeBanner.attackerSize) }}，{{ report.sizeBanner.reduction }} 档）→ 本击伤害 −{{ report.sizeBanner.reduction }}
      </div>

      <!-- 公式 / 拦截原因 -->
      <div class="ar-formula">
        <template v-if="blocked">
          <div class="ar-block-reason">{{ report.reason }}</div>
        </template>
        <template v-else>
          <div class="ar-formula-title">伤害计算公式</div>
          <div
            v-for="(step, i) in formula"
            :key="i"
            class="ar-step"
            :class="{ subtotal: step.isSubtotal, final: step.isFinal, counter: step.isCounter, warn: step.warn, 'size-def': step.isSizeDef, 'size-mob': step.isSizeMob }"
          >
            <div class="ar-step-label">{{ step.label }}</div>
            <div class="ar-step-value">
              <span v-if="step.value > 0 && !step.isFinal">+{{ step.value }}</span>
              <span v-else>{{ step.value }}</span>
            </div>
            <div v-if="step.desc" class="ar-step-desc">{{ step.desc }}</div>
          </div>
          <div class="ar-result">
            结算结果：
            <b v-if="dodged" class="ar-miss">被闪避，未造成伤害</b>
            <b v-else>对防御方造成 {{ finalDamage }} 点伤害</b>
          </div>
          <div v-if="report.sizeTactic" class="ar-size-banner ar-size-mob">
            💨 体型机动补偿：攻击方体型更大（{{ sizeLabel(report.sizeTactic.attackerSize) }} ▷ {{ sizeLabel(report.sizeTactic.defenderSize) }}，{{ report.sizeTactic.amount }} 档）→ 防守方下回合移动 +{{ report.sizeTactic.amount }}
          </div>
        </template>
        <div class="ar-footer">
          <button class="ar-confirm-btn" @click="emit('close')">确认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { normSize, SIZE_LABELS } from '@/utils/unitSize.js'

const props = defineProps({
  report: { type: Object, required: true },
})
const emit = defineEmits(['close'])

function sizeKey(s) { return normSize(s) }
function sizeLabel(s) { return SIZE_LABELS[normSize(s)] || 'M' }

const FACTION_MAP = {
  earth: { label: '地球', color: '#4caf50' },
  balon: { label: '拜隆', color: '#9c27b0' },
  mars: { label: '火星', color: '#f44336' },
  neutral: { label: '中立', color: '#ffb000' },
}
function facInfo(f) {
  return FACTION_MAP[f] || { label: f || '未知阵营', color: '#8892a0' }
}

const blocked = computed(() => !!props.report?.blocked)
const attacker = computed(() => props.report?.attacker || {})
const target = computed(() => props.report?.target || {})
const formula = computed(() => props.report?.formula || [])
const finalDamage = computed(() => props.report?.finalDamage ?? 0)
const dodged = computed(() => !!props.report?.dodged)

// 取指定方向视图；若缺失且传入 fallbackKey，则回退到该方向（如正面 key 0）
function viewUrl(unit, key, fallbackKey) {
  const v = unit?.viewUrls
  if (!v) return ''
  const primary = v[String(key)] || v[key] || ''
  if (primary) return primary
  if (fallbackKey != null) return v[String(fallbackKey)] || v[fallbackKey] || ''
  return ''
}
function hpPct(u) {
  const max = u?.maxHp || u?.hp || 1
  const hp = u?.hp ?? 0
  return Math.max(0, Math.min(100, (hp / max) * 100))
}
function hpColor(pct) {
  if (pct > 60) return '#4caf50'
  if (pct > 30) return '#ffb300'
  return '#f44336'
}
</script>

<style scoped>
.attack-report-overlay {
  position: fixed;
  inset: 0;
  background: rgba(6, 10, 20, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  backdrop-filter: blur(2px);
}
.attack-report-card {
  width: min(720px, 92vw);
  max-height: 90vh;
  overflow: auto;
  background: linear-gradient(160deg, #0e1730, #0a1226);
  border: 1px solid #2b3f6b;
  border-radius: 14px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.55);
  color: #e8eefc;
  font-family: 'Segoe UI', 'PingFang SC', sans-serif;
}
.ar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #21304f;
  background: linear-gradient(90deg, #16335c, #0e1d3a);
}
.ar-header.blocked {
  background: linear-gradient(90deg, #5c1f16, #3a140e);
}
.ar-title {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 1px;
}
.ar-confirm {
  background: transparent;
  border: 1px solid #2b3f6b;
  color: #cfe0ff;
  font-size: 14px;
  font-weight: 600;
  padding: 4px 14px;
  border-radius: 8px;
  cursor: pointer;
}
.ar-confirm:hover { background: #1b2d4f; color: #fff; }
.ar-footer {
  display: flex;
  justify-content: flex-end;
  padding: 10px 16px 16px;
}
.ar-confirm-btn {
  background: linear-gradient(90deg, #1f6feb, #2f9bff);
  border: none;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  padding: 8px 28px;
  border-radius: 10px;
  cursor: pointer;
}
.ar-confirm-btn:hover { filter: brightness(1.1); }
.ar-body {
  display: flex;
  align-items: stretch;
  gap: 8px;
  padding: 16px;
}
.ar-unit {
  flex: 1;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid #243454;
  border-radius: 10px;
  padding: 10px;
  text-align: center;
}
.ar-attacker { border-top: 3px solid #4caf50; }
.ar-defender { border-top: 3px solid #f44336; }
.ar-unit-name {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ar-unit-tag {
  display: inline-block;
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  color: #fff;
  margin-bottom: 8px;
}
.ar-sprite {
  height: 150px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 50% 60%, #1b2b4d, #0a1326);
  border-radius: 8px;
  overflow: hidden;
}
.ar-sprite img {
  max-height: 100%;
  max-width: 100%;
  object-fit: contain;
}
.ar-sprite-ph {
  color: #5e6e8f;
  font-size: 13px;
}
.ar-hp { margin-top: 10px; }
.ar-hp-bar {
  height: 10px;
  background: #1a2742;
  border-radius: 6px;
  overflow: hidden;
}
.ar-hp-fill { height: 100%; transition: width 0.3s; }
.ar-hp-text {
  font-size: 12px;
  margin-top: 4px;
  color: #c4d0e6;
}
.ar-vs {
  align-self: center;
  font-size: 20px;
  font-weight: 800;
  color: #ffce54;
}
.ar-formula {
  padding: 12px 16px 18px;
  border-top: 1px solid #21304f;
}
.ar-formula-title {
  font-size: 13px;
  color: #9fb0d0;
  margin-bottom: 8px;
  letter-spacing: 1px;
}
.ar-step {
  display: grid;
  grid-template-columns: 120px 60px 1fr;
  align-items: baseline;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px dashed #1c2a47;
}
.ar-step-label { color: #d4def0; font-size: 13px; }
.ar-step-value { font-weight: 700; color: #ffce54; text-align: right; }
.ar-step-desc { color: #8294b4; font-size: 12px; }
.ar-step.subtotal { background: rgba(255, 255, 255, 0.04); }
.ar-step.subtotal .ar-step-label { font-weight: 600; }
.ar-step.final {
  border-bottom: none;
  border-top: 2px solid #2b3f6b;
  margin-top: 4px;
  padding-top: 8px;
}
.ar-step.final .ar-step-label,
.ar-step.final .ar-step-value { color: #ff7a59; font-size: 15px; }
.ar-step.counter .ar-step-value { color: #59c2ff; }
.ar-step.warn .ar-step-value { color: #ff5252; }
.ar-result {
  margin-top: 10px;
  font-size: 14px;
  color: #e8eefc;
}
.ar-result b { color: #ff7a59; }
.ar-miss { color: #ff5252 !important; }
.ar-block-reason {
  background: rgba(255, 82, 82, 0.08);
  border: 1px solid #5c1f16;
  border-radius: 8px;
  padding: 12px 14px;
  color: #ffc9c0;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-line;
}

/* 体型 chip（与编辑器/战场一致） */
.ar-size-chip {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 20px; height: 18px; padding: 0 5px; margin-left: 6px;
  border-radius: 3px; font-weight: 700; font-size: 11px; color: #001018;
  vertical-align: middle;
}
.ar-size-chip.size-s { background: #4fd1ff; }
.ar-size-chip.size-m { background: #9aa7b0; }
.ar-size-chip.size-l { background: #ff9d3c; }
.ar-size-chip.size-xl { background: #ff5a5a; }

/* 体型克制双色横幅 */
.ar-size-banner {
  margin: 10px 0; padding: 8px 12px; border-radius: 6px; font-size: 13px;
  line-height: 1.5; font-weight: 600;
}
.ar-size-banner.ar-size-def {
  background: rgba(19, 255, 67, 0.12);
  border: 1px solid rgba(19, 255, 67, 0.5);
  color: #7dffa0;
}
.ar-size-banner.ar-size-mob {
  background: rgba(79, 209, 255, 0.12);
  border: 1px solid rgba(79, 209, 255, 0.5);
  color: #9fe3ff;
}

/* formula 步骤：体型减伤绿字 */
.ar-step.size-def .ar-step-value { color: #46f08a; }
.ar-step.size-def .ar-step-label { color: #9dffc0; }
</style>
