<template>
  <div :class="['tactical-card', cardClass]">
    <div v-if="$slots.header" class="tactical-card-header">
      <slot name="header"></slot>
    </div>
    <div v-if="$slots.default" class="tactical-card-body">
      <slot></slot>
    </div>
    <div v-if="$slots.footer" class="tactical-card-footer">
      <slot name="footer"></slot>
    </div>
  </div>
</template>

<script>
export default {
  name: 'Card',
  props: {
    variant: {
      type: String,
      default: 'default',
      validator: (value) => ['default', 'glass', 'elevated'].includes(value)
    },
    padding: {
      type: String,
      default: 'medium',
      validator: (value) => ['none', 'small', 'medium', 'large'].includes(value)
    }
  },
  computed: {
    cardClass() {
      return `tactical-card-${this.variant} tactical-card-padding-${this.padding}`;
    }
  }
}
</script>

<style scoped>
@import '@/styles/variables.css';

/* 基础卡片样式 - 使用色调层级代替边框 */
.tactical-card {
  background: var(--surface-container);
  color: var(--on-surface);
  border-radius: 0;
  overflow: hidden;
  position: relative;
  transition: all 0.2s steps(4);
  font-family: 'Space Grotesk', monospace, sans-serif;
}

/* 顶部色调层级边框 - 代替传统border */
.tactical-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--surface-container-high) 20%,
    var(--surface-container-highest) 50%,
    var(--surface-container-high) 80%,
    transparent 100%
  );
  opacity: 0.6;
  z-index: 1;
}

/* 底部色调层级边框 */
.tactical-card::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--surface-container-high) 20%,
    var(--surface-container-highest) 50%,
    var(--surface-container-high) 80%,
    transparent 100%
  );
  opacity: 0.4;
  z-index: 1;
}

/* 卡片头部 */
.tactical-card-header {
  background: linear-gradient(
    180deg,
    var(--surface-container-highest) 0%,
    var(--surface-container) 100%
  );
  padding: 16px 20px;
  border-bottom: 1px solid var(--surface-container-high);
  position: relative;
  z-index: 2;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 16px;
  color: var(--on-surface);
}

/* 卡片主体 */
.tactical-card-body {
  padding: 20px;
  position: relative;
  z-index: 2;
}

/* 卡片底部 */
.tactical-card-footer {
  padding: 16px 20px;
  margin-top: 16px;
  background: linear-gradient(
    180deg,
    var(--surface-container) 0%,
    var(--surface-container-high) 100%
  );
  border-top: 1px solid var(--surface-container-high);
  position: relative;
  z-index: 2;
}

/* 悬停效果 - 使用背景色shift代替边框变化 */
.tactical-card:hover {
  background: var(--surface-container-highest);
  transform: translateY(-2px);
}

.tactical-card:hover::before {
  opacity: 1;
}

/* 金属边缘效果 - 倒斜面 */
.tactical-card-elevated {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    inset 0 -1px 0 rgba(0, 0, 0, 0.1),
    0 4px 12px rgba(0, 0, 0, 0.4);
}

/* 玻璃效果 */
.tactical-card-glass {
  background: rgba(32, 38, 47, 0.8);
  backdrop-filter: blur(12px);
  border: none;
}

.tactical-card-glass::before {
  opacity: 0.3;
}

.tactical-card-glass::after {
  opacity: 0.2;
}

/* 内边距变体 */
.tactical-card-padding-none {
  padding: 0;
}

.tactical-card-padding-small {
  padding: 12px;
}

.tactical-card-padding-medium {
  padding: 16px;
}

.tactical-card-padding-large {
  padding: 24px;
}

/* 确保body padding正确应用 */
.tactical-card-padding-small .tactical-card-body {
  padding: 12px;
}

.tactical-card-padding-medium .tactical-card-body {
  padding: 20px;
}

.tactical-card-padding-large .tactical-card-body {
  padding: 24px;
}
</style>
