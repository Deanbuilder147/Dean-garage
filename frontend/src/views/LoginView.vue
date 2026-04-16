<template>
  <div class="login-container">
    <CRTScanlines />
    
    <div class="login-box">
      <div class="login-logo">
        <Icon name="sword" size="48" variant="primary" />
      </div>
      <h1 class="login-title font-space">机甲战棋</h1>
      
      <div class="form-group">
        <label>用户名</label>
        <input 
          v-model="username" 
          type="text" 
          class="tactical-input" 
          placeholder="请输入用户名"
          @keyup.enter="handleLogin"
        />
      </div>
      
      <div class="form-group">
        <label>密码</label>
        <input 
          v-model="password" 
          type="password" 
          class="tactical-input" 
          placeholder="请输入密码"
          @keyup.enter="handleLogin"
        />
      </div>
      
      <div v-if="error" class="error-message">
        {{ error }}
      </div>
      
      <div class="button-group">
        <Button variant="primary" @click="handleLogin">登录</Button>
        <Button variant="secondary" @click="$router.push('/register')">注册</Button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import { useUserStore } from '../stores/user';
import CRTScanlines from '../components/ui/CRTScanlines.vue';
import Button from '../components/ui/Button.vue';
import Icon from '../components/ui/Icon.vue';

const router = useRouter();
const userStore = useUserStore();

const username = ref('');
const password = ref('');
const error = ref('');

async function handleLogin() {
  if (!username.value || !password.value) {
    error.value = '请输入用户名和密码';
    return;
  }
  
  try {
    const response = await axios.post('/api/auth/login', {
      username: username.value,
      password: password.value
    });
    
    // 保存token
    localStorage.setItem('token', response.data.token);
    userStore.setUser(response.data.user);
    
    router.push('/home');
  } catch (err) {
    error.value = err.response?.data?.error || '登录失败';
  }
}
</script>

<style scoped>
@import '@/styles/variables.css';
@import '@/styles/utilities.css';

.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 20px;
  background: var(--surface);
  position: relative;
}

.login-box {
  width: 100%;
  max-width: 400px;
  background: var(--surface-container);
  padding: 32px;
  position: relative;
}

/* 色调层级边框 */
.login-box::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    var(--surface-container-highest) 20%,
    var(--surface-container-highest) 50%,
    var(--surface-container-highest) 80%,
    transparent
  );
}

.login-title {
  font-family: var(--font-headline);
  font-size: 24px;
  font-weight: 900;
  color: var(--primary);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  text-align: center;
  margin-bottom: 32px;
  font-style: italic;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: var(--on-surface-variant);
  font-size: var(--text-sm);
  font-family: var(--font-headline);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.tactical-input {
  width: 100%;
  padding: 10px 14px;
  background: var(--surface-container-highest);
  color: var(--on-surface);
  border: none;
  font-size: var(--text-base);
  font-family: var(--font-headline);
  transition: all 0.2s steps(4);
}

.tactical-input:focus {
  outline: none;
  background: var(--surface-container-lowest);
}

.button-group {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.button-group button {
  flex: 1;
}

.error-message {
  color: var(--error);
  margin-top: 16px;
  font-size: var(--text-sm);
  font-family: var(--font-mono);
  text-align: center;
  padding: 8px;
  background: rgba(244, 67, 54, 0.1);
}
</style>
