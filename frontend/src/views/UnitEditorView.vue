<template>
  <div class="unit-editor">
    <div class="editor-header">
      <div class="header-left">
        <UIButton variant="secondary" @click="$router.push('/home')">返回主页</UIButton>
      </div>
      <h2>棋子编辑器</h2>
      <div class="header-actions">
        <UIButton variant="secondary" @click="importExcel">
          📥 Excel导入
        </UIButton>
      </div>
    </div>

    <!-- 棋子列表 -->
    <div v-if="!editingUnit" class="unit-list">
      <div class="list-actions">
        <UIButton variant="primary" @click="createNew">
          ➕ 新建棋子
        </UIButton>
      </div>
      
      <div v-if="units.length === 0" class="empty-state">
        暂无棋子，点击上方按钮创建或导入
      </div>
      
      <div v-else class="units-grid">
        <div v-for="unit in units" :key="unit.id" class="unit-card" @click="editUnit(unit)">
          <div class="unit-image">
            <img v-if="unit.main_image_url" :src="unit.main_image_url" :alt="unit.name">
            <span v-else class="placeholder">无图</span>
          </div>
          <div class="unit-info">
            <h3>{{ unit.name }}</h3>
            <p v-if="unit.codename">代号: {{ unit.codename }}</p>
            <p class="faction">{{ getFactionName(unit.faction) }}</p>
          </div>
          <div class="unit-actions">
            <button @click.stop="deleteUnit(unit.id)">🗑️</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑表单 -->
    <div v-else class="editor-form">
      <div class="form-nav">
        <UIButton variant="tertiary" @click="cancelEdit">← 返回列表</UIButton>
        <UIButton variant="primary" @click="saveUnit">💾 保存</UIButton>
      </div>

      <!-- 错误提示 -->
      <Card v-if="errors.length > 0" variant="elevated" class="error-box">
        <strong>⚠️ 验证失败：</strong>
        <ul>
          <li v-for="(err, i) in errors" :key="i">{{ err }}</li>
        </ul>
      </Card>

      <!-- 基础信息 -->
      <section class="form-section">
        <h3>基础信息</h3>
        <div class="form-row">
          <label>机体番号 *</label>
          <input v-model="form.name" type="text" placeholder="例如: RX-78-2" 
                 :class="{ 'error-highlight': highlightFields.name }" 
                 @input="clearHighlight('name')" required>
        </div>
        <div class="form-row">
          <label>行动代号</label>
          <input v-model="form.codename" type="text" placeholder="例如: 高达"
                 :class="{ 'error-highlight': highlightFields.codename }"
                 @input="clearHighlight('codename')">
        </div>
        <div class="form-row">
          <label>所属阵营</label>
          <div class="faction-selector">
            <select v-model="selectedFaction" :disabled="factionConfirmed">
              <option value="">选择阵营...</option>
              <option value="earth">地球联合</option>
              <option value="bailong">拜隆军</option>
              <option value="maxion">马克西翁</option>
            </select>
            <button v-if="!factionConfirmed && selectedFaction" @click="confirmFaction" class="btn-confirm">确认</button>
            <button v-if="factionConfirmed" @click="changeFaction" class="btn-change">更换</button>
          </div>
        </div>
        <div class="form-row">
          <label>主机体图片</label>
          <input type="file" @change="uploadImage" accept="image/*">
          <img v-if="form.main_image_url" :src="form.main_image_url" class="preview-image">
        </div>
      </section>

      <!-- 主机体 -->
      <section class="form-section">
        <h3>主机体 <Tag>{{ mainTotal }}/40点</Tag></h3>
        <div class="stats-grid">
          <div class="stat-input">
            <label>格斗</label>
            <div class="stepper">
              <button @click="adjustStat('main', '格斗', -1)">-</button>
              <input type="number" v-model.number="form.main_格斗" min="0" max="40"
                     :class="{ 'error-highlight': highlightFields.main_格斗 }"
                     @input="clearHighlight('main_格斗')">
              <button @click="adjustStat('main', '格斗', 1)">+</button>
            </div>
          </div>
          <div class="stat-input">
            <label>射击</label>
            <div class="stepper">
              <button @click="adjustStat('main', '射击', -1)">-</button>
              <input type="number" v-model.number="form.main_射击" min="0" max="40"
                     :class="{ 'error-highlight': highlightFields.main_射击 }"
                     @input="clearHighlight('main_射击')">
              <button @click="adjustStat('main', '射击', 1)">+</button>
            </div>
          </div>
          <div class="stat-input">
            <label>结构</label>
            <div class="stepper">
              <button @click="adjustStat('main', '结构', -1)">-</button>
              <input type="number" v-model.number="form.main_结构" min="0" max="40"
                     :class="{ 'error-highlight': highlightFields.main_结构 }"
                     @input="clearHighlight('main_结构')">
              <button @click="adjustStat('main', '结构', 1)">+</button>
            </div>
          </div>
          <div class="stat-input">
            <label>机动</label>
            <div class="stepper">
              <button @click="adjustStat('main', '机动', -1)">-</button>
              <input type="number" v-model.number="form.main_机动" min="0" max="40"
                     :class="{ 'error-highlight': highlightFields.main_机动 }"
                     @input="clearHighlight('main_机动')">
              <button @click="adjustStat('main', '机动', 1)">+</button>
            </div>
          </div>
        </div>
        <DataField label="HP" :value="mainHP" class="hp-display" />
        <SkillsEditor title="主机体技能" v-model="form.main_skills" :max-slots="3" />
      </section>

      <!-- 跟随 -->
      <section class="form-section">
        <h3>
          <label>
            <input type="checkbox" v-model="form.has_royroy">
            跟随 (Royroy)
          </label>
          <Tag v-if="form.has_royroy" variant="blue">{{ royroyTotal }}/25点</Tag>
        </h3>
        <div v-if="form.has_royroy">
          <div class="stats-grid">
            <div class="stat-input">
              <label>格斗</label>
              <div class="stepper">
                <button @click="adjustStat('royroy', '格斗', -1)">-</button>
                <input type="number" v-model.number="form.royroy_格斗" min="0" max="25">
                <button @click="adjustStat('royroy', '格斗', 1)">+</button>
              </div>
            </div>
            <div class="stat-input">
              <label>射击</label>
              <div class="stepper">
                <button @click="adjustStat('royroy', '射击', -1)">-</button>
                <input type="number" v-model.number="form.royroy_射击" min="0" max="25">
                <button @click="adjustStat('royroy', '射击', 1)">+</button>
              </div>
            </div>
            <div class="stat-input">
              <label>结构</label>
              <div class="stepper">
                <button @click="adjustStat('royroy', '结构', -1)">-</button>
                <input type="number" v-model.number="form.royroy_结构" min="0" max="25">
                <button @click="adjustStat('royroy', '结构', 1)">+</button>
              </div>
            </div>
            <div class="stat-input">
              <label>机动</label>
              <div class="stepper">
                <button @click="adjustStat('royroy', '机动', -1)">-</button>
                <input type="number" v-model.number="form.royroy_机动" min="0" max="25">
                <button @click="adjustStat('royroy', '机动', 1)">+</button>
              </div>
            </div>
          </div>
          <div class="hp-display">HP: {{ royroyHP }}</div>
          <SkillsEditor title="跟随技能" v-model="form.royroy_skills" :max-slots="2" />
          <p class="hint" v-if="!royroyConstraintMet">⚠️ 任一项属性需≥10</p>
        </div>
      </section>

      <!-- 左手 -->
      <section class="form-section">
        <h3>左手装备 <span v-if="form.left_type !== 'none'" class="points-badge">{{ leftTotal }}/15点</span></h3>
        <div class="form-row">
          <select v-model="form.left_type">
            <option value="none">无</option>
            <option value="武器">武器</option>
            <option value="防具">防具</option>
            <option value="载具">载具</option>
            <option value="背包">背包</option>
          </select>
        </div>
        <div v-if="form.left_type !== 'none'" class="stats-grid">
          <div class="stat-input">
            <label>格斗</label>
            <div class="stepper">
              <button @click="adjustStat('left', '格斗', -1)">-</button>
              <input type="number" v-model.number="form.left_格斗" min="0" max="15">
              <button @click="adjustStat('left', '格斗', 1)">+</button>
            </div>
          </div>
          <div class="stat-input">
            <label>射击</label>
            <div class="stepper">
              <button @click="adjustStat('left', '射击', -1)">-</button>
              <input type="number" v-model.number="form.left_射击" min="0" max="15">
              <button @click="adjustStat('left', '射击', 1)">+</button>
            </div>
          </div>
          <div class="stat-input">
            <label>结构</label>
            <div class="stepper">
              <button @click="adjustStat('left', '结构', -1)">-</button>
              <input type="number" v-model.number="form.left_结构" min="0" max="15">
              <button @click="adjustStat('left', '结构', 1)">+</button>
            </div>
          </div>
          <div class="stat-input">
            <label>机动</label>
            <div class="stepper">
              <button @click="adjustStat('left', '机动', -1)">-</button>
              <input type="number" v-model.number="form.left_机动" min="0" max="15">
              <button @click="adjustStat('left', '机动', 1)">+</button>
            </div>
          </div>
        </div>
        <SkillsEditor v-if="form.left_type !== 'none'" title="左手技能" v-model="form.left_skills" :max-slots="getSkillSlots(form.left_type)" />
      </section>

      <!-- 右手 -->
      <section class="form-section">
        <h3>右手装备 <span v-if="form.right_type !== 'none'" class="points-badge">{{ rightTotal }}/15点</span></h3>
        <div class="form-row">
          <select v-model="form.right_type">
            <option value="none">无</option>
            <option value="武器">武器</option>
            <option value="防具">防具</option>
            <option value="载具">载具</option>
            <option value="背包">背包</option>
          </select>
        </div>
        <div v-if="form.right_type !== 'none'" class="stats-grid">
          <div class="stat-input">
            <label>格斗</label>
            <div class="stepper">
              <button @click="adjustStat('right', '格斗', -1)">-</button>
              <input type="number" v-model.number="form.right_格斗" min="0" max="15">
              <button @click="adjustStat('right', '格斗', 1)">+</button>
            </div>
          </div>
          <div class="stat-input">
            <label>射击</label>
            <div class="stepper">
              <button @click="adjustStat('right', '射击', -1)">-</button>
              <input type="number" v-model.number="form.right_射击" min="0" max="15">
              <button @click="adjustStat('right', '射击', 1)">+</button>
            </div>
          </div>
          <div class="stat-input">
            <label>结构</label>
            <div class="stepper">
              <button @click="adjustStat('right', '结构', -1)">-</button>
              <input type="number" v-model.number="form.right_结构" min="0" max="15">
              <button @click="adjustStat('right', '结构', 1)">+</button>
            </div>
          </div>
          <div class="stat-input">
            <label>机动</label>
            <div class="stepper">
              <button @click="adjustStat('right', '机动', -1)">-</button>
              <input type="number" v-model.number="form.right_机动" min="0" max="15">
              <button @click="adjustStat('right', '机动', 1)">+</button>
            </div>
          </div>
        </div>
        <SkillsEditor v-if="form.right_type !== 'none'" title="右手技能" v-model="form.right_skills" :max-slots="getSkillSlots(form.right_type)" />
      </section>

      <!-- 其它 -->
      <section class="form-section">
        <h3>其它装备 <span v-if="form.extra_type !== 'none'" class="points-badge">{{ extraTotal }}/{{ extraPointLimit }}点</span></h3>
        <div class="form-row">
          <select v-model="form.extra_type">
            <option value="none">无</option>
            <option value="武器">武器</option>
            <option value="防具">防具</option>
            <option value="载具">载具</option>
            <option value="背包">背包</option>
          </select>
        </div>
        <div v-if="form.extra_type !== 'none'" class="stats-grid">
          <div class="stat-input">
            <label>格斗</label>
            <div class="stepper">
              <button @click="adjustStat('extra', '格斗', -1)">-</button>
              <input type="number" v-model.number="form.extra_格斗" min="0" :max="extraPointLimit">
              <button @click="adjustStat('extra', '格斗', 1)">+</button>
            </div>
          </div>
          <div class="stat-input">
            <label>射击</label>
            <div class="stepper">
              <button @click="adjustStat('extra', '射击', -1)">-</button>
              <input type="number" v-model.number="form.extra_射击" min="0" :max="extraPointLimit">
              <button @click="adjustStat('extra', '射击', 1)">+</button>
            </div>
          </div>
          <div class="stat-input">
            <label>结构</label>
            <div class="stepper">
              <button @click="adjustStat('extra', '结构', -1)">-</button>
              <input type="number" v-model.number="form.extra_结构" min="0" :max="extraPointLimit">
              <button @click="adjustStat('extra', '结构', 1)">+</button>
            </div>
          </div>
          <div class="stat-input">
            <label>机动</label>
            <div class="stepper">
              <button @click="adjustStat('extra', '机动', -1)">-</button>
              <input type="number" v-model.number="form.extra_机动" min="0" :max="extraPointLimit">
              <button @click="adjustStat('extra', '机动', 1)">+</button>
            </div>
          </div>
        </div>
        <SkillsEditor v-if="form.extra_type !== 'none'" title="其它技能" v-model="form.extra_skills" :max-slots="getSkillSlots(form.extra_type)" />
        <p v-if="form.extra_type === '载具' && form.extra_机动 < 10" class="hint warning">⚠️ 载具机动&lt;10，效果不生效</p>
        <p v-if="form.extra_type === '防具' && form.extra_结构 < 10" class="hint warning">⚠️ 防具结构&lt;10，效果不生效</p>
      </section>
    </div>

    <!-- Excel导入弹窗 - 步骤1: 选择文件 -->
    <div v-if="showImportDialog && !previewData" class="modal-overlay" @click.self="showImportDialog = false">
      <div class="modal">
        <h3>📥 Excel导入</h3>
        <p>请上传设定器格式的Excel文件</p>
        <input type="file" @change="handleFileSelect" accept=".xlsx,.xls" ref="fileInputRef">
        <p v-if="importing" style="color: var(--primary);">⏳ 正在解析...</p>
        <div class="modal-actions">
          <button @click="showImportDialog = false" :disabled="importing">取消</button>
        </div>
      </div>
    </div>

    <!-- Excel导入弹窗 - 步骤2: 预览确认 -->
    <div v-if="showImportDialog && previewData" class="modal-overlay" @click.self="closePreview">
      <div class="modal preview-modal">
        <h3>📋 导入预览</h3>
        
        <!-- 警告信息 -->
        <div v-if="previewWarnings.length > 0" class="preview-warnings">
          <h4>⚠️ 待填写项</h4>
          <ul>
            <li v-for="(warning, i) in previewWarnings" :key="i">{{ warning }}</li>
          </ul>
        </div>

        <!-- 预览内容 -->
        <div class="preview-content">
          <div class="preview-section">
            <h4>基础信息</h4>
            <p><strong>机体番号:</strong> {{ previewData.name || '(未填写)' }}</p>
            <p><strong>行动代号:</strong> {{ previewData.codename || '(未填写)' }}</p>
            <p><strong>阵营:</strong> {{ getFactionName(previewData.faction) }}</p>
          </div>

          <div class="preview-section">
            <h4>主机体</h4>
            <p>格斗: {{ previewData.main_格斗 }} | 射击: {{ previewData.main_射击 }} | 结构: {{ previewData.main_结构 }} | 机动: {{ previewData.main_机动 }}</p>
            <p v-if="previewData.main_skills.length > 0">
              <strong>技能:</strong> {{ previewData.main_skills.map(s => s.name === 'null' ? '(空)' : s.name).join(', ') }}
            </p>
            <p v-else class="empty-field">技能: (未填写)</p>
          </div>

          <div v-if="previewData.has_royroy" class="preview-section">
            <h4>跟随 (Royroy)</h4>
            <p>格斗: {{ previewData.royroy_格斗 }} | 射击: {{ previewData.royroy_射击 }} | 结构: {{ previewData.royroy_结构 }} | 机动: {{ previewData.royroy_机动 }}</p>
            <p v-if="previewData.royroy_skills.length > 0">
              <strong>技能:</strong> {{ previewData.royroy_skills.map(s => s.name === 'null' ? '(空)' : s.name).join(', ') }}
            </p>
          </div>

          <div v-if="previewData.left_type !== 'none'" class="preview-section">
            <h4>左手装备 ({{ previewData.left_type }})</h4>
            <p>格斗: {{ previewData.left_格斗 }} | 射击: {{ previewData.left_射击 }} | 结构: {{ previewData.left_结构 }} | 机动: {{ previewData.left_机动 }}</p>
            <p v-if="previewData.left_skills.length > 0">
              <strong>技能:</strong> {{ previewData.left_skills.map(s => s.name === 'null' ? '(空)' : s.name).join(', ') }}
            </p>
          </div>

          <div v-if="previewData.right_type !== 'none'" class="preview-section">
            <h4>右手装备 ({{ previewData.right_type }})</h4>
            <p>格斗: {{ previewData.right_格斗 }} | 射击: {{ previewData.right_射击 }} | 结构: {{ previewData.right_结构 }} | 机动: {{ previewData.right_机动 }}</p>
            <p v-if="previewData.right_skills.length > 0">
              <strong>技能:</strong> {{ previewData.right_skills.map(s => s.name === 'null' ? '(空)' : s.name).join(', ') }}
            </p>
          </div>

          <div v-if="previewData.extra_type !== 'none'" class="preview-section">
            <h4>其它装备 ({{ previewData.extra_type }})</h4>
            <p>格斗: {{ previewData.extra_格斗 }} | 射击: {{ previewData.extra_射击 }} | 结构: {{ previewData.extra_结构 }} | 机动: {{ previewData.extra_机动 }}</p>
            <p v-if="previewData.extra_skills.length > 0">
              <strong>技能:</strong> {{ previewData.extra_skills.map(s => s.name === 'null' ? '(空)' : s.name).join(', ') }}
            </p>
            <p v-else class="empty-field">技能: (未填写，可后续补充)</p>
          </div>
        </div>

        <div class="modal-actions">
          <button @click="closePreview" :disabled="confirming">返回</button>
          <button @click="confirmImport" :disabled="confirming" class="btn-primary">
            {{ confirming ? '⏳ 保存中...' : '✓ 确认导入' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import SkillsEditor from '../components/SkillsEditor.vue';
import UIButton from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Tag from '@/components/ui/Tag.vue';
import DataField from '@/components/ui/DataField.vue';

// 使用 Vite 代理，统一通过 /api 访问后端服务
const API_BASE = '/api/hangar';

// 技能效果说明
const SKILL_EFFECTS = {
  '有线式双发炮': { type: '远程', description: '可同时攻击2个目标（助攻/阻碍）' },
  '光之军刀': { type: '近战', description: '格斗攻击+1' },
  '胸部56mm炮': { type: '远程', description: '远程攻击' },
  '胸部导弹': { type: '远程', description: '范围攻击' },
  '胸部光束炮': { type: '远程', description: '高伤害远程攻击' },
  '肩部导弹': { type: '远程', description: '追击攻击' },
  '脚部导弹': { type: '远程', description: '攻击后封锁' },
  '光线步枪': { type: '远程', description: '远程射击' },
  '盾牌': { type: '防御', description: '减少受到的伤害' },
  '备用弹夹': { type: '辅助', description: '增加弹药数' },
  '推进器': { type: '机动', description: '机动性提升' },
  '备用武器': { type: '辅助', description: '第二武器' },
  '修理包': { type: '辅助', description: '回复HP' },
  '补给': { type: '辅助', description: '给友军补给弹药' },
  '特殊装甲': { type: '防御', description: '减伤' },
  '感知干扰': { type: '特殊', description: '使敌人命中率降低' },
  '加速': { type: '机动', description: '移动距离+1' },
  '后退': { type: '机动', description: '攻击后可以后退' },
  '突击': { type: '近战', description: '攻击后可以继续移动' },
  '反击': { type: '防御', description: '反击攻击者' },
  '迎击': { type: '远程', description: '迎击进入射程的敌人' },
  '连续攻击': { type: '攻击', description: '一定概率追加攻击' },
  '贯穿': { type: '攻击', description: '无视防御' },
  '高效': { type: '辅助', description: '减少弹药消耗' },
  '广域': { type: '远程', description: '范围扩大' },
  '妨碍': { type: '特殊', description: '降低敌人能力' },
  '再生': { type: '辅助', description: '每回合回复HP' },
  '再动': { type: '辅助', description: '一定概率获得额外行动' },
  '集中': { type: '辅助', description: '命中率提升' },
  '铁壁': { type: '防御', description: '减伤率提升' },
  '全力': { type: '攻击', description: '攻击力上升但下回合无法行动' },
  '扰乱': { type: '特殊', description: '使敌人混乱' },
  '无效化': { type: '防御', description: '一定概率无效化攻击' },
  '觉醒': { type: '特殊', description: '能力大幅上升' }
};

// 阵营映射
const FACTION_MAP = {
  earth: '地球联合',
  bailong: '拜隆军',
  maxion: '马克西翁'
};

const units = ref([]);
const editingUnit = ref(null);
const showImportDialog = ref(false);
const importing = ref(false);
const confirming = ref(false);
const errors = ref([]);
const highlightFields = ref({});
const fileInputRef = ref(null);

// 预览相关状态
const previewData = ref(null);
const previewWarnings = ref([]);
const selectedFile = ref(null);

const form = ref(createEmptyForm());
const selectedFaction = ref('');
const factionConfirmed = ref(false);

function createEmptyForm() {
  return {
    name: '',
    codename: '',
    faction: 'earth',
    main_image_url: null,
    main_type: '机体',
    main_格斗: 0, main_射击: 0, main_结构: 0, main_机动: 0,
    main_skills: [],
    has_royroy: false,
    royroy_image_url: null,
    royroy_格斗: 0, royroy_射击: 0, royroy_结构: 0, royroy_机动: 0,
    royroy_skills: [],
    left_type: 'none',
    left_image_url: null,
    left_格斗: 0, left_射击: 0, left_结构: 0, left_机动: 0,
    left_skills: [],
    right_type: 'none',
    right_image_url: null,
    right_格斗: 0, right_射击: 0, right_结构: 0, right_机动: 0,
    right_skills: [],
    extra_type: 'none',
    extra_image_url: null,
    extra_格斗: 0, extra_射击: 0, extra_结构: 0, extra_机动: 0,
    extra_skills: []
  };
}

// 计算属性
const mainTotal = computed(() => 
      (form.value.main_格斗 || 0) + (form.value.main_射击 || 0) + 
      (form.value.main_结构 || 0) + (form.value.main_机动 || 0)
    );

    const mainHP = computed(() => (form.value.main_结构 || 0) * 10);

    const royroyTotal = computed(() =>
      (form.value.royroy_格斗 || 0) + (form.value.royroy_射击 || 0) +
      (form.value.royroy_结构 || 0) + (form.value.royroy_机动 || 0)
    );

    const royroyHP = computed(() => (form.value.royroy_结构 || 0) * 3);

    const royroyConstraintMet = computed(() =>
      (form.value.royroy_格斗 || 0) >= 10 ||
      (form.value.royroy_射击 || 0) >= 10 ||
      (form.value.royroy_结构 || 0) >= 10 ||
      (form.value.royroy_机动 || 0) >= 10
    );

    const leftTotal = computed(() =>
      (form.value.left_格斗 || 0) + (form.value.left_射击 || 0) +
      (form.value.left_结构 || 0) + (form.value.left_机动 || 0)
    );

    const rightTotal = computed(() =>
      (form.value.right_格斗 || 0) + (form.value.right_射击 || 0) +
      (form.value.right_结构 || 0) + (form.value.right_机动 || 0)
    );

    const extraPointLimit = computed(() => form.value.extra_type === '背包' ? 10 : 15);

    const extraTotal = computed(() =>
      (form.value.extra_格斗 || 0) + (form.value.extra_射击 || 0) +
      (form.value.extra_结构 || 0) + (form.value.extra_机动 || 0)
    );

    function getSkillSlots(type) {
      const slots = { '武器': 1, '防具': 1, '载具': 2, '背包': 0 };
      return slots[type] || 1;
    }

    function adjustStat(prefix, stat, delta) {
      const key = `${prefix}_${stat}`;
      const current = form.value[key] || 0;
      const max = prefix === 'main' ? 40 : (prefix === 'royroy' ? 25 : (prefix === 'extra' ? extraPointLimit.value : 15));
      form.value[key] = Math.max(0, Math.min(max, current + delta));
      clearHighlight(key);
    }
    
    function clearHighlight(field) {
      if (highlightFields.value[field]) {
        delete highlightFields.value[field];
        highlightFields.value = { ...highlightFields.value };
      }
    }

    function getFactionName(faction) {
      return FACTION_MAP[faction] || faction;
    }

    async function loadUnits() {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE}/units`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        units.value = data.units || [];
      } catch (e) {
        console.error('加载棋子失败:', e);
      }
    }

    function createNew() {
      form.value = createEmptyForm();
      editingUnit.value = { id: null };
      errors.value = [];
      highlightFields.value = {};
      selectedFaction.value = '';
      factionConfirmed.value = false;
    }

    async function editUnit(unit) {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE}/units/${unit.id}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        form.value = {
          ...createEmptyForm(),
          ...data
        };
        editingUnit.value = unit;
        errors.value = [];
        selectedFaction.value = form.value.faction;
        factionConfirmed.value = true;
      } catch (e) {
        console.error('加载棋子失败:', e);
      }
    }
    
    function loadUnitToForm(unit) {
      form.value = {
        ...createEmptyForm(),
        ...unit,
        id: unit.id,
        name: unit.name || '',
        codename: unit.codename || '',
        faction: unit.faction || 'earth',
        main_格斗: unit.main_格斗 || 0,
        main_射击: unit.main_射击 || 0,
        main_结构: unit.main_结构 || 0,
        main_机动: unit.main_机动 || 0,
        main_skills: unit.main_skills || [],
        has_royroy: unit.has_royroy || false,
        royroy_格斗: unit.royroy_格斗 || 0,
        royroy_射击: unit.royroy_射击 || 0,
        royroy_结构: unit.royroy_结构 || 0,
        royroy_机动: unit.royroy_机动 || 0,
        royroy_skills: unit.royroy_skills || [],
        left_type: unit.left_type || 'none',
        left_格斗: unit.left_格斗 || 0,
        left_射击: unit.left_射击 || 0,
        left_结构: unit.left_结构 || 0,
        left_机动: unit.left_机动 || 0,
        left_skills: unit.left_skills || [],
        right_type: unit.right_type || 'none',
        right_格斗: unit.right_格斗 || 0,
        right_射击: unit.right_射击 || 0,
        right_结构: unit.right_结构 || 0,
        right_机动: unit.right_机动 || 0,
        right_skills: unit.right_skills || [],
        extra_type: unit.extra_type || 'none',
        extra_格斗: unit.extra_格斗 || 0,
        extra_射击: unit.extra_射击 || 0,
        extra_结构: unit.extra_结构 || 0,
        extra_机动: unit.extra_机动 || 0,
        extra_skills: unit.extra_skills || [],
      };
      editingUnit.value = { id: unit.id };
      errors.value = [];
    }

    function cancelEdit() {
      editingUnit.value = null;
      errors.value = [];
      highlightFields.value = {};
    }

    // 确认阵营选择
    function confirmFaction() {
      if (!selectedFaction.value) {
        alert('请先选择一个阵营');
        return;
      }
      form.value.faction = selectedFaction.value;
      factionConfirmed.value = true;
    }

    // 更换阵营
    function changeFaction() {
      factionConfirmed.value = false;
      selectedFaction.value = '';
    }

    async function saveUnit() {
      errors.value = [];
      highlightFields.value = {};

      try {
        const url = form.value.id
          ? `${API_BASE}/units/${form.value.id}`
          : `${API_BASE}/units`;
        const method = form.value.id ? 'PUT' : 'POST';
        const token = localStorage.getItem('token');

        const res = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(form.value)
        });
        
        const result = await res.json();
        
        if (!res.ok) {
          errors.value = result.details || [result.error];
          // 根据错误信息设置高亮
          const details = result.details || [];
          details.forEach(err => {
            if (err.includes('机体番号')) highlightFields.value.name = true;
            if (err.includes('行动代号')) highlightFields.value.codename = true;
            if (err.includes('主机体')) {
              highlightFields.value.main_格斗 = true;
              highlightFields.value.main_射击 = true;
              highlightFields.value.main_结构 = true;
              highlightFields.value.main_机动 = true;
            }
            if (err.includes('跟随')) {
              highlightFields.value.royroy_格斗 = true;
              highlightFields.value.royroy_射击 = true;
              highlightFields.value.royroy_结构 = true;
              highlightFields.value.royroy_机动 = true;
            }
            if (err.includes('左手')) {
              highlightFields.value.left_格斗 = true;
              highlightFields.value.left_射击 = true;
              highlightFields.value.left_结构 = true;
              highlightFields.value.left_机动 = true;
            }
            if (err.includes('右手')) {
              highlightFields.value.right_格斗 = true;
              highlightFields.value.right_射击 = true;
              highlightFields.value.right_结构 = true;
              highlightFields.value.right_机动 = true;
            }
            if (err.includes('其它')) {
              highlightFields.value.extra_格斗 = true;
              highlightFields.value.extra_射击 = true;
              highlightFields.value.extra_结构 = true;
              highlightFields.value.extra_机动 = true;
            }
          });
          return;
        }
        
        await loadUnits();
        editingUnit.value = null;
        alert(result.message || '保存成功');
      } catch (e) {
        console.error('保存失败:', e);
        errors.value = ['保存失败'];
      }
    }

    async function deleteUnit(id) {
      if (!confirm('确定要删除这个棋子吗？')) return;

      try {
        const token = localStorage.getItem('token');
        await fetch(`${API_BASE}/units/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        await loadUnits();
      } catch (e) {
        console.error('删除失败:', e);
      }
    }

    async function uploadImage(e) {
      const file = e.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('image', file);

      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE}/units/upload-image`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        const data = await res.json();
        form.value.main_image_url = data.url;
      } catch (e) {
        console.error('上传失败:', e);
      }
    }

    function importExcel() {
      showImportDialog.value = true;
      previewData.value = null;
      previewWarnings.value = [];
      selectedFile.value = null;
      // 清空文件选择
      if (fileInputRef.value) {
        fileInputRef.value.value = '';
      }
    }

    // 步骤1: 选择文件并解析
    async function handleFileSelect(e) {
      const file = e.target.files[0];
      if (!file) return;

      selectedFile.value = file;
      importing.value = true;

      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);

      try {
        // 调用新的解析API
        const res = await fetch(`${API_BASE}/units/parse-excel`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });
        const data = await res.json();

        if (!res.ok) {
          alert(data.error || '解析失败');
          importing.value = false;
          return;
        }

        // 保存预览数据
        previewData.value = data.preview;
        previewWarnings.value = data.warnings || [];
        importing.value = false;

      } catch (e) {
        console.error('解析失败:', e);
        importing.value = false;
        alert('解析失败: ' + e.message);
      }
    }

    // 关闭预览
    function closePreview() {
      previewData.value = null;
      previewWarnings.value = [];
      selectedFile.value = null;
      showImportDialog.value = false;
    }

    // 步骤2: 确认导入
    async function confirmImport() {
      if (!previewData.value) return;

      confirming.value = true;
      const token = localStorage.getItem('token');

      try {
        // 调用create-from-json API
        const res = await fetch(`${API_BASE}/units/create-from-json`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(previewData.value)
        });
        const data = await res.json();

        if (!res.ok) {
          alert(data.error || '保存失败');
          confirming.value = false;
          return;
        }

        // 获取新导入棋子的完整数据并打开编辑
        if (data.id) {
          const unitRes = await fetch(`${API_BASE}/units/${data.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const unitData = await unitRes.json();
          if (unitRes.ok && unitData) {
            loadUnitToForm(unitData);
          }
        }

        showImportDialog.value = false;
        const importedName = previewData.value?.name || '新棋子';
        previewData.value = null;
        previewWarnings.value = [];
        selectedFile.value = null;
        await loadUnits();

        // 显示成功提示
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#2ecc71;color:white;padding:12px 24px;border-radius:8px;z-index:9999;font-size:14px;box-shadow:0 2px 10px rgba(0,0,0,0.2);';
        toast.textContent = `✓ 已导入: ${importedName}`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
        confirming.value = false;
      } catch (e) {
        console.error('导入失败:', e);
        confirming.value = false;
        alert('导入失败: ' + e.message);
      }
    }

    // 旧版导入函数（保留兼容性）
    async function handleExcelImport(e) {
      // 已弃用，使用新的两步骤流程
      console.log('旧版导入已弃用，请使用新的预览流程');
    }

onMounted(() => {
  loadUnits();
});
</script>

<style scoped>
@import '@/styles/variables.css';

.unit-editor {
  padding: 20px;
  max-width: 1000px;
  margin: 0 auto;
  color: var(--text-primary);
  background: var(--surface-base);
  min-height: 100vh;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(79, 172, 254, 0.1);
}

.editor-header h2 {
  font-family: 'Space Grotesk', monospace;
  font-size: 20px;
  color: var(--text-primary);
}

.header-left {
  display: flex;
  align-items: center;
}

.header-actions {
  display: flex;
  gap: 12px;
}

/* 列表样式 */
.list-actions {
  margin-bottom: 24px;
}

.units-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.unit-card {
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--primary-panel);
  color: var(--text-primary);
}

.unit-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 242, 96, 0.15);
}

.unit-image {
  width: 100%;
  height: 140px;
  background: var(--data-inlay);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  overflow: hidden;
}

.unit-image img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.unit-info h3 {
  margin: 0 0 6px;
  font-size: 16px;
  color: var(--text-primary);
  font-family: 'Space Grotesk', monospace;
}

.unit-info p {
  margin: 4px 0;
  font-size: 13px;
  color: var(--text-secondary);
  font-family: 'Space Grotesk', monospace;
}

.unit-actions {
  margin-top: 12px;
}

.unit-actions button {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: var(--text-secondary);
}

.unit-actions button:hover {
  color: var(--accent-red);
}

/* 表单样式 */
.form-nav {
  display: flex;
  justify-content: space-between;
  margin-bottom: 24px;
}

.form-section {
  background: var(--primary-panel);
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 20px;
}

.form-section h3 {
  margin-top: 0;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-primary);
  font-size: 16px;
  font-family: 'Space Grotesk', monospace;
}

.form-row {
  margin-bottom: 16px;
}

.form-row label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--text-primary);
  font-family: 'Space Grotesk', monospace;
  text-transform: uppercase;
  font-size: 12px;
}

.form-row input,
.form-row select {
  width: 100%;
  padding: 10px 14px;
  border-radius: 4px;
  font-size: 14px;
  background: var(--data-inlay);
  color: var(--text-primary);
  font-family: 'Space Grotesk', monospace;
  transition: all 0.2s;
}

.form-row input:focus,
.form-row select:focus {
  outline: none;
  background: rgba(79, 172, 254, 0.1);
}

.error-highlight {
  border: 1px solid var(--accent-red) !important;
  background: rgba(244, 67, 54, 0.1) !important;
  animation: pulse-error 1s ease-in-out;
}

@keyframes pulse-error {
  0%, 100% { box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(244, 67, 54, 0); }
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.stat-input label {
  display: block;
  text-align: center;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  font-family: 'Space Grotesk', monospace;
  text-transform: uppercase;
}

.stepper {
  display: flex;
  align-items: center;
}

.stepper button {
  width: 36px;
  height: 32px;
  background: var(--data-inlay);
  cursor: pointer;
  font-size: 16px;
  color: var(--text-primary);
  font-family: 'Space Grotesk', monospace;
  transition: all 0.2s;
}

.stepper button:hover {
  background: rgba(79, 172, 254, 0.2);
}

.stepper button:first-child {
  border-radius: 4px 0 0 4px;
}

.stepper button:last-child {
  border-radius: 0 4px 4px 0;
}

.stepper input {
  width: 60px;
  height: 32px;
  border-left: 1px solid var(--data-inlay);
  border-right: 1px solid var(--data-inlay);
  text-align: center;
  font-size: 14px;
  background: var(--data-inlay);
  color: var(--text-primary);
  font-family: 'Space Grotesk', monospace;
}

.hp-display {
  text-align: center;
  font-size: 18px;
  font-weight: bold;
  color: var(--accent-blue);
  margin-bottom: 16px;
  font-family: 'Space Grotesk', monospace;
}

.hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 8px;
  font-family: 'Space Grotesk', monospace;
}

.hint.warning {
  color: var(--accent-orange);
  font-weight: 500;
}

/* 错误提示 */
.error-box {
  background: rgba(255, 152, 0, 0.1);
  border: 1px solid var(--accent-orange);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
  color: var(--text-primary);
}

.error-box strong {
  color: var(--accent-orange);
  font-family: 'Space Grotesk', monospace;
}

.error-box ul {
  margin: 12px 0 0;
  padding-left: 24px;
}

.error-box li {
  color: var(--text-secondary);
  font-family: 'Space Grotesk', monospace;
  font-size: 13px;
  margin-bottom: 4px;
}

.preview-image {
  max-width: 220px;
  max-height: 180px;
  margin-top: 12px;
  border-radius: 6px;
}

/* 弹窗 */
.modal-overlay {
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
  z-index: 1000;
}

.modal {
  background: var(--primary-panel);
  padding: 32px;
  border-radius: 8px;
  max-width: 440px;
  width: 90%;
  color: var(--text-primary);
}

.modal h3 {
  margin-top: 0;
  margin-bottom: 16px;
  color: var(--text-primary);
  font-family: 'Space Grotesk', monospace;
  font-size: 18px;
}

.modal p {
  color: var(--text-secondary);
  font-family: 'Space Grotesk', monospace;
  margin-bottom: 16px;
}

.modal input[type="file"] {
  margin: 16px 0;
  color: var(--text-primary);
  background: var(--data-inlay);
  padding: 10px;
  border-radius: 4px;
}

.modal-actions {
  margin-top: 24px;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

/* 阵营样式 */
.faction-earth {
  color: var(--accent-blue);
}

.faction-balon {
  color: var(--accent-red);
}

.faction-maxion {
  color: var(--accent-purple);
}

.faction-selector {
  display: flex;
  gap: 8px;
  align-items: center;
}

.faction-selector select {
  flex: 1;
  padding: 8px 12px;
  background: var(--surface-container-lowest);
  color: var(--text-primary);
  border: 1px solid var(--outline-variant);
  border-radius: 4px;
  font-family: 'Space Mono', monospace;
  cursor: pointer;
}

.faction-selector select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-confirm {
  padding: 8px 16px;
  background: var(--primary);
  color: var(--on-primary);
  border: 2px solid var(--primary);
  border-radius: 4px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-confirm:hover {
  background: var(--primary-container);
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 255, 65, 0.3);
}

.btn-change {
  padding: 8px 16px;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--outline-variant);
  border-radius: 4px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-change:hover {
  background: var(--surface-container);
  color: var(--text-primary);
}

/* 技能卡片 */
.skill-card {
  background: var(--data-inlay);
  border-radius: 6px;
  padding: 14px;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.skill-card h4 {
  margin: 0 0 10px;
  font-size: 14px;
  color: var(--text-primary);
  font-family: 'Space Grotesk', monospace;
}

.skill-card p {
  margin: 4px 0;
  font-size: 12px;
  color: var(--text-secondary);
  font-family: 'Space Grotesk', monospace;
}

.skill-item {
  background: var(--data-inlay);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 10px;
  color: var(--text-primary);
}

.skill-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.skill-item-name {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 14px;
  font-family: 'Space Grotesk', monospace;
}

.skill-item-type {
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--data-inlay);
  padding: 3px 8px;
  border-radius: 4px;
  font-family: 'Space Grotesk', monospace;
  text-transform: uppercase;
}

.skill-item-detail {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 4px 0;
  font-family: 'Space Grotesk', monospace;
}

.skill-tags {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.skill-tag {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 12px;
  background: var(--data-inlay);
  color: var(--accent-blue);
  font-family: 'Space Grotesk', monospace;
  text-transform: uppercase;
}

.skill-tag.melee {
  background: rgba(244, 67, 54, 0.15);
  color: var(--accent-red);
}

.skill-tag.ranged {
  background: rgba(79, 172, 254, 0.15);
  color: var(--accent-blue);
}

.skill-tag.auto {
  background: rgba(0, 242, 96, 0.15);
  color: var(--accent-green);
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 48px;
  color: var(--text-secondary);
}

.empty-state p {
  color: var(--text-secondary);
  font-family: 'Space Grotesk', monospace;
}

/* 部件类型选择 */
.part-type-select {
  margin-bottom: 16px;
}

.part-type-select label {
  display: block;
  margin-bottom: 10px;
  font-weight: 500;
  color: var(--text-primary);
  font-family: 'Space Grotesk', monospace;
  text-transform: uppercase;
  font-size: 12px;
}

.part-type-select select {
  width: 100%;
  padding: 12px;
  border-radius: 4px;
  font-size: 14px;
  background: var(--data-inlay);
  color: var(--text-primary);
  font-family: 'Space Grotesk', monospace;
}

/* 装备卡片 */
.equipment-card {
  background: var(--primary-panel);
  border-radius: 8px;
  padding: 18px;
  margin-bottom: 20px;
  color: var(--text-primary);
}

.equipment-card h4 {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: 'Space Grotesk', monospace;
}

.equipment-type-badge {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 4px;
  background: var(--data-inlay);
  color: var(--text-secondary);
  font-family: 'Space Grotesk', monospace;
  text-transform: uppercase;
}

/* 编辑器标题 */
.editor-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(79, 172, 254, 0.1);
  font-family: 'Space Grotesk', monospace;
}

/* 单位详情头部 */
.unit-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  padding-bottom: 18px;
  border-bottom: 1px solid rgba(79, 172, 254, 0.1);
}

.unit-detail-header h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 18px;
  font-family: 'Space Grotesk', monospace;
}

.unit-detail-header .codename {
  color: var(--text-secondary);
  font-size: 14px;
  margin-top: 6px;
  font-family: 'Space Grotesk', monospace;
}

.unit-meta {
  text-align: right;
  color: var(--text-secondary);
  font-size: 12px;
  font-family: 'Space Grotesk', monospace;
}

.unit-meta .faction {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 6px;
}

/* 预览弹窗样式 */
.preview-modal {
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
}

.preview-warnings {
  background: rgba(255, 152, 0, 0.1);
  border: 1px solid var(--accent-orange);
  border-radius: 6px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.preview-warnings h4 {
  margin: 0 0 8px 0;
  color: var(--accent-orange);
  font-size: 14px;
}

.preview-warnings ul {
  margin: 0;
  padding-left: 20px;
}

.preview-warnings li {
  color: var(--text-secondary);
  font-size: 13px;
  margin-bottom: 4px;
}

.preview-content {
  max-height: 400px;
  overflow-y: auto;
}

.preview-section {
  background: var(--data-inlay);
  border-radius: 6px;
  padding: 12px 16px;
  margin-bottom: 12px;
}

.preview-section h4 {
  margin: 0 0 8px 0;
  color: var(--primary);
  font-size: 14px;
}

.preview-section p {
  margin: 4px 0;
  font-size: 13px;
  color: var(--text-primary);
}

.preview-section .empty-field {
  color: var(--text-secondary);
  font-style: italic;
}

.btn-primary {
  padding: 10px 20px;
  background: var(--primary);
  color: var(--on-primary);
  border: none;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-container);
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
