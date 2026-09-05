<template>
  <div class="fab-nav">
    <!-- 展开态：六边形导航列（竖向堆叠于右下角，可自滚动） -->
    <transition name="fab-expand">
      <div v-show="expanded" class="fab-list">
        <nav class="nav">
          <!-- 六边形导航：取自首页.svg 真源（平顶六边形 + 蜂巢错位 + 琥珀中文 + 绿光选中态） -->
          <template v-for="(item, i) in navItems" :key="item.to">
            <a
              v-if="item.external"
              :href="item.to"
              target="_blank"
              rel="noopener"
              class="hex-nav"
              :class="{ 'even': i % 2 === 1, 'admin': item.admin }"
            >
              <svg class="hx" viewBox="0 0 80 96" preserveAspectRatio="xMidYMid meet">
                <polygon points="40,4 72,22 72,58 40,76 8,58 8,22" class="hx-fill"/>
                <polygon points="40,4 72,22 72,58 40,76 8,58 8,22" class="hx-stroke"/>
              </svg>
              <span class="hx-tit">{{ item.label }}</span>
            </a>
            <router-link
              v-else
              :to="item.to"
              class="hex-nav"
              :class="{ 'on': route.path === item.to || (item.match && item.match(route.path)), 'even': i % 2 === 1, 'admin': item.admin }"
              active-class=""
            >
              <svg class="hx" viewBox="0 0 80 96" preserveAspectRatio="xMidYMid meet">
                <polygon points="40,4 72,22 72,58 40,76 8,58 8,22" class="hx-fill"/>
                <polygon points="40,4 72,22 72,58 40,76 8,58 8,22" class="hx-stroke"/>
              </svg>
              <span class="hx-tit">{{ item.label }}</span>
            </router-link>
          </template>

          <template v-if="isBattlePage">
            <div class="nav-separator"></div>
            <span class="hex-nav on battle">
              <svg class="hx" viewBox="0 0 80 96"><polygon points="40,4 72,22 72,58 40,76 8,58 8,22" class="hx-fill"/><polygon points="40,4 72,22 72,58 40,76 8,58 8,22" class="hx-stroke"/></svg>
              <span class="hx-tit">战场指挥</span>
            </span>
          </template>
        </nav>
      </div>
    </transition>

    <!-- FAB 主按钮：默认收起，点击展开 / 收起 -->
    <button class="fab-toggle" @click="expanded = !expanded" :title="expanded ? '收起导航' : '展开导航'">
      <img class="hx-img" :src="hexBtnUrl" alt="菜单" />
      <span class="hx-tit">{{ expanded ? '收起' : '菜单' }}</span>
    </button>

    <!-- ID 栏：右上角独立浮动，不随导航列 -->
    <div class="id-fab">
      <div class="hex-nav account-entry" @click="openProfileModal" title="账号信息 / 修改资料">
        <img class="hx-img" :src="hexBtnUrl" alt="账号" />
        <span class="hx-tit">账号</span>
      </div>
    </div>

    <!-- 账号信息弹窗 -->
    <div v-if="showProfileModal" class="profile-modal-overlay" @click.self="closeProfileModal">
      <div class="profile-modal">
        <div class="pm-header">
          <h3>账号信息</h3>
          <button class="pm-close" @click="closeProfileModal">✕</button>
        </div>

        <div class="pm-section">
          <div class="pm-uid">
            <span class="pm-label">UID（唯一标识，不可修改）</span>
            <code>{{ user?.id || '—' }}</code>
          </div>
          <div class="pm-row"><span class="pm-label">角色</span><span>{{ roleLabel }}</span></div>
          <div class="pm-row"><span class="pm-label">军衔</span><span>{{ userRank }}</span></div>
        </div>

        <div class="pm-tabs">
          <button :class="{ active: activeTab === 'info' }" @click="activeTab = 'info'">修改资料</button>
          <button :class="{ active: activeTab === 'pwd' }" @click="activeTab = 'pwd'">修改密码</button>
        </div>

        <!-- 修改资料 -->
        <div v-if="activeTab === 'info'" class="pm-form">
          <label>用户名
            <input v-model="infoForm.username" :placeholder="user?.username || ''" />
          </label>
          <label>邮箱
            <input v-model="infoForm.email" :placeholder="user?.email || ''" />
          </label>
          <label>军衔 / 阵营
            <input v-model="infoForm.faction" :placeholder="user?.faction || ''" />
          </label>
          <button class="pm-save" :disabled="infoSaving" @click="saveProfile">
            {{ infoSaving ? '保存中…' : '保存修改' }}
          </button>
        </div>

        <!-- 修改密码 -->
        <div v-if="activeTab === 'pwd'" class="pm-form">
          <label>当前密码
            <input v-model="pwdForm.oldPassword" type="password" placeholder="请输入当前密码" />
          </label>
          <label>新密码
            <input v-model="pwdForm.newPassword" type="password" placeholder="至少 6 位" />
          </label>
          <label>确认新密码
            <input v-model="pwdForm.confirmPassword" type="password" placeholder="再次输入新密码" />
          </label>
          <button class="pm-save" :disabled="pwdSaving" @click="savePassword">
            {{ pwdSaving ? '保存中…' : '修改密码' }}
          </button>
        </div>

        <p v-if="msg" :class="['pm-msg', msgType]">{{ msg }}</p>

        <!-- 退出登录 -->
        <button class="pm-logout" @click="handleLogout">
          ↩ 退出登录
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useRouter } from 'vue-router'
import { useUserStore } from '../../stores/user'
import { authAPI } from '../../api/client.js'
import hexBtnUrl from '../../assets/icons/hex-btn.svg'

const route = useRoute()
const userStore = useUserStore()
const user = computed(() => userStore.user)
const router = useRouter()

// 浮动导航展开状态：默认展开（常驻显示）
const expanded = ref(true)

const userRank = computed(() => {
  if (!user.value) return 'AC-01'
  const f = (user.value.faction || '').charAt(0).toUpperCase() + (user.value.faction || '').slice(1)
  return f || 'AC-01'
})

const roleLabel = computed(() => {
  const map = { dominator: '主宰', admin: '管理员', referee: '裁判', user: '玩家', guest: '游客' }
  return map[user.value?.role] || user.value?.role || '玩家'
})

const isBattlePage = computed(() => route.path.startsWith('/battle/'))

// 主导航只保留 5 项；其余（AI 素材 / 问题反馈 / 棋子库 / 我的投稿）归总到后台管理页
const navItems = [
  { to: '/home', label: '首页' },
  { to: '/units', label: '格纳库' },
  { to: '/battlefield-edit', label: '地图档案' },
  { to: '/glossary-studio', label: '词条库' },
  { to: '/glossary2/', label: '词条展示', external: true },
  { to: '/admin-center', label: '后台管理', admin: true, match: (p) => p.startsWith('/admin') },
]

function handleLogout() {
  // 清除所有本地鉴权数据
  localStorage.clear()
  userStore.clearUser()
  // 重定向回登录页
  router.push('/login')
}

// —— 账号信息弹窗 ——
const showProfileModal = ref(false)
const activeTab = ref('info')
const msg = ref('')
const msgType = ref('') // 'ok' | 'err'

const infoForm = ref({ username: '', email: '', faction: '' })
const infoSaving = ref(false)
const pwdForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' })
const pwdSaving = ref(false)

function openProfileModal() {
  msg.value = ''
  activeTab.value = 'info'
  infoForm.value = { username: '', email: '', faction: '' }
  pwdForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
  showProfileModal.value = true
}
function closeProfileModal() {
  showProfileModal.value = false
}

async function saveProfile() {
  const payload = {}
  if (infoForm.value.username.trim()) payload.username = infoForm.value.username.trim()
  if (infoForm.value.email.trim()) payload.email = infoForm.value.email.trim()
  if (infoForm.value.faction.trim()) payload.faction = infoForm.value.faction.trim()
  if (Object.keys(payload).length === 0) {
    msg.value = '请至少填写一项要修改的内容'
    msgType.value = 'err'
    return
  }
  infoSaving.value = true
  msg.value = ''
  try {
    const { data } = await authAPI.updateProfile(payload)
    // 同步 store 与本地缓存，避免刷新后回到旧信息
    userStore.setUser(data)
    localStorage.setItem('user', JSON.stringify(data))
    msg.value = '账号信息已更新'
    msgType.value = 'ok'
  } catch (e) {
    msg.value = e.response?.data?.message || '保存失败'
    msgType.value = 'err'
  } finally {
    infoSaving.value = false
  }
}

async function savePassword() {
  if (!pwdForm.value.oldPassword || !pwdForm.value.newPassword) {
    msg.value = '请填写当前密码和新密码'
    msgType.value = 'err'
    return
  }
  if (pwdForm.value.newPassword.length < 6) {
    msg.value = '新密码至少 6 位'
    msgType.value = 'err'
    return
  }
  if (pwdForm.value.newPassword !== pwdForm.value.confirmPassword) {
    msg.value = '两次输入的新密码不一致'
    msgType.value = 'err'
    return
  }
  pwdSaving.value = true
  msg.value = ''
  try {
    const { data } = await authAPI.changePassword({
      oldPassword: pwdForm.value.oldPassword,
      newPassword: pwdForm.value.newPassword,
    })
    msg.value = data.message || '密码修改成功'
    msgType.value = 'ok'
    pwdForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
  } catch (e) {
    msg.value = e.response?.data?.message || '密码修改失败'
    msgType.value = 'err'
  } finally {
    pwdSaving.value = false
  }
}
</script>

<style scoped>
/* ===== 右下角浮动导航（FAB） ===== */
.fab-nav {
  position: fixed;
  left: 20px;
  bottom: 20px;
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.fab-list {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  max-height: 72vh;
  overflow-y: auto;
  padding: 4px;
  scrollbar-width: none;
  transform-origin: bottom left;
}
.fab-list::-webkit-scrollbar { display: none; }

.fab-toggle {
  position: relative;
  width: 76px;
  height: 82px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: none;
  background: transparent;
  flex-shrink: 0;
  transition: transform 0.22s cubic-bezier(.2,.8,.2,1);
}
.fab-toggle .hx { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.hx-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
.fab-toggle .hx-fill { fill: #1e6fd0; transition: fill .22s; }
.fab-toggle .hx-stroke {
  fill: none; stroke: #4A9EFF; stroke-width: 2.4;
  filter: drop-shadow(0 0 8px rgba(74,158,255,.6)); transition: .22s;
}
.fab-toggle .hx-tit {
  position: relative; z-index: 1; pointer-events: none;
  font-size: 14px; font-weight: 700; letter-spacing: 1px;
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
  background: linear-gradient(180deg,#ffe0a0 0%,#ffb700 55%,#ff8c00 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  text-shadow: 0 0 12px rgba(255,160,0,.4);
}
.fab-toggle:hover { transform: scale(1.06); }
.fab-toggle:hover .hx-fill { fill: #2f86ec; }
.fab-toggle:hover .hx-stroke { stroke: #7ec0ff; filter: drop-shadow(0 0 14px rgba(74,158,255,.9)); }

.fab-expand-enter-active,
.fab-expand-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fab-expand-enter-from,
.fab-expand-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}

/* ===== 六边形导航（取自首页.svg 真源） ===== */
.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hex-nav {
  position: relative;
  width: 96px;
  height: 104px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  text-decoration: none;
  transition: transform 0.22s cubic-bezier(.2,.8,.2,1);
}
/* 蜂巢错位：偶数项向右偏移 */
.hex-nav.even { margin-left: 52px; }
.hex-nav .hx { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
/* 填充与框线同色系（不透明实色） */
.hex-nav .hx-fill { fill: #1e6fd0; transition: fill .22s; }
.hex-nav .hx-stroke {
  fill: none; stroke: #4A9EFF; stroke-width: 2.2;
  filter: drop-shadow(0 0 6px rgba(74,158,255,.5)); transition: .22s;
}
.hex-nav .hx-tit {
  position: relative; z-index: 1; pointer-events: none;
  font-size: 15px; font-weight: 700; letter-spacing: 1px;
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
  background: linear-gradient(180deg,#ffe0a0 0%,#ffb700 55%,#ff8c00 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  text-shadow: 0 0 12px rgba(255,160,0,.4);
}
.hex-nav:hover { transform: scale(1.05); z-index: 2; }
.hex-nav:hover .hx-fill { fill: #2f86ec; }
.hex-nav:hover .hx-stroke { stroke: #7ec0ff; filter: drop-shadow(0 0 12px rgba(74,158,255,.8)); }
/* 选中态：青绿高亮（不透明实色） */
.hex-nav.on { transform: scale(1.1); z-index: 2; }
.hex-nav.on .hx-fill { fill: #06b46c; }
.hex-nav.on .hx-stroke { stroke: #00ff88; stroke-width: 3; filter: drop-shadow(0 0 10px rgba(0,255,136,.7)); }
.hex-nav.on .hx-tit { text-shadow: 0 0 16px rgba(0,255,136,.5); }
/* 后台管理：紫描边变体 */
.hex-nav.admin .hx-stroke { stroke: #c77dff; }
.hex-nav.admin:hover .hx-stroke { stroke: #e0b0ff; filter: drop-shadow(0 0 12px rgba(199,125,255,.8)); }
.hex-nav.admin.on .hx-stroke { stroke: #b06bff; filter: drop-shadow(0 0 10px rgba(176,107,255,.7)); }

.nav-separator {
  height: 1px;
  background: rgba(255,176,0,0.08);
  margin: 6px 0;
  width: 96px;
}

/* 账号入口：浮动六边形按钮（紫色变体） */
.account-entry { margin-top: 14px; }
.account-entry .hx-fill { fill: #5b2a7a; }
.account-entry .hx-stroke { stroke: #c77dff; }
.account-entry:hover .hx-stroke { stroke: #e0b0ff; filter: drop-shadow(0 0 12px rgba(199,125,255,.8)); }
.account-entry .hx-tit {
  background: linear-gradient(180deg,#e7c4ff 0%,#c77dff 55%,#a64dff 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}

/* ID 栏：右上角独立浮动（不随左下角导航列） */
.id-fab {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 60;
}
.id-fab .account-entry { margin-top: 0; }

/* 账号信息弹窗 */
.profile-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(8,12,20,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.profile-modal {
  width: 340px;
  max-width: 90vw;
  background: #11161f;
  border: 1px solid rgba(255,176,0,0.35);
  border-radius: 10px;
  padding: 18px 20px;
  color: #f1f3fc;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5);
}
.pm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.pm-header h3 {
  margin: 0;
  color: #ffb000;
  font-size: 15px;
  letter-spacing: 1px;
}
.pm-close {
  background: transparent;
  border: none;
  color: rgba(241,243,252,0.6);
  font-size: 16px;
  cursor: pointer;
}
.pm-section {
  border: 1px solid rgba(255,176,0,0.12);
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 12px;
  background: rgba(255,176,0,0.04);
}
.pm-uid {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}
.pm-uid code {
  color: #c1e8ff;
  font-family: 'Fira Code', monospace;
  font-size: 12px;
  word-break: break-all;
}
.pm-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 2px 0;
}
.pm-label {
  color: rgba(193,232,255,0.5);
  font-size: 11px;
}
.pm-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}
.pm-tabs button {
  flex: 1;
  padding: 6px 0;
  background: transparent;
  border: 1px solid rgba(255,176,0,0.2);
  color: rgba(241,243,252,0.6);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}
.pm-tabs button.active {
  background: rgba(255,176,0,0.12);
  color: #ffb000;
  border-color: rgba(255,176,0,0.45);
}
.pm-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pm-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: rgba(193,232,255,0.7);
}
.pm-form input {
  background: #0c1118;
  border: 1px solid rgba(255,176,0,0.2);
  border-radius: 4px;
  padding: 7px 9px;
  color: #f1f3fc;
  font-size: 13px;
  font-family: inherit;
}
.pm-form input:focus {
  outline: none;
  border-color: rgba(255,176,0,0.6);
}
.pm-save {
  margin-top: 4px;
  padding: 8px 0;
  background: rgba(255,176,0,0.15);
  border: 1px solid rgba(255,176,0,0.4);
  color: #ffb000;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  letter-spacing: 1px;
}
.pm-save:disabled {
  opacity: 0.5;
  cursor: default;
}
.pm-msg {
  margin: 10px 0 0;
  font-size: 12px;
}
.pm-msg.ok { color: #4ade80; }
.pm-msg.err { color: #ff6b6b; }

.pm-logout {
  margin-top: 14px;
  width: 100%;
  padding: 9px 0;
  background: rgba(255,77,77,0.08);
  border: 1px solid rgba(255,77,77,0.25);
  color: rgba(255,107,107,0.9);
  font-size: 13px;
  border-radius: 5px;
  cursor: pointer;
  font-family: inherit;
  letter-spacing: 1px;
  transition: all 0.15s;
}

.pm-logout:hover {
  background: rgba(255,77,77,0.2);
  color: #ff6b6b;
  border-color: rgba(255,77,77,0.45);
}
</style>
