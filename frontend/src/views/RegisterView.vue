<template>
  <div class="register-container">
    <CRTScanlines />
    
    <div class="register-box">
      <h1 class="register-title font-space">创建账号</h1>
      
      <div class="form-group">
        <label>用户名</label>
        <input 
          v-model="username" 
          type="text" 
          class="tactical-input" 
          placeholder="请输入用户名"
        />
      </div>
      
      <div class="form-group">
        <label>密码</label>
        <input 
          v-model="password" 
          type="password" 
          class="tactical-input" 
          placeholder="请输入密码"
        />
      </div>
      
      <div class="form-group">
        <label>选择阵营</label>
        <div class="faction-select">
          <div
            v-for="f in factions"
            :key="f.id"
            class="faction-option"
            :class="{ active: selectedFaction === f.id }"
            @click="selectedFaction = f.id"
          >
            <Icon :name="f.icon" size="32" variant="primary" />
            <span class="faction-name font-space uppercase">{{ f.name }}</span>
            <div v-if="selectedFaction === f.id" class="faction-indicator"></div>
          </div>
        </div>
      </div>
      
      <div v-if="error" class="error-message">
        {{ error }}
      </div>
      
      <div class="button-group">
        <Button variant="secondary" @click="$router.push('/login')">返回</Button>
        <Button variant="primary" @click="handleRegister">注册</Button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import CRTScanlines from '../components/ui/CRTScanlines.vue';
import Button from '../components/ui/Button.vue';
import Icon from '../components/ui/Icon.vue';

const router = useRouter();

const username = ref('');
const password = ref('');
const selectedFaction = ref('earth');
const error = ref('');

const factions = [
  { id: 'earth', name: '地球联合', icon: 'earth' },
  { id: 'balon', name: '拜隆', icon: 'moon' },
  { id: 'maxion', name: '马克西翁', icon: 'star' }
];

async function handleRegister() {
  if (!username.value || !password.value) {
    error.value = '请输入用户名和密码';
    return;
  }
  
  try {
    await axios.post('/api/auth/register', {
      username: username.value,
      password: password.value,
      faction: selectedFaction.value
    });
    
    alert('注册成功！请登录');
    router.push('/login');
  } catch (err) {
    error.value = err.response?.data?.error || '注册失败';
  }
}
</script>

<style scoped>
@import '@/styles/variables.css';
@import '@/styles/utilities.css';

.register-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 20px;
  background: var(--surface);
  position: relative;
}

.register-box {
  width: 100%;
  max-width: 450px;
  background: var(--surface-container);
  padding: 32px;
  position: relative;
}

/* 色调层级边框 */
.register-box::before {
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

.register-title {
  font-family: var(--font-headline);
  font-size: 20px;
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

.faction-select {
  display: flex;
  gap: 12px;
}

.faction-option {
  flex: 1;
  padding: 16px 12px;
  background: var(--surface-container-highest);
  text-align: center;
  cursor: pointer;
  transition: all 0.2s steps(4);
  position: relative;
  overflow: hidden;
}

/* 色调层级边框 */
.faction-option::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border: 2px solid transparent;
  transition: border-color 0.2s steps(4);
}

.faction-option:hover {
  background: var(--surface-container);
}

.faction-option:hover::before {
  border-color: var(--surface-container-highest);
}

.faction-option.active {
  background: var(--surface-container-low);
}

.faction-option.active::before {
  border-color: var(--primary);
}

.faction-name {
  font-size: var(--text-sm);
  color: var(--on-surface);
  font-weight: var(--font-semibold);
}

.faction-indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 12px;
  height: 12px;
  background: var(--primary);
  border-radius: 50%;
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
