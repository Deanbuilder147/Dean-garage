<template>
  <AppSidebar
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <!-- Profile：点击头像/信息区弹出账号信息弹窗 -->
    <div class="sidebar-profile" @click="openProfileModal" title="点击查看 / 修改账号信息">
      <div class="avatar">
        <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuDYyn-HCiF01XLYgK6uTbi_cB5wuYmt8wGvSbdTtGk_-bIDUvWqWvTFoahEAZhzycVcpuExWN3Rw1jX1-1PqZYrfHGb5tma9krNH7tYuYxKSqJ7ma-wJir3RmFgtHvmZ_J2Lg4QYbl3N1GTRREWIHZI4KOwkIZ8XWdW1zxDdtHVOJs8D5o3KqueWnknlSfp57HOjuj9rn0ZijamKid25utBkYLbqKFrFkQQxczNmtQx1b63kPfqZGIlEfAnUi2XSKTCDLtPh9noD-w" alt="">
      </div>
      <div class="profile-info">
        <p>[ {{ user?.username || '指挥官' }} ]</p>
        <p>军衔: {{ userRank }}</p>
      </div>
      <button class="logout-btn" @click.stop="handleLogout" title="退出登录">↩ 退出</button>
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
      </div>
    </div>

    <nav class="nav">
      <router-link to="/home" class="nav-link" active-class="active">
        <svg class="icon-lg" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="9 22 9 12 15 12 15 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span class="nav-link-text">首页</span>
      </router-link>
      <router-link to="/units" class="nav-link" active-class="active">
        <svg class="icon-lg" viewBox="0 0 24 24" fill="currentColor"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>
        <span class="nav-link-text">单位编辑器</span>
      </router-link>
      <router-link to="/battlefield-edit" class="nav-link" active-class="active">
        <svg class="icon-lg" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="3" width="7" height="7" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="14" width="7" height="7" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="14" width="7" height="7" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        <span class="nav-link-text">地图编辑器</span>
      </router-link>
      <router-link to="/battlefields" class="nav-link" active-class="active">
        <svg class="icon-lg" viewBox="0 0 24 24"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><line x1="12" y1="22" x2="12" y2="15.5" stroke="currentColor" stroke-width="2"/><line x1="22" y1="8.5" x2="12" y2="15.5" stroke="currentColor" stroke-width="2"/><line x1="2" y1="8.5" x2="12" y2="15.5" stroke="currentColor" stroke-width="2"/></svg>
        <span class="nav-link-text">战术部署</span>
      </router-link>
      <router-link to="/glossary" class="nav-link" active-class="active">
        <svg class="icon-lg" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <span class="nav-link-text">词条库</span>
      </router-link>
      <router-link to="/asset-gen" class="nav-link" active-class="active">
        <svg class="icon-lg" viewBox="0 0 24 24"><path d="M12 2l2.4 5.4L20 8l-4 4 1 6-5-3-5 3 1-6-4-4 5.6-.6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        <span class="nav-link-text">AI 素材工坊</span>
      </router-link>

      <!-- 后台管理分组：仅管理员(admin)或主宰(dominator)可见 -->
      <template v-if="['admin', 'dominator'].includes(user?.role)">
        <div class="nav-group-label">后台管理</div>
        <router-link to="/admin" class="nav-link nav-admin" active-class="active">
          <svg class="icon-lg" viewBox="0 0 24 24"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 8v4M10 10h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <span class="nav-link-text">权限与用户</span>
        </router-link>
        <router-link to="/dice-config" class="nav-link nav-admin" active-class="active">
          <svg class="icon-lg" viewBox="0 0 24 24"><path d="M5 5h14v14H5z M9 9h.01M15 9h.01M9 15h.01M15 15h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <span class="nav-link-text">骰子工坊</span>
        </router-link>
        <router-link to="/size-config" class="nav-link nav-admin" active-class="active">
          <svg class="icon-lg" viewBox="0 0 24 24"><path d="M4 9h16M4 15h16M9 4v16M15 4v16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <span class="nav-link-text">体型工坊</span>
        </router-link>
      </template>

      <template v-if="isBattlePage">
        <div class="nav-separator"></div>
        <span class="nav-link active">
          <svg class="icon-lg" viewBox="0 0 24 24"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>
          <span class="nav-link-text">战场指挥</span>
        </span>
      </template>
      </nav>
  </AppSidebar>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useRouter } from 'vue-router'
import { useUserStore } from '../../stores/user'
import { authAPI } from '../../api/client.js'
import AppSidebar from './AppSidebar.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

// 收起状态由布局层（App.vue）持有，这里透传给 AppSidebar 即可
const route = useRoute()
const userStore = useUserStore()
const user = computed(() => userStore.user)
const router = useRouter()

const userRank = computed(() => {
  if (!user.value) return 'AC-01'
  const f = (user.value.faction || '').charAt(0).toUpperCase() + (user.value.faction || '').slice(1)
  return f || 'AC-01'
})

const roleLabel = computed(() => {
  const map = { dominator: '主宰', referee: '裁判(GM)', admin: '管理员', user: '玩家' }
  return map[user.value?.role] || user.value?.role || '玩家'
})

const isBattlePage = computed(() => route.path.startsWith('/battle/'))

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
.sidebar-profile {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255,176,0,0.08);
  cursor: pointer;
}

.avatar {
  width: 36px; height: 36px;
  border-radius: 50%;
  background: rgba(255,176,0,0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  border: 1px solid rgba(255,176,0,0.2);
  overflow: hidden;
  position: relative;
  flex-shrink: 0;
}

.avatar img {
  width: 100%; height: 100%;
  object-fit: cover;
}

.profile-info p {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  white-space: nowrap;
}

.profile-info p:first-child {
  font-weight: 700;
  color: #ffb000;
  font-size: 13px;
  letter-spacing: 1px;
}

.profile-info p:last-child {
  color: rgba(193,232,255,0.5);
  font-size: 9px;
  font-family: 'Fira Code', monospace;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  color: rgba(241,243,252,0.35);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  border-radius: 4px;
  text-decoration: none;
  border: none;
  background: transparent;
  font-family: inherit;
  letter-spacing: 1px;
}

.nav-link:hover {
  color: #c1e8ff;
  background: rgba(255,176,0,0.05);
}

.nav-link.active {
  color: #ffb000;
  background: rgba(255,176,0,0.08);
  border-left: 3px solid #ffb000;
}

.nav-link-text { white-space: nowrap; }
.icon-lg { width: 20px; height: 20px; flex-shrink: 0; }

.nav-group-label {
  margin: 14px 0 4px;
  padding: 0 6px;
  font-size: 10px;
  letter-spacing: 1px;
  color: rgba(168,85,247,0.6);
  text-transform: uppercase;
}

/* 主宰专属后台入口：醒目配色 */
.nav-admin {
  color: rgba(168,85,247,0.85);
  border: 1px solid rgba(168,85,247,0.25);
  background: rgba(168,85,247,0.06);
}
.nav-admin:hover {
  color: #c084fc;
  background: rgba(168,85,247,0.14);
}
.nav-admin.active {
  color: #c084fc;
  background: rgba(168,85,247,0.18);
  border-left: 3px solid #a855f7;
}

.nav-separator {
  height: 1px;
  background: rgba(255,176,0,0.08);
  margin: 4px 0;
}

.logout-btn {
  margin-top: 6px;
  padding: 4px 10px;
  background: rgba(255,77,77,0.08);
  border: 1px solid rgba(255,77,77,0.2);
  color: rgba(255,77,77,0.7);
  font-size: 10px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;
  font-family: inherit;
  letter-spacing: 1px;
}

.logout-btn:hover {
  background: rgba(255,77,77,0.2);
  color: #ff6b6b;
  border-color: rgba(255,77,77,0.4);
}

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
</style>
