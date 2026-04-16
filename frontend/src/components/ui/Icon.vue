<template>
  <component :is="iconComponent" :class="iconClasses" />
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  name: {
    type: String,
    required: true
  },
  size: {
    type: String,
    default: '24',
    validator: (value) => ['16', '20', '24', '32', '48', '64'].includes(value)
  },
  variant: {
    type: String,
    default: 'default',
    validator: (value) => ['default', 'primary', 'secondary', 'tertiary', 'success', 'warning', 'error'].includes(value)
  }
});

const iconClasses = computed(() => [
  'icon',
  `icon-${props.size}`,
  `icon-${props.variant}`
]);

const icons = {
  // 战斗相关
  sword: {
    viewBox: '0 0 24 24',
    path: 'M14.5 17.5L3 6V3h3l11.5 11.5-3 3zm-5-5l1.5-1.5L8.5 9 7 10.5 9.5 13zm8.5-8.5c0-.83-.67-1.5-1.5-1.5S15 3.17 15 4s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5zM19 9l-3-3-2 2 3 3 2-2z'
  },
  shield: {
    viewBox: '0 0 24 24',
    path: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z'
  },
  attack: {
    viewBox: '0 0 24 24',
    path: 'M3 3l2.5 2.5L12 8.5l4-4-6-1.5L3 3zm5.5 9.5L12 16l6 1.5 2.5-2.5-6.5-2.5-5.5-2.5zM12 18l-1.5 4 3 3 3-3-1.5-4H12z'
  },

  // 导航相关
  home: {
    viewBox: '0 0 24 24',
    path: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z'
  },
  arrowLeft: {
    viewBox: '0 0 24 24',
    path: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z'
  },

  // 功能相关
  palette: {
    viewBox: '0 0 24 24',
    path: 'M12 3a9 9 0 000 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z'
  },
  box: {
    viewBox: '0 0 24 24',
    path: 'M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18-.21 0-.41-.06-.57-.18l-7.9-4.44A.991.991 0 013 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44A.99.99 0 0112 2c.21 0 .41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9zM12 4.15L6.04 7.5 12 10.85l5.96-3.35L12 4.15zM5 15.91l6 3.38v-6.71L5 9.21v6.7zm14 0v-6.7l-6 3.37v6.71l6-3.38z'
  },
  map: {
    viewBox: '0 0 24 24',
    path: 'M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z'
  },
  rocket: {
    viewBox: '0 0 24 24',
    path: 'M7.5 12h9M12 3v9m0 0l-2.5-2.5M12 12l2.5-2.5m-2.5 2.5L9.5 14.5m2.5-2.5l2.5 2.5M12 3c0 4.42-3.58 8-8 8v2c4.42 0 8 3.58 8 8 4.42 0 8-3.58 8-8 0-4.42-3.58-8-8-8z'
  },

  // 阵营
  earth: {
    viewBox: '0 0 24 24',
    path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z'
  },
  moon: {
    viewBox: '0 0 24 24',
    path: 'M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-3.03 0-5.5-2.47-5.5-5.5 0-1.82.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z'
  },
  star: {
    viewBox: '0 0 24 24',
    path: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z'
  },

  // 其他
  robot: {
    viewBox: '0 0 24 24',
    path: 'M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1H2a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2zM7.5 13a2.5 2.5 0 100 5 2.5 2.5 0 000-5zm9 0a2.5 2.5 0 100 5 2.5 2.5 0 000-5z'
  },
  close: {
    viewBox: '0 0 24 24',
    path: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'
  },

  // 战斗相关
  melee: {
    viewBox: '0 0 24 24',
    path: 'M6 2l2 2-3 3-2-2L6 2zm3.5 5.5L13 11l-2 2L7.5 9.5l2-2zm5 5L19 17l-3 3-4.5-4.5 3-3zm3 7l-1 1-1.5-1.5 1-1 1.5 1.5zm-12-2l1 1 1.5-1.5-1-1-1.5 1.5z'
  },
  ranged: {
    viewBox: '0 0 24 24',
    path: 'M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12s4.48 10 10 10 10-4.48 10-10zm-10 8c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z'
  },
  defense: {
    viewBox: '0 0 24 24',
    path: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z'
  },

  // 编辑相关
  edit: {
    viewBox: '0 0 24 24',
    path: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'
  },
  delete: {
    viewBox: '0 0 24 24',
    path: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z'
  },
  save: {
    viewBox: '0 0 24 24',
    path: 'M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z'
  },

  // 状态
  check: {
    viewBox: '0 0 24 24',
    path: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z'
  },
  add: {
    viewBox: '0 0 24 24',
    path: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z'
  }
};

const iconComponent = computed(() => {
  const icon = icons[props.name];
  if (!icon) {
    console.warn(`Icon "${props.name}" not found`);
    return null;
  }

  return {
    template: `<svg viewBox="${icon.viewBox}" class="icon-svg"><path d="${icon.path}"/></svg>`
  };
});
</script>

<style scoped>
.icon {
  display: inline-block;
  vertical-align: middle;
}

.icon-svg {
  width: 100%;
  height: 100%;
  fill: currentColor;
}

.icon-16 {
  width: 16px;
  height: 16px;
}

.icon-20 {
  width: 20px;
  height: 20px;
}

.icon-24 {
  width: 24px;
  height: 24px;
}

.icon-32 {
  width: 32px;
  height: 32px;
}

.icon-48 {
  width: 48px;
  height: 48px;
}

.icon-64 {
  width: 64px;
  height: 64px;
}

.icon-default {
  color: var(--on-surface);
}

.icon-primary {
  color: var(--primary);
}

.icon-secondary {
  color: var(--secondary);
}

.icon-tertiary {
  color: var(--tertiary);
}

.icon-success {
  color: var(--primary);
}

.icon-warning {
  color: var(--warning);
}

.icon-error {
  color: var(--error);
}
</style>
