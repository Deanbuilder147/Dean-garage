· <template>
  <div class="terminal-shell" @click="focusInput">
    <!-- Background grid -->
    <div class="terminal-grid-bg"></div>
    <!-- Scanline overlay -->
    <div class="terminal-scanline"></div>

    <!-- ========== 上方：标题区（固定） ========== -->
    <div class="terminal-header">
      <div class="header-content">
        <!-- ASCII Logo -->
        <div v-if="showLogo" class="terminal-logo">
          <pre class="ascii-art">██╗   ██╗██╗██████╗ ████████╗██╗   ██╗██████╗  █████╗ ██╗          ██████╗ ██████╗ ███╗   ███╗██████╗  █████╗ ████████╗
██║   ██║██║██╔══██╗╚══██╔══╝██║   ██║██╔══██╗██╔══██╗██║         ██╔════╝██╔═══██╗████╗ ████║██╔══██╗██╔══██╗╚══██╔══╝
██║   ██║██║██████╔╝   ██║   ██║   ██║██████╔╝███████║██║         ██║     ██║   ██║██╔████╔██║██████╔╝███████║   ██║   
╚██╗ ██╔╝██║██╔══██╗   ██║   ██║   ██║██╔══██╗██╔══██║██║         ██║     ██║   ██║██║╚██╔╝██║██╔══██╗██╔══██║   ██║   
 ╚████╔╝ ██║██║  ██║   ██║   ╚██████╔╝██║  ██║██║  ██║███████╗    ╚██████╗╚██████╔╝██║ ╚═╝ ██║██████╔╝██║  ██║   ██║   
  ╚═══╝  ╚═╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝     ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚═════╝ ╚═╝  ╚═╝   ╚═╝   </pre>
          <div class="logo-subtitle">BETA 1.0</div>
        </div>

        <!-- Welcome message -->
        <div v-if="showWelcome" class="terminal-welcome">
          <p class="t-accent">[ UNIT_01 TERMINAL SYSTEM ]</p>
          <p class="t-dim">CONNECTED VIA SECURE ENCRYPTED CHANNEL 0x8842</p>
          <p class="t-dim">OS: KINETIC_OS v2.4.1 // ARCH: NEURAL_MAPPED_64</p>
        </div>

        <!-- Boot logs -->
        <div v-if="showBootLogs" class="terminal-logs">
          <div v-for="(log, i) in bootLogs" :key="i" class="log-line">
            <span class="log-time">{{ log.time }}</span>
            <span :class="log.cls">{{ log.text }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ========== 下方：命令交互区（可滚动） ========== -->
    <div class="terminal-command-area" ref="outputRef">
      <div class="command-content">
        <!-- Command history output -->
        <div class="terminal-history">
          <div v-for="(entry, i) in history" :key="i" class="history-entry">
            <!-- Command line -->
            <div v-if="entry.type === 'command'" class="cmd-line">
              <span class="t-prompt">{{ entry.prompt }}</span>
              <span class="t-input">{{ entry.text }}</span>
            </div>
            <!-- Output lines -->
            <div v-else-if="entry.type === 'output'" :class="entry.cls || ''">{{ entry.html || entry.text }}</div>
            <!-- Login prompt (interactive) -->
            <div v-else-if="entry.type === 'login-prompt'" class="login-step">
              {{ entry.label }}
              <span class="t-input">{{ entry.display }}</span>
            </div>
          </div>
        </div>

        <!-- Tab completion hint -->
        <div v-if="tabHint" class="tab-hint">
          {{ tabHint }}
        </div>

        <!-- Inline command input line -->
        <div class="cmd-line inline-input-line">
          <span class="t-prompt">{{ currentPrompt }}</span>
          <div class="input-wrapper">
            <input
              ref="inputRef"
              v-model="currentInput"
              class="terminal-input-field"
              :type="inputType"
              :placeholder="inputPlaceholder"
              @keydown="handleKeydown"
              @keyup.tab.prevent
              autocomplete="off"
              spellcheck="false"
            />
          </div>
          <div class="status-indicators">
            <span class="status-dot"></span>
            <span class="status-text">LINK: STABLE</span>
            <span class="status-text">ENC: AES-512</span>
            <span class="status-text t-accent">{{ loginState === 'logged-in' ? 'LOCKED' : 'UNLOCKED' }}</span>
          </div>
        </div>

        <!-- Command hints -->
        <div class="command-hints">
          <span v-for="c in allCommands" :key="c.cmd" class="hint-chip" @click="fillCommand(c.cmd)">{{ c.cmd }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import { useUserStore } from '../stores/user';

const router = useRouter();
const userStore = useUserStore();

// Refs
const outputRef = ref(null);
const inputRef = ref(null);

// Display flags
const showLogo = ref(true);
const showWelcome = ref(true);
const showBootLogs = ref(true);

// Boot log simulation
const bootLogs = ref([]);
const bootLogData = [
  { time: '00:00:01', text: ':: BOOT_SEQUENCE INITIATED...', cls: 't-dim' },
  { time: '00:00:03', text: ':: CORE_STABILITY: 98.4%', cls: 't-info' },
  { time: '00:00:04', text: ':: PERIMETER_SWEEP COMPLETE', cls: 't-accent' },
  { time: '00:00:06', text: ':: 3 HOSTILE SIGNATURES DETECTED AT [GRID_A9]', cls: 't-accent' },
  { time: '00:00:07', text: ':: NEURAL_LINK CALIBRATED', cls: 't-dim' },
  { time: '00:00:09', text: ':: SYSTEM_READY // AWAITS_INPUT', cls: 't-accent' },
];

// Terminal state
const history = ref([]);
const currentInput = ref('');
const commandHistory = ref([]);
const historyIndex = ref(-1);
const tabHint = ref('');

// Login state machine: 'idle' | 'login-username' | 'login-password' | 'register-username' | 'register-password' | 'logged-in'
const loginState = ref('idle');
const loginUsername = ref('');
const loginPassword = ref('');

// Check if already logged in
const existingToken = localStorage.getItem('token');
if (existingToken) {
  loginState.value = 'logged-in';
}

// Computed
const currentPrompt = computed(() => {
  if (loginState.value === 'logged-in') {
    const name = userStore.user?.username || loginUsername.value || 'user';
    return `[${name}@mecha ~]$ `;
  }
  return `[guest@mecha ~]$ `;
});

const inputType = computed(() => {
  if (loginState.value === 'login-password' || loginState.value === 'register-password') {
    return 'password';
  }
  return 'text';
});

const inputPlaceholder = computed(() => {
  switch (loginState.value) {
    case 'login-username': return 'INPUT_USER_ID...';
    case 'login-password': return 'INPUT_PASSWORD...';
    case 'register-username': return 'INPUT_USER_ID...';
    case 'register-password': return 'INPUT_PASSWORD...';
    default: return '输入命令...';
  }
});

// Available commands
const allCommands = computed(() => {
  const base = [
    { cmd: 'help', desc: '显示可用命令', auth: false },
    { cmd: 'clear', desc: '清屏', auth: false },
    { cmd: 'login', desc: '登录系统', auth: false },
    { cmd: 'register', desc: '注册新账号', auth: false },
  ];
  const authed = [
    { cmd: 'mecha_bay', desc: '进入机甲库（棋子设计）', auth: true },
    { cmd: 'map_editor', desc: '进入棋盘设计（战场编辑）', auth: true },
    { cmd: 'sim_combat', desc: '进入战术推演（开始战斗）', auth: true },
    { cmd: 'status', desc: '查看当前状态', auth: true },
    { cmd: 'logout', desc: '退出登录', auth: true },
  ];
  if (loginState.value === 'logged-in') {
    return [...base.filter(c => c.cmd !== 'login' && c.cmd !== 'register'), ...authed];
  }
  return base;
});

const commandNames = computed(() => allCommands.value.map(c => c.cmd));

// Methods
function focusInput() {
  inputRef.value?.focus();
}

function fillCommand(cmd) {
  currentInput.value = cmd;
  inputRef.value?.focus();
}

function scrollToBottom() {
  nextTick(() => {
    if (outputRef.value) {
      outputRef.value.scrollTop = outputRef.value.scrollHeight;
    }
  });
}

function addOutput(text, cls = '', html = '') {
  history.value.push({ type: 'output', text, cls, html });
  scrollToBottom();
}

function addCommand(prompt, text) {
  history.value.push({ type: 'command', prompt, text });
  scrollToBottom();
}

function addLoginPrompt(label, display) {
  history.value.push({ type: 'login-prompt', label, display });
  scrollToBottom();
}

function getTimestamp() {
  const now = new Date();
  return now.toTimeString().split(' ')[0];
}

// Boot animation
async function runBootSequence() {
  for (let i = 0; i < bootLogData.length; i++) {
    await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
    bootLogs.value.push(bootLogData[i]);
    scrollToBottom();
  }

  // If already logged in, show welcome back
  if (loginState.value === 'logged-in') {
    addOutput('');
    addOutput('// SESSION_RESUMED: WELCOME_BACK, PILOT', 't-accent');
    addOutput('输入 help 查看可用命令', 't-dim');
  } else {
    // Not logged in — prompt to register or login
    addOutput('');
    addOutput('请输入 register 注册新账号 或 login 登录已有账号', 't-dim');
  }
}

// Command handler
function handleKeydown(e) {
  tabHint.value = '';

  if (e.key === 'Enter') {
    e.preventDefault();
    executeInput();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    navigateHistory(-1);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    navigateHistory(1);
  } else if (e.key === 'Tab') {
    e.preventDefault();
    tabComplete();
  } else if (e.key === 'c' && e.ctrlKey) {
    e.preventDefault();
    cancelCurrentOperation();
  } else if (e.key === 'l' && e.ctrlKey) {
    e.preventDefault();
    clearScreen();
  }
}

function executeInput() {
  const input = currentInput.value.trim();
  currentInput.value = '';

  // Handle login flow states
  if (loginState.value === 'login-username') {
    if (!input) {
      addOutput('// ERROR: 用户名不能为空', 't-error');
      return;
    }
    loginUsername.value = input;
    addLoginPrompt('ID_REQUIRED:', input);
    loginState.value = 'login-password';
    return;
  }

  if (loginState.value === 'login-password') {
    if (!input) {
      addOutput('// ERROR: 密码不能为空', 't-error');
      return;
    }
    loginPassword.value = input;
    addLoginPrompt('PASSWORD:', '••••••••');
    performLogin();
    return;
  }

  if (loginState.value === 'register-username') {
    if (!input) {
      addOutput('// ERROR: 用户名不能为空', 't-error');
      return;
    }
    loginUsername.value = input;
    addLoginPrompt('ID_REQUIRED:', input);
    loginState.value = 'register-password';
    return;
  }

  if (loginState.value === 'register-password') {
    if (!input) {
      addOutput('// ERROR: 密码不能为空', 't-error');
      return;
    }
    loginPassword.value = input;
    addLoginPrompt('PASSWORD:', '••••••••');
    performRegister();
    return;
  }

  // Normal command mode
  if (!input) {
    addCommand(currentPrompt.value, '');
    return;
  }

  addCommand(currentPrompt.value, input);
  commandHistory.value.push(input);
  historyIndex.value = -1;

  const [cmd, ...args] = input.toLowerCase().split(/\s+/);
  executeCommand(cmd, args.join(' '));
}

async function performLogin() {
  addOutput('// AUTHENTICATING...', 't-dim');
  try {
    const response = await axios.post('/api/auth/login', {
      username: loginUsername.value,
      password: loginPassword.value
    });
    localStorage.setItem('token', response.data.token);
    userStore.setUser(response.data.user);
    loginState.value = 'logged-in';
    addOutput(`// ACCESS_GRANTED: PILOT_${String(response.data.user?.id || '084').padStart(3, '0')} AUTHENTICATED`, 't-accent');
    addOutput('');
    addOutput('输入 help 查看可用命令', 't-dim');
  } catch (err) {
    const msg = err.response?.data?.error || 'AUTH_FAILED';
    addOutput(`// ACCESS_DENIED: ${msg}`, 't-error');
    loginState.value = 'idle';
  }
  loginPassword.value = '';
}

async function performRegister() {
  addOutput('// CREATING_UNIT...', 't-dim');
  try {
    await axios.post('/api/auth/register', {
      username: loginUsername.value,
      password: loginPassword.value
    });
    addOutput('// UNIT_CREATED_SUCCESSFULLY', 't-accent');
    addOutput('请使用 login 命令登录', 't-dim');
    loginState.value = 'idle';
  } catch (err) {
    const msg = err.response?.data?.error || 'REGISTRATION_FAILED';
    addOutput(`// ERROR: ${msg}`, 't-error');
    loginState.value = 'idle';
  }
  loginPassword.value = '';
}

function executeCommand(cmd, args) {
  switch (cmd) {
    case 'help':
      showHelp();
      break;
    case 'clear':
      clearScreen();
      break;
    case 'login':
      if (loginState.value === 'logged-in') {
        addOutput('// ERROR: 已登录，请先 logout', 't-error');
      } else {
        loginState.value = 'login-username';
        addOutput('ID_REQUIRED:', 't-accent');
      }
      break;
    case 'register':
      if (loginState.value === 'logged-in') {
        addOutput('// ERROR: 已登录，请先 logout', 't-error');
      } else {
        loginState.value = 'register-username';
        addOutput('ID_REQUIRED:', 't-accent');
      }
      break;
    case 'mecha_bay':
      if (!requireAuth()) break;
      addOutput('// INITIATING_MECHA_BAY_PROTOCOL...', 't-dim');
      setTimeout(() => router.push('/units'), 600);
      break;
    case 'map_editor':
      if (!requireAuth()) break;
      addOutput('// LOADING_MAP_EDITOR...', 't-dim');
      setTimeout(() => router.push('/battlefields'), 600);
      break;
    case 'sim_combat':
      if (!requireAuth()) break;
      addOutput('// INITIATING_COMBAT_SIMULATION...', 't-dim');
      setTimeout(() => {
        router.push('/home');
      }, 600);
      break;
    case 'status':
      if (!requireAuth()) break;
      showStatus();
      break;
    case 'logout':
      if (loginState.value !== 'logged-in') {
        addOutput('// ERROR: 未登录', 't-error');
        break;
      }
      localStorage.removeItem('token');
      userStore.clearUser();
      loginState.value = 'idle';
      loginUsername.value = '';
      addOutput('// SESSION_TERMINATED', 't-accent');
      addOutput('请输入 register 注册新账号 或 login 登录已有账号', 't-dim');
      break;
    default:
      addOutput(`// UNKNOWN_COMMAND: "${cmd}" — 输入 help 查看可用命令`, 't-error');
  }
}

function requireAuth() {
  if (loginState.value !== 'logged-in') {
    addOutput('// ERROR: ACCESS_DENIED — 请先 login', 't-error');
    return false;
  }
  return true;
}

function showHelp() {
  addOutput('');
  addOutput('╔══════════════════════════════════════════╗', 't-accent');
  addOutput('║        AVAILABLE_OPERATIONS              ║', 't-accent');
  addOutput('╚══════════════════════════════════════════╝', 't-accent');
  addOutput('');
  for (const c of allCommands.value) {
    const padding = ' '.repeat(Math.max(1, 16 - c.cmd.length));
    addOutput(`  ${c.cmd.toUpperCase()}${padding}— ${c.desc}`, '');
  }
  addOutput('');
  addOutput('提示: 使用 Tab 自动补全 · ↑↓ 切换历史 · 点击下方命令可直接填入', 't-dim');
  addOutput('');
}

function showStatus() {
  const user = userStore.user;
  addOutput('');
  addOutput(`  PILOT_ID:   ${user?.username || loginUsername.value || 'N/A'}`, '');
  addOutput(`  SESSION:    ACTIVE`, '');
  addOutput(`  UPTIME:     ${getTimestamp()}`, '');
  addOutput('');
}

function clearScreen() {
  history.value = [];
  showLogo.value = false;
  showWelcome.value = false;
  showBootLogs.value = false;
  scrollToBottom();
}

function navigateHistory(direction) {
  if (commandHistory.value.length === 0) return;

  if (historyIndex.value === -1) {
    historyIndex.value = commandHistory.value.length - 1;
  } else {
    historyIndex.value += direction;
  }

  if (historyIndex.value < 0) {
    historyIndex.value = 0;
  }
  if (historyIndex.value >= commandHistory.value.length) {
    historyIndex.value = commandHistory.value.length - 1;
  }

  currentInput.value = commandHistory.value[historyIndex.value];
}

function tabComplete() {
  const input = currentInput.value.trim().toLowerCase();
  if (!input) return;

  const matches = commandNames.value.filter(c => c.startsWith(input));
  if (matches.length === 1) {
    currentInput.value = matches[0] + ' ';
    tabHint.value = '';
  } else if (matches.length > 1) {
    tabHint.value = matches.map(m => m.toUpperCase()).join('  ');
    const commonPrefix = matches.reduce((acc, m) => {
      let i = 0;
      while (i < acc.length && i < m.length && acc[i] === m[i]) i++;
      return acc.substring(0, i);
    });
    if (commonPrefix.length > input.length) {
      currentInput.value = commonPrefix;
    }
  } else {
    tabHint.value = '// NO_MATCH';
  }
}

function cancelCurrentOperation() {
  if (loginState.value !== 'idle' && loginState.value !== 'logged-in') {
    addOutput('^C', 't-dim');
    addOutput('// OPERATION_ABORTED', 't-error');
    loginState.value = loginState.value === 'logged-in' ? 'logged-in' : 'idle';
  }
}

// Lifecycle
onMounted(() => {
  runBootSequence();
  nextTick(() => focusInput());
});

onUnmounted(() => {});
</script>

<style scoped>
@import '@/styles/variables.css';

.terminal-shell {
  position: relative;
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #061f28;
  color: #c1e8ff;
  font-family: 'Fira Code', 'Space Mono', 'Courier New', monospace;
  overflow: hidden;
}

/* Background grid */
.terminal-grid-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  opacity: 0.05;
  pointer-events: none;
  background-image: radial-gradient(circle, #9f8e78 1px, transparent 1px);
  background-size: 24px 24px;
}

/* Scanline overlay */
.terminal-scanline {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: linear-gradient(to bottom, transparent 50%, rgba(255, 176, 0, 0.01) 50%);
  background-size: 100% 4px;
}

/* ========== 上方：标题区 ========== */
.terminal-header {
  position: relative;
  z-index: 2;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(255, 176, 0, 0.15);
  background: rgba(6, 31, 40, 0.95);
}

.header-content {
  max-width: 960px;
  margin: 0 auto;
  padding: 20px 24px 12px;
}

/* ASCII Logo */
.terminal-logo {
  margin-bottom: 12px;
}

.ascii-art {
  font-size: 10px;
  line-height: 1.1;
  color: #ffb000;
  overflow-x: auto;
  white-space: pre;
  margin: 0;
}

@media (min-width: 768px) {
  .ascii-art {
    font-size: 12px;
  }
}

.logo-subtitle {
  color: #ffb000;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 24px;
  font-weight: 900;
  margin-top: 8px;
  letter-spacing: 0.3em;
  text-transform: uppercase;
}

/* Welcome */
.terminal-welcome {
  margin-bottom: 8px;
}

.terminal-welcome p {
  margin: 2px 0;
}

/* Boot logs */
.terminal-logs {
  margin-bottom: 8px;
}

.log-line {
  display: flex;
  gap: 16px;
  margin: 1px 0;
}

.log-time {
  color: #666;
  flex-shrink: 0;
  font-size: 12px;
}

/* ========== 下方：命令交互区 ========== */
.terminal-command-area {
  flex: 1;
  overflow-y: auto;
  position: relative;
  z-index: 2;
  padding: 16px 24px 16px;
}

.terminal-command-area::-webkit-scrollbar {
  width: 4px;
}

.terminal-command-area::-webkit-scrollbar-track {
  background: transparent;
}

.terminal-command-area::-webkit-scrollbar-thumb {
  background: rgba(255, 176, 0, 0.3);
}

.command-content {
  max-width: 960px;
  margin: 0 auto;
}

/* History entries */
.terminal-history {
  min-height: 0;
}

.cmd-line {
  margin: 4px 0;
  display: flex;
  align-items: center;
  gap: 0;
  flex-wrap: nowrap;
}

.login-step {
  padding-left: 16px;
  margin: 2px 0;
}

/* Tab hint */
.tab-hint {
  margin: 2px 0;
  padding: 2px 4px;
}

/* Inline input line */
.inline-input-line {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 176, 0, 0.12);
}

.input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
}

.terminal-input-field {
  flex: 1;
  background: transparent;
  border: none;
  color: #ffffff;
  font-family: 'Fira Code', 'Space Mono', 'Courier New', monospace;
  font-size: 14px;
  outline: none;
  padding: 0;
  caret-color: #ffb000;
  min-width: 80px;
}

.terminal-input-field::placeholder {
  color: #555;
}

/* Status indicators */
.status-indicators {
  display: none;
  align-items: center;
  gap: 16px;
  font-size: 10px;
  font-family: 'Space Grotesk', sans-serif;
  letter-spacing: 0.1em;
  color: #666;
  margin-left: auto;
  flex-shrink: 0;
}

@media (min-width: 768px) {
  .status-indicators {
    display: flex;
  }
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ffb000;
  margin-right: 4px;
  display: inline-block;
}

.status-text {
  white-space: nowrap;
}

/* ========== 指令提示区 ========== */
.command-hints {
  margin-top: 8px;
  padding-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  border-top: 1px solid rgba(255, 176, 0, 0.06);
}

.hint-chip {
  display: inline-block;
  padding: 3px 10px;
  font-size: 12px;
  font-family: 'Fira Code', 'Space Mono', 'Courier New', monospace;
  color: #ffb000;
  background: rgba(255, 176, 0, 0.06);
  border: 1px solid rgba(255, 176, 0, 0.15);
  border-radius: 3px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  user-select: none;
}

.hint-chip:hover {
  background: rgba(255, 176, 0, 0.15);
  border-color: rgba(255, 176, 0, 0.4);
}

/* Text color classes */
.t-accent {
  color: #ffb000;
}

.t-dim {
  color: #666;
}

.t-info {
  color: #005761;
}

.t-error {
  color: #ff6e81;
}

.t-prompt {
  color: #ffb000;
  font-weight: 700;
  white-space: nowrap;
}

.t-input {
  color: #ffffff;
}
</style>
