<template>
  <div class="reaction-overlay" @click.self="$emit('cancel')">
    <div class="reaction-panel duel">
      <div class="reaction-icon">⚔️</div>
      <div class="reaction-title">决斗邀请</div>
      <div class="reaction-body">
        <p>
          <b class="a">{{ attackerName }}</b>
          <span class="vs">挑战</span>
          <b class="d">{{ defenderName }}</b>
        </p>
        <p class="muted">
          双方掷 1d6 比大小，败者承受致命惩罚（替代普通攻击）。<br />
          是否发起决斗？
        </p>
      </div>
      <div class="reaction-actions">
        <button class="reaction-btn confirm" @click="$emit('confirm')">发起决斗</button>
        <button class="reaction-btn cancel" @click="$emit('cancel')">普通攻击</button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  attackerName: { type: String, default: '攻击者' },
  defenderName: { type: String, default: '守方' }
})
defineEmits(['confirm', 'cancel'])
</script>

<style scoped>
.reaction-overlay {
  position: fixed; inset: 0; z-index: 9998;
  background: rgba(0, 0, 0, 0.72);
  display: flex; align-items: center; justify-content: center;
}
.reaction-panel {
  min-width: 340px; max-width: 460px; padding: 22px 26px;
  background: linear-gradient(160deg, #141a1f, #0a0d10);
  border: 1px solid #2a5a6a; border-radius: 12px;
  box-shadow: 0 0 28px rgba(60, 180, 220, 0.3);
  text-align: center; color: #e6f0f5;
  font-family: 'Fira Code', monospace;
}
.reaction-icon { font-size: 46px; line-height: 1; margin-bottom: 6px; }
.reaction-title { font-size: 18px; font-weight: bold; letter-spacing: 2px; color: #4dd0e1; }
.duel .reaction-title { text-shadow: 0 0 12px rgba(80, 200, 240, 0.6); }
.reaction-body { margin: 14px 0; font-size: 14px; line-height: 1.6; }
.muted { color: #8aa0aa; font-size: 12px; }
.a { color: #4dd0e1; }
.d { color: #ff8a80; }
.vs { color: #b0b8bc; margin: 0 10px; font-style: italic; }
.reaction-actions { margin-top: 16px; display: flex; gap: 12px; justify-content: center; }
.reaction-btn {
  padding: 8px 18px; border-radius: 8px; cursor: pointer;
  border: 1px solid #2a5a6a; background: #0e1a20; color: #e6f0f5;
  font-family: inherit; font-size: 14px; transition: all 0.15s;
}
.reaction-btn.confirm { background: #0277bd; border-color: #29b6f6; }
.reaction-btn.confirm:hover { background: #29b6f6; }
.reaction-btn.cancel { background: #37474f; border-color: #546e7a; }
.reaction-btn.cancel:hover { background: #546e7a; }
</style>
