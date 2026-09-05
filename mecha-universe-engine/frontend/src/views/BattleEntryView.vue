<template>
  <div class="battle-entry">
    <div class="be-card">
      <h1 class="be-title">选择战斗视角</h1>
      <p class="be-sub">请手动选择进入方式（不再自动判断设备）</p>
      <div class="be-options">
        <button class="be-opt be-pc" @click="enter('pc')">
          <span class="be-icon">🖥️</span>
          <span class="be-label">电脑版</span>
          <span class="be-desc">完整多面板操作界面</span>
        </button>
        <button class="be-opt be-mobile" @click="enter('mobile')">
          <span class="be-icon">📱</span>
          <span class="be-label">手机版</span>
          <span class="be-desc">触屏简化操作界面</span>
        </button>
      </div>
      <button class="be-cancel" @click="goHome">取消</button>
    </div>
  </div>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const battleId = route.params.id

function enter(device) {
  if (!battleId) { router.replace('/home'); return }
  router.replace(device === 'mobile' ? `/battle-mobile/${battleId}` : `/battle-pc/${battleId}`)
}
function goHome() { router.replace('/home') }
</script>

<style scoped>
.battle-entry {
  position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle at 50% 30%, #11243f, #060b12);
  color: #e6edf3; font-family: system-ui, sans-serif; padding: 24px;
}
.be-card {
  width: 100%; max-width: 420px; background: rgba(10, 22, 38, 0.9);
  border: 1px solid rgba(74, 158, 255, 0.3); border-radius: 16px; padding: 28px 24px;
  text-align: center;
}
.be-title { margin: 0 0 4px; font-size: 22px; }
.be-sub { margin: 0 0 24px; font-size: 13px; color: #9aa7b5; }
.be-options { display: flex; flex-direction: column; gap: 14px; }
.be-opt {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 20px; border-radius: 14px; cursor: pointer; font-size: 16px;
  border: 1px solid rgba(74, 158, 255, 0.4); transition: transform 0.12s, background 0.12s;
}
.be-opt:active { transform: scale(0.97); }
.be-pc { background: rgba(74, 158, 255, 0.14); }
.be-mobile { background: rgba(91, 227, 91, 0.14); border-color: rgba(91, 227, 91, 0.4); }
.be-icon { font-size: 34px; }
.be-label { font-weight: 700; font-size: 18px; }
.be-desc { font-size: 12px; color: #9aa7b5; }
.be-cancel {
  margin-top: 20px; background: transparent; color: #9aa7b5; border: none;
  font-size: 13px; text-decoration: underline; cursor: pointer;
}
</style>
