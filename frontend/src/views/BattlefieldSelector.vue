<template>
  <div class="battlefield-selector-modal" @click.self="closeModal">
    <CRTScanlines />
    
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-title-wrapper">
          <Icon name="sword" size="24" variant="primary" />
          <h2 class="font-space uppercase">选择战场</h2>
        </div>
        <button class="close-btn" @click="closeModal">
          <Icon name="close" size="16" variant="default" />
        </button>
      </div>
      
      <div class="modal-body">
        <div v-if="loading" class="loading-state">
          <div class="loading-spinner"></div>
          <p class="font-mono">加载战场列表...</p>
        </div>
        
        <div v-else-if="error" class="error-state">
          <div class="error-wrapper">
            <Icon name="close" size="20" variant="error" />
            <p class="font-space">{{ error }}</p>
          </div>
          <Button @click="loadBattlefields" variant="primary">重试</Button>
        </div>
        
        <div v-else-if="battlefields.length === 0" class="empty-state">
          <p class="font-space">暂无可用战场</p>
          <p class="hint font-mono">请先创建战场</p>
        </div>
        
        <div v-else class="battlefield-grid">
          <div 
            v-for="bf in battlefields" 
            :key="bf.id" 
            class="battlefield-card"
            :class="{ selected: selectedBattlefield?.id === bf.id }"
            @click="selectBattlefield(bf)"
          >
            <!-- 预览图区域 -->
            <div class="card-preview">
              <div v-if="bf.preview" class="preview-image">
                <img :src="bf.preview" alt="战场预览" />
              </div>
              <div v-else class="preview-placeholder">
                <Icon name="map" size="32" variant="primary" />
                <span class="preview-text">{{ bf.name }}</span>
              </div>
              <!-- 尺寸标签 -->
              <div class="size-badge">
                {{ bf.width }}×{{ bf.height }}
              </div>
            </div>
            
            <!-- 信息区域 -->
            <div class="card-info">
              <h3 class="battlefield-name">{{ bf.name }}</h3>
              <p class="battlefield-size">{{ getSizeLabel(bf.width, bf.height) }}</p>
            </div>
            
            <!-- 选择按钮 -->
            <Button 
              variant="primary"
              :class="{ selected: selectedBattlefield?.id === bf.id }"
              @click.stop="confirmSelection(bf)"
              size="small"
            >
              {{ selectedBattlefield?.id === bf.id ? '已选择' : '选择' }}
            </Button>
          </div>
        </div>
      </div>
      
      <div class="modal-footer" v-if="selectedBattlefield">
        <div class="selected-info">
          <span class="font-mono">已选择: <strong>{{ selectedBattlefield.name }}</strong></span>
          <span class="selected-size font-mono">{{ selectedBattlefield.width }}×{{ selectedBattlefield.height }}</span>
        </div>
        <div class="action-btns">
          <Button @click="closeModal" variant="secondary">取消</Button>
          <Button @click="createRoom" variant="primary" :disabled="creating">
            {{ creating ? '创建中...' : '进入整备室' }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Button from '@/components/ui/Button.vue';
import CRTScanlines from '@/components/ui/CRTScanlines.vue';
import Icon from '@/components/ui/Icon.vue';
import { commAPI } from '@/api/client.js';

const router = useRouter();

// Props
const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
});

// Emits
const emit = defineEmits(['close', 'select']);

// 状态
const battlefields = ref([]);
const loading = ref(false);
const error = ref(null);
const selectedBattlefield = ref(null);
const creating = ref(false);

// 加载战场列表
async function loadBattlefields() {
  loading.value = true;
  error.value = null;
  
  try {
    const res = await fetch('/api/map/battlefields');
    const data = await res.json();
    
    if (res.ok) {
      battlefields.value = data.battlefields || data || [];
    } else {
      error.value = data.error || '加载失败';
    }
  } catch (err) {
    console.error('加载战场列表失败:', err);
    error.value = '网络错误，请检查后端服务';
  } finally {
    loading.value = false;
  }
}

// 获取尺寸标签
function getSizeLabel(width, height) {
  const total = width * height;
  if (total <= 150) return '小型战场';
  if (total <= 450) return '中型战场';
  if (total <= 1500) return '大型战场';
  return '超大型战场';
}

// 选择战场
function selectBattlefield(bf) {
  selectedBattlefield.value = bf;
}

// 确认选择
function confirmSelection(bf) {
  selectedBattlefield.value = bf;
}

// 创建房间并跳转
async function createRoom() {
  if (!selectedBattlefield.value) return;
  
  creating.value = true;
  
  try {
    const res = await commAPI.createRoom({
      battlefield_id: selectedBattlefield.value.id,
      max_players: 6
    });
    
    if (res.data && res.data.room) {
      // 跳转到整备室
      router.push(`/preparation/${res.data.room.id}`);
      emit('close');
    } else {
      alert(res.data?.error || '创建房间失败');
    }
  } catch (err) {
    console.error('创建房间失败:', err);
    const errorMsg = err.response?.data?.error || '创建房间失败，请检查网络连接';
    alert(errorMsg);
  } finally {
    creating.value = false;
  }
}

// 关闭弹窗
function closeModal() {
  selectedBattlefield.value = null;
  emit('close');
}

// 初始化
onMounted(() => {
  loadBattlefields();
});
</script>

<style scoped>
@import '@/styles/variables.css';
@import '@/styles/utilities.css';

.battlefield-selector-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 14, 20, 0.85);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  padding: 20px;
}

.modal-content {
  background: var(--surface-container);
  border: none;
  width: 100%;
  max-width: 900px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* 色调层级边框 */
.modal-content::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border: 1px solid var(--surface-container-highest);
  pointer-events: none;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  position: relative;
}

/* 色调层级分隔线 */
.modal-header::after {
  content: '';
  position: absolute;
  bottom: 0;
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

.modal-header h2 {
  margin: 0;
  font-size: 20px;
  color: var(--on-surface);
  font-family: var(--font-headline);
  font-weight: 700;
  letter-spacing: 0.1em;
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--outline);
  font-size: 28px;
  cursor: pointer;
  line-height: 1;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s steps(4);
}

.close-btn:hover {
  color: var(--on-surface);
  background: var(--surface-container-highest);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #888;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #333;
  border-top-color: #4a9eff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.hint {
  font-size: var(--text-xs);
  color: var(--outline);
  margin-top: 8px;
}

.battlefield-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.battlefield-card {
  background: var(--surface-container);
  border: none;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s steps(4);
  display: flex;
  flex-direction: column;
  position: relative;
}

/* 色调层级边框 */
.battlefield-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border: 1px solid var(--surface-container-highest);
  transition: all 0.2s steps(4);
  pointer-events: none;
}

.battlefield-card:hover {
  transform: translateY(-2px);
  background: var(--surface-container-low);
}

.battlefield-card:hover::before {
  border-color: var(--primary);
}

.battlefield-card.selected::before {
  border-color: var(--primary);
  border-width: 2px;
}

.battlefield-card.selected {
  background: var(--surface-container-low);
}

.card-preview {
  position: relative;
  height: 120px;
  background: var(--surface-container-highest);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.preview-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-rendering: pixelated;
}

.preview-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.preview-icon {
  font-size: 40px;
}

.preview-text {
  font-size: var(--text-xs);
  color: var(--outline);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 10px;
}

.size-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: var(--surface);
  color: var(--on-surface-variant);
  padding: 4px 8px;
  border: 1px solid var(--surface-container-highest);
  font-size: var(--text-xs);
  font-family: var(--font-mono);
}

.card-info {
  padding: 12px;
  flex: 1;
}

.battlefield-name {
  margin: 0 0 4px;
  font-size: var(--text-sm);
  color: var(--on-surface);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-headline);
  font-weight: var(--font-semibold);
}

.battlefield-size {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--on-surface-variant);
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  position: relative;
}

/* 色调层级分隔线 */
.modal-footer::before {
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

.selected-info {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--on-surface-variant);
  font-size: var(--text-sm);
}

.selected-info strong {
  color: var(--on-surface);
}

.selected-size {
  background: var(--surface-container-highest);
  padding: 4px 8px;
  font-size: var(--text-xs);
  font-family: var(--font-mono);
}

.action-btns {
  display: flex;
  gap: 12px;
}

/* 响应式 */
@media (max-width: 768px) {
  .modal-content {
    max-height: 90vh;
    margin: 10px;
  }
  
  .battlefield-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .modal-footer {
    flex-direction: column;
    gap: 12px;
  }
  
  .action-btns {
    width: 100%;
    justify-content: stretch;
  }
  
  .action-btns button {
    flex: 1;
  }
}

@media (max-width: 480px) {
  .battlefield-grid {
    grid-template-columns: 1fr;
  }
}
</style>
