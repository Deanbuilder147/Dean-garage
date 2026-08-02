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
              <button class="btn btn-delete btn-mini" @click.stop="deleteUnit(unit.id)" title="删除">×</button>
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
            <input id="unit-name-field" name="name" v-model="form.name" type="text" class="param-input" placeholder="例如: RX-78-2"
                   :class="{ 'error-input': highlightFields.name }" @input="clearHighlight('name')">
          </div>
          <div class="form-row">
            <label for="unit-codename-field">行动代号</label>
            <input id="unit-codename-field" name="codename" v-model="form.codename" type="text" class="param-input" placeholder="例如: 高达"
                   :class="{ 'error-input': highlightFields.codename }" @input="clearHighlight('codename')">
          </div>
          <div class="form-row">
            <label for="unit-faction-field">所属阵营</label>
            <div class="faction-row">
              <select id="unit-faction-field" name="faction" v-model="form.faction" class="faction-select w-48 param-select">
                <option value="">选择阵营...</option>
                <option v-for="f in factions" :key="f.code" :value="f.code">{{ f.name }}</option>
              </select>
              <button class="btn btn-accent btn-small" @click="openAddFaction">+ 添加阵营</button>
              <div class="faction-logo-box">
                <img v-if="factionLogoSrc" :src="factionLogoSrc" alt="阵营Logo" class="faction-logo-img" @error="onFactionLogoError">
                <span v-else class="faction-logo-placeholder">{{ getFactionName(form.faction)?.[0] || '?' }}</span>
              </div>
            </div>
          </div>

          <!-- 体型（体积） -->
          <div class="form-row">
            <label for="unit-size-field">体型（体积）</label>
            <div class="size-row">
              <select id="unit-size-field" name="size" v-model="form.size" class="faction-select w-48 param-select">
                <option value="s">S（小型）</option>
                <option value="m">M（中型）</option>
                <option value="l">L（大型）</option>
                <option value="xl">XL（超大型）</option>
              </select>
              <span class="size-chip" :class="'size-' + normSize(form.size)">{{ SIZE_LABELS[normSize(form.size)] }}</span>
            </div>
            <div class="size-rules">
              <div>HP：<strong>{{ sizeRuleHp }}</strong> ／ 机动：<strong>{{ sizeRuleMob }}</strong> ／ 战场棋子缩放：<strong>×{{ SIZE_RENDER_SCALE[normSize(form.size)] }}</strong></div>
              <div class="size-rule-hint">体型克制：被更小机体攻击 → 每档 −1 防御减伤；被更大机体攻击 → 下回合机动每档 +1（临时 Buff）</div>
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
          <div class="views-dir-hint">
            <span class="dir-hint-strong">方向说明：</span>方向 <b>0 = 正面</b>（棋子正对观众），<b>1~6 顺时针每 60°</b>旋转；下图箭头表示「该方向棋子<em>面朝</em>的方位」，上传时请让棋子朝向与箭头一致。
          </div>
          <div class="views-actions">
            <button type="button" class="btn-small btn-danger" :disabled="!hasAnyView" @click="clearAllViews">一键清除全部视图</button>
            <span v-if="hasAnyView" class="file-hint">将同时清除本地待上传图与已保存到服务端的视图（不可撤销）</span>
          </div>
          <div class="views-grid">
            <div v-for="dv in directionViews" :key="dv.value" class="view-slot">
              <div class="view-label">
                {{ dv.label }}
                <!-- 方向箭头标注：仅正面(0)以外显示，指向该方向棋子面朝的方位 -->
                <span v-if="dv.value !== 0" class="dir-arrow" :style="{ transform: `rotate(${dv.arrowRotate}deg)` }" title="该方向棋子面朝方位">↑</span>
              </div>
              <div class="view-drop-zone"
                   @click="triggerViewUpload(dv.value)"
                   @dragover.prevent
                   @drop.prevent="handleViewDrop($event, dv.value)">
                <img v-if="viewPreviews[dv.value]" :src="viewPreviews[dv.value]" class="view-preview-img">
                <span v-else class="view-placeholder">{{ dv.value }}</span>
              </div>
              <input type="file" :ref="el => viewInputs[dv.value] = el" @change="e => handleViewUpload(e, dv.value)" accept="image/png" class="file-input-hidden">
              <div class="view-slot-actions">
                <button class="btn-small btn-crop" @click.stop="openCrop(dv.value)" v-if="viewPreviews[dv.value]">裁剪</button>
                <button class="btn-small btn-delete" @click.stop="clearView(dv.value)" v-if="viewPreviews[dv.value]">清除</button>
              </div>
            </div>
          </div>
          <div class="views-actions">
            <button class="btn btn-accent" @click="uploadAllViews" :disabled="viewUploading">
              {{ viewUploading ? '上传中...' : '上传已选视图' }}
            </button>
            <button class="btn btn-secondary" @click="generateAIViews" :disabled="viewUploading">
              AI 动态生成七视图
            </button>
          </div>
          <p v-if="viewUploading" class="import-status">正在上传七视图...</p>
          <p v-if="viewError" class="error-text">{{ viewError }}</p>
        </section>

        <!-- Phase 31: 手动裁剪模态框 -->
        <div v-if="cropModalOpen" class="modal-overlay" @click.self="cropModalOpen = false">
          <div class="crop-modal">
            <div class="crop-modal-header">
              <span>裁剪方向 {{ cropTargetDv }} 的七视图</span>
              <button class="btn-small btn-delete" @click="cropModalOpen = false">关闭</button>
            </div>
            <p class="crop-tip">拖拽选框边缘/四角调整裁剪范围（拖动内部可平移选框）。目标：让棋子内容占满选框、去除四周透明留白，使 7 个方向的棋子大小一致。</p>
            <div class="crop-canvas-wrap">
              <canvas ref="cropCanvasRef"
                      @mousedown="cropPointerDown"
                      @mousemove="cropPointerMove"
                      @mouseup="cropPointerUp"
                      @mouseleave="cropPointerUp"></canvas>
            </div>
            <div class="crop-modal-actions">
              <button class="btn btn-secondary" @click="autoCropAlpha">自动去留白</button>
              <button class="btn btn-accent" @click="applyCrop">应用裁剪</button>
            </div>
          </div>
        </div>

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
            <select id="unit-left-type" name="left_type" v-model="form.left_type" class="param-select"><option value="none">无</option><option value="武器">武器</option><option value="防具">防具</option><option value="载具">载具</option><option value="背包">背包</option></select>
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
            <select id="unit-right-type" name="right_type" v-model="form.right_type" class="param-select"><option value="none">无</option><option value="武器">武器</option><option value="防具">防具</option><option value="载具">载具</option><option value="背包">背包</option></select>
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
            <select id="unit-extra-type" name="extra_type" v-model="form.extra_type" class="param-select"><option value="none">无</option><option value="武器">武器</option><option value="防具">防具</option><option value="载具">载具</option><option value="背包">背包</option></select>
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
          <input id="faction-code-field" name="faction_code" v-model="newFaction.code" type="text" class="param-input" placeholder="如: neon" :disabled="factionUploading">
        </div>
        <div class="form-row">
          <label for="faction-name-field">阵营名称 *</label>
          <input id="faction-name-field" name="faction_name" v-model="newFaction.name" type="text" class="param-input" placeholder="如: 霓虹战线" :disabled="factionUploading">
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
import { ref, computed, onMounted, reactive, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { hangarAPI } from '@/api/client'
import SkillsEditor from '@/components/SkillsEditor.vue'
import { normSize, SIZE_LABELS, SIZE_HP_FACTOR, SIZE_MOB_FACTOR, SIZE_RENDER_SCALE } from '@/utils/unitSize.js'

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
// 方向语义（真相源 frontend/src/utils/hexUtils.js DIRECTIONS）：
//   0 = 正面；1=正右 2=右下 3=左下 4=正左 5=左上 6=右上
// 朝向角按 combat computeDirection 的 6 扇区中心（屏幕坐标 Y 向下，0°=正右，顺时针）：
//   1=0° 2=60° 3=120° 4=180° 5=240° 6=300°
// arrowRotate = 朝向角 + 90：因箭头字符 ↑ 默认指向屏幕正上方(=270°)，
//   旋转 90° 才指向正右(0°)，以此类推。仅正面(dir 0)不标箭头。
const directionViews = [
  { value: 0, label: '0 正面', arrowRotate: null },
  { value: 1, label: '1 正右', arrowRotate: 90 },
  { value: 2, label: '2 右下', arrowRotate: 150 },
  { value: 3, label: '3 左下', arrowRotate: 210 },
  { value: 4, label: '4 正左', arrowRotate: 270 },
  { value: 5, label: '5 左上', arrowRotate: 330 },
  { value: 6, label: '6 右上', arrowRotate: 30 },
]
const viewFiles = ref({})       // { 0: File, 1: File, ... }
const viewPreviews = ref({})    // { 0: dataURL, ... }
const viewInputs = ref({})      // { 0: inputElement, ... }
const viewUploading = ref(false)
const viewError = ref('')

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

// 安全解析 JSON 字符串（用于 view_urls 可能为字符串的场景）
function safeParse(str) { try { return JSON.parse(str) } catch { return null } }

// 是否存在任何视图（本地待上传 或 已保存服务端），用于启用"一键清除"
const hasAnyView = computed(() => {
  if (Object.keys(viewFiles.value || {}).length > 0) return true
  if (Object.keys(viewPreviews.value || {}).length > 0) return true
  const vu = form.value.view_urls
  if (!vu) return false
  const obj = typeof vu === 'string' ? (safeParse(vu) || {}) : vu
  return Object.keys(obj || {}).length > 0
})

// 一键清除全部视图：同时清除本地待上传图与已保存到服务端的 view_urls，并持久化
async function clearAllViews() {
  viewFiles.value = {}
  viewPreviews.value = {}   // 网格立即清空，前端立刻可见变化
  for (const dv of Object.keys(viewInputs.value)) {
    if (viewInputs.value[dv]) viewInputs.value[dv].value = ''
  }
  form.value.view_urls = {}
  try {
    await saveUnit(true)
    await loadUnits()
    const toast = document.createElement('div')
    toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#1faa59;color:#fff;padding:12px 24px;border-radius:8px;z-index:9999;font-size:14px;font-weight:700;font-family:monospace;box-shadow:0 4px 16px rgba(0,0,0,.3);'
    toast.textContent = '已清除全部七视图'
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 2600)
  } catch (e) {
    const msg = e?.response?.data?.message || e?.message || '未知错误'
    alert('清除后保存失败（前端已临时清空，但服务端可能未生效）: ' + msg)
  }
}

// ===== 手动裁剪模态框（Phase 31） =====
const cropModalOpen = ref(false)
const cropTargetDv = ref(null)          // 正在裁剪的方向编号
const cropSrcImg = ref(null)            // 原图 Image 对象
const cropCanvasRef = ref(null)         // 原图显示 canvas
const cropRect = reactive({ x: 0, y: 0, w: 0, h: 0 }) // 选框（原图像素坐标）
const cropDrag = reactive({ mode: '', startX: 0, startY: 0, orig: null })

// 计算 PNG 不透明内容包围盒（用于「自动去留白」）
function computeContentBBox(img) {
  const w = img.naturalWidth, h = img.naturalHeight
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const cx = c.getContext('2d'); cx.drawImage(img, 0, 0)
  const data = cx.getImageData(0, 0, w, h).data
  let top = -1, bot = -1, left = -1, right = -1
  for (let y = 0; y < h; y++) {
    const rowOff = y * w * 4
    for (let x = 0; x < w; x++) {
      if (data[rowOff + x * 4 + 3] > 16) {
        if (top < 0) top = y
        bot = y
        if (left < 0 || x < left) left = x
        if (x > right) right = x
      }
    }
  }
  if (top < 0) return null
  return { top, bot, left, right, w: right - left + 1, h: bot - top + 1 }
}

function openCrop(dv) {
  const file = viewFiles.value[dv]
  if (!file) { viewError.value = `方向 ${dv}: 请先选择图片再裁剪`; return }
  const img = new Image()
  img.onload = () => {
    cropTargetDv.value = dv
    cropSrcImg.value = img
    cropRect.x = 0; cropRect.y = 0; cropRect.w = img.naturalWidth; cropRect.h = img.naturalHeight
    cropModalOpen.value = true
    nextTick(() => drawCropCanvas())
  }
  img.onerror = () => { viewError.value = `方向 ${dv}: 图片加载失败`; return }
  img.src = URL.createObjectURL(file)
}

// 把原图绘制到裁剪 canvas（含半透明选框遮罩）
function drawCropCanvas() {
  const canvas = cropCanvasRef.value
  if (!canvas || !cropSrcImg.value) return
  const img = cropSrcImg.value
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0)
  // 选框外暗化遮罩
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, 0, canvas.width, cropRect.y)
  ctx.fillRect(0, cropRect.y + cropRect.h, canvas.width, canvas.height - (cropRect.y + cropRect.h))
  ctx.fillRect(0, cropRect.y, cropRect.x, cropRect.h)
  ctx.fillRect(cropRect.x + cropRect.w, cropRect.y, canvas.width - (cropRect.x + cropRect.w), cropRect.h)
  // 选框边框 + 角点
  ctx.strokeStyle = '#ffc24d'; ctx.lineWidth = 2
  ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h)
  const corners = [[cropRect.x, cropRect.y], [cropRect.x + cropRect.w, cropRect.y], [cropRect.x, cropRect.y + cropRect.h], [cropRect.x + cropRect.w, cropRect.y + cropRect.h]]
  ctx.fillStyle = '#ffc24d'
  corners.forEach(([cx, cy]) => ctx.fillRect(cx - 4, cy - 4, 8, 8))
}

function autoCropAlpha() {
  if (!cropSrcImg.value) return
  const b = computeContentBBox(cropSrcImg.value)
  if (!b) return
  // 留 2px 余量，避免裁掉半透明描边
  const pad = 2
  cropRect.x = Math.max(0, b.left - pad)
  cropRect.y = Math.max(0, b.top - pad)
  cropRect.w = Math.min(cropSrcImg.value.naturalWidth - cropRect.x, b.w + pad * 2)
  cropRect.h = Math.min(cropSrcImg.value.naturalHeight - cropRect.y, b.h + pad * 2)
  drawCropCanvas()
}

function cropPointerDown(e) {
  const canvas = cropCanvasRef.value
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height
  const px = (e.clientX - rect.left) * scaleX
  const py = (e.clientY - rect.top) * scaleY
  // 命中哪个手柄：四边中点 + 四角 + 内部
  const m = 10 * scaleX
  let mode = ''
  const onL = Math.abs(px - cropRect.x) <= m, onR = Math.abs(px - (cropRect.x + cropRect.w)) <= m
  const onT = Math.abs(py - cropRect.y) <= m, onB = Math.abs(py - (cropRect.y + cropRect.h)) <= m
  if (onL && onT) mode = 'lt'; else if (onR && onT) mode = 'rt'
  else if (onL && onB) mode = 'lb'; else if (onR && onB) mode = 'rb'
  else if (onL) mode = 'l'; else if (onR) mode = 'r'; else if (onT) mode = 't'; else if (onB) mode = 'b'
  else if (px > cropRect.x && px < cropRect.x + cropRect.w && py > cropRect.y && py < cropRect.y + cropRect.h) mode = 'move'
  if (!mode) return
  cropDrag.mode = mode
  cropDrag.startX = px; cropDrag.startY = py
  cropDrag.orig = { ...cropRect }
  e.preventDefault()
}

function cropPointerMove(e) {
  if (!cropDrag.mode) return
  const canvas = cropCanvasRef.value
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height
  const px = (e.clientX - rect.left) * scaleX
  const py = (e.clientY - rect.top) * scaleY
  const dx = px - cropDrag.startX, dy = py - cropDrag.startY
  const o = cropDrag.orig
  const maxW = cropSrcImg.value.naturalWidth, maxH = cropSrcImg.value.naturalHeight
  let { x, y, w, h } = o
  if (cropDrag.mode === 'move') {
    x = Math.max(0, Math.min(maxW - w, o.x + dx))
    y = Math.max(0, Math.min(maxH - h, o.y + dy))
  } else {
    if (cropDrag.mode.includes('l')) { x = Math.max(0, Math.min(o.x + o.w - 1, o.x + dx)); w = o.x + o.w - x }
    if (cropDrag.mode.includes('r')) { w = Math.max(1, Math.min(maxW - o.x, o.w + dx)) }
    if (cropDrag.mode.includes('t')) { y = Math.max(0, Math.min(o.y + o.h - 1, o.y + dy)); h = o.y + o.h - y }
    if (cropDrag.mode.includes('b')) { h = Math.max(1, Math.min(maxH - o.y, o.h + dy)) }
  }
  cropRect.x = Math.round(x); cropRect.y = Math.round(y); cropRect.w = Math.round(w); cropRect.h = Math.round(h)
  drawCropCanvas()
}

function cropPointerUp() { cropDrag.mode = '' }

async function applyCrop() {
  if (!cropSrcImg.value) return
  const canvas = document.createElement('canvas')
  canvas.width = cropRect.w; canvas.height = cropRect.h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(cropSrcImg.value, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, cropRect.w, cropRect.h)
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
  if (!blob) return
  const dv = cropTargetDv.value
  const newFile = new File([blob], `view_${dv}.png`, { type: 'image/png' })
  viewFiles.value = { ...viewFiles.value, [dv]: newFile }
  const reader = new FileReader()
  reader.onload = (ev) => { viewPreviews.value = { ...viewPreviews.value, [dv]: ev.target.result } }
  reader.readAsDataURL(newFile)
  cropModalOpen.value = false
  cropSrcImg.value = null
}

async function uploadAllViews() {
  // 支持「只重传选中方向」：只要至少选了 1 张即可上传，其余方向保持不变（满足「只修改正视图」场景）
  const hasSelection = directionViews.some(dv => viewFiles.value[dv.value])
  if (!hasSelection) { viewError.value = '请至少选择一个方向的图片'; return }
  // 优先用单位 UUID（唯一命名空间）；未落库则先保存，确保上传走 UPDATE 而非重复 INSERT
  let unitId = form.value.id || editingUnit.value?.id
  if (!unitId) { await saveUnit(); unitId = form.value.id || editingUnit.value?.id }
  if (!unitId) { viewError.value = '请先保存单位后再上传七视图'; return }

  // 后端 upload-view 以单位 UUID 为命名空间（生产 gateway 用 unitId），此处同时下发 unitCode 作为兜底。
  // 真正的「改不动」根因是：原代码强制 7 张全选(allViewsFilled) 才允许上传，
  // 用户只想重传单张（如正视图）时直接被门控拦截，本次已放宽为「至少选 1 张」。
  const unitCode = (form.value.codename || form.value.name || 'UNIT').replace(/[^a-zA-Z0-9_-]/g, '')

  viewUploading.value = true; viewError.value = ''

  try {
    for (const dv of directionViews) {
      // 仅上传用户已选中的方向，未选中的跳过（保留既有视图不变）
      if (!viewFiles.value[dv.value]) continue
      const fd = new FormData()
      fd.append('image', viewFiles.value[dv.value])
      fd.append('unitCode', unitCode)
      fd.append('unitId', unitId)
      fd.append('direction', String(dv.value))
      const { data } = await hangarAPI.uploadUnitView(fd)
      const url = data?.url || data?.path
      if (url) {
        form.value.view_urls = { ...(form.value.view_urls || {}), [dv.value]: url }
        viewPreviews.value = { ...viewPreviews.value, [dv.value]: url }
      }
    }
    viewError.value = ''
      // 系统提示：用应用内 toast 替代原生 alert，确保上传成功有可见反馈
      const toast = document.createElement('div')
      toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#1faa59;color:#fff;padding:12px 24px;border-radius:8px;z-index:9999;font-size:14px;font-weight:700;font-family:monospace;box-shadow:0 4px 16px rgba(0,0,0,.3);'
      toast.textContent = '七视图上传成功！'
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 3000)
    // 清空临时文件句柄，但保留预览，避免误以为丢失
    viewFiles.value = {}
    // 关键：把七视图 URL 持久化到数据库，否则仅存于内存，刷新/重开后丢失
    await saveUnit(true)
  } catch (e) {
    // 透出后端精确消息（如 413 文件过大 / 500 内部错误），避免只显示 axios 笼统状态码
    const msg = e?.response?.data?.message || e?.message || '未知错误'
    viewError.value = '上传失败: ' + msg
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
    name:'', codename:'', faction:'earth', main_type:'机体', size:'m',
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
// 体型规则展示：HP/机动按系数显示百分比（实际加减分别向上/向下取整）
const sizeRuleHp = computed(() => {
  const f = SIZE_HP_FACTOR[normSize(form.value.size)] ?? 1
  return f === 1 ? '不变' : (f > 1 ? `+${Math.round((f - 1) * 100)}%（向上取整）` : `−${Math.round((1 - f) * 100)}%（向下取整）`)
})
const sizeRuleMob = computed(() => {
  const f = SIZE_MOB_FACTOR[normSize(form.value.size)] ?? 1
  return f === 1 ? '不变' : (f > 1 ? `+${Math.round((f - 1) * 100)}%（向上取整）` : `−${Math.round((1 - f) * 100)}%（向下取整）`)
})
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
// 阵营 Logo：优先 logoUrl（后端返回字段），加载失败（如内置 logo 文件缺失）回退到占位字母
const brokenFactionLogos = ref({})
const factionLogoSrc = computed(() => {
  if (!form.faction || brokenFactionLogos.value[form.faction]) return null
  const f = factions.value.find(x => x.code === form.faction)
  return f ? (f.logoUrl || f.logo) : null
})
function onFactionLogoError() {
  brokenFactionLogos.value = { ...brokenFactionLogos.value, [form.faction]: true }
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

    const { data } = await hangarAPI.createFaction(fd)
    if (!data || data.error || !data.success) { factionError.value = data?.error || data?.message || '创建失败'; factionUploading.value = false; return }

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

/**
 * 将手动编辑器的平铺中文字段收敛为与 Excel 归一器（excel-schema-normalizer）同构的
 * stats / skills / attributes，确保手动单位与 Excel 单位在战局里被同一套代码消费。
 * 公式严格对齐宪法红线与 Phase 29 普通攻击射程修复：
 *   攻击 = 总格斗*2+5；射程 = 1+floor(总射击/25)；HP = 结构*5+20；
 *   护甲 = floor(结构*0.25)；移动力 = 机体机动 + 载具/背包机动。
 */
function num(v){ const n=Number(v); return Number.isFinite(n)?n:0 }
function normalizePartType(t){
  if(!t) return '未知'
  const s=String(t).trim()
  const ALIAS={ '机体':'机体','主机体':'机体','本体':'机体','机甲':'机体','mech':'机体',
    '武器':'武器','枪':'武器','炮':'武器','剑':'武器','刃':'武器','weapon':'武器',
    '防具':'防具','盾':'防具','装甲':'防具','护甲':'防具','armor':'防具',
    '载具':'载具','车':'载具','推进器':'载具','飞行器':'载具','vehicle':'载具',
    '背包':'背包','包':'背包','backpack':'背包',
    '跟随':'跟随','royroy':'跟随','随从':'跟随','辅机':'跟随','follower':'跟随' }
  return ALIAS[s]||ALIAS[s.toLowerCase()]||s
}
function parseRange(raw){
  if(raw===undefined||raw===null||raw==='') return {min:1,max:1,label:'1'}
  if(typeof raw==='number') return {min:1,max:raw,label:String(raw)}
  const nums=String(raw).split(/[-~]/).map(Number).filter(n=>!Number.isNaN(n))
  if(!nums.length) return {min:1,max:1,label:'1'}
  const min=Math.min(...nums)||1, max=Math.max(...nums)
  return {min,max,label:min===max?String(max):`${min}~${max}`}
}
function inferDamageType(attribute){
  const a=String(attribute||'').toLowerCase()
  if(a.includes('能量')||a.includes('beam')) return 'ENERGY'
  if(a.includes('实弹')||a.includes('物理')) return 'PHYSICAL'
  if(a.includes('回复')||a.includes('修复')) return 'HEAL'
  return 'PHYSICAL'
}
function makeUnitSkill(s,min,max,label){
  return {
    id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : 'sk_'+Math.random().toString(36).slice(2),
    name: s.name, description: s.effect||s.special||'', effect: s.effect||'',
    type: s.type||'自动', script:'', cooldown:0, currentCooldown:0, energyCost:0,
    damageType: inferDamageType(s.attribute),
    range: max, range_min: min, range_max: max, max_range: max, min_range: min,
    cast_range: max, min_cast_range: min, rangeLabel: label,
  }
}
function buildUnitPayload(f){
  const partsInput=[]
  partsInput.push({ slot:'主机体', type:f.main_type||'机体', normalizedType:'机体', include:true,
    格斗:num(f.main_格斗), 射击:num(f.main_射击), 结构:num(f.main_结构), 机动:num(f.main_机动), skills:f.main_skills||[] })
  if(f.has_royroy){
    partsInput.push({ slot:'跟随', type:'Royroy', normalizedType:'跟随', include:true,
      格斗:num(f.royroy_格斗), 射击:num(f.royroy_射击), 结构:num(f.royroy_结构), 机动:num(f.royroy_机动), skills:f.royroy_skills||[] })
  }
  if(f.left_type && f.left_type!=='none'){
    partsInput.push({ slot:'左手', type:f.left_type, normalizedType:normalizePartType(f.left_type), include:true,
      格斗:num(f.left_格斗), 射击:num(f.left_射击), 结构:num(f.left_结构), 机动:num(f.left_机动), skills:f.left_skills||[] })
  }
  if(f.right_type && f.right_type!=='none'){
    partsInput.push({ slot:'右手', type:f.right_type, normalizedType:normalizePartType(f.right_type), include:true,
      格斗:num(f.right_格斗), 射击:num(f.right_射击), 结构:num(f.right_结构), 机动:num(f.right_机动), skills:f.right_skills||[] })
  }
  if(f.extra_type && f.extra_type!=='none'){
    partsInput.push({ slot:'其它', type:f.extra_type, normalizedType:normalizePartType(f.extra_type), include:true,
      格斗:num(f.extra_格斗), 射击:num(f.extra_射击), 结构:num(f.extra_结构), 机动:num(f.extra_机动), skills:f.extra_skills||[] })
  }

  const mainPart=partsInput.find(p=>p.normalizedType==='机体')||partsInput[0]
  const bodyStructure=mainPart?mainPart.结构:0
  const bodyMobility=mainPart?mainPart.机动:0
  const meleeParts=partsInput.filter(p=>['机体','武器'].includes(p.normalizedType))
  const carrierParts=partsInput.filter(p=>['载具','背包'].includes(p.normalizedType))
  const totalMelee=meleeParts.reduce((s,p)=>s+p.格斗,0)
  const totalShooting=meleeParts.reduce((s,p)=>s+p.射击,0)
  const carrierMobility=carrierParts.reduce((s,p)=>s+p.机动,0)

  const hp=bodyStructure*5+20
  const moveRange=bodyMobility+carrierMobility
  const stats={
    hp, maxHp:hp,
    armor: Math.floor(bodyStructure*0.25),
    shield: 0,
    attack: totalMelee*2+5,
    defense: 0,
    speed: moveRange,
    mobility: bodyMobility,
    range: 1+Math.floor(totalShooting/25),
  }

  const flatSkills=[]
  const skillsByOwner={}
  for(const part of partsInput){
    const ownerSkills=(part.skills||[]).filter(s=>s&&s.name)
    skillsByOwner[part.slot]=ownerSkills.map(s=>{
      const {min,max,label}=parseRange(s.range)
      flatSkills.push(makeUnitSkill(s,min,max,label))
      return { name:s.name, type:s.type||'', attribute:s.attribute||'', effect:s.effect||'', range:s.range||'', special:s.special||'' }
    })
  }

  const parts={}
  for(const part of partsInput){
    const t=part.normalizedType
    const isShield=(t==='防具'||t==='背包')
    const pStruct=part.结构
    const partHp=isShield?pStruct*2:0
    const durability=(t==='武器'||t==='载具')?pStruct:(isShield?5:0)
    parts[part.slot]={
      type:part.type, normalizedType:t, slot:part.slot,
      格斗:part.格斗, 射击:part.射击, 结构:part.结构, 机动:part.机动,
      hp:partHp, maxHp:partHp, durability, maxDurability:durability,
      destroyed:false, isShield, skillSlots:(part.skills||[]).length,
    }
  }

  const t0=String(f.main_type||'').toLowerCase()
  let category='melee'
  if(t0.includes('装甲')||t0.includes('盾牌')) category='tank'
  else if(t0.includes('推进器')||t0.includes('辅助')) category='support'
  else if(totalShooting>totalMelee*1.3) category='ranged'

  return {
    ...f,
    stats, skills:flatSkills,
    attributes:{ action_points:{MOVE:1,ATTACK:1}, parts, skills_by_owner:skillsByOwner, import_source:'manual', import_version:'2.0' },
    category, tier:1, sprite_key:null,
    size: normSize(f.size || 'm'),
  }
}

async function saveUnit(silent=false) {
  errors.value=[]; highlightFields.value={}
  try {
    // Phase 30-Cover: 剥离废弃主图字段，封面改由七视图正视图派生
    const payload = buildUnitPayload(form.value)
    delete payload.main_image_url
    const isUpdate=!!editingUnit.value?.id
    if(isUpdate) await hangarAPI.updateUnit(editingUnit.value.id,payload)
    else {
      const { data } = await hangarAPI.createUnit(payload)
      // 关键：把新建返回的 UUID 写回，使后续七视图上传能拿到 unitId（唯一命名空间）
      if (data?.unit?.id) {
        editingUnit.value = { ...(editingUnit.value || {}), id: data.unit.id }
        form.value.id = data.unit.id
      }
    }
    await loadUnits()
    if(!silent) alert('保存成功')
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
.btn-accent { background:transparent; border:1px solid rgba(255,176,0,0.35); color:#ffb000; } .btn-accent:hover { background:rgba(255,176,0,0.08); border-color:#ffb000; }
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
.file-name { color: #ffd597; font-size: 11px; font-family: 'Fira Code', monospace; }
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
.footer { position:fixed; bottom:0; left:var(--sidebar-w, 240px); right:0;
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
/* 方向箭头标注：指向该方向棋子面朝的方位 */
.dir-arrow {
  display: inline-block; margin-left: 3px; color: #4fd1ff; font-weight: 900;
  font-size: 12px; line-height: 1; transform-origin: center; transition: transform 0.15s;
}
.views-dir-hint {
  font-size: 11px; color: rgba(193,232,255,0.6); margin-bottom: 10px; line-height: 1.6;
  background: rgba(79,209,255,0.06); border-left: 2px solid rgba(79,209,255,0.4);
  padding: 6px 10px; border-radius: 4px;
}
.views-dir-hint .dir-hint-strong { color: #4fd1ff; font-weight: 700; }
.views-dir-hint b { color: #ffd597; }
.views-dir-hint em { color: #ffb000; font-style: normal; }
.view-slot-actions { display: flex; gap: 4px; margin-top: 2px; }
.btn-small.btn-crop { background: rgba(79,209,255,0.15); color: #4fd1ff; border: 1px solid rgba(79,209,255,0.4); }
.btn-small.btn-crop:hover { background: rgba(79,209,255,0.3); }
.btn-small.btn-danger { background: rgba(255,99,99,0.15); color: #ff6363; border: 1px solid rgba(255,99,99,0.45); }
.btn-small.btn-danger:hover:not(:disabled) { background: rgba(255,99,99,0.32); }
.btn-small.btn-danger:disabled { opacity: 0.4; cursor: not-allowed; }
.views-actions { display: flex; align-items: center; gap: 10px; margin-top: 8px; margin-bottom: 4px; flex-wrap: wrap; }
.section-desc { font-size: 11px; color: rgba(193,232,255,0.4); margin-bottom: 10px; font-family: 'Fira Code', monospace; }
.faction-code { color: #ffd597; font-family: 'Fira Code', monospace; }

/* 体型（体积）选择器 */
.size-row { display: flex; align-items: center; gap: 10px; }
.size-chip {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 26px; height: 22px; padding: 0 6px; border-radius: 4px;
  font-weight: 700; font-family: 'Fira Code', monospace; font-size: 12px; color: #001018;
}
.size-chip.size-s { background: #4fd1ff; }
.size-chip.size-m { background: #9aa7b0; }
.size-chip.size-l { background: #ff9d3c; }
.size-chip.size-xl { background: #ff5a5a; }
.size-rules {
  margin-top: 8px; font-size: 12px; line-height: 1.6; color: rgba(193,232,255,0.75);
  background: rgba(255,176,0,0.06); border-left: 2px solid rgba(255,176,0,0.4);
  padding: 6px 10px; border-radius: 4px;
}
.size-rules strong { color: #ffb000; font-family: 'Fira Code', monospace; }
.size-rule-hint { margin-top: 4px; color: rgba(193,232,255,0.5); font-size: 11px; }

/* Phase 31: 手动裁剪模态框 */
.crop-modal {
  background: #0a2230; border: 1px solid rgba(255,176,0,0.3); border-radius: 10px;
  width: min(560px, 92vw); max-height: 90vh; overflow: auto; padding: 16px 18px;
  box-shadow: 0 12px 48px rgba(0,0,0,0.6);
}
.crop-modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; color: #ffd597; font-weight: 700; }
.crop-tip { font-size: 11px; color: rgba(193,232,255,0.6); line-height: 1.6; margin-bottom: 10px; }
.crop-canvas-wrap {
  display: flex; align-items: center; justify-content: center;
  background: #06202c; border: 1px dashed rgba(159,142,120,0.3); border-radius: 6px;
  padding: 10px; max-height: 60vh; overflow: auto;
}
.crop-canvas-wrap canvas { max-width: 100%; max-height: 56vh; image-rendering: pixelated; cursor: crosshair; background:
  repeating-conic-gradient(#0c2c3a 0% 25%, #0a2532 0% 50%) 50% / 16px 16px; }
.crop-modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px; }
</style>
