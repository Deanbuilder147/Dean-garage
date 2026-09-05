<template>
  <div class="admin-center">
    <header class="ac-header">
      <h1>🛡 后台管理 / Admin Center</h1>
      <p class="ac-sub">所有管理类功能归拢于此 · All management tools live here</p>
      <div class="ac-role" v-if="user">
        当前账号 / Current account：
        <b :class="roleClass">{{ roleLabel }}</b>
        <span class="ac-role-name">（{{ user.username }}）</span>
      </div>
    </header>

    <div class="ac-grid">
      <router-link
        v-for="card in visibleCards"
        :key="card.to"
        :to="card.to"
        class="ac-card"
      >
        <div class="ac-card-icon" v-html="card.icon"></div>
        <div class="ac-card-body">
          <div class="ac-card-title">{{ card.title }}</div>
          <div class="ac-card-title-en">{{ card.titleEn }}</div>
          <div class="ac-card-desc">{{ card.desc }}</div>
        </div>
      </router-link>
    </div>

    <p v-if="!visibleCards.length" class="ac-empty">
      当前账号无后台权限 / Your account has no admin access.
    </p>

    <!-- 素材预览：菜单按钮 SVG（路线1 原样替换，不改色/不改造） -->
    <section class="ac-icon-preview">
      <header class="aip-head">
        <h2>素材预览 · 菜单按钮</h2>
        <span class="aip-hint">原样 SVG（仅去除文字层），后续素材直接替换此文件即可</span>
      </header>
      <div class="aip-stage">
        <img class="aip-img" :src="menuPreviewUrl" alt="菜单按钮预览" />
      </div>
    </section>

    <!-- 异形 Canvas 预览：用 ShapedCanvas 把战斗画布裁切为不规则形状（骨架验证） -->
    <section class="ac-shaped-preview">
      <header class="aip-head">
        <h2>异形 Canvas 预览 · 战斗画布</h2>
        <span class="aip-hint">ShapedCanvas 裁剪 + SVG 描边 + 程序化阴影（线条/发光可配置）</span>
      </header>
      <ShapedCanvas
        :raw-points="HEX_FRAME_POINTS"
        :view-box-w="HEX_FRAME_VIEWBOX.w"
        :view-box-h="HEX_FRAME_VIEWBOX.h"
        stroke-color="rgba(255,176,0,0.9)"
        :stroke-width="2"
        glow
        glow-color="rgba(255,176,0,0.4)"
      >
        <HexGridCanvasEngine :grid-data="demoGrid" style="display:block;width:100%;height:auto;" />
      </ShapedCanvas>
    </section>

  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useUserStore } from '../stores/user.js'
import menuPreviewUrl from '../assets/icons/menu-preview.svg'
import ShapedCanvas from '../components/ShapedCanvas.vue'
import HexGridCanvasEngine from '../components/HexGridCanvasEngine.vue'
import { HEX_FRAME_POINTS, HEX_FRAME_VIEWBOX } from '../utils/shapeFrames.js'

const userStore = useUserStore()
const user = computed(() => userStore.user)

// 演示用小型网格（纯几何，无业务逻辑）
function buildDemoGrid(cols, rows) {
  const cells = []
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const terrains = ['plain', 'forest', 'mountain', 'water', 'crystal']
      cells.push({ q, r, terrain: terrains[(q + r) % terrains.length] })
    }
  }
  return { width: cols, height: rows, cells }
}
const demoGrid = buildDemoGrid(10, 7)

const roleLabel = computed(() => {
  const map = { dominator: '主宰', admin: '管理员', referee: '裁判', user: '玩家', guest: '游客' }
  return map[user.value?.role] || user.value?.role || '玩家'
})
const roleClass = computed(() => ({
  'role-dominator': user.value?.role === 'dominator',
  'role-admin': user.value?.role === 'admin',
  'role-referee': user.value?.role === 'referee',
}))

// 所有后台卡片（权限由 meta.requiresRole 后端再卡一次，这里只控制可见性）
const ALL_CARDS = [
  {
    to: '/admin',
    title: '权限与用户',
    titleEn: 'Permissions & Users',
    desc: '等级-功能权限矩阵、账号检索与角色管理',
    roles: ['admin', 'dominator'],
    icon: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 8v4M10 10h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  },
  {
    to: '/dice-config',
    title: '骰子工坊',
    titleEn: 'Dice Workshop',
    desc: '骰点倍率、暴击、命中判定等战斗掷骰参数',
    roles: ['admin', 'dominator'],
    icon: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M5 5h14v14H5z M9 9h.01M15 9h.01M9 15h.01M15 15h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  },
  {
    to: '/size-config',
    title: '体型工坊',
    titleEn: 'Size Workshop',
    desc: '七视图尺寸、受击系数与体型参数配置',
    roles: ['admin', 'dominator'],
    icon: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 9h16M4 15h16M9 4v16M15 4v16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  },
  {
    to: '/bug-report-admin',
    title: 'Bug 汇总',
    titleEn: 'Bug Reports',
    desc: '查看、筛选、改状态与导出玩家反馈',
    roles: ['referee', 'dominator'],
    icon: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zM8 12h8M8 8h8M8 16h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  },
  {
    to: '/unit-review',
    title: '棋子审核台',
    titleEn: 'Unit Review',
    desc: '玩家投稿棋子的通过 / 驳回审核队列',
    roles: ['referee', 'dominator'],
    icon: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M9 11l2 2 4-4M5 5h14v14H5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  },
  {
    to: '/map-review',
    title: '地图审核台',
    titleEn: 'Map Review',
    desc: '玩家投稿地图的通过 / 驳回审核队列',
    roles: ['admin', 'dominator'],
    icon: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  },
  // —— 从主导航归总进来的用户功能入口 ——
  {
    to: '/asset-gen',
    title: 'AI 素材',
    titleEn: 'AI Asset Gen',
    desc: '用 AI 生成棋子的七视图 / 地形等美术素材',
    roles: ['user', 'guest', 'referee', 'admin', 'dominator'],
    icon: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  },
  {
    to: '/bug-report',
    title: '问题反馈',
    titleEn: 'Bug Report',
    desc: '提交你遇到的 Bug 与体验问题',
    roles: ['user', 'guest', 'referee', 'admin', 'dominator'],
    icon: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 3a9 9 0 100 18 9 9 0 000-18zM8 12h8M8 8h8M8 16h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  },
  {
    to: '/unit-library',
    title: '棋子库',
    titleEn: 'Unit Library',
    desc: '浏览全部棋子的图鉴与检索',
    roles: ['user', 'guest', 'referee', 'admin', 'dominator'],
    icon: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 6h16v12H4z M12 6v12M8 10h.01M16 10h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  },
  {
    to: '/my-units',
    title: '我的投稿',
    titleEn: 'My Submissions',
    desc: '管理你投稿的棋子与审核进度',
    roles: ['user', 'guest', 'referee', 'admin', 'dominator'],
    icon: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 7l8-4 8 4v10l-8 4-8-4z M12 3v18M4 7l8 4 8-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  },
]

const visibleCards = computed(() => {
  const r = user.value?.role
  if (!r) return []
  return ALL_CARDS.filter((c) => c.roles.includes(r))
})
</script>

<style scoped>
.admin-center {
  max-width: 1100px;
  margin: 0 auto;
  padding: 28px 24px 48px;
  color: #f1f3fc;
}
.ac-header h1 {
  margin: 0 0 4px;
  color: #ffb000;
  font-size: 24px;
  letter-spacing: 1px;
}
.ac-sub {
  margin: 0 0 10px;
  color: rgba(193, 232, 255, 0.5);
  font-size: 13px;
}
.ac-role {
  font-size: 13px;
  color: rgba(241, 243, 252, 0.7);
}
.ac-role b { color: #c1e8ff; }
.role-dominator { color: #c084fc !important; }
.role-admin { color: #ffb000 !important; }
.role-referee { color: #4ade80 !important; }

.ac-grid {
  margin-top: 22px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}
.ac-card {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 16px 18px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 176, 0, 0.18);
  border-radius: 10px;
  text-decoration: none;
  transition: all 0.15s;
}
.ac-card:hover {
  background: rgba(255, 176, 0, 0.08);
  border-color: rgba(255, 176, 0, 0.45);
  transform: translateY(-2px);
}
.ac-card-icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffb000;
  background: rgba(255, 176, 0, 0.08);
  border-radius: 8px;
}
.ac-card-title {
  font-size: 15px;
  font-weight: 600;
  color: #f1f3fc;
}
.ac-card-title-en {
  font-size: 11px;
  color: rgba(193, 232, 255, 0.55);
  margin-bottom: 4px;
  letter-spacing: 0.5px;
}
.ac-card-desc {
  font-size: 12px;
  color: rgba(241, 243, 252, 0.45);
  line-height: 1.5;
}
.ac-empty {
  margin-top: 28px;
  color: rgba(241, 243, 252, 0.5);
  font-size: 13px;
}

/* 素材预览区块 */
.ac-icon-preview {
  margin-top: 40px;
  padding: 22px 24px 26px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 176, 0, 0.2);
  border-radius: 12px;
}
.aip-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 18px;
}
.aip-head h2 {
  margin: 0;
  font-size: 16px;
  color: #ffb000;
}
.aip-hint {
  font-size: 12px;
  color: rgba(193, 232, 255, 0.5);
}
.aip-stage {
  width: 160px;
  height: 176px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 10px;
  margin-bottom: 16px;
}
.aip-img {
  width: 130px;
  height: auto;
}

/* 异形 Canvas 预览区块 */
.ac-shaped-preview {
  margin-top: 40px;
  padding: 22px 24px 28px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 176, 0, 0.2);
  border-radius: 12px;
}
.ac-shaped-preview :deep(.shaped-canvas) {
  margin-top: 18px;
}

</style>
