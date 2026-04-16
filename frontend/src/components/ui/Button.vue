<template>
  <button
    :class="['tactical-btn', variantClass, sizeClass, { 'btn-disabled': disabled, 'btn-block': block }]"
    :disabled="disabled"
    @click="$emit('click')"
  >
    <slot></slot>
  </button>
</template>

<script>
export default {
  name: 'Button',
  props: {
    variant: {
      type: String,
      default: 'primary',
      validator: (value) => ['primary', 'secondary', 'tertiary', 'danger'].includes(value)
    },
    size: {
      type: String,
      default: 'medium',
      validator: (value) => ['small', 'medium', 'large'].includes(value)
    },
    disabled: {
      type: Boolean,
      default: false
    },
    block: {
      type: Boolean,
      default: false
    }
  },
  computed: {
    variantClass() {
      return `tactical-btn-${this.variant}`;
    },
    sizeClass() {
      return `tactical-btn-${this.size}`;
    }
  },
  emits: ['click']
}
</script>

<style scoped>
@import '@/styles/variables.css';

/* 基础按钮样式 */
.tactical-btn {
  background: var(--primary);
  color: var(--on-primary);
  padding: 16px 32px;
  font-family: 'Space Grotesk', monospace, sans-serif;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 14px;
  border: none;
  border-radius: 0;
  cursor: pointer;
  position: relative;
  transition: all 0.2s steps(4);
  /* Stepped corner using clip-path */
  clip-path: polygon(
    0 2px,
    2px 2px,
    2px 0,
    calc(100% - 2px) 0,
    calc(100% - 2px) 2px,
    100% 2px,
    100% calc(100% - 2px),
    calc(100% - 2px) calc(100% - 2px),
    calc(100% - 2px) 100%,
    2px 100%,
    2px calc(100% - 2px),
    0 calc(100% - 2px)
  );
  background-size: 100% 100%;
}

/* 使用色调层级代替边框 - 通过伪元素实现 */
.tactical-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.1) 0%,
    transparent 50%,
    rgba(0, 0, 0, 0.1) 100%
  );
  pointer-events: none;
  z-index: 1;
}

/* 悬停效果 - flicker animation */
.tactical-btn:hover {
  animation: flicker 0.5s steps(4) infinite;
  transform: scale(1.02);
}

/* 点击效果 - jitter */
.tactical-btn:active {
  animation: jitter 0.1s steps(4);
  transform: scale(0.98);
}

/* 禁用状态 */
.tactical-btn:disabled,
.btn-disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
  background: var(--surface-container-low);
  color: var(--outline);
}

/* 主按钮（Primary）- 绿色渐变 */
.tactical-btn-primary {
  background: linear-gradient(180deg, var(--primary) 0%, var(--primary-container) 100%);
  color: var(--on-primary);
}

.tactical-btn-primary::before {
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.15) 0%,
    transparent 50%,
    rgba(0, 0, 0, 0.05) 100%
  );
}

.tactical-btn-primary:hover {
  box-shadow: 0 0 20px rgba(0, 255, 65, 0.3);
}

/* 次要按钮（Secondary）- Ghost Border */
.tactical-btn-secondary {
  background: transparent;
  color: var(--secondary);
  border: 1px solid rgba(255, 110, 129, 0.2);
}

.tactical-btn-secondary::before {
  background: rgba(255, 110, 129, 0.1);
}

.tactical-btn-secondary:hover {
  background: rgba(255, 110, 129, 0.1);
  border-color: var(--secondary);
  box-shadow: 0 0 20px rgba(255, 110, 129, 0.3);
}

/* 信息按钮（Tertiary）- 文字样式 */
.tactical-btn-tertiary {
  background: transparent;
  color: var(--tertiary);
  padding: 8px 16px;
}

.tactical-btn-tertiary::before {
  display: none;
}

.tactical-btn-tertiary:hover {
  background: rgba(129, 236, 255, 0.1);
}

/* 危险按钮（Danger）- 红色 */
.tactical-btn-danger {
  background: var(--error);
  color: var(--on-error);
}

.tactical-btn-danger::before {
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.15) 0%,
    transparent 50%,
    rgba(0, 0, 0, 0.05) 100%
  );
}

.tactical-btn-danger:hover {
  box-shadow: 0 0 20px rgba(255, 115, 81, 0.3);
}

/* 尺寸变体 */
.tactical-btn-small {
  padding: 8px 16px;
  font-size: 12px;
}

.tactical-btn-medium {
  padding: 12px 24px;
  font-size: 14px;
}

.tactical-btn-large {
  padding: 16px 32px;
  font-size: 16px;
}

/* 块级按钮 */
.tactical-btn-block,
.btn-block {
  width: 100%;
  display: flex;
  justify-content: center;
}

/* 动画定义 */
@keyframes flicker {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.95; }
  75% { opacity: 0.9; }
}

@keyframes jitter {
  0%, 100% { transform: translate(0, 0); }
  25% { transform: translate(1px, -1px); }
  50% { transform: translate(-1px, 1px); }
  75% { transform: translate(1px, 1px); }
}
</style>
