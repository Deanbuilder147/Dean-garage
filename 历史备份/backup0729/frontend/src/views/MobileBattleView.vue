<template>
  <div class="mobile-battle-container">
    <div class="mobile-placeholder">
      <div class="mobile-icon">&#9881;</div>
      <h2>移动端战场</h2>
      <p class="mobile-subtitle">Mobile Battlefield — 开发中</p>
      <p class="mobile-info">
        已检测到您正在使用移动设备访问。<br />
        PC 端完整战场（含 3D 等距透视、鼠标拾取、右侧行动栏）<br />
        已为您重定向至此独立移动端视图。
      </p>
      <div class="mobile-status">
        <span class="status-dot"></span>
        <span>Phase 13-A 设备分流已激活</span>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * MobileBattleView.vue — Phase 13-A
 * 移动端/平板独立战场容器
 *
 * 当前为空白占位视图，完全隔离于 PC 端 NewBattleView.vue。
 * 未来在此处实现触摸适配、简化布局、竖屏模式等移动端专属功能。
 *
 * 红线：严禁从此视图引用 NewBattleView 的任何组件或逻辑。
 */
import { useRoute } from 'vue-router';

const route = useRoute();
const battleId = route.params.id;

// 将来在此初始化移动端战斗逻辑
console.log('[MobileBattleView] 移动端战场已挂载, battleId:', battleId);
</script>

<style scoped>
.mobile-battle-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0a0f14;
  padding: 24px;
}

.mobile-placeholder {
  text-align: center;
  max-width: 360px;
}

.mobile-icon {
  font-size: 48px;
  color: #4a9eff;
  margin-bottom: 16px;
}

.mobile-placeholder h2 {
  color: #e0e8f0;
  font-size: 22px;
  margin: 0 0 8px 0;
  font-weight: 600;
}

.mobile-subtitle {
  color: #4a9eff;
  font-size: 14px;
  margin: 0 0 24px 0;
  letter-spacing: 1px;
}

.mobile-info {
  color: #6b7d8e;
  font-size: 13px;
  line-height: 1.8;
  margin: 0 0 32px 0;
}

.mobile-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border: 1px solid #1e2d3d;
  border-radius: 6px;
  background: rgba(74, 158, 255, 0.05);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4ade80;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.mobile-status span {
  color: #8ba4b8;
  font-size: 12px;
}
</style>
