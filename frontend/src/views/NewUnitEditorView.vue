<template>

    <main class="main-content">
      <div v-if="errors.length > 0" class="error-box">
        <strong>⚠ 验证失败：</strong>
        <ul><li v-for="(err, i) in errors" :key="i">{{ err }}</li></ul>
      </div>

      <!-- ===== 列表视图 ===== -->
      <div v-if="!editingUnit">
        <div class="editor-header">
          <h2>单位编辑器</h2>
          <div class="header-actions">
            <button class="btn btn-primary" @click="createNew">+ 新建棋子</button>
            <button class="btn btn-secondary" @click="importExcel">Excel导入</button>
          </div>
        </div>
        <div v-if="units.length === 0" class="empty-state">暂无机甲数据，点击上方按钮创建或导入</div>
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
            <div class="unit-card-actions">
              <button @click.stop="deleteUnit(unit.id)" title="删除">×</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 编辑视图 ===== -->
      <div v-else class="editor-form">
        <div class="form-nav">
          <button class="btn btn-ghost" @click="cancelEdit">← 返回列表</button>
          <div class="form-nav-right">
            <button class="btn btn-secondary" @click="importExcel">导入Excel</button>
            <button class="btn btn-primary" @click="saveUnit">保存</button>
          </div>
        </div>

        <!-- 基础信息 -->
        <section class="form-section">
          <h3>基础信息</h3>
          <div class="form-row">
            <label>机体番号 *</label>
            <input v-model="form.name" type="text" placeholder="例如: RX-78-2"
                   :class="{ 'error-input': highlightFields.name }" @input="clearHighlight('name')">
          </div>
          <div class="form-row">
            <label>行动代号</label>
            <input v-model="form.codename" type="text" placeholder="例如: 高达"
                   :class="{ 'error-input': highlightFields.codename }" @input="clearHighlight('codename')">
          </div>
          <div class="form-row">
            <label>所属阵营</label>
            <div class="faction-row">
              <select v-model="selectedFaction" :disabled="factionConfirmed">
                <option value="">选择阵营...</option>
                <option value="earth">地球联合</option>
                <option value="bailong">拜隆军</option>
                <option value="maxion">马克西翁</option>
              </select>
              <button v-if="!factionConfirmed && selectedFaction" @click="confirmFaction" class="btn-small btn-primary">确认</button>
              <button v-if="factionConfirmed" @click="changeFaction" class="btn-small btn-ghost">更换</button>
            </div>
          </div>
          <div class="form-row">
            <label>主机体图片</label>
            <div class="file-upload-wrapper">
              <input type="file" ref="imageInputRef" @change="uploadImage" accept="image/*" class="file-input-hidden">
              <button type="button" @click="$refs.imageInputRef.click()" class="btn-file-upload">
                选择文件...
              </button>
              <span class="file-hint" v-if="!form.main_image_url">未选择任何文件</span>
              <span class="file-name" v-else>{{ imageFileName || '已选择图片' }}</span>
            </div>
            <img v-if="form.main_image_url" :src="form.main_image_url" class="preview-image">
          </div>
        </section>

        <!-- 主机体 -->
        <section class="form-section">
          <h3>主机体 <span class="points-badge">{{ mainTotal }}/40点</span></h3>
          <div class="stats-grid">
            <div class="stat-input"><label>格斗</label><div class="stepper"><button @click="adjustStat('main','格斗',-1)">-</button><input type="number" v-model.number="form.main_格斗" min="0" max="40" :class="{ 'error-input': highlightFields.main_格斗 }" @input="clearHighlight('main_格斗')"><button @click="adjustStat('main','格斗',1)">+</button></div></div>
            <div class="stat-input"><label>射击</label><div class="stepper"><button @click="adjustStat('main','射击',-1)">-</button><input type="number" v-model.number="form.main_射击" min="0" max="40" :class="{ 'error-input': highlightFields.main_射击 }" @input="clearHighlight('main_射击')"><button @click="adjustStat('main','射击',1)">+</button></div></div>
            <div class="stat-input"><label>结构</label><div class="stepper"><button @click="adjustStat('main','结构',-1)">-</button><input type="number" v-model.number="form.main_结构" min="0" max="40" :class="{ 'error-input': highlightFields.main_结构 }" @input="clearHighlight('main_结构')"><button @click="adjustStat('main','结构',1)">+</button></div></div>
            <div class="stat-input"><label>机动</label><div class="stepper"><button @click="adjustStat('main','机动',-1)">-</button><input type="number" v-model.number="form.main_机动" min="0" max="40" :class="{ 'error-input': highlightFields.main_机动 }" @input="clearHighlight('main_机动')"><button @click="adjustStat('main','机动',1)">+</button></div></div>
          </div>
          <div class="hp-display">HP: {{ mainHP }}</div>
          <SkillsEditor title="主机体技能" v-model="form.main_skills" :max-slots="3" />
        </section>

        <!-- 跟随 -->
        <section class="form-section">
          <h3><label class="check-row"><input type="checkbox" v-model="form.has_royroy">跟随 (Royroy)</label><span v-if="form.has_royroy" class="points-badge">{{ royroyTotal }}/25点</span></h3>
          <div v-if="form.has_royroy">
            <div class="stats-grid">
              <div class="stat-input"><label>格斗</label><div class="stepper"><button @click="adjustStat('royroy','格斗',-1)">-</button><input type="number" v-model.number="form.royroy_格斗" min="0" max="25"><button @click="adjustStat('royroy','格斗',1)">+</button></div></div>
              <div class="stat-input"><label>射击</label><div class="stepper"><button @click="adjustStat('royroy','射击',-1)">-</button><input type="number" v-model.number="form.royroy_射击" min="0" max="25"><button @click="adjustStat('royroy','射击',1)">+</button></div></div>
              <div class="stat-input"><label>结构</label><div class="stepper"><button @click="adjustStat('royroy','结构',-1)">-</button><input type="number" v-model.number="form.royroy_结构" min="0" max="25"><button @click="adjustStat('royroy','结构',1)">+</button></div></div>
              <div class="stat-input"><label>机动</label><div class="stepper"><button @click="adjustStat('royroy','机动',-1)">-</button><input type="number" v-model.number="form.royroy_机动" min="0" max="25"><button @click="adjustStat('royroy','机动',1)">+</button></div></div>
            </div>
            <div class="hp-display">HP: {{ royroyHP }}</div>
            <SkillsEditor title="跟随技能" v-model="form.royroy_skills" :max-slots="2" />
            <p v-if="!royroyConstraintMet" class="hint warning">⚠ 任一项属性需≥10</p>
          </div>
        </section>

        <!-- 左手 -->
        <section class="form-section">
          <h3>左手装备 <span v-if="form.left_type !== 'none'" class="points-badge">{{ leftTotal }}/15点</span></h3>
          <div class="form-row">
            <select v-model="form.left_type"><option value="none">无</option><option value="武器">武器</option><option value="防具">防具</option><option value="载具">载具</option><option value="背包">背包</option></select>
          </div>
          <div v-if="form.left_type !== 'none'" class="stats-grid">
            <div class="stat-input"><label>格斗</label><div class="stepper"><button @click="adjustStat('left','格斗',-1)">-</button><input type="number" v-model.number="form.left_格斗" min="0" max="15"><button @click="adjustStat('left','格斗',1)">+</button></div></div>
            <div class="stat-input"><label>射击</label><div class="stepper"><button @click="adjustStat('left','射击',-1)">-</button><input type="number" v-model.number="form.left_射击" min="0" max="15"><button @click="adjustStat('left','射击',1)">+</button></div></div>
            <div class="stat-input"><label>结构</label><div class="stepper"><button @click="adjustStat('left','结构',-1)">-</button><input type="number" v-model.number="form.left_结构" min="0" max="15"><button @click="adjustStat('left','结构',1)">+</button></div></div>
            <div class="stat-input"><label>机动</label><div class="stepper"><button @click="adjustStat('left','机动',-1)">-</button><input type="number" v-model.number="form.left_机动" min="0" max="15"><button @click="adjustStat('left','机动',1)">+</button></div></div>
          </div>
          <SkillsEditor v-if="form.left_type !== 'none'" title="左手技能" v-model="form.left_skills" :max-slots="getSkillSlots(form.left_type)" />
        </section>

        <!-- 右手 -->
        <section class="form-section">
          <h3>右手装备 <span v-if="form.right_type !== 'none'" class="points-badge">{{ rightTotal }}/15点</span></h3>
          <div class="form-row">
            <select v-model="form.right_type"><option value="none">无</option><option value="武器">武器</option><option value="防具">防具</option><option value="载具">载具</option><option value="背包">背包</option></select>
          </div>
          <div v-if="form.right_type !== 'none'" class="stats-grid">
            <div class="stat-input"><label>格斗</label><div class="stepper"><button @click="adjustStat('right','格斗',-1)">-</button><input type="number" v-model.number="form.right_格斗" min="0" max="15"><button @click="adjustStat('right','格斗',1)">+</button></div></div>
            <div class="stat-input"><label>射击</label><div class="stepper"><button @click="adjustStat('right','射击',-1)">-</button><input type="number" v-model.number="form.right_射击" min="0" max="15"><button @click="adjustStat('right','射击',1)">+</button></div></div>
            <div class="stat-input"><label>结构</label><div class="stepper"><button @click="adjustStat('right','结构',-1)">-</button><input type="number" v-model.number="form.right_结构" min="0" max="15"><button @click="adjustStat('right','结构',1)">+</button></div></div>
            <div class="stat-input"><label>机动</label><div class="stepper"><button @click="adjustStat('right','机动',-1)">-</button><input type="number" v-model.number="form.right_机动" min="0" max="15"><button @click="adjustStat('right','机动',1)">+</button></div></div>
          </div>
          <SkillsEditor v-if="form.right_type !== 'none'" title="右手技能" v-model="form.right_skills" :max-slots="getSkillSlots(form.right_type)" />
        </section>

        <!-- 其它 -->
        <section class="form-section">
          <h3>其它装备 <span v-if="form.extra_type !== 'none'" class="points-badge">{{ extraTotal }}/{{ extraPointLimit }}点</span></h3>
          <div class="form-row">
            <select v-model="form.extra_type"><option value="none">无</option><option value="武器">武器</option><option value="防具">防具</option><option value="载具">载具</option><option value="背包">背包</option></select>
          </div>
          <div v-if="form.extra_type !== 'none'" class="stats-grid">
            <div class="stat-input"><label>格斗</label><div class="stepper"><button @click="adjustStat('extra','格斗',-1)">-</button><input type="number" v-model.number="form.extra_格斗" min="0" :max="extraPointLimit"><button @click="adjustStat('extra','格斗',1)">+</button></div></div>
            <div class="stat-input"><label>射击</label><div class="stepper"><button @click="adjustStat('extra','射击',-1)">-</button><input type="number" v-model.number="form.extra_射击" min="0" :max="extraPointLimit"><button @click="adjustStat('extra','射击',1)">+</button></div></div>
            <div class="stat-input"><label>结构</label><div class="stepper"><button @click="adjustStat('extra','结构',-1)">-</button><input type="number" v-model.number="form.extra_结构" min="0" :max="extraPointLimit"><button @click="adjustStat('extra','结构',1)">+</button></div></div>
            <div class="stat-input"><label>机动</label><div class="stepper"><button @click="adjustStat('extra','机动',-1)">-</button><input type="number" v-model.number="form.extra_机动" min="0" :max="extraPointLimit"><button @click="adjustStat('extra','机动',1)">+</button></div></div>
          </div>
          <SkillsEditor v-if="form.extra_type !== 'none'" title="其它技能" v-model="form.extra_skills" :max-slots="getSkillSlots(form.extra_type)" />
          <p v-if="form.extra_type === '载具' && form.extra_机动 < 10" class="hint warning">⚠ 载具机动&lt;10，效果不生效</p>
          <p v-if="form.extra_type === '防具' && form.extra_结构 < 10" class="hint warning">⚠ 防具结构&lt;10，效果不生效</p>
        </section>
      </div>
    </main>

    <!-- Excel导入弹窗 步骤1 -->
    <div v-if="showImportDialog && !previewData" class="modal-overlay" @click.self="showImportDialog=false">
      <div class="modal">
        <h3>Excel导入</h3>
        <p>请上传设定器格式的Excel文件</p>
        <input type="file" @change="handleFileSelect" accept=".xlsx,.xls" ref="fileInputRef">
        <p v-if="importing" class="import-status">正在解析...</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" @click="showImportDialog=false" :disabled="importing">取消</button>
        </div>
      </div>
    </div>

    <!-- Excel导入弹窗 步骤2 -->
    <div v-if="showImportDialog && previewData" class="modal-overlay" @click.self="closePreview">
      <div class="modal preview-modal">
        <h3>导入预览</h3>
        <div v-if="previewWarnings.length>0" class="preview-warnings">
          <h4>⚠ 待填写项</h4><ul><li v-for="(w,i) in previewWarnings" :key="i">{{ w }}</li></ul>
        </div>
        <div class="preview-content">
          <div class="preview-section"><h4>基础信息</h4><p><strong>机体番号:</strong> {{ previewData.name||'(未填写)' }}</p><p><strong>行动代号:</strong> {{ previewData.codename||'(未填写)' }}</p><p><strong>阵营:</strong> {{ getFactionName(previewData.faction) }}</p></div>
          <div class="preview-section"><h4>主机体</h4><p>格斗: {{ previewData.main_格斗 }} | 射击: {{ previewData.main_射击 }} | 结构: {{ previewData.main_结构 }} | 机动: {{ previewData.main_机动 }}</p><p v-if="previewData.main_skills?.length"><strong>技能:</strong> {{ previewData.main_skills.map(s=>s.name==='null'?'(空)':s.name).join(', ') }}</p><p v-else class="empty-field">技能: (未填写)</p></div>
          <div v-if="previewData.has_royroy" class="preview-section"><h4>跟随 (Royroy)</h4><p>格斗: {{ previewData.royroy_格斗 }} | 射击: {{ previewData.royroy_射击 }} | 结构: {{ previewData.royroy_结构 }} | 机动: {{ previewData.royroy_机动 }}</p></div>
          <div v-if="previewData.left_type!=='none'" class="preview-section"><h4>左手装备 ({{ previewData.left_type }})</h4><p>格斗: {{ previewData.left_格斗 }} | 射击: {{ previewData.left_射击 }} | 结构: {{ previewData.left_结构 }} | 机动: {{ previewData.left_机动 }}</p></div>
          <div v-if="previewData.right_type!=='none'" class="preview-section"><h4>右手装备 ({{ previewData.right_type }})</h4><p>格斗: {{ previewData.right_格斗 }} | 射击: {{ previewData.right_射击 }} | 结构: {{ previewData.right_结构 }} | 机动: {{ previewData.right_机动 }}</p></div>
          <div v-if="previewData.extra_type!=='none'" class="preview-section"><h4>其它装备 ({{ previewData.extra_type }})</h4><p>格斗: {{ previewData.extra_格斗 }} | 射击: {{ previewData.extra_射击 }} | 结构: {{ previewData.extra_结构 }} | 机动: {{ previewData.extra_机动 }}</p></div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" @click="closePreview" :disabled="confirming">返回</button>
          <button class="btn btn-primary" @click="confirmImport" :disabled="confirming">{{ confirming?'保存中...':'确认导入' }}</button>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <footer class="footer">
      <div class="footer-left"><span>SYS.OK // 12:04:99</span></div>
      <div class="footer-right"><span class="good">同步率: 98.4%</span><span class="muted">坐标: 35.6895 N</span><span class="muted">状态: 最佳</span></div>
    </footer>
  
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { hangarAPI } from '@/api/client'
import SkillsEditor from '@/components/SkillsEditor.vue'

const router = useRouter()
const userStore = useUserStore()
const user = computed(() => userStore.user)
const FACTION_MAP = { earth:'地球联合', bailong:'拜隆军', maxion:'马克西翁' }

const units = ref([])
const editingUnit = ref(null)
const errors = ref([])
const highlightFields = ref({})
const showImportDialog = ref(false)
const importing = ref(false)
const confirming = ref(false)
const previewData = ref(null)
const previewWarnings = ref([])
const fileInputRef = ref(null)
const imageInputRef = ref(null)
const imageFileName = ref('')
const form = ref(createEmptyForm())
const selectedFaction = ref('')
const factionConfirmed = ref(false)

function createEmptyForm() {
  return {
    name:'', codename:'', faction:'earth', main_image_url:null, main_type:'机体',
    main_格斗:0, main_射击:0, main_结构:0, main_机动:0, main_skills:[],
    has_royroy:false, royroy_image_url:null,
    royroy_格斗:0, royroy_射击:0, royroy_结构:0, royroy_机动:0, royroy_skills:[],
    left_type:'none', left_image_url:null,
    left_格斗:0, left_射击:0, left_结构:0, left_机动:0, left_skills:[],
    right_type:'none', right_image_url:null,
    right_格斗:0, right_射击:0, right_结构:0, right_机动:0, right_skills:[],
    extra_type:'none', extra_image_url:null,
    extra_格斗:0, extra_射击:0, extra_结构:0, extra_机动:0, extra_skills:[]
  }
}

const mainTotal = computed(()=>(form.value.main_格斗||0)+(form.value.main_射击||0)+(form.value.main_结构||0)+(form.value.main_机动||0))
const mainHP = computed(()=>(form.value.main_结构||0)*10)
const royroyTotal = computed(()=>(form.value.royroy_格斗||0)+(form.value.royroy_射击||0)+(form.value.royroy_结构||0)+(form.value.royroy_机动||0))
const royroyHP = computed(()=>(form.value.royroy_结构||0)*3)
const royroyConstraintMet = computed(()=>(form.value.royroy_格斗||0)>=10||(form.value.royroy_射击||0)>=10||(form.value.royroy_结构||0)>=10||(form.value.royroy_机动||0)>=10)
const leftTotal = computed(()=>(form.value.left_格斗||0)+(form.value.left_射击||0)+(form.value.left_结构||0)+(form.value.left_机动||0))
const rightTotal = computed(()=>(form.value.right_格斗||0)+(form.value.right_射击||0)+(form.value.right_结构||0)+(form.value.right_机动||0))
const extraPointLimit = computed(()=>form.value.extra_type==='背包'?10:15)
const extraTotal = computed(()=>(form.value.extra_格斗||0)+(form.value.extra_射击||0)+(form.value.extra_结构||0)+(form.value.extra_机动||0))

function getSkillSlots(type) { return { '武器':1,'防具':1,'载具':2,'背包':0 }[type]||1 }

function adjustStat(prefix, stat, delta) {
  const key=`${prefix}_${stat}`
  const maxMap={main:40,royroy:25,left:15,right:15,extra:extraPointLimit.value}
  form.value[key]=Math.max(0,Math.min(maxMap[prefix]||15,(form.value[key]||0)+delta))
  clearHighlight(key)
}

function clearHighlight(field) { if(highlightFields.value[field]){ delete highlightFields.value[field]; highlightFields.value={...highlightFields.value} } }
function getFactionName(f) { return FACTION_MAP[f]||f }
function navigateTo(p) { router.push(p) }

async function loadUnits() { try { const {data}=await hangarAPI.getUnits(); units.value=data.units||[] } catch(e){ console.error(e) } }

function createNew() { form.value=createEmptyForm(); editingUnit.value={id:null}; errors.value=[]; highlightFields.value={}; selectedFaction.value=''; factionConfirmed.value=false }

async function editUnit(unit) { try { const {data}=await hangarAPI.getUnit(unit.id); form.value={...createEmptyForm(),...data}; editingUnit.value=unit; errors.value=[]; selectedFaction.value=form.value.faction; factionConfirmed.value=true } catch(e){ console.error(e) } }

function cancelEdit() { editingUnit.value=null; errors.value=[]; highlightFields.value={} }

function confirmFaction() { if(!selectedFaction.value) return alert('请先选择阵营'); form.value.faction=selectedFaction.value; factionConfirmed.value=true }

function changeFaction() { factionConfirmed.value=false; selectedFaction.value='' }

async function saveUnit() {
  errors.value=[]; highlightFields.value={}
  try {
    const isUpdate=!!editingUnit.value?.id
    if(isUpdate) await hangarAPI.updateUnit(editingUnit.value.id,form.value)
    else await hangarAPI.createUnit(form.value)
    await loadUnits(); editingUnit.value=null
    alert('保存成功')
  } catch(e) {
    const detail=e.response?.data
    errors.value=detail?.details||[detail?.error||'保存失败']
    const details=detail?.details||[]
    details.forEach(err=>{
      if(err.includes('机体番号')) highlightFields.value.name=true
      if(err.includes('行动代号')) highlightFields.value.codename=true
      if(err.includes('主机体')){ highlightFields.value.main_格斗=highlightFields.value.main_射击=highlightFields.value.main_结构=highlightFields.value.main_机动=true }
    })
  }
}

async function deleteUnit(id) { if(!confirm('确定要删除吗？')) return; try { await hangarAPI.deleteUnit(id); await loadUnits() } catch(e){ console.error(e) } }

async function uploadImage(e) {
  const file=e.target.files[0]; if(!file) return
  imageFileName.value = file.name
  const fd=new FormData(); fd.append('image',file)
  try {
    const token=localStorage.getItem('token')
    const res=await fetch('/api/hangar/units/upload-image',{method:'POST',headers:{'Authorization':`Bearer ${token}`},body:fd})
    const data=await res.json(); form.value.main_image_url=data.url
  } catch(e){ console.error(e) }
}

function importExcel() { showImportDialog.value=true; previewData.value=null; previewWarnings.value=[]; if(fileInputRef.value) fileInputRef.value.value='' }

async function handleFileSelect(e) {
  const file=e.target.files[0]; if(!file) return
  importing.value=true
  const token=localStorage.getItem('token'); const fd=new FormData(); fd.append('file',file)
  try {
    const res=await fetch('/api/hangar/units/parse-excel',{method:'POST',headers:{'Authorization':`Bearer ${token}`},body:fd})
    const data=await res.json()
    if(!res.ok){ alert(data.error||'解析失败'); importing.value=false; return }
    previewData.value=data.preview; previewWarnings.value=data.warnings||[]; importing.value=false
  } catch(e){ importing.value=false; alert('解析失败: '+e.message) }
}

function closePreview() { previewData.value=null; previewWarnings.value=[]; showImportDialog.value=false }

async function confirmImport() {
  if(!previewData.value) return; confirming.value=true
  const token=localStorage.getItem('token')
  try {
    const res=await fetch('/api/hangar/units/create-from-json',{method:'POST',headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(previewData.value)})
    const data=await res.json()
    if(!res.ok){ alert(data.error||'保存失败'); confirming.value=false; return }
    showImportDialog.value=false
    const importedName=previewData.value?.name||'新棋子'
    previewData.value=null; previewWarnings.value=[]; await loadUnits()
    const toast=document.createElement('div')
    toast.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#ffb000;color:#0a1628;padding:12px 24px;z-index:9999;font-size:14px;font-weight:700;font-family:monospace;'
    toast.textContent=`已导入: ${importedName}`; document.body.appendChild(toast)
    setTimeout(()=>toast.remove(),3000); confirming.value=false
  } catch(e){ confirming.value=false; alert('导入失败: '+e.message) }
}

onMounted(()=>{ loadUnits() })
</script>

<style scoped>
/* Layout */
.page-container { display:flex; min-height:100vh; background:#001620; }

/* Sidebar */

/* ===== NAV (shared) ===== */

.icon-xl { width:48px; height:48px; flex-shrink:0; }

/* Header */
.editor-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; padding-bottom:16px; border-bottom:1px solid rgba(255,176,0,0.1); }
.editor-header h2 { font-size:20px; font-weight:700; color:#ffb000; text-transform:uppercase; letter-spacing:.08em; }
.header-actions { display:flex; gap:10px; }

/* Buttons */
.btn { font-family:'Fira Code',monospace; font-size:12px; font-weight:700; padding:10px 20px; cursor:pointer; border:none; text-transform:uppercase; letter-spacing:.05em; transition:all .15s; }
.btn-primary { background:#ffb000; color:#0a1628; } .btn-primary:hover { background:#ffc840; }
.btn-secondary { background:transparent; border:1px solid rgba(255,176,0,0.4); color:#ffb000; } .btn-secondary:hover { background:rgba(255,176,0,0.1); }
.btn-ghost { background:transparent; border:1px solid rgba(159,142,120,0.3); color:#9f8e78; } .btn-ghost:hover { border-color:#ffb000; color:#ffb000; }
.btn-small { padding:6px 14px; font-size:11px; font-family:'Fira Code',monospace; font-weight:700; cursor:pointer; text-transform:uppercase; letter-spacing:.03em; transition:all .15s; }

/* Unit Cards */
.units-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(210px, 1fr)); gap:14px; }
.unit-card { background:#001e2b; border:1px solid rgba(255,176,0,0.08); padding:14px; cursor:pointer; transition:all .2s; position:relative; overflow:hidden; }
.unit-card::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(255,176,0,0.3) 20%,rgba(255,176,0,0.3) 80%,transparent); opacity:0; transition:opacity .2s; }
.unit-card:hover { transform:translateY(-3px); border-color:rgba(255,176,0,0.2); background:#002e3f; }
.unit-card:hover::before { opacity:1; }
.unit-image { width:100%; height:120px; background:#083344; display:flex; align-items:center; justify-content:center; margin-bottom:10px; overflow:hidden; }
.unit-image img { max-width:100%; max-height:100%; object-fit:contain; }
.unit-image .placeholder { font-size:12px; color:rgba(193,232,255,0.3); text-transform:uppercase; letter-spacing:.05em; }
.unit-info h3 { font-size:15px; font-weight:700; color:#c1e8ff; text-transform:uppercase; letter-spacing:.05em; margin-bottom:3px; }
.unit-info p { font-size:11px; color:rgba(193,232,255,0.45); margin:2px 0; font-family:'Fira Code',monospace; }
.unit-info .faction { color:#ffb000; font-weight:700; text-transform:uppercase; letter-spacing:.05em; }
.unit-card-actions { margin-top:10px; display:flex; justify-content:flex-end; }
.unit-card-actions button { background:none; border:none; font-size:18px; font-weight:700; cursor:pointer; color:rgba(193,232,255,0.3); padding:4px 8px; transition:all .2s; }
.unit-card-actions button:hover { color:#ff7351; transform:scale(1.2); }

/* Form */
.editor-form { padding-bottom:40px; }
.form-nav { display:flex; justify-content:space-between; margin-bottom:22px; }
.form-section { background:#001e2b; border:1px solid rgba(255,176,0,0.08); padding:22px; margin-bottom:20px; position:relative; overflow:hidden; }
.form-section::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:#ffb000; }
.form-section h3 { font-size:16px; font-weight:700; color:#ffb000; text-transform:uppercase; letter-spacing:.08em; margin-bottom:18px; display:flex; align-items:center; gap:10px; }
.form-row { margin-bottom:14px; }
.form-row > label { display:block; margin-bottom:6px; font-size:11px; font-weight:700; color:#ffd597; text-transform:uppercase; letter-spacing:1px; }
.form-row input[type="text"], .form-row select { width:100%; padding:10px 14px; border:1px solid rgba(159,142,120,0.25); background:#083344; color:#c1e8ff; font-family:'Fira Code',monospace; font-size:13px; transition:all .2s; }
.form-row input:focus, .form-row select:focus { outline:none; border-color:#ffb000; box-shadow:0 0 0 2px rgba(255,176,0,0.08); }
.file-upload-wrapper { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.file-input-hidden { display: none; }
.btn-file-upload {
  padding: 8px 18px;
  background: rgba(255,176,0,0.12);
  border: 1px solid rgba(255,176,0,0.3);
  color: #ffb000;
  font-family: 'Fira Code', monospace;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.btn-file-upload:hover { background: rgba(255,176,0,0.2); border-color: #ffb000; }
.file-hint { color: rgba(193,232,255,0.35); font-size: 11px; }
.file-name { color: #13ff43; font-size: 11px; font-family: 'Fira Code', monospace; }
.error-input { border-color:#ff7351 !important; background:rgba(255,115,81,0.08) !important; animation:pulse-error 1s ease-in-out; }
@keyframes pulse-error { 0%,100%{box-shadow:0 0 0 0 rgba(255,115,81,0.3)} 50%{box-shadow:0 0 0 5px rgba(255,115,81,0)} }
.faction-row { display:flex; gap:8px; align-items:center; }
.faction-row select { flex:1; }
.faction-row select:disabled { opacity:.5; }

/* Stats */
.stats-grid { display:grid; grid-template-columns:repeat(4, 1fr); gap:14px; margin-bottom:18px; }
.stat-input { display:flex; flex-direction:column; gap:6px; }
.stat-input > label { font-size:11px; font-weight:700; color:#ffd597; text-transform:uppercase; letter-spacing:1px; text-align:center; }
.stepper { display:flex; align-items:stretch; }
.stepper button { width:34px; height:38px; border:1px solid rgba(159,142,120,0.25); background:#083344; color:#c1e8ff; font-size:16px; font-weight:700; font-family:'Fira Code',monospace; cursor:pointer; transition:all .15s; }
.stepper button:hover { border-color:#ffb000; color:#ffb000; background:rgba(255,176,0,0.1); }
.stepper input { width:56px; height:38px; border:1px solid rgba(159,142,120,0.25); border-left:none; border-right:none; background:#083344; color:#c1e8ff; font-family:'Fira Code',monospace; font-size:14px; text-align:center; }
.stepper input:focus { outline:none; border-color:#ffb000; }
.hp-display { text-align:center; font-size:18px; font-weight:700; color:#ffb000; margin-bottom:18px; text-transform:uppercase; letter-spacing:.05em; font-family:'Fira Code',monospace; }
.points-badge { background:#ffb000; color:#0a1628; padding:3px 10px; font-size:11px; font-weight:700; font-family:'Fira Code',monospace; text-transform:uppercase; letter-spacing:.05em; }
.hint { font-size:12px; color:rgba(193,232,255,0.4); margin-top:7px; font-family:'Fira Code',monospace; }
.hint.warning { color:#ffb000; font-weight:700; }
.check-row { display:flex; align-items:center; gap:8px; cursor:pointer; color:#ffd597; }
.check-row input[type="checkbox"] { width:16px; height:16px; accent-color:#ffb000; }
.preview-image { max-width:200px; max-height:140px; margin-top:10px; border:1px solid rgba(255,176,0,0.3); }

/* Error */
.error-box { background:#001e2b; border-left:3px solid #ff7351; padding:14px 16px; margin-bottom:20px; }
.error-box strong { color:#ff7351; font-size:14px; text-transform:uppercase; letter-spacing:.05em; }
.error-box ul { margin:8px 0 0; padding-left:20px; }
.error-box li { font-size:12px; color:rgba(193,232,255,0.6); margin-bottom:3px; font-family:'Fira Code',monospace; }
.empty-state { text-align:center; padding:48px; color:rgba(193,232,255,0.35); font-size:14px; }

/* Modal */
.modal-overlay { position:fixed; inset:0; background:rgba(2,9,17,0.88); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; z-index:1000; }
.modal { background:#001e2b; border:1px solid rgba(255,176,0,0.2); padding:28px; max-width:440px; width:90%; }
.modal h3 { font-size:17px; color:#ffb000; margin-bottom:14px; text-transform:uppercase; letter-spacing:.08em; }
.modal p { color:rgba(193,232,255,0.5); margin-bottom:14px; font-size:13px; }
.modal input[type="file"] { margin:12px 0; color:#c1e8ff; }
.modal-actions { margin-top:22px; display:flex; gap:10px; justify-content:flex-end; }
.import-status { color:#ffb000 !important; font-weight:700; font-family:'Fira Code',monospace; }
.preview-modal { max-width:560px; max-height:80vh; overflow-y:auto; }
.preview-warnings { background:rgba(255,176,0,0.08); border:1px solid rgba(255,176,0,0.2); padding:12px 14px; margin-bottom:14px; }
.preview-warnings h4 { margin:0 0 6px; color:#ffb000; font-size:13px; }
.preview-warnings ul { margin:0; padding-left:18px; }
.preview-warnings li { color:rgba(193,232,255,0.55); font-size:12px; margin-bottom:3px; }
.preview-content { max-height:380px; overflow-y:auto; }
.preview-section { background:#083344; padding:12px 14px; margin-bottom:10px; }
.preview-section h4 { margin:0 0 6px; color:#ffb000; font-size:13px; text-transform:uppercase; }
.preview-section p { margin:3px 0; font-size:12px; color:#c1e8ff; }
.preview-section .empty-field { color:rgba(193,232,255,0.35); font-style:italic; }

/* Footer */
.footer { position:fixed; bottom:0; left:256px; right:0;
  transition: left 0.25s cubic-bezier(0.4, 0, 0.2, 1); background:rgba(2,9,17,0.92); border-top:1px solid rgba(255,176,0,0.1); padding:6px 24px; display:flex; justify-content:space-between; align-items:center; font-family:'Fira Code',monospace; font-size:10px; z-index:50; }
.footer-left span { color:#ffb000; font-weight:700; letter-spacing:2px; text-transform:uppercase; }
.footer-right { display:flex; gap:28px; letter-spacing:2px; text-transform:uppercase; }
.footer-right .good { color:rgba(122,236,255,0.8); }
.footer-right .muted { color:rgba(193,232,255,0.3); }
</style>
