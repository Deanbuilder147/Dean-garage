<template>
  <div :class="['data-field', { 'data-field-compact': compact }]">
    <div v-if="label" class="data-label">{{ label }}</div>
    <div class="data-value" :style="{ color: valueColor }">
      <slot>{{ formattedValue }}</slot>
    </div>
    <div v-if="$slots.suffix" class="data-suffix">
      <slot name="suffix"></slot>
    </div>
  </div>
</template>

<script>
export default {
  name: 'DataField',
  props: {
    label: {
      type: String,
      default: ''
    },
    value: {
      type: [String, Number],
      default: ''
    },
    valueColor: {
      type: String,
      default: 'var(--text-primary)'
    },
    compact: {
      type: Boolean,
      default: false
    },
    format: {
      type: Function,
      default: null
    }
  },
  computed: {
    formattedValue() {
      if (this.format) {
        return this.format(this.value);
      }
      return this.value;
    }
  }
}
</script>

<style scoped>
.data-field-compact {
  padding: 8px 12px;
}

.data-field-compact .data-label {
  font-size: 10px;
  margin-bottom: 2px;
}

.data-field-compact .data-value {
  font-size: 18px;
}

.data-suffix {
  margin-left: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
}
</style>
