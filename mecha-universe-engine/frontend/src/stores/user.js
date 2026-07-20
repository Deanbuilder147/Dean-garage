/**
 * Phase 29-X — 用户状态管理 (Pinia)
 *
 * 纯净 Token + 用户信息管理，无侧边栏/旧业务污染。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useUserStore = defineStore('user', () => {
  const user = ref(null)
  const token = ref(localStorage.getItem('token') || null)

  const isLoggedIn = computed(() => !!token.value)
  const currentFaction = computed(() => user.value?.faction || 'earth')

  function setUser(userData) {
    user.value = userData
  }

  function setToken(newToken) {
    token.value = newToken
    if (newToken) {
      localStorage.setItem('token', newToken)
    } else {
      localStorage.removeItem('token')
    }
  }

  function clearUser() {
    user.value = null
    token.value = null
    localStorage.removeItem('token')
  }

  return { user, token, isLoggedIn, currentFaction, setUser, setToken, clearUser }
})
