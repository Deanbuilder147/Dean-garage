<template>
  <span :class="['tactical-label', variantClass, sizeClass]">
    <slot></slot>
  </span>
</template>

<script>
export default {
  name: 'Tag',
  props: {
    variant: {
      type: String,
      default: 'default',
      validator: (value) => ['default', 'blue', 'green', 'red', 'yellow'].includes(value)
    },
    size: {
      type: String,
      default: 'medium',
      validator: (value) => ['small', 'medium'].includes(value)
    }
  },
  computed: {
    variantClass() {
      return `tactical-label-${this.variant}`;
    },
    sizeClass() {
      return `tactical-label-${this.size}`;
    }
  }
}
</script>

<style scoped>
@import '@/styles/variables.css';

/* 基础标签样式 - 全大写Monospace */
.tactical-label {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  font-family: 'Space Grotesk', monospace, sans-serif;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 0;
  background: var(--surface-container);
  color: var(--on-surface-variant);
  transition: all 0.2s steps(4);
  position: relative;
}

/* 使用色调层级代替边框 */
.tactical-label::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.05) 0%,
    transparent 50%,
    rgba(0, 0, 0, 0.05) 100%
  );
  pointer-events: none;
  z-index: 1;
}

/* 默认标签 */
.tactical-label-default {
  background: var(--surface-container);
  color: var(--on-surface-variant);
}

/* 蓝色标签 */
.tactical-label-blue {
  background: rgba(79, 172, 254, 0.15);
  color: #4facfe;
}

.tactical-label-blue:hover {
  background: rgba(79, 172, 254, 0.25);
  box-shadow: 0 0 10px rgba(79, 172, 254, 0.3);
}

/* 绿色标签 */
.tactical-label-green {
  background: rgba(0, 242, 96, 0.15);
  color: var(--primary);
}

.tactical-label-green:hover {
  background: rgba(0, 242, 96, 0.25);
  box-shadow: 0 0 10px rgba(0, 242, 96, 0.3);
}

/* 红色标签 */
.tactical-label-red {
  background: rgba(255, 115, 81, 0.15);
  color: var(--error);
}

.tactical-label-red:hover {
  background: rgba(255, 115, 81, 0.25);
  box-shadow: 0 0 10px rgba(255, 115, 81, 0.3);
}

/* 黄色标签 */
.tactical-label-yellow {
  background: rgba(247, 215, 148, 0.15);
  color: #f7d794;
}

.tactical-label-yellow:hover {
  background: rgba(247, 215, 148, 0.25);
  box-shadow: 0 0 10px rgba(247, 215, 148, 0.3);
}

/* 尺寸变体 */
.tactical-label-small {
  padding: 2px 8px;
  font-size: 10px;
}

.tactical-label-medium {
  padding: 4px 12px;
  font-size: 11px;
}

/* 阵营徽章（用于BattleView） */
.tactical-label-faction-earth {
  background: rgba(25, 118, 210, 0.15);
  color: #1976d2;
}

.tactical-label-faction-balon {
  background: rgba(211, 47, 47, 0.15);
  color: #d32f2f;
}

.tactical-label-faction-maxion {
  background: rgba(123, 31, 162, 0.15);
  color: #7b1fa2;
}
</style>
