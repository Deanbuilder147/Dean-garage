<template>

    <div class="page-container w-full h-full flex flex-col overflow-y-auto">
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
              <img v-if="coverUrl(unit)" :src="coverUrl(unit)" :alt="unit.name" @error="onImgError">
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
            <label for="unit-name-field">机体番号 *</label>
            <input id="unit-name-field" name="name" v-model="form.name" type="text" placeholder="例如: RX-78-2"
                   :class="{ 'error-input': highlightFields.name }" @input="clearHighlight('name')">
          </div>
          <div class="form-row">
            <label for="unit-codename-field">行动代号</label>
            <input id="unit-codename-field" name="codename" v-model="form.codename" type="text" placeholder="例如: 高达"
                   :class="{ 'error-input': highlightFields.codename }" @input="clearHighlight('codename')">
          </div>
          <div class="form-row">
            <label for="unit-faction-field">所属阵营</label>
            <div class="faction-row">
              <select id="unit-faction-field" name="faction" v-model="form.faction" class="faction-select w-48">
                <option value="">选择阵营...</option>
                <option v-for="f in factions" :key="f.code" :value="f.code">{{ f.name }}</option>
              </select>
              <button class="btn btn-accent btn-small" @click="openAddFaction">+ 添加阵营</button>
              <div class="faction-logo-box">
                <img v-if="getFactionLogo(form.faction)" :src="getFactionLogo(form.faction)" alt="阵营Logo" class="faction-logo-img">
                <span v-else class="faction-logo-placeholder">{{ getFactionName(form.faction)?.[0] || '?' }}</span>
              </div>
            </div>
          </div>
          <div class="form-row">
            <label for="unit-image-field">机体封面</label>
            <div class="file-upload-wrapper">
              <div class="cover-preview-box">
                <img v-if="frontViewUrl" :src="frontViewUrl" class="preview-image" alt="封面" @error="onImgError">
                <span v-else class="file-hint">未配置七视图，将显示「无图」占位</span>
              </div>
              <p class="file-hint">封面自动取自「七视图」正视图（方向 0），无需单独上传主图。</p>
            </div>
          </div>
        </section>

        <!-- Phase 28-D: 机体七视图配置区 -->
        <section class="form-section">
          <h3>七视图 (<span class="faction-code">{{ form.codename || form.name || '???' }}</span>)</h3>
          <p class="section-desc">按 0-6 朝向配置精灵图，命名规范: {{ (form.codename || form.name || 'UNIT') }}_[0-6]_idle.png</p>
          <div class="views-grid">
            <div v-for="dv in directionViews" :key="dv.value" class="view-slot">
              <div class="view-label">{{ dv.label }}</div>
              <div class="view-drop-zone"
                   @click="triggerViewUpload(dv.value)"
                   @dragover.prevent
                   @drop.prevent="handleViewDrop($event, dv.value)">
                <img v-if="viewPreviews[dv.value]" :src="viewPreviews[dv.value]" class="view-preview-img">
                <span v-else class="view-placeholder">{{ dv.value }}</span>
              </div>
              <input type="file" :ref="el => viewInputs[dv.value] = el" @change="e => handleViewUpload(e, dv.value)" accept="image/png" class="file-input-hidden">
              <button class="btn-small btn-accent" @click="clearView(dv.value)" v-if="viewPreviews[dv.value]">清除</button>
            </div>
          </div>
          <div class="views-actions">
            <button class="btn btn-accent" @click="uploadAllViews" :disabled="!allViewsFilled || viewUploading">
              {{ viewUploading ? '上传中...' : '批量上传七视图' }}
            </button>
            <button class="btn btn-secondary" @click="generateAIViews" :disabled="viewUploading">
              AI 动态生成七视图
            </button>
          </div>
          <p v-if="viewUploading" class="import-status">正在上传七视图...</p>
          <p v-if="viewError" class="error-text">{{ viewError }}</p>
        </section>

        <!-- 主机体 -->
        <section class="form-section">
          <h3>主机体 <span class="points-badge">{{ mainTotal }}/40点</span></h3>
          <div class="stats-grid">
            <div class="stat-input"><label for="stat-main-格斗">格斗</label><div class="stepper"><button @click="adjustStat('main','格斗',-1)">-</button><input id="stat-main-格斗" name="main_格斗" type="number" v-model.number="form.main_格斗" min="0" max="40" :class="{ 'error-input': highlightFields.main_格斗 }" @input="clearHighlight('main_格斗')"><button @click="adjustStat('main','格斗',1)">+</button></div></div>
            <div class="stat-input"><label for="stat-main-射击">射击</label><div class="stepper"><button @click="adjustStat('main','射击',-1)">-</button><input id="stat-main-射击" name="main_射击" type="number" v-model.number="form.main_射击" min="0" max="40" :class="{ 'error-input': highlightFields.main_射击 }" @input="clearHighlight('main_射击')"><button @click="adjustStat('main','射击',1)">+</button></div></div>
            <div class="stat-input"><label for="stat-main-结构">结构</label><div class="stepper"><button @click="adjustStat('main','结构',-1)">-</button><input id="stat-main-结构" name="main_结构" type="number" v-model.number="form.main_结构" min="0" max="40" :class="{ 'error-input': highlightFields.main_结构 }" @input="clearHighlight('main_结构')"><button @click="adjustStat('main','结构',1)">+</button></div></div>
            <div class="stat-input"><label for="stat-main-机动">机动</label><div class="stepper"><button @click="adjustStat('main','机动',-1)">-</button><input id="stat-main-机动" name="main_机动" type="number" v-model.number="form.main_机动" min="0" max="40" :class="{ 'error-input': highlightFields.main_机动 }" @input="clearHighlight('main_机动')"><button @click="adjustStat('main','机动',1)">+</button></div></div>
          </div>
          <div class="hp-display">HP: {{ mainHP }}</div>
          <SkillsEditor title="主机体技能" v-model="form.main_skills" :max-slots="3" />
        </section>

        <!-- 跟随 -->
        <section class="form-section">
          <h3><label class="check-row" for="unit-has-royroy"><input id="unit-has-royroy" name="has_royroy" type="checkbox" v-model="form.has_royroy">跟随 (Royroy)</label><span v-if="form.has_royroy" class="points-badge">{{ royroyTotal }}/25点</span></h3>
          <div v-if="form.has_royroy">
            <div class="stats-grid">
              <div class="stat-input"><label for="stat-royroy-格斗">格斗</label><div class="stepper"><button @click="adjustStat('royroy','格斗',-1)">-</button><input id="stat-royroy-格斗" name="royroy_格斗" type="number" v-model.number="form.royroy_格斗" min="0" max="25"><button @click="adjustStat('royroy','格斗',1)">+</button></div></div>
              <div class="stat-input"><label for="stat-royroy-射击">射击</label><div class="stepper"><button @click="adjustStat('royroy','射击',-1)">-</button><input id="stat-royroy-射击" name="royroy_射击" type="number" v-model.number="form.royroy_射击" min="0" max="25"><button @click="adjustStat('royroy','射击',1)">+</button></div></div>
              <div class="stat-input"><label for="stat-royroy-结构">结构</label><div class="stepper"><button @click="adjustStat('royroy','结构',-1)">-</button><input id="stat-royroy-结构" name="royroy_结构" type="number" v-model.number="form.royroy_结构" min="0" max="25"><button @click="adjustStat('royroy','结构',1)">+</button></div></div>
              <div class="stat-input"><label for="stat-royroy-机动">机动</label><div class="stepper"><button @click="adjustStat('royroy','机动',-1)">-</button><input id="stat-royroy-机动" name="royroy_机动" type="number" v-model.number="form.royroy_机动" min="0" max="25"><button @click="adjustStat('royroy','机动',1)">+</button></div></div>
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
            <select id="unit-left-type" name="left_type" v-model="form.left_type"><option value="none">无</option><option value="武器">武器</option><option value="防具">防具</option><option value="载具">载具</option><option value="背包">背包</option></select>
          </div>
          <div v-if="form.left_type !== 'none'" class="stats-grid">
            <div class="stat-input"><label for="stat-left-格斗">格斗</label><div class="stepper"><button @click="adjustStat('left','格斗',-1)">-</button><input id="stat-left-格斗" name="left_格斗" type="number" v-model.number="form.left_格斗" min="0" max="15"><button @click="adjustStat('left','格斗',1)">+</button></div></div>
            <div class="stat-input"><label for="stat-left-射击">射击</label><div class="stepper"><button @click="adjustStat('left','射击',-1)">-</button><input id="stat-left-射击" name="left_射击" type="number" v-model.number="form.left_射击" min="0" max="15"><button @click="adjustStat('left','射击',1)">+</button></div></div>
            <div class="stat-input"><label for="stat-left-结构">结构</label><div class="stepper"><button @click="adjustStat('left','结构',-1)">-</button><input id="stat-left-结构" name="left_结构" type="number" v-model.number="form.left_结构" min="0" max="15"><button @click="adjustStat('left','结构',1)">+</button></div></div>
            <div class="stat-input"><label for="stat-left-机动">机动</label><div class="stepper"><button @click="adjustStat('left','机动',-1)">-</button><input id="stat-left-机动" name="left_机动" type="number" v-model.number="form.left_机动" min="0" max="15"><button @click="adjustStat('left','机动',1)">+</button></div></div>
          </div>
          <div v-if="form.left_type !== 'none'" class="dkm-section">
            <label class="dkm-title">damage_kind_modifiers (Phase 11)</label>
            <div class="dkm-grid">
              <div class="dkm-cell"><label for="stat-left-dkm-beam">光束</label><input id="stat-left-dkm-beam" name="left_dkm_beam" type="number" v-model.number="form.left_dkm_beam" step="0.1" min="-5" max="5" /></div>
              <div class="dkm-cell"><label for="stat-left-dkm-kinetic">动能</label><input id="stat-left-dkm-kinetic" name="left_dkm_kinetic" type="number" v-model.number="form.left_dkm_kinetic" step="0.1" min="-5" max="5" /></div>
              <div class="dkm-cell"><label for="stat-left-dkm-explosive">爆炸</label><input id="stat-left-dkm-explosive" name="left_dkm_explosive" type="number" v-model.number="form.left_dkm_explosive" step="0.1" min="-5" max="5" /></div>
              <div class="dkm-cell"><label for="stat-left-dkm-corrosive">腐蚀</label><input id="stat-left-dkm-corrosive" name="left_dkm_corrosive" type="number" v-model.number="form.left_dkm_corrosive" step="0.1" min="-5" max="5" /></div>
              <div class="dkm-cell"><label for="stat-left-dkm-thermal">热熔</label><input id="stat-left-dkm-thermal" name="left_dkm_thermal" type="number" v-model.number="form.left_dkm_thermal" step="0.1" min="-5" max="5" /></div>
            </div>
          </div>
          <SkillsEditor v-if="form.left_type !== 'none'" title="左手技能" v-model="form.left_skills" :max-slots="getSkillSlots(form.left_type)" />
        </section>

        <!-- 右手 -->
        <section class="form-section">
          <h3>右手装备 <span v-if="form.right_type !== 'none'" class="points-badge">{{ rightTotal }}/15点</span></h3>
          <div class="form-row">
            <select id="unit-right-type" name="right_type" v-model="form.right_type"><option value="none">无</option><option value="武器">武器</option><option value="防具">防具</option><option value="载具">载具</option><option value="背包">背包</option></select>
          </div>
          <div v-if="form.right_type !== 'none'" class="stats-grid">
            <div class="stat-input"><label for="stat-right-格斗">格斗</label><div class="stepper"><button @click="adjustStat('right','格斗',-1)">-</button><input id="stat-right-格斗" name="right_格斗" type="number" v-model.number="form.right_格斗" min="0" max="15"><button @click="adjustStat('right','格斗',1)">+</button></div></div>
            <div class="stat-input"><label for="stat-right-射击">射击</label><div class="stepper"><button @click="adjustStat('right','射击',-1)">-</button><input id="stat-right-射击" name="right_射击" type="number" v-model.number="form.right_射击" min="0" max="15"><button @click="adjustStat('right','射击',1)">+</button></div></div>
            <div class="stat-input"><label for="stat-right-结构">结构</label><div class="stepper"><button @click="adjustStat('right','结构',-1)">-</button><input id="stat-right-结构" name="right_结构" type="number" v-model.number="form.right_结构" min="0" max="15"><button @click="adjustStat('right','结构',1)">+</button></div></div>
            <div class="stat-input"><label for="stat-right-机动">机动</label><div class="stepper"><button @click="adjustStat('right','机动',-1)">-</button><input id="stat-right-机动" name="right_机动" type="number" v-model.number="form.right_机动" min="0" max="15"><button @click="adjustStat('right','机动',1)">+</button></div></div>
          </div>
          <div v-if="form.right_type !== 'none'" class="dkm-section">
            <label class="dkm-title">damage_kind_modifiers (Phase 11)</label>
            <div class="dkm-grid">
              <div class="dkm-cell"><label for="stat-right-dkm-beam">光束</label><input id="stat-right-dkm-beam" name="right_dkm_beam" type="number" v-model.number="form.right_dkm_beam" step="0.1" min="-5" max="5" /></div>
              <div class="dkm-cell"><label for="stat-right-dkm-kinetic">动能</label><input id="stat-right-dkm-kinetic" name="right_dkm_kinetic" type="number" v-model.number="form.right_dkm_kinetic" step="0.1" min="-5" max="5" /></div>
              <div class="dkm-cell"><label for="stat-right-dkm-explosive">爆炸</label><input id="stat-right-dkm-explosive" name="right_dkm_explosive" type="number" v-model.number="form.right_dkm_explosive" step="0.1" min="-5" max="5" /></div>
              <div class="dkm-cell"><label for="stat-right-dkm-corrosive">腐蚀</label><input id="stat-right-dkm-corrosive" name="right_dkm_corrosive" type="number" v-model.number="form.right_dkm_corrosive" step="0.1" min="-5" max="5" /></div>
              <div class="dkm-cell"><label for="stat-right-dkm-thermal">热熔</label><input id="stat-right-dkm-thermal" name="right_dkm_thermal" type="number" v-model.number="form.right_dkm_thermal" step="0.1" min="-5" max="5" /></div>
            </div>
          </div>
          <SkillsEditor v-if="form.right_type !== 'none'" title="右手技能" v-model="form.right_skills" :max-slots="getSkillSlots(form.right_type)" />
        </section>

        <!-- 其它 -->
        <section class="form-section">
          <h3>其它装备 <span v-if="form.extra_type !== 'none'" class="points-badge">{{ extraTotal }}/{{ extraPointLimit }}点</span></h3>
          <div class="form-row">
            <select id="unit-extra-type" name="extra_type" v-model="form.extra_type"><option value="none">无</option><option value="武器">武器</option><option value="防具">防具</option><option value="载具">载具</option><option value="背包">背包</option></select>
          </div>
          <div v-if="form.extra_type !== 'none'" class="stats-grid">
            <div class="stat-input"><label for="stat-extra-格斗">格斗</label><div class="stepper"><button @click="adjustStat('extra','格斗',-1)">-</button><input id="stat-extra-格斗" name="extra_格斗" type="number" v-model.number="form.extra_格斗" min="0" :max="extraPointLimit"><button @click="adjustStat('extra','格斗',1)">+</button></div></div>
            <div class="stat-input"><label for="stat-extra-射击">射击</label><div class="stepper"><button @click="adjustStat('extra','射击',-1)">-</button><input id="stat-extra-射击" name="extra_射击" type="number" v-model.number="form.extra_射击" min="0" :max="extraPointLimit"><button @click="adjustStat('extra','射击',1)">+</button></div></div>
            <div class="stat-input"><label for="stat-extra-结构">结构</label><div class="stepper"><button @click="adjustStat('extra','结构',-1)">-</button><input id="stat-extra-结构" name="extra_结构" type="number" v-model.number="form.extra_结构" min="0" :max="extraPointLimit"><button @click="adjustStat('extra','结构',1)">+</button></div></div>
            <div class="stat-input"><label for="stat-extra-机动">机动</label><div class="stepper"><button @click="adjustStat('extra','机动',-1)">-</button><input id="stat-extra-机动" name="extra_机动" type="number" v-model.number="form.extra_机动" min="0" :max="extraPointLimit"><button @click="adjustStat('extra','机动',1)">+</button></div></div>
          </div>
          <div v-if="form.extra_type !== 'none'" class="dkm-section">
            <label class="dkm-title">damage_kind_modifiers (Phase 11)</label>
            <div class="dkm-grid">
              <div class="dkm-cell"><label for="stat-extra-dkm-beam">光束</label><input id="stat-extra-dkm-beam" name="extra_dkm_beam" type="number" v-model.number="form.extra_dkm_beam" step="0.1" min="-5" max="5" /></div>
              <div class="dkm-cell"><label for="stat-extra-dkm-kinetic">动能</label><input id="stat-extra-dkm-kinetic" name="extra_dkm_kinetic" type="number" v-model.number="form.extra_dkm_kinetic" step="0.1" min="-5" max="5" /></div>
              <div class="dkm-cell"><label for="stat-extra-dkm-explosive">爆炸</label><input id="stat-extra-dkm-explosive" name="extra_dkm_explosive" type="number" v-model.number="form.extra_dkm_explosive" step="0.1" min="-5" max="5" /></div>
              <div class="dkm-cell"><label for="stat-extra-dkm-corrosive">腐蚀</label><input id="stat-extra-dkm-corrosive" name="extra_dkm_corrosive" type="number" v-model.number="form.extra_dkm_corrosive" step="0.1" min="-5" max="5" /></div>
              <div class="dkm-cell"><label for="stat-extra-dkm-thermal">热熔</label><input id="stat-extra-dkm-thermal" name="extra_dkm_thermal" type="number" v-model.number="form.extra_dkm_thermal" step="0.1" min="-5" max="5" /></div>
            </div>
          </div>
          <SkillsEditor v-if="form.extra_type !== 'none'" title="其它技能" v-model="form.extra_skills" :max-slots="getSkillSlots(form.extra_type)" />
          <p v-if="form.extra_type === '载具' && form.extra_机动 < 10" class="hint warning">⚠ 载具机动&lt;10，效果不生效</p>
          <p v-if="form.extra_type === '防具' && form.extra_结构 < 10" class="hint warning">⚠ 防具结构&lt;10，效果不生效</p>
        </section>
      </div>
    </div>

    <!-- Phase 28: 添加阵营模态弹窗 -->
    <div v-if="showAddFaction" class="modal-overlay" @click.self="showAddFaction=false">
      <div class="modal">
        <h3>添加阵营</h3>
        <div class="form-row">
          <label for="faction-code-field">阵营 Code *</label>
          <input id="faction-code-field" name="faction_code" v-model="newFaction.code" type="text" placeholder="如: neon" :disabled="factionUploading">
        </div>
        <div class="form-row">
          <label for="faction-name-field">阵营名称 *</label>
          <input id="faction-name-field" name="faction_name" v-model="newFaction.name" type="text" placeholder="如: 霓虹战线" :disabled="factionUploading">
        </div>
        <div class="form-row">
          <label for="faction-logo-field">阵营 Logo (仅 PNG)</label>
          <input id="faction-logo-field" name="faction_logo" type="file" ref="factionImageRef" @change="handleFactionImage" accept="image/png" :disabled="factionUploading">
        </div>
        <p v-if="factionUploading" class="import-status">正在上传...</p>
        <p v-if="factionError" class="error-text">{{ factionError }}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" @click="cancelAddFaction" :disabled="factionUploading">取消</button>
          <button class="btn btn-primary" @click="submitFaction" :disabled="factionUploading">{{ factionUploading ? '上传中...' : '确认添加' }}</button>
        </div>
      </div>
    </div>

    <!-- Excel导入弹窗 步骤1 -->
    <div v-if="showImportDialog && !previewData" class="modal-overlay" @click.self="showImportDialog=false">
      <div class="modal">
        <h3>Excel导入</h3>
        <p>请上传设定器格式的Excel文件</p>
        <div class="excel-upload-row">
          <input id="excel-import-field" name="excel_file" type="file" @change="handleFileSelect" accept=".xlsx,.xls" ref="fileInputRef" class="file-input-hidden">
          <button type="button" class="btn btn-ghost" @click="fileInputRef.click()">选择文件</button>
          <span class="excel-file-status">{{ importFileName || '未选择任何文件' }}</span>
        </div>
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
          <div class="preview-section"><h4>基础信息</h4><p><strong>机体番号:</strong> {{ previewData.name||'(未填写)' }}</p><p><strong>行动代号:</strong> {{ previewData.codename||'(未填写)' }}</p><p><strong>阵营:</strong> {{ getFactionName(previewData.faction) || '(未填写)' }}</p></div>
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

const units = ref([])
const editingUnit = ref(null)
const errors = ref([])
const highlightFields = ref({})
const showImportDialog = ref(false)
const importing = ref(false)
const confirming = ref(false)
const previewData = ref(null)
const previewNormalized = ref(null)  // 结构化 { normalized, legacy } 供 confirmImport 使用
const importPayloadStr = ref('')  // _importPayload JSON 字符串，绕过序列化问题
const previewWarnings = ref([])
const fileInputRef = ref(null)
const importFileName = ref('')
const form = ref(createEmptyForm())

// Phase 28: 动态阵营管理
const factions = ref([])
const showAddFaction = ref(false)
const factionUploading = ref(false)
const factionError = ref('')
const factionImageRef = ref(null)
const factionImageFile = ref(null)
const newFaction = ref({ code: '', name: '' })

// Phase 28-D: 七视图上传管理
const directionViews = [
  { value: 0, label: '0 正面' },
  { value: 1, label: '1 正右' },
  { value: 2, label: '2 右下' },
  { value: 3, label: '3 左下' },
  { value: 4, label: '4 正左' },
  { value: 5, label: '5 左上' },
  { value: 6, label: '6 右上' },
]
const viewFiles = ref({})       // { 0: File, 1: File, ... }
const viewPreviews = ref({})    // { 0: dataURL, ... }
const viewInputs = ref({})      // { 0: inputElement, ... }
const viewUploading = ref(false)
const viewError = ref('')
const allViewsFilled = computed(() => directionViews.every(dv => viewFiles.value[dv.value]))

function triggerViewUpload(dv) {
  const input = viewInputs.value[dv]
  if (input) input.click()
}

function handleViewUpload(e, dv) {
  const file = e.target.files[0]
  if (!file) return
  if (file.type !== 'image/png') {
    viewError.value = `方向 ${dv}: 仅支持 PNG 格式`
    return
  }
  viewError.value = ''
  viewFiles.value = { ...viewFiles.value, [dv]: file }
  // 生成预览
  const reader = new FileReader()
  reader.onload = (ev) => { viewPreviews.value = { ...viewPreviews.value, [dv]: ev.target.result } }
  reader.readAsDataURL(file)
}

function handleViewDrop(e, dv) {
  const file = e.dataTransfer.files[0]
  if (!file) return
  if (file.type !== 'image/png') {
    viewError.value = `方向 ${dv}: 仅支持 PNG 格式`
    return
  }
  viewError.value = ''
  viewFiles.value = { ...viewFiles.value, [dv]: file }
  const reader = new FileReader()
  reader.onload = (ev) => { viewPreviews.value = { ...viewPreviews.value, [dv]: ev.target.result } }
  reader.readAsDataURL(file)
}

function clearView(dv) {
  const newFiles = { ...viewFiles.value }; delete newFiles[dv]; viewFiles.value = newFiles
  const newPreviews = { ...viewPreviews.value }; delete newPreviews[dv]; viewPreviews.value = newPreviews
  if (viewInputs.value[dv]) viewInputs.value[dv].value = ''
}

async function uploadAllViews() {
  if (!allViewsFilled.value) { viewError.value = '请填充全部 7 个方向的图片'; return }
  const unitCode = (form.value.codename || form.value.name || 'UNIT').replace(/[^a-zA-Z0-9_-]/g, '')
  viewUploading.value = true; viewError.value = ''

  try {
    for (const dv of directionViews) {
      const fd = new FormData()
      fd.append('image', viewFiles.value[dv.value])
      fd.append('unitCode', unitCode)
      fd.append('direction', String(dv.value))
      const { data } = await hangarAPI.uploadUnitView(fd)
      const url = data?.url
      if (url) {
        form.value.view_urls = { ...(form.value.view_urls || {}), [dv.value]: url }
        viewPreviews.value = { ...viewPreviews.value, [dv.value]: url }
      }
    }
    viewError.value = ''
    alert('七视图上传成功！')
    // 清空临时文件句柄，但保留预览，避免误以为丢失
    viewFiles.value = {}
  } catch (e) {
    viewError.value = '上传失败: ' + e.message
  } finally {
    viewUploading.value = false
  }
}

function generateAIViews() {
  // AI 动态生成七视图 — 预留接口，调用合作商 API
  const unitCode = (form.value.codename || form.value.name || 'UNIT').replace(/[^a-zA-Z0-9_-]/g, '')
  if (!unitCode) { viewError.value = '请先填写机体番号或行动代号'; return }
  alert(`AI 七视图生成接口预留: 将为核心 "${unitCode}" 生成 0-6 七个角度的 PNG 精灵图。
当前为合作商 API 对接预留位，请确认 API Key 后启用。`)
  viewError.value = ''
}

// 主图/预览图加载失败时的占位，避免浏览器裂图图标（如 DB 引用了已丢失的旧文件）
const NO_IMG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="%23e5e7eb"/><text x="60" y="64" font-size="13" text-anchor="middle" fill="%239ca3af">无图</text></svg>';
function onImgError(e) {
  e.target.onerror = null;
  e.target.src = NO_IMG;
}

// Phase 30-Cover: 封面自动取七视图正视图（方向 0）；列表接口 view_urls 可能是 JSON 字符串，需兼容解析
function coverUrl(u) {
  let vu = u?.view_urls
  if (typeof vu === 'string') { try { vu = JSON.parse(vu) } catch { vu = {} } }
  if (vu && (vu['0'] || vu[0])) return vu['0'] || vu[0]
  return null
}
// 编辑态封面：优先用本地预览（上传后），回退到已保存的 view_urls 正视图
const frontViewUrl = computed(() =>
  viewPreviews.value[0] || form.value.view_urls?.['0'] || form.value.view_urls?.[0] || null
)

function createEmptyForm() {
  return {
    name:'', codename:'', faction:'earth', main_type:'机体',
    main_格斗:0, main_射击:0, main_结构:0, main_机动:0, main_skills:[],
    has_royroy:false, royroy_image_url:null,
    royroy_格斗:0, royroy_射击:0, royroy_结构:0, royroy_机动:0, royroy_skills:[],
    left_type:'none', left_image_url:null,
    left_格斗:0, left_射击:0, left_结构:0, left_机动:0, left_skills:[],
    right_type:'none', right_image_url:null,
    right_格斗:0, right_射击:0, right_结构:0, right_机动:0, right_skills:[],
    extra_type:'none', extra_image_url:null,
    extra_格斗:0, extra_射击:0, extra_结构:0, extra_机动:0, extra_skills:[],
    view_urls: {}
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

// Phase 28: 动态阵营名查找
function getFactionName(code) {
  const f = factions.value.find(x => x.code === code)
  return f ? f.name : (code || '?')
}
function getFactionLogo(code) {
  const f = factions.value.find(x => x.code === code)
  return f ? f.logo : null
}

function navigateTo(p) { router.push(p) }

// Phase 28: 加载阵营列表
async function loadFactions() {
  try {
    const { data } = await hangarAPI.getFactions()
    factions.value = data.factions || []
  } catch (e) { console.error('[factions] 加载失败:', e) }
}

// Phase 28: 添加阵营弹窗
function openAddFaction() {
  showAddFaction.value = true
  newFaction.value = { code: '', name: '' }
  factionError.value = ''
  factionImageFile.value = null
  if (factionImageRef.value) factionImageRef.value.value = ''
}

function cancelAddFaction() {
  showAddFaction.value = false
  factionImageFile.value = null
  factionError.value = ''
}

function handleFactionImage(e) {
  const file = e.target.files[0]
  if (file && file.type !== 'image/png') {
    factionError.value = '仅支持 PNG 格式图片'
    factionImageFile.value = null
    return
  }
  factionError.value = ''
  factionImageFile.value = file
}

async function submitFaction() {
  const code = newFaction.value.code.trim()
  const name = newFaction.value.name.trim()
  if (!code) { factionError.value = '请输入阵营 Code'; return }
  if (!name) { factionError.value = '请输入阵营名称'; return }
  if (!/^[a-zA-Z0-9_-]+$/.test(code)) { factionError.value = 'Code 只能包含字母、数字、下划线、连字符'; return }

  factionUploading.value = true
  factionError.value = ''

  try {
    const fd = new FormData()
    fd.append('code', code)
    fd.append('name', name)
    if (factionImageFile.value) fd.append('image', factionImageFile.value)

    const { data } = await hangarAPI.uploadFactionLogo(fd)
    if (!data || data.error) { factionError.value = data?.error || '上传失败'; factionUploading.value = false; return }

    // 即时刷新阵营列表
    await loadFactions()
    showAddFaction.value = false
    factionUploading.value = false
    console.log(`[factions] 阵营添加成功: ${code} (${name})`)
  } catch (e) {
    factionError.value = '上传失败: ' + e.message
    factionUploading.value = false
  }
}

async function loadUnits() { try { const {data}=await hangarAPI.getUnits(); units.value=data.units||[] } catch(e){ console.error(e) } }

function createNew() { form.value=createEmptyForm(); editingUnit.value={id:null}; errors.value=[]; highlightFields.value={} }

async function editUnit(unit) {
  try {
    const {data}=await hangarAPI.getUnit(unit.id)
    // Phase 30: 深拷贝避免引用污染，确保 skills/attributes 等嵌套对象独立
    const base = JSON.parse(JSON.stringify({...createEmptyForm(), ...data}))

    // Phase 30-Fix: attributes.parts → 扁平装备字段映射
    const parts = data?.attributes?.parts
    if (parts) {
      const partMap = {
        '主机体': { type: 'main_type', 格斗: 'main_格斗', 射击: 'main_射击', 结构: 'main_结构', 机动: 'main_机动' },
        '跟随': { type: 'royroy', 格斗: 'royroy_格斗', 射击: 'royroy_射击', 结构: 'royroy_结构', 机动: 'royroy_机动', hasPart: 'has_royroy' },
        '左手': { type: 'left_type', 格斗: 'left_格斗', 射击: 'left_射击', 结构: 'left_结构', 机动: 'left_机动' },
        '右手': { type: 'right_type', 格斗: 'right_格斗', 射击: 'right_射击', 结构: 'right_结构', 机动: 'right_机动' },
        '其它': { type: 'extra_type', 格斗: 'extra_格斗', 射击: 'extra_射击', 结构: 'extra_结构', 机动: 'extra_机动' },
      }
      for (const [cnName, mapping] of Object.entries(partMap)) {
        const p = parts[cnName]
        if (!p) continue
        if (mapping.type === 'royroy') base.has_royroy = true
        else if (mapping.type && p.type) base[mapping.type] = p.type
        base[mapping.格斗] = p.格斗 ?? 0
        base[mapping.射击] = p.射击 ?? 0
        base[mapping.结构] = p.结构 ?? 0
        base[mapping.机动] = p.机动 ?? 0
      }
    }

    // Phase 30-Fix: skills_by_owner → 技能槽映射
    const sbo = data?.attributes?.skills_by_owner
    if (sbo) {
      const ownerSkillMap = { '主机体': 'main_skills', '跟随': 'royroy_skills', '左手': 'left_skills', '右手': 'right_skills', '其它': 'extra_skills' }
      for (const [owner, slotKey] of Object.entries(ownerSkillMap)) {
        if (Array.isArray(sbo[owner])) base[slotKey] = sbo[owner]
      }
    }

    form.value = base
    // Phase 30-Fix: 从 DB 回填七视图 URL，刷新后可重新显示
    const vu = data.view_urls || {}
    form.value.view_urls = vu
    const restoredPreviews = { ...viewPreviews.value }
    for (const dv of directionViews) {
      const u = vu[String(dv.value)] || vu[dv.value]
      if (u) restoredPreviews[dv.value] = u
    }
    viewPreviews.value = restoredPreviews
    editingUnit.value = JSON.parse(JSON.stringify(unit))
    errors.value=[]
  } catch(e){ console.error(e) }
}

function cancelEdit() { editingUnit.value=null; errors.value=[]; highlightFields.value={} }

async function saveUnit() {
  errors.value=[]; highlightFields.value={}
  try {
    // Phase 30-Cover: 剥离废弃主图字段，封面改由七视图正视图派生
    const payload = { ...form.value }
    delete payload.main_image_url
    const isUpdate=!!editingUnit.value?.id
    if(isUpdate) await hangarAPI.updateUnit(editingUnit.value.id,payload)
    else await hangarAPI.createUnit(payload)
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

function importExcel() { showImportDialog.value=true; previewData.value=null; previewWarnings.value=[]; importFileName.value=''; if(fileInputRef.value) fileInputRef.value.value='' }

async function handleFileSelect(e) {
  const file=e.target.files[0]; if(!file) return
  importFileName.value = file.name
  importing.value=true
  const fd=new FormData(); fd.append('file',file)
  try {
    const { data } = await hangarAPI.parseExcel(fd)
    previewData.value=data.preview; previewNormalized.value=data.previewNormalized; importPayloadStr.value=data._importPayload||''; previewWarnings.value=data.warnings||[]; importing.value=false
  } catch(e){
    importing.value=false
    const d=e.response?.data
    let msg='解析失败: '+(d?.error||e.message)
    if(d?.errors?.length) msg+='\n\n缺失项:\n'+d.errors.map(x=>`• ${x.field}: ${x.message}`).join('\n')
    if(d?.warnings?.length) msg+='\n\n警告:\n'+d.warnings.map(x=>`• ${x.message}`).join('\n')
    alert(msg)
  }
}

function closePreview() { previewData.value=null; previewNormalized.value=null; importPayloadStr.value=''; previewWarnings.value=[]; showImportDialog.value=false }

async function confirmImport() {
  // Phase 30-RobustData: 优先用 _importPayload 字符串（可靠），其次 previewNormalized 对象
  let payload = null
  if(importPayloadStr.value) {
    try { payload = JSON.parse(importPayloadStr.value) } catch(_) { payload = null }
  }
  if(!payload && previewNormalized.value?.normalized) {
    payload = previewNormalized.value
  }
  if(!payload) return
  confirming.value=true
  try {
    const { data } = await hangarAPI.createFromJson(payload)
    showImportDialog.value=false
    const importedName=previewData.value?.name||'新棋子'
    previewData.value=null; previewNormalized.value=null; previewWarnings.value=[]; await loadUnits()
    // Phase 30-Fix: 导入后立即进入该单位编辑态，使后续保存走 UPDATE 而非重复 INSERT
    if (data?.unit?.id) {
      try { await editUnit({ id: data.unit.id }) } catch (_) {}
    }
    const toast=document.createElement('div')
    toast.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#ffb000;color:#0a1628;padding:12px 24px;z-index:9999;font-size:14px;font-weight:700;font-family:monospace;'
    toast.textContent=`已导入: ${importedName}`; document.body.appendChild(toast)
    setTimeout(()=>toast.remove(),3000); confirming.value=false
  } catch(e){
    confirming.value=false
    const d=e.response?.data
    let msg='导入失败: '+(d?.error||e.message)
    if(d?.errors?.length) msg+='\n\n错误:\n'+d.errors.map(x=>`• ${x.field}: ${x.message}`).join('\n')
    if(d?.warnings?.length) msg+='\n\n警告:\n'+d.warnings.map(x=>`• ${x.message}`).join('\n')
    alert(msg)
  }
}

onMounted(()=>{ loadUnits(); loadFactions() })
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
.btn-accent { background:transparent; border:1px solid rgba(19,255,67,0.35); color:#13ff43; } .btn-accent:hover { background:rgba(19,255,67,0.08); border-color:#13ff43; }
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
.file-input-hidden { position: absolute; opacity: 0; width: 1px; height: 1px; overflow: hidden; }
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
.faction-row .faction-select { max-width: 200px; flex: none; padding: 10px 14px; border: 1px solid rgba(159,142,120,0.25); background: #083344; color: #c1e8ff; font-family: 'Fira Code', monospace; font-size: 13px; }
.faction-row .faction-select:focus { outline: none; border-color: #ffb000; box-shadow: 0 0 0 2px rgba(255,176,0,0.08); }
.faction-logo-box { width: 48px; height: 48px; border: 1px solid rgba(51,65,85,0.6); background: #0a1628; border-radius: 4px; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
.faction-logo-img { max-width: 100%; max-height: 100%; object-fit: contain; }
.faction-logo-placeholder { font-size: 20px; font-weight: 700; color: rgba(255,176,0,0.5); font-family: 'Fira Code', monospace; text-transform: uppercase; }

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
.excel-upload-row { display:flex; align-items:center; gap:12px; margin:12px 0; position: relative; }
.excel-file-status { color:rgba(193,232,255,0.5); font-size:13px; }
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
.error-text { color: #ff7351; font-size: 12px; margin: 8px 0; font-family: 'Fira Code', monospace; }

/* Footer */
.footer { position:fixed; bottom:0; left:256px; right:0;
  transition: left 0.25s cubic-bezier(0.4, 0, 0.2, 1); background:rgba(2,9,17,0.92); border-top:1px solid rgba(255,176,0,0.1); padding:6px 24px; display:flex; justify-content:space-between; align-items:center; font-family:'Fira Code',monospace; font-size:10px; z-index:50; }
.footer-left span { color:#ffb000; font-weight:700; letter-spacing:2px; text-transform:uppercase; }
.footer-right { display:flex; gap:28px; letter-spacing:2px; text-transform:uppercase; }
.footer-right .good { color:rgba(122,236,255,0.8); }
.footer-right .muted { color:rgba(193,232,255,0.3); }

/* Phase 11: damage_kind_modifiers */
.dkm-section { margin-top: 6px; padding: 6px 8px; background: rgba(0,0,0,0.15); border: 1px solid rgba(159,142,120,0.1); }
.dkm-title { font-size: 8px; color: rgba(255,176,0,0.45); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 3px; display: block; }
.dkm-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px; }
.dkm-cell { display: flex; flex-direction: column; align-items: center; }
.dkm-cell label { font-size: 7px; color: rgba(193,232,255,0.35); }
.dkm-cell input { width: 44px; padding: 2px 3px; background: rgba(0,0,0,0.3); border: 1px solid rgba(159,142,120,0.12); color: #c1e8ff; font-family: inherit; font-size: 9px; text-align: center; }
.dkm-cell input:focus { border-color: rgba(255,176,0,0.25); outline: none; }

/* Phase 28-D: 七视图上传 */
.views-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-bottom: 14px; }
.view-slot { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.view-label { font-size: 10px; font-weight: 700; color: #ffd597; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; }
.view-drop-zone { width: 72px; height: 72px; border: 2px dashed rgba(159,142,120,0.3); background: #083344; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; overflow: hidden; }
.view-drop-zone:hover { border-color: #ffb000; background: rgba(255,176,0,0.05); }
.view-placeholder { font-size: 24px; font-weight: 700; color: rgba(193,232,255,0.25); font-family: 'Fira Code', monospace; }
.view-preview-img { max-width: 100%; max-height: 100%; object-fit: contain; }
.views-actions { display: flex; gap: 10px; margin-top: 8px; }
.section-desc { font-size: 11px; color: rgba(193,232,255,0.4); margin-bottom: 10px; font-family: 'Fira Code', monospace; }
.faction-code { color: #13ff43; font-family: 'Fira Code', monospace; }
</style>
