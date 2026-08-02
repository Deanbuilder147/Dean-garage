<template>
  <div class="admin-page" v-if="isDominator">
    <header class="page-header">
      <h1>[ 后台管理 · 主宰专属 ]</h1>
      <p class="subtitle">管理各等级（普通用户 / 裁判 / 管理员）对各项功能的权限，并搜索账号、修改账号权限。</p>
    </header>

    <!-- 权限矩阵面板 -->
    <section class="panel matrix-panel">
      <div class="panel-header">
        <h2>[ 等级 · 功能权限矩阵 ]</h2>
        <span class="panel-badge">PERMISSIONS · 勾选即开放该等级对应功能</span>
      </div>
      <div class="panel-body">
        <div v-if="loadingMatrix" class="loading">加载权限矩阵…</div>
        <template v-else>
          <div class="matrix-grid" :style="{ '--cols': roles.length + 1 }">
            <!-- 表头 -->
            <div class="mx-row mx-head">
              <div class="mx-cell mx-feat">功能 / 等级</div>
              <div v-for="role in roles" :key="role.key" class="mx-cell mx-role" :class="'lvl-' + role.key">
                {{ role.label }}
              </div>
            </div>

            <!-- 按分组渲染功能 -->
            <template v-for="grp in groupedFeatures" :key="grp.name">
              <div class="mx-group-title">{{ grp.name }}</div>
              <div v-for="feat in grp.items" :key="feat.key" class="mx-row">
                <div class="mx-cell mx-feat" :title="feat.key">{{ feat.label }}</div>
                <div v-for="role in roles" :key="role.key" class="mx-cell mx-perm" :class="'lvl-' + role.key">
                  <input
                    type="checkbox"
                    :checked="matrix[role.key]?.[feat.key]"
                    @change="togglePerm(role.key, feat.key)"
                    class="mx-check"
                  />
                </div>
              </div>
            </template>
          </div>

          <div class="matrix-actions">
            <button class="btn btn-save" :disabled="savingMatrix || dirtyRoles.length === 0" @click="saveMatrix">
              {{ savingMatrix ? '[ 保存中… ]' : '[ 保存矩阵修改 ]' }}
            </button>
            <span v-if="dirtyRoles.length" class="dirty-hint">⚠ 待保存：{{ dirtyRoles.join('、') }}</span>
            <span v-if="matrixMsg" class="matrix-msg">{{ matrixMsg }}</span>
          </div>
        </template>
      </div>
    </section>

    <!-- 账号权限管理面板 -->
    <section class="panel account-panel">
      <div class="panel-header">
        <h2>[ 账号权限管理 ]</h2>
        <span class="panel-badge">ACCOUNTS · 搜索并修改账号等级/权限/积分</span>
      </div>
      <div class="panel-body">
        <div class="search-bar">
          <input
            class="admin-search"
            type="text"
            v-model="searchText"
            @input="onSearchInput"
            @keydown.enter="doSearch"
            placeholder="输入用户名或邮箱搜索账号…"
          />
          <button class="btn btn-add" @click="doSearch" :disabled="searching || !searchText.trim()">🔍 搜索</button>
          <ul v-if="showResults && searchResults.length" class="search-results">
            <li
              v-for="u in searchResults"
              :key="u.id"
              @mousedown.prevent="selectUser(u)"
              :class="{ active: selectedUser && selectedUser.id === u.id }"
            >
              <span class="sr-name">{{ u.username }}</span>
              <span class="sr-email">{{ u.email }}</span>
              <span class="sr-role">{{ roleLabel(u.role) }}</span>
            </li>
          </ul>
          <ul v-else-if="showResults && searched && !searchResults.length" class="search-results">
            <li class="search-no">无匹配账号</li>
          </ul>
        </div>

        <div v-if="selectedUser" class="account-edit">
          <div class="ae-title">
            编辑账号：<strong>{{ selectedUser.username }}</strong>
            <span class="ae-email">{{ selectedUser.email }}</span>
          </div>
          <div class="ae-grid">
            <label class="ae-field">
              <span>等级 / 角色 role</span>
              <select v-model="editForm.role" class="ae-input">
                <option v-for="r in allRoles" :key="r.key" :value="r.key">{{ r.label }}</option>
              </select>
            </label>
            <label class="ae-field">
              <span>权限数值 permission</span>
              <input type="number" min="0" v-model.number="editForm.permission" class="ae-input" />
            </label>
            <label class="ae-field">
              <span>积分 credits</span>
              <input type="number" min="0" v-model.number="editForm.credits" class="ae-input" />
            </label>
          </div>
          <div class="ae-actions">
            <button class="btn btn-save" :disabled="savingUser" @click="saveUser">
              {{ savingUser ? '[ 保存中… ]' : '[ 保存账号权限 ]' }}
            </button>
            <button class="btn" @click="clearUser">清除</button>
            <span v-if="userMsg" class="user-msg">{{ userMsg }}</span>
          </div>
        </div>
        <div v-else class="account-empty">搜索并选择一个账号以修改其权限。</div>
      </div>
    </section>
  </div>

  <!-- 无权限提示（非 dominator 不应到达此路由，兜底展示） -->
  <div class="admin-denied" v-else>
    <h1>⛔ 访问受限</h1>
    <p>此页面仅对【主宰(dominator)】账号开放。当前账号：{{ user?.role || '未知' }}</p>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
import { adminAPI } from '../api/client'

const userStore = useUserStore()
const user = computed(() => userStore.user)
const isDominator = computed(() => user.value && user.value.role === 'dominator')

// ===== 权限矩阵 =====
const loadingMatrix = ref(false)
const features = ref([])
const roles = ref([])
const matrix = reactive({}) // { roleKey: { featureKey: bool } }
const dirtyRoles = ref([])
const savingMatrix = ref(false)
const matrixMsg = ref('')

const roleLabelMap = {
  user: '普通用户',
  referee: '裁判',
  admin: '管理员',
  dominator: '主宰',
}
const allRoles = computed(() => Object.entries(roleLabelMap).map(([key, label]) => ({ key, label })))
function roleLabel(r) {
  return roleLabelMap[r] || r || '普通用户'
}

const groupedFeatures = computed(() => {
  const groups = {}
  for (const f of features.value) {
    if (!groups[f.group]) groups[f.group] = []
    groups[f.group].push(f)
  }
  return Object.entries(groups).map(([name, items]) => ({ name, items }))
})

function togglePerm(roleKey, featKey) {
  if (!matrix[roleKey]) matrix[roleKey] = {}
  matrix[roleKey][featKey] = !matrix[roleKey][featKey]
  if (!dirtyRoles.value.includes(roleKey)) dirtyRoles.value.push(roleKey)
}

async function loadMatrix() {
  loadingMatrix.value = true
  matrixMsg.value = ''
  try {
    const [fres, pres] = await Promise.all([adminAPI.getFeatures(), adminAPI.getPermissions()])
    features.value = fres.features || []
    roles.value = pres.roles || []
    // 初始化矩阵
    for (const r of roles.value) {
      const enabled = pres.matrix?.[r.key] || []
      const row = {}
      for (const f of features.value) row[f.key] = enabled.includes(f.key)
      matrix[r.key] = row
    }
    dirtyRoles.value = []
  } catch (e) {
    matrixMsg.value = '加载失败：' + (e?.response?.data?.message || e.message)
  } finally {
    loadingMatrix.value = false
  }
}

async function saveMatrix() {
  savingMatrix.value = true
  matrixMsg.value = ''
  try {
    for (const roleKey of dirtyRoles.value) {
      const enabled = Object.entries(matrix[roleKey])
        .filter(([, v]) => v)
        .map(([k]) => k)
      await adminAPI.updatePermissions(roleKey, enabled)
    }
    dirtyRoles.value = []
    matrixMsg.value = '✓ 权限矩阵已保存'
  } catch (e) {
    matrixMsg.value = '保存失败：' + (e?.response?.data?.message || e.message)
  } finally {
    savingMatrix.value = false
  }
}

// ===== 账号权限管理 =====
const searchText = ref('')
const searchResults = ref([])
const searching = ref(false)
const searched = ref(false)
const showResults = ref(false)
const selectedUser = ref(null)
const editForm = reactive({ role: 'user', permission: 1, credits: 10 })
const savingUser = ref(false)
const userMsg = ref('')

function onSearchInput() {
  showResults.value = true
}
function doSearch() {
  const q = searchText.value.trim()
  if (!q) return
  searching.value = true
  searched.value = true
  showResults.value = true
  adminAPI
    .searchUsers(q)
    .then((res) => {
      searchResults.value = res.users || []
    })
    .catch((e) => {
      searchResults.value = []
      userMsg.value = '搜索失败：' + (e?.response?.data?.message || e.message)
    })
    .finally(() => {
      searching.value = false
    })
}
function selectUser(u) {
  selectedUser.value = u
  editForm.role = u.role
  editForm.permission = u.permission
  editForm.credits = u.credits
  userMsg.value = ''
  showResults.value = false
}
function clearUser() {
  selectedUser.value = null
  searchText.value = ''
  searchResults.value = []
  searched.value = false
}
async function saveUser() {
  if (!selectedUser.value) return
  savingUser.value = true
  userMsg.value = ''
  try {
    const res = await adminAPI.updateUser(selectedUser.value.id, {
      role: editForm.role,
      permission: editForm.permission,
      credits: editForm.credits,
    })
    userMsg.value = `✓ 已保存：${res.user.username}（${roleLabel(res.user.role)}，权限 ${res.user.permission}，积分 ${res.user.credits}）`
    selectedUser.value = res.user
  } catch (e) {
    userMsg.value = '保存失败：' + (e?.response?.data?.message || e.message)
  } finally {
    savingUser.value = false
  }
}

onMounted(() => {
  if (isDominator.value) loadMatrix()
})
</script>

<style scoped>
.admin-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px 20px 60px;
}
.page-header h1 {
  color: #ffb000;
  font-size: 22px;
  letter-spacing: 2px;
  margin: 0 0 4px;
}
.subtitle {
  color: #94a3b8;
  font-size: 13px;
  margin: 0 0 20px;
}

.panel {
  background: rgba(15, 13, 10, 0.6);
  border: 1px solid rgba(159, 142, 120, 0.18);
  border-radius: 8px;
  margin-bottom: 24px;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(159, 142, 120, 0.18);
}
.panel-header h2 {
  margin: 0;
  color: #ffd597;
  font-size: 16px;
  letter-spacing: 1px;
}
.panel-badge {
  font-size: 11px;
  color: #94a3b8;
  font-family: 'Fira Code', monospace;
}
.panel-body { padding: 16px; }

.loading { color: #94a3b8; font-size: 13px; padding: 20px; text-align: center; }

/* 矩阵网格 */
.matrix-grid {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(159, 142, 120, 0.15);
  border-radius: 6px;
  overflow: hidden;
  /* 内部独立滚动，长矩阵不撑爆整页 */
  max-height: 520px;
  overflow-y: auto;
  overflow-x: hidden;
}
.mx-row {
  display: grid;
  grid-template-columns: 2fr repeat(var(--cols), 1fr);
  border-bottom: 1px solid rgba(159, 142, 120, 0.1);
}
.mx-row:last-child { border-bottom: none; }
.mx-cell {
  padding: 8px 12px;
  display: flex;
  align-items: center;
  font-size: 13px;
  border-right: 1px solid rgba(159, 142, 120, 0.08);
}
.mx-cell:last-child { border-right: none; }
.mx-head {
  background: rgba(30, 26, 18, 0.96);
  font-weight: 700;
  /* 矩阵内部滚动时表头常驻 */
  position: sticky;
  top: 0;
  z-index: 2;
}
.mx-head .mx-role { color: #ffb000; justify-content: center; }
.mx-feat { color: #c9bda5; }
.mx-perm { justify-content: center; }
.mx-check { width: 16px; height: 16px; accent-color: #ffb000; cursor: pointer; }
.mx-group-title {
  padding: 6px 12px;
  background: rgba(0, 0, 0, 0.25);
  color: #ffd597;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
}
.lvl-user .mx-role, .lvl-user.mx-perm { color: #cbd5e1; }
.lvl-referee .mx-role, .lvl-referee.mx-perm { color: #38bdf8; }
.lvl-admin .mx-role, .lvl-admin.mx-perm { color: #a855f7; }

.matrix-actions {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.dirty-hint { color: #fbbf24; font-size: 12px; }
.matrix-msg { color: #4ade80; font-size: 12px; }

/* 账号管理 */
.search-bar { position: relative; display: inline-block; }
.admin-search {
  width: 320px;
  max-width: 60vw;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.35);
  color: #ffd597;
  border: 1px solid rgba(255, 176, 0, 0.25);
  border-radius: 4px;
  font-size: 13px;
  outline: none;
}
.admin-search:focus { border-color: #ffb000; }
.search-results {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 50;
  min-width: 320px;
  max-height: 320px;
  overflow-y: auto;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: rgba(20, 18, 14, 0.98);
  border: 1px solid rgba(255, 176, 0, 0.3);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}
.search-results li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.search-results li:hover { background: rgba(255, 176, 0, 0.12); }
.search-results li.active { background: rgba(168, 85, 247, 0.16); }
.sr-name { font-weight: 700; color: #ffb000; }
.sr-email { color: #e2d8c2; flex: 1; font-size: 12px; }
.sr-role { font-size: 11px; color: #94a3b8; }
.search-no { padding: 10px; text-align: center; color: #94a3b8; font-size: 12px; }

.account-empty { color: #94a3b8; font-size: 13px; padding: 12px 0; }
.account-edit {
  margin-top: 16px;
  border: 1px solid rgba(168, 85, 247, 0.2);
  border-radius: 6px;
  padding: 14px;
  background: rgba(168, 85, 247, 0.04);
}
.ae-title { color: #e2d8c2; font-size: 14px; margin-bottom: 12px; }
.ae-title strong { color: #c084fc; }
.ae-email { color: #94a3b8; font-size: 12px; margin-left: 8px; }
.ae-grid { display: flex; gap: 16px; flex-wrap: wrap; }
.ae-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #c9bda5; }
.ae-input {
  width: 200px;
  padding: 7px 10px;
  background: rgba(0, 0, 0, 0.35);
  color: #ffd597;
  border: 1px solid rgba(255, 176, 0, 0.25);
  border-radius: 4px;
  font-size: 13px;
  outline: none;
}
.ae-input:focus { border-color: #ffb000; }
.ae-actions { margin-top: 14px; display: flex; align-items: center; gap: 12px; }
.user-msg { color: #4ade80; font-size: 12px; }

.btn {
  padding: 7px 14px;
  background: rgba(159, 142, 120, 0.1);
  border: 1px solid rgba(159, 142, 120, 0.3);
  color: #c9bda5;
  font-size: 13px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.btn:hover { border-color: rgba(159, 142, 120, 0.5); color: #e2d8c2; }
.btn-save {
  border-color: rgba(255, 176, 0, 0.4);
  color: #ffb000;
  background: rgba(255, 176, 0, 0.08);
}
.btn-save:hover { background: rgba(255, 176, 0, 0.18); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-add {
  border-color: rgba(56, 189, 248, 0.4);
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.08);
}
.btn-add:hover { background: rgba(56, 189, 248, 0.18); }

.admin-denied {
  max-width: 600px;
  margin: 80px auto;
  text-align: center;
  color: #94a3b8;
}
.admin-denied h1 { color: #ff6b6b; font-size: 28px; }
</style>
