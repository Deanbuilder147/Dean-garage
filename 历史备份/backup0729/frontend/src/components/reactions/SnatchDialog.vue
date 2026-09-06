<template>
  <div class="reaction-overlay" @click.self="$emit('resolve', false)">
    <div class="reaction-panel snatch">
      <div class="reaction-icon">🫳</div>
      <div class="reaction-title">抢夺触发</div>
      <div class="reaction-body">
        <p>
          <b class="a">{{ data.attackerName }}</b> 对
          <b class="d">{{ data.targetName }}</b> 造成
          <span class="dmg">{{ data.damage }}</span> 伤害，
          超过其最佳武器攻击值
          <span class="atk">{{ data.bestWeaponAttack }}</span>！
        </p>
        <p class="muted">
          接受抢夺：本次伤害减半，并夺取目标主手武器
          「{{ data.targetWeapon || '未知' }}」。<br />
          拒绝：维持全额伤害，不夺取武器。
        </p>
      </div>
      <div class="reaction-actions">
        <button class="reaction-btn accept" @click="$emit('resolve', true)">抢夺</button>
        <button class="reaction-btn cancel" @click="$emit('resolve', false)">放弃</button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  data: { type: Object, default: () => ({}) }
})
defineEmits(['resolve'])
</script>

<style scoped>
.reaction-overlay {
  position: fixed; inset: 0; z-index: 9998;
  background: rgba(0, 0, 0, 0.72);
  display: flex; align-items: center; justify-content: center;
}
.reaction-panel {
  min-width: 360px; max-width: 480px; padding: 22px 26px;
  background: linear-gradient(160deg, #1a160a, #0d0b06);
  border: 1px solid #6a5a2a; border-radius: 12px;
  box-shadow: 0 0 28px rgba(220, 180, 60, 0.3);
  text-align: center; color: #f5efe0;
  font-family: 'Fira Code', monospace;
}
.reaction-icon { font-size: 46px; line-height: 1; margin-bottom: 6px; }
.reaction-title { font-size: 18px; font-weight: bold; letter-spacing: 2px; color: #ffd166; }
.snatch .reaction-title { text-shadow: 0 0 12px rgba(255, 210, 100, 0.6); }
.reaction-body { margin: 14px 0; font-size: 14px; line-height: 1.6; }
.muted { color: #aaa088; font-size: 12px; }
.a { color: #ffd166; }
.d { color: #ff8a80; }
.dmg { color: #ff5252; font-weight: bold; }
.atk { color: #4dd0e1; font-weight: bold; }
.reaction-actions { margin-top: 16px; display: flex; gap: 12px; justify-content: center; }
.reaction-btn {
  padding: 8px 18px; border-radius: 8px; cursor: pointer;
  border: 1px solid #6a5a2a; background: #1a160a; color: #f5efe0;
  font-family: inherit; font-size: 14px; transition: all 0.15s;
}
.reaction-btn.accept { background: #b7892b; border-color: #ffd166; }
.reaction-btn.accept:hover { background: #ffd166; color: #1a160a; }
.reaction-btn.cancel { background: #37474f; border-color: #546e7a; }
.reaction-btn.cancel:hover { background: #546e7a; }
</style>
