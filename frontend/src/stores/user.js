import { defineStore } from 'pinia';

export const useUserStore = defineStore('user', {
  state: () => ({
    user: null,
    token: localStorage.getItem('token') || null
  }),
  
  getters: {
    isLoggedIn: (state) => !!state.token,
    currentFaction: (state) => state.user?.faction || 'earth'
  },
  
  actions: {
    setUser(user) {
      this.user = user;
    },
    setToken(token) {
      this.token = token;
      localStorage.setItem('token', token);
    },
    clearUser() {
      this.user = null;
      this.token = null;
      localStorage.removeItem('token');
    }
  }
});
