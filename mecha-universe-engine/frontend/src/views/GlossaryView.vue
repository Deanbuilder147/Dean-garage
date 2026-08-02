<template>
  <div class="page-container w-full h-full flex flex-col min-h-0 overflow-y-auto">
    <header class="page-header">
      <h1>[ 词条库中枢 · 万能语法战斗中枢 v5.0 ]</h1>
      <div class="header-meta">
        <span class="meta-item"><span class="dot-live"></span> {{ syncStatus }}</span>
        <span class="sep">::</span>
        <span>词条数: {{ skillCount }}</span>
        <span class="sep">::</span>
        <span class="meta-version">v{{ configVersion }}</span>
      </div>
    </header>

    <!-- 操作栏 -->
    <div class="action-bar">
      <!-- 第一排：搜索框 + 上传Excel + 重新加载 + 新建 / 向导 -->
      <div class="action-row action-row-top">
        <!-- 词条搜索框：输入即筛选，点击结果跳转并展开对应词条；对比模式下加入对比槽位 -->
        <div class="search-box">
          <input
            class="glossary-search"
            type="text"
            v-model="searchText"
            @focus="showResults = true"
            @blur="onSearchBlur"
            @keydown.enter="onSearchEnter"
            :placeholder="compareMode ? '搜索词条以加入对比…' : '搜索词条 KEY / 名称 / 分类…'"
          />
          <ul v-if="showResults && searchText.trim() && filteredSkills.length" class="search-results">
            <li
              v-for="item in filteredSkills"
              :key="item.key"
              @mousedown.prevent="onPickSearch(item.key)"
              :class="{ 'cmp-a': compareMode && compareA === item.key, 'cmp-b': compareMode && compareB === item.key }"
            >
              <span class="sr-key">{{ item.key }}</span>
              <span class="sr-name">{{ item.skill.name || item.key }}</span>
              <span class="sr-cat">{{ CATEGORY_LABELS[item.skill.category] || item.skill.category }}</span>
            </li>
          </ul>
          <ul v-else-if="showResults && searchText.trim()" class="search-results">
            <li class="search-no">无匹配词条</li>
          </ul>
        </div>

        <button
          class="btn btn-reload"
          :disabled="excelLoading"
          @click="triggerExcelUpload"
        >
          {{ excelLoading ? '解析中...' : '上传Excel' }}
        </button>
        <button
          class="btn btn-reload"
          @click="loadConfig"
        >
          [ 重新加载 ]
        </button>
        <button class="btn btn-reload" @click="addNewSkill">
          [ + 添加新词条 ]
        </button>
        <button
          class="btn btn-reload"
          :class="{ active: showWizard }"
          @click="toggleWizard"
        >
          [ 分步向导 ]
        </button>
      </div>

      <!-- 第二排：对比模式 + 对比词条选择器（靠左） / 保存并同步规则（靠右） -->
      <div class="action-row action-row-compare">
        <label class="compare-toggle" :class="{ active: compareMode }">
          <input type="checkbox" v-model="compareMode" @change="onCompareToggle" />
          <span>对比模式</span>
        </label>

        <!-- 对比词条选择器（仅对比模式可见）：通过下拉菜单选取两个词条 -->
        <template v-if="compareMode">
          <select class="compare-select" v-model="compareA" @change="onCompareSelect">
            <option value="">— 对比词条 A —</option>
            <option v-for="(sk, key) in editableConfig.skills" :key="'ca-' + key" :value="key">{{ key }} · {{ sk.name || key }}</option>
          </select>
          <select class="compare-select" v-model="compareB" @change="onCompareSelect">
            <option value="">— 对比词条 B —</option>
            <option v-for="(sk, key) in editableConfig.skills" :key="'cb-' + key" :value="key">{{ key }} · {{ sk.name || key }}</option>
          </select>
        </template>

        <span class="action-spacer"></span>

        <button
          class="btn btn-save"
          :disabled="saving"
          @click="saveConfig"
        >
          {{ saving ? '[ 保存中... ]' : '[ 保存并同步规则 ]' }}
        </button>
      </div>

      <span v-if="pendingDeletes.length > 0" class="delete-hint">
        ⚠ {{ pendingDeletes.length }} 个待删除
      </span>
      <span v-if="saveMsg" class="save-msg">{{ saveMsg }}</span>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="loading-state">
      <p>[ 正在连接词条库中枢... ]</p>
      <p class="loading-hint">正在从 combat-service 获取最新配置</p>
    </div>

    <!-- 加载失败 -->
    <div v-else-if="loadError" class="error-state">
      <p class="error-msg">{{ loadError }}</p>
      <button class="btn btn-reload" @click="loadConfig">[ 重试 ]</button>
    </div>

    <!-- Phase 11: 万能槽位分步创建向导 -->
    <div v-if="showWizard" class="wizard-overlay" @click.self="toggleWizard">
      <div class="wizard-panel">
        <div class="wizard-header">
          <h2>🧙 万能槽位创建向导</h2>
          <span class="wizard-step-indicator">Step {{ wizardStep }}/6 — {{ wizardStepLabel }}</span>
          <button class="btn" @click="toggleWizard">✕ 关闭</button>
        <button class="btn btn-ai-import" @click="toggleAiImport">🤖 导入AI技能</button>
        </div>

        <!-- Step 1: 主语 -->
        <div v-if="wizardStep === 1" class="wizard-body">
          <p class="wizard-desc">主语决定技能的触发条件与限制</p>
          <div class="wiz-field"><label for="wiz-action-type">动作类型 (action_type) *</label>
            <select id="wiz-action-type" name="action_type" v-model="wizardForm.action_type" class="param-select">
              <option value="attack">攻击 attack</option>
              <option value="heal">治疗 heal</option>
              <option value="buff">增益 buff</option>
              <option value="debuff">减益 debuff</option>
              <option value="passive">被动 passive</option>
            </select></div>
          <div class="wiz-field"><label for="wiz-attack-stat">攻击属性 (attack_stat)</label>
            <select id="wiz-attack-stat" name="attack_stat" v-model="wizardForm.attack_stat" class="param-select">
              <option value="melee">近战 melee</option>
              <option value="ranged">远程 ranged</option>
              <option value="max">最高值 max</option>
            </select></div>
          <div class="wiz-check"><input id="wiz-requires-unmoved" name="requires_unmoved" type="checkbox" v-model="wizardForm.requires_unmoved" /> 需要本回合未移动</div>
          <div class="wiz-check"><input id="wiz-requires-stealth" name="requires_stealth" type="checkbox" v-model="wizardForm.requires_stealth" /> 需要潜行状态</div>
          <div class="wiz-field"><label for="wiz-requires-hp-below">HP 低于值 (requires_hp_below)</label>
            <input id="wiz-requires-hp-below" name="requires_hp_below" type="number" v-model.number="wizardForm.requires_hp_below" min="0" max="100" class="wiz-input" />
            <small class="wiz-hint">0=无限制，单位当前HP低于此值才可触发</small></div>
          <div class="wiz-field"><label for="wiz-target-on-terrain">目标地形条件 (target_on_terrain)</label>
            <select id="wiz-target-on-terrain" name="target_on_terrain" v-model="wizardForm.target_on_terrain" class="param-select">
              <option value="">无限制</option>
              <option value="plain">平原</option>
              <option value="mountain">山地</option>
              <option value="forest">森林</option>
              <option value="water">水域</option>
              <option value="moon">月面</option>
              <option value="fortress">防御圈</option>
              <option value="ruins">废墟</option>
              <option value="crystal">晶矿</option>
              <option value="rubble">残骸</option>
              <option value="city_building">城市建筑</option>
            </select>
            <small class="wiz-hint">限定目标必须站在特定地形上</small></div>
        </div>

        <!-- Step 2: 谓语 -->
        <div v-if="wizardStep === 2" class="wizard-body">
          <p class="wizard-desc">谓语决定技能的作用对象与范围</p>
          <div class="wiz-field"><label for="wiz-target-filter">施放对象 (target_filter) *</label>
            <select id="wiz-target-filter" name="target_filter" v-model="wizardForm.target_filter" class="param-select">
              <option value="enemy">敌方 enemy</option>
              <option value="ally">友方 ally</option>
              <option value="self">自身 self</option>
              <option value="all">全员 all</option>
            </select></div>
          <div class="wiz-field"><label for="wiz-cast-range">最大施放距离 (cast_range)</label>
            <input id="wiz-cast-range" name="cast_range" type="number" v-model.number="wizardForm.cast_range" min="0" max="20" class="wiz-input" /></div>
          <div class="wiz-field"><label for="wiz-min-cast-range">最小施放距离 (min_cast_range)</label>
            <input id="wiz-min-cast-range" name="min_cast_range" type="number" v-model.number="wizardForm.min_cast_range" min="0" max="20" class="wiz-input" /></div>
          <div class="wiz-field"><label for="wiz-aoe-radius">AOE 溅射半径 (aoe_radius)</label>
            <input id="wiz-aoe-radius" name="aoe_radius" type="number" v-model.number="wizardForm.aoe_radius" min="0" max="10" class="wiz-input" /></div>
          <!-- Phase 30: 范围类型 — 支持地图炮/扇形 -->
          <div class="wiz-field"><label for="wiz-range-type">范围类型 (range_type)</label>
            <select id="wiz-range-type" name="range_type" v-model="wizardForm.range_type" class="param-select">
              <option value="radial">同心圆 radial</option>
              <option value="directional_beam">地图炮 directional_beam</option>
              <option value="cone">扇形 cone</option>
            </select></div>
          <div v-if="wizardForm.range_type === 'directional_beam'" class="wiz-field">
            <label for="wiz-beam-width">地图炮宽度 (beam_width) — 前方格数</label>
            <input id="wiz-beam-width" name="beam_width" type="number" v-model.number="wizardForm.beam_width" min="1" max="10" class="wiz-input" />
          </div>
        </div>

        <!-- Step 3: 定语 -->
        <div v-if="wizardStep === 3" class="wizard-body">
          <p class="wizard-desc">定语决定伤害类型与地形互动</p>
          <div class="wiz-field"><label for="wiz-damage-kind">伤害类型 (damage_kind)</label>
            <select id="wiz-damage-kind" name="damage_kind" v-model="wizardForm.damage_kind" class="param-select">
              <option value="kinetic">动能 kinetic</option>
              <option value="beam">光束 beam</option>
              <option value="explosive">爆炸 explosive</option>
              <option value="corrosive">腐蚀 corrosive</option>
              <option value="thermal">热熔 thermal</option>
            </select><small class="wiz-hint">水域对光束×0.5，晶矿对光束×1.5</small></div>
          <div class="wiz-field"><label for="wiz-category">分类 (category)</label>
            <select id="wiz-category" name="category" v-model="wizardForm.category" class="param-select">
              <option value="melee">近战 melee</option>
              <option value="ranged">远程 ranged</option>
              <option value="automation">自动化 automation</option>
              <option value="support">辅助 support</option>
              <option value="auto">自动化(旧) auto</option>
              <option value="special">特殊 special</option>
              <option value="passive">被动 passive</option>
            </select></div>
          <div class="wiz-field"><label for="wiz-description">描述</label>
            <input id="wiz-description" name="description" type="text" v-model="wizardForm.description" placeholder="技能描述..." class="wiz-input" /></div>
        </div>

        <!-- Step 4: 状语 -->
        <div v-if="wizardStep === 4" class="wizard-body">
          <p class="wizard-desc">状语决定环境的加成与随机干预</p>
          <div class="wiz-field"><label for="wiz-height-bonus">高地加成 (height_bonus_per_diff)</label>
            <input id="wiz-height-bonus" name="height_bonus_per_diff" type="number" v-model.number="wizardForm.height_bonus_per_diff" min="0" max="10" class="wiz-input" />
            <small class="wiz-hint">每高1格增加此数值伤害</small></div>
          <div class="wiz-field"><label for="wiz-dice-type">骰子类型 (dice_type)</label>
            <select id="wiz-dice-type" name="dice_type" v-model="wizardForm.dice_type" class="param-select">
              <option value="1d4">1d4</option><option value="1d6">1d6 (标准)</option>
              <option value="1d8">1d8</option><option value="2d6">2d6</option>
              <option value="1d10">1d10</option><option value="1d20">1d20</option>
            </select></div>
          <div class="wiz-field"><label for="wiz-success-line">成功线 (success_line)</label>
            <input id="wiz-success-line" name="success_line" type="number" v-model.number="wizardForm.success_line" min="1" max="20" class="wiz-input" /></div>
          <div class="wiz-field"><label for="wiz-success-bonus">成功追加伤害 (success_bonus_damage)</label>
            <input id="wiz-success-bonus" name="success_bonus_damage" type="number" v-model.number="wizardForm.success_bonus_damage" min="0" max="50" class="wiz-input" /></div>
          <div class="wiz-check"><input id="wiz-is-manual-roll" name="is_manual_roll" type="checkbox" v-model="wizardForm.is_manual_roll" /> 启用手动摇骰</div>
          <div class="wiz-field"><label for="wiz-accuracy-mod">命中修正 (accuracy_mod)</label>
            <input id="wiz-accuracy-mod" name="accuracy_mod" type="number" v-model.number="wizardForm.accuracy_mod" min="-10" max="10" class="wiz-input" /></div>
          <div class="wiz-field"><label for="wiz-evasion-mod">回避修正 (evasion_mod)</label>
            <input id="wiz-evasion-mod" name="evasion_mod" type="number" v-model.number="wizardForm.evasion_mod" min="-10" max="10" class="wiz-input" /></div>
          <hr class="wiz-sep" />
          <div class="wiz-check"><input id="wiz-has-dice" type="checkbox" v-model="wizardForm.has_dice" /> <label for="wiz-has-dice">启用多分支投骰 (has_dice) — 掷骰后按点数命中不同分支</label></div>
          <div v-if="wizardForm.has_dice" class="wiz-branches">
            <div class="wiz-branch" v-for="(br, bi) in wizardForm.dice_branches" :key="bi">
              <div class="wiz-branch-head">
                <span>分支 #{{ bi + 1 }}</span>
                <button type="button" class="wiz-x" @click="wizardForm.dice_branches.splice(bi,1)">删除分支</button>
              </div>
              <div class="wiz-field"><label>生效点数 points（逗号分隔如 1,2,3；区间用 - 如 4-6）</label>
                <input v-model="br.pointsStr" placeholder="1,2,3 或 4-6" class="wiz-input" />
              </div>
              <div class="wiz-effects" v-for="(ef, ei) in br.effects" :key="ei">
                <select v-model="ef.action" class="param-select">
                  <option v-for="a in BRANCH_ACTIONS" :key="a" :value="a">{{ a }}</option>
                </select>
                <input type="number" v-model.number="ef.value" placeholder="数值" class="wiz-input" />
                <input v-if="ef.action === 'apply_status'" v-model="ef.status" placeholder="状态 key，如 stun" class="wiz-input" />
                <button type="button" class="wiz-x" @click="br.effects.splice(ei,1)">删效果</button>
              </div>
              <button type="button" class="wiz-add" @click="br.effects.push({ action: 'damage', value: 0, status: '' })">+ 添加效果</button>
            </div>
            <button type="button" class="wiz-add" @click="addWizardBranch">+ 添加判定分支</button>
          </div>
        </div>

        <!-- Step 5: 补语 -->
        <div v-if="wizardStep === 5" class="wizard-body">
          <p class="wizard-desc">补语是技能的基础数值与效果</p>
          <div class="wiz-field"><label for="wiz-base-damage">基础伤害 (base_damage)</label>
            <input id="wiz-base-damage" name="base_damage" type="number" v-model.number="wizardForm.base_damage" min="0" max="100" class="wiz-input" /></div>
          <div class="wiz-field"><label for="wiz-status-effects">状态效果 (status_effects) - 逗号分隔</label>
            <input id="wiz-status-effects" name="status_effects_str" type="text" v-model="wizardForm.status_effects_str" placeholder="burn,stun,disable,slow,poison,freeze" class="wiz-input" />
            <small class="wiz-hint">可选: burn, stun, disable, slow, poison, freeze</small></div>
        </div>

        <!-- Step 6: 确认 -->
        <div v-if="wizardStep === 6" class="wizard-body">
          <p class="wizard-desc">确认以下万能语法槽位配置</p>
          <div class="wiz-preview">
            <div class="wiz-preview-line"><b>名称:</b> {{ wizardForm.label }}</div>
            <div class="wiz-preview-line"><b>动作:</b> {{ wizardForm.action_type }} | {{ wizardForm.attack_stat }} | {{ wizardForm.category }}</div>
            <div class="wiz-preview-line"><b>伤害类型:</b> {{ wizardForm.damage_kind }}</div>
            <div class="wiz-preview-line"><b>范围:</b> {{ wizardForm.min_cast_range }}~{{ wizardForm.cast_range }} | {{ wizardForm.range_type === 'directional_beam' ? '地图炮W' + wizardForm.beam_width : wizardForm.range_type === 'cone' ? '扇形' : 'AOE ' + wizardForm.aoe_radius }}</div>
            <div class="wiz-preview-line"><b>对象:</b> {{ wizardForm.target_filter }}</div>
            <div class="wiz-preview-line"><b>高地:</b> ×{{ wizardForm.height_bonus_per_diff }} | 骰子: {{ wizardForm.dice_type }} ≥{{ wizardForm.success_line }}</div>
            <div class="wiz-preview-line"><b>基础伤害:</b> {{ wizardForm.base_damage }} | 手动掷骰: {{ wizardForm.is_manual_roll ? '是' : '否' }}</div>
            <div class="wiz-preview-line"><b>状态:</b> {{ wizardForm.status_effects_str || '无' }}</div>
            <div class="wiz-preview-line"><b>描述:</b> {{ wizardForm.description || '无' }}</div>
          </div>
        </div>

        <div class="wizard-footer">
          <button class="btn" @click="wizardStep > 1 ? wizardStep-- : toggleWizard()">{{ wizardStep === 1 ? '取消' : '← 上一步' }}</button>
          <button v-if="wizardStep < 6" class="btn btn-add" @click="wizardStep++">下一步 →</button>
          <button v-else class="btn btn-save" @click="commitWizardSkill">✓ 创建词条</button>
        </div>
      </div>
    </div>

    <!-- 词条对比面板：对比模式下，选取两个词条并排编辑，数值单独成列 -->
    <section class="panel compare-panel" v-if="compareMode && skillA && skillB">
      <div class="panel-header">
        <h2>[ 词条对比 · {{ compareA }} ⇄ {{ compareB }} ]</h2>
        <span class="panel-badge">COMPARE · 数值并排 · 可直接编辑</span>
      </div>
      <div class="panel-body compare-body">
        <div class="compare-grid">
          <!-- 表头 -->
          <div class="cmp-row cmp-head">
            <div class="cmp-cell cmp-key">参数 PARAM</div>
            <div class="cmp-cell cmp-av">A · {{ skillA.name || compareA }} <span class="cmp-cat">{{ CATEGORY_LABELS[skillA.category] || skillA.category }}</span></div>
            <div class="cmp-cell cmp-bv">B · {{ skillB.name || compareB }} <span class="cmp-cat">{{ CATEGORY_LABELS[skillB.category] || skillB.category }}</span></div>
          </div>

          <!-- 核心字段 -->
          <div class="cmp-row" v-for="f in compareFields" :key="f.key">
            <div class="cmp-cell cmp-key">{{ f.label }}</div>
            <div class="cmp-cell">
              <input v-if="f.type === 'text'" v-model="skillA[f.key]" class="cmp-input" />
              <input v-else-if="f.type === 'number'" type="number" v-model.number="skillA[f.key]" class="cmp-input cmp-num" />
              <select v-else-if="f.type === 'select'" v-model="skillA[f.key]" class="cmp-input">
                <option v-for="o in f.options" :key="o" :value="o">{{ f.labels[o] || o }}</option>
              </select>
              <template v-else-if="f.type === 'def'">
                <input v-if="f.def.type === 'number'" type="number" v-model.number="skillA[f.key]" class="cmp-input cmp-num" :min="f.def.min" :max="f.def.max" />
                <select v-else-if="f.def.type === 'select'" v-model="skillA[f.key]" class="cmp-input">
                  <option v-for="o in f.def.options" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
                <input v-else-if="f.def.type === 'bool'" type="checkbox" v-model="skillA[f.key]" />
                <input v-else-if="f.def.type === 'json'" :value="jsonStr(skillA[f.key])" @input="e => setJson(skillA, f.key, e.target.value)" class="cmp-input cmp-json" />
                <input v-else v-model="skillA[f.key]" class="cmp-input" />
              </template>
            </div>
            <div class="cmp-cell">
              <input v-if="f.type === 'text'" v-model="skillB[f.key]" class="cmp-input" />
              <input v-else-if="f.type === 'number'" type="number" v-model.number="skillB[f.key]" class="cmp-input cmp-num" />
              <select v-else-if="f.type === 'select'" v-model="skillB[f.key]" class="cmp-input">
                <option v-for="o in f.options" :key="o" :value="o">{{ f.labels[o] || o }}</option>
              </select>
              <template v-else-if="f.type === 'def'">
                <input v-if="f.def.type === 'number'" type="number" v-model.number="skillB[f.key]" class="cmp-input cmp-num" :min="f.def.min" :max="f.def.max" />
                <select v-else-if="f.def.type === 'select'" v-model="skillB[f.key]" class="cmp-input">
                  <option v-for="o in f.def.options" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
                <input v-else-if="f.def.type === 'bool'" type="checkbox" v-model="skillB[f.key]" />
                <input v-else-if="f.def.type === 'json'" :value="jsonStr(skillB[f.key])" @input="e => setJson(skillB, f.key, e.target.value)" class="cmp-input cmp-json" />
                <input v-else v-model="skillB[f.key]" class="cmp-input" />
              </template>
            </div>
          </div>

          <!-- 施放距离 cast_range（对象 min/max） -->
          <div class="cmp-row">
            <div class="cmp-cell cmp-key">施放距离 cast_range</div>
            <div class="cmp-cell">
              <span class="range-inputs">
                <input type="number" v-model.number="skillA.cast_range.min" class="cmp-input cmp-num" /> ~
                <input type="number" v-model.number="skillA.cast_range.max" class="cmp-input cmp-num" /> 格
              </span>
            </div>
            <div class="cmp-cell">
              <span class="range-inputs">
                <input type="number" v-model.number="skillB.cast_range.min" class="cmp-input cmp-num" /> ~
                <input type="number" v-model.number="skillB.cast_range.max" class="cmp-input cmp-num" /> 格
              </span>
            </div>
          </div>

          <!-- 投骰区 -->
          <div class="cmp-row cmp-section">
            <div class="cmp-cell cmp-key">投骰 has_dice</div>
            <div class="cmp-cell"><input type="checkbox" v-model="skillA.has_dice" /></div>
            <div class="cmp-cell"><input type="checkbox" v-model="skillB.has_dice" /></div>
          </div>
          <div class="cmp-row">
            <div class="cmp-cell cmp-key">投骰类型 dice_type</div>
            <div class="cmp-cell"><select v-if="skillA.has_dice" v-model.number="skillA.dice_type" class="cmp-input"><option v-for="dt in DICE_TYPES" :key="dt" :value="dt">d{{ dt }}</option></select><span v-else class="cmp-val">—</span></div>
            <div class="cmp-cell"><select v-if="skillB.has_dice" v-model.number="skillB.dice_type" class="cmp-input"><option v-for="dt in DICE_TYPES" :key="dt" :value="dt">d{{ dt }}</option></select><span v-else class="cmp-val">—</span></div>
          </div>
          <div class="cmp-row" v-if="!skillA.has_dice || !skillB.has_dice">
            <div class="cmp-cell cmp-key">成功线 success_line</div>
            <div class="cmp-cell"><input v-if="!skillA.has_dice" type="number" v-model.number="skillA.success_line" class="cmp-input cmp-num" /><span v-else class="cmp-val">—</span></div>
            <div class="cmp-cell"><input v-if="!skillB.has_dice" type="number" v-model.number="skillB.success_line" class="cmp-input cmp-num" /><span v-else class="cmp-val">—</span></div>
          </div>
          <div class="cmp-row" v-if="!skillA.has_dice || !skillB.has_dice">
            <div class="cmp-cell cmp-key">成功附加伤害 success_bonus_damage</div>
            <div class="cmp-cell"><input v-if="!skillA.has_dice" type="number" v-model.number="skillA.success_bonus_damage" class="cmp-input cmp-num" /><span v-else class="cmp-val">—</span></div>
            <div class="cmp-cell"><input v-if="!skillB.has_dice" type="number" v-model.number="skillB.success_bonus_damage" class="cmp-input cmp-num" /><span v-else class="cmp-val">—</span></div>
          </div>
          <div class="cmp-row" v-if="!skillA.has_dice || !skillB.has_dice">
            <div class="cmp-cell cmp-key">允许手动摇骰 is_manual_roll</div>
            <div class="cmp-cell"><input v-if="!skillA.has_dice" type="checkbox" v-model="skillA.is_manual_roll" /><span v-else class="cmp-val">—</span></div>
            <div class="cmp-cell"><input v-if="!skillB.has_dice" type="checkbox" v-model="skillB.is_manual_roll" /><span v-else class="cmp-val">—</span></div>
          </div>
          <div class="cmp-row">
            <div class="cmp-cell cmp-key">判定分支 dice_branches</div>
            <div class="cmp-cell"><input :value="jsonStr(skillA.dice_branches)" @input="e => setJson(skillA, 'dice_branches', e.target.value)" class="cmp-input cmp-json" /></div>
            <div class="cmp-cell"><input :value="jsonStr(skillB.dice_branches)" @input="e => setJson(skillB, 'dice_branches', e.target.value)" class="cmp-input cmp-json" /></div>
          </div>
        </div>

        <div class="ov-detail-actions">
          <button class="btn btn-save" @click="saveConfig" :disabled="saving">💾 保存对比修改</button>
          <button class="btn" @click="clearCompare">清除对比</button>
        </div>
      </div>
    </section>

    <!-- 词条中枢首页 · 全部词条列表（总览 + 点击内联展开编辑） -->
    <section class="panel overview-panel">
      <div class="panel-header">
        <h2>[ 词条中枢首页 · 全部词条 ({{ skillCount }}）]</h2>
        <span class="panel-badge">INDEX · 点击词条展开编辑</span>
      </div>
      <div class="panel-body">
        <div v-if="skillCount === 0" class="empty-state">
          <p>暂无词条，点击「添加新词条」或「分步向导」创建</p>
        </div>
        <div v-else class="overview-list">
          <!-- 每个词条 bar：点击展开为内联「编辑 & 保存」式样（手风琴，单开），不再跳转/滚动到独立面板 -->
          <div
            v-for="(skill, key) in editableConfig.skills"
            :key="'ov-' + key"
            class="overview-item-wrap"
            :class="{ 'ov-expanded': expandedKey === key }"
          >
            <button class="overview-item" @click="toggleOverview(key)" :aria-expanded="expandedKey === key">
              <span class="ov-key">{{ key }}</span>
              <span class="ov-name">{{ skill.name || key }}</span>
              <span class="ov-cat" :class="'cat-' + (skill.category || 'melee')">{{ CATEGORY_LABELS[skill.category] || skill.category }}</span>
              <span v-if="skill.has_dice" class="ov-dice">🎲 d{{ skill.dice_type }}</span>
              <span class="ov-chevron">{{ expandedKey === key ? '▴' : '▾' }}</span>
            </button>

            <!-- 内联可编辑详情：点击下拉展示完整数值（编辑 & 保存式样），保留页面滚动 -->
            <div v-if="expandedKey === key" class="ov-detail">
              <div
                class="skill-card"
                :id="'skill-card-' + key"
                :class="{ 'deleted-card': pendingDeletes.includes(key) }"
              >
                <!-- 卡片头：KEY + 名称 + 删除 -->
                <div class="skill-card-header">
                  <span class="skill-key-badge">{{ key }}</span>
                  <span class="skill-name-badge">{{ skill.name || key }}</span>
                  <button
                    v-if="isEditing(key)"
                    class="btn btn-delete"
                    @click="deleteSkill(key)"
                  >
                    ✕ 删除
                  </button>
                </div>

                <!-- 区块一 · 名称分类面板 -->
                <section class="edit-block">
                  <div class="block-title">▸ 区块一 · 名称分类</div>
                  <div class="block-body">
                    <div class="block-row">
                      <label class="param-row" :for="`skill-${key}-key`">
                        <span class="param-key">KEY（检索代号）</span>
                        <input
                          v-if="isEditing(key)"
                          :id="`skill-${key}-key`"
                          v-model="skillKeyEdits[key]"
                          type="text"
                          class="param-input param-text"
                          placeholder="skill_key"
                          @blur="onSkillKeyBlur(key)"
                        />
                        <span v-else class="param-value">{{ key }}</span>
                      </label>
                      <label class="param-row" :for="`skill-${key}-name`">
                        <span class="param-key">名称（中文名）</span>
                        <input v-if="isEditing(key)" :id="`skill-${key}-name`" v-model="skill.name" type="text" class="param-input param-text" placeholder="技能名称" />
                        <span v-else class="param-value">{{ skill.name || key }}</span>
                      </label>
                    <label class="param-row" :for="`skill-${key}-category`">
                      <span class="param-key">分类 category</span>
                      <select v-if="isEditing(key)" :id="`skill-${key}-category`" v-model="skill.category" class="param-select">
                        <option v-for="c in SKILL_CATEGORIES" :key="c" :value="c">{{ CATEGORY_LABELS[c] }} {{ c }}</option>
                      </select>
                      <span v-else class="param-value">{{ CATEGORY_LABELS[skill.category] || skill.category }}</span>
                    </label>
                    <div class="param-hint" style="font-size:11px;color:#7fb3d5;margin:-4px 0 10px 2px;">技能大类：auto=自动化（消耗行动点换取持续增益）；melee/ranged=近战/射击；special=特殊；support=支援</div>
                    </div>
                    <label class="param-row param-row-wide" :for="`skill-${key}-description`">
                      <span class="param-key">描述</span>
                      <input v-if="isEditing(key)" :id="`skill-${key}-description`" v-model="skill.description" type="text" class="param-input param-text" placeholder="技能描述..." />
                      <span v-else class="param-value">{{ skill.description || '-' }}</span>
                    </label>
                    <div class="param-hint" style="font-size:11px;color:#7fb3d5;margin:-4px 0 10px 2px;">技能中文说明，会战内单位技能悬浮提示显示此文本</div>
                  </div>
                </section>

                <!-- 区块二 · 基础属性与伤害分流面板 -->
                <section class="edit-block">
                  <div class="block-title">▸ 区块二 · 基础属性与伤害分流</div>
                  <div class="block-body">
                    <label class="param-row" :for="`skill-${key}-target-scope`">
                      <span class="param-key">施放对象 target_scope</span>
                      <select v-if="isEditing(key)" :id="`skill-${key}-target-scope`" v-model="skill.target_scope" class="param-select">
                        <option v-for="s in TARGET_SCOPES" :key="s" :value="s">{{ TARGET_SCOPE_LABELS[s] }}</option>
                      </select>
                      <span v-else class="param-value">{{ TARGET_SCOPE_LABELS[skill.target_scope] || skill.target_scope }}</span>
                    </label>
                    <div class="param-hint" style="font-size:11px;color:#7fb3d5;margin:-4px 0 10px 2px;">作用目标范围：self 自身 / ally 友军 / enemy 敌方</div>

                    <label class="param-row" :for="`skill-${key}-cast-range`">
                      <span class="param-key">施放距离 cast_range</span>
                      <span v-if="isEditing(key)" class="range-inputs">
                        <input v-model.number="skill.cast_range.min" type="number" min="0" max="20" class="param-input param-num" /> ~
                        <input v-model.number="skill.cast_range.max" type="number" min="0" max="20" class="param-input param-num" /> 格
                      </span>
                      <span v-else class="param-value">{{ skill.cast_range && skill.cast_range.min }}~{{ skill.cast_range && skill.cast_range.max }} 格</span>
                    </label>
                    <div class="param-hint" style="font-size:11px;color:#7fb3d5;margin:-4px 0 10px 2px;">可施放的最小~最大格距；自动化自增益技能为 0~0（仅自身），专注射击为 4~6</div>

                    <label class="param-row" :for="`skill-${key}-skill-shape`">
                      <span class="param-key">技能形态 skill_shape</span>
                      <select v-if="isEditing(key)" :id="`skill-${key}-skill-shape`" v-model="skill.skill_shape" class="param-select">
                        <option v-for="sh in SKILL_SHAPES" :key="sh" :value="sh">{{ SKILL_SHAPE_LABELS[sh] }}</option>
                      </select>
                      <span v-else class="param-value">{{ SKILL_SHAPE_LABELS[skill.skill_shape] || skill.skill_shape }}</span>
                    </label>
                    <div class="param-hint" style="font-size:11px;color:#7fb3d5;margin:-4px 0 10px 2px;">命中几何：single 单点 / radial 同心圆 / directional_beam 地图炮 / cone 扇形</div>

                    <label class="param-row" :for="`skill-${key}-damage-kind`">
                      <span class="param-key">伤害种类 damage_kind</span>
                      <select v-if="isEditing(key)" :id="`skill-${key}-damage-kind`" v-model="skill.damage_kind" class="param-select">
                        <option v-for="dk in DAMAGE_KINDS" :key="dk" :value="dk">{{ DAMAGE_KIND_LABELS[dk] }}</option>
                      </select>
                      <span v-else class="param-value">{{ DAMAGE_KIND_LABELS[skill.damage_kind] || skill.damage_kind }}</span>
                    </label>
                    <div class="param-hint" style="font-size:11px;color:#7fb3d5;margin:-4px 0 10px 2px;">伤害属性：kinetic 动能 / energy 能量 / explosive 爆炸（影响抗性与减伤计算）</div>

                    <label class="param-row" :for="`skill-${key}-action-type`">
                      <span class="param-key">动作类型 action_type</span>
                      <select v-if="isEditing(key)" :id="`skill-${key}-action-type`" v-model="skill.action_type" class="param-select">
                        <option v-for="at in ACTION_TYPES" :key="at" :value="at">{{ ACTION_TYPE_LABELS[at] }}</option>
                      </select>
                      <span v-else class="param-value">{{ ACTION_TYPE_LABELS[skill.action_type] || skill.action_type }}</span>
                    </label>
                    <div class="param-hint" style="font-size:11px;color:#7fb3d5;margin:-4px 0 10px 2px;">万能语法谓语：attack 攻击 / heal 治疗 / buff 增益 / debuff 减益 / passive 被动</div>
                  </div>

                  <!-- 兼容插槽 + 自动化增益：数据驱动，全部字段可编辑并附中文释义 -->
                  <details class="compat-slot">
                    <summary>⚙ 兼容插槽（AOE / 修正 / 状态 / 旧距离）</summary>
                    <div class="block-body">
                      <template v-for="def in compatFieldDefs" :key="def.key">
                        <label class="param-row" :for="`skill-${key}-${def.key}`">
                          <span class="param-key">{{ def.label }} <code>{{ def.key }}</code></span>
                          <input v-if="isEditing(key) && def.type==='number'" :id="`skill-${key}-${def.key}`" v-model.number="skill[def.key]" type="number" :min="def.min" :max="def.max" class="param-input" />
                          <select v-else-if="isEditing(key) && def.type==='select'" :id="`skill-${key}-${def.key}`" v-model="skill[def.key]" class="param-select">
                            <option v-for="o in def.options" :key="o.value" :value="o.value">{{ o.label }}</option>
                          </select>
                          <input v-else-if="isEditing(key) && def.type==='bool'" :id="`skill-${key}-${def.key}`" type="checkbox" v-model="skill[def.key]" />
                          <input v-else-if="isEditing(key) && def.type==='json'" :id="`skill-${key}-${def.key}`" :value="jsonStr(skill[def.key])" @input="e => setJson(skill, def.key, e.target.value)" class="param-input param-json" />
                          <input v-else-if="isEditing(key)" :id="`skill-${key}-${def.key}`" v-model="skill[def.key]" class="param-input" />
                          <span v-else class="param-value">{{ displayVal(skill[def.key], def) }}</span>
                        </label>
                        <div class="param-hint" style="font-size:11px;color:#7fb3d5;margin:-4px 0 10px 2px;">{{ def.hint }}</div>
                      </template>
                      <label class="param-row param-row-wide">
                        <span class="param-key">附加效果 status_effects</span>
                        <span v-if="!isEditing(key)" class="param-value">{{ (skill.status_effects || []).join(', ') || '无' }}</span>
                        <div v-else class="status-effects-tags">
                          <label
                            v-for="eff in availableEffects"
                            :key="eff.value"
                            class="status-tag"
                            :class="{ active: (skill.status_effects || []).includes(eff.value) }"
                          >
                            <input
                              type="checkbox"
                              :id="`skill-${key}-eff-${eff.value}`"
                              :checked="(skill.status_effects || []).includes(eff.value)"
                              @change="toggleEffect(skill, eff.value)"
                              class="status-checkbox"
                            />
                            {{ eff.label }}
                          </label>
                        </div>
                      </label>
                    </div>
                  </details>

                  <!-- 自动化 / 增益配置分区 -->
                  <details class="compat-slot automation-slot">
                    <summary>🤖 自动化 / 增益配置（行动点消耗 · 持续回合 · 数值）</summary>
                    <div class="block-body">
                      <template v-for="def in automationFieldDefs" :key="def.key">
                        <label class="param-row" :for="`skill-${key}-${def.key}`">
                          <span class="param-key">{{ def.label }} <code>{{ def.key }}</code></span>
                          <input v-if="isEditing(key) && def.type==='number'" :id="`skill-${key}-${def.key}`" v-model.number="skill[def.key]" type="number" :min="def.min" :max="def.max" class="param-input" />
                          <select v-else-if="isEditing(key) && def.type==='select'" :id="`skill-${key}-${def.key}`" v-model="skill[def.key]" class="param-select">
                            <option v-for="o in def.options" :key="o.value" :value="o.value">{{ o.label }}</option>
                          </select>
                          <input v-else-if="isEditing(key) && def.type==='bool'" :id="`skill-${key}-${def.key}`" type="checkbox" v-model="skill[def.key]" />
                          <input v-else-if="isEditing(key) && def.type==='json'" :id="`skill-${key}-${def.key}`" :value="jsonStr(skill[def.key])" @input="e => setJson(skill, def.key, e.target.value)" class="param-input param-json" />
                          <input v-else-if="isEditing(key)" :id="`skill-${key}-${def.key}`" v-model="skill[def.key]" class="param-input" />
                          <span v-else class="param-value">{{ displayVal(skill[def.key], def) }}</span>
                        </label>
                        <div class="param-hint" style="font-size:11px;color:#7fb3d5;margin:-4px 0 10px 2px;">{{ def.hint }}</div>
                      </template>
                    </div>
                  </details>
                </section>

                <!-- 区块三 · 投骰属性与多重判定面板 -->
                <section class="edit-block">
                  <div class="block-title">▸ 区块三 · 投骰属性与多重判定</div>
                  <div class="block-body">
                    <!-- 主开关 -->
                    <label class="param-row has-dice-row" :for="`skill-${key}-has-dice`">
                      <span class="param-key">是否投骰 has_dice</span>
                      <template v-if="isEditing(key)">
                        <input :id="`skill-${key}-has-dice`" type="checkbox" v-model="skill.has_dice" />
                        <span class="param-value">{{ skill.has_dice ? 'ON（启用多判定）' : 'OFF（传统掷骰）' }}</span>
                      </template>
                      <span v-else class="param-value">{{ skill.has_dice ? 'ON' : 'OFF' }}</span>
                    </label>

                    <!-- 新投骰多分支模型 -->
                    <div v-if="skill.has_dice" class="dice-branch-zone">
                      <label class="param-row" :for="`skill-${key}-dice-type`">
                        <span class="param-key">骰子面数 dice_type</span>
                        <select v-if="isEditing(key)" :id="`skill-${key}-dice-type`" v-model.number="skill.dice_type" class="param-select">
                          <option v-for="dt in DICE_TYPES" :key="dt" :value="dt">d{{ dt }}</option>
                        </select>
                        <span v-else class="param-value">d{{ skill.dice_type }}</span>
                      </label>

                      <div class="branches-list">
                        <div
                          v-for="(branch, bi) in skill.dice_branches"
                          :key="branch.id"
                          class="branch-card"
                        >
                          <div class="branch-head">
                            <span class="branch-title">《判定{{ bi + 1 }}》</span>
                            <button v-if="isEditing(key)" class="btn btn-mini btn-delete" @click="removeBranch(skill, bi)">− 删除判定</button>
                          </div>

                          <!-- 生效点数集合（离散 2,5 或区间 [1,4]） -->
                          <div class="branch-sub">
                            <span class="branch-sub-label">生效点数</span>
                            <input
                              v-if="isEditing(key)"
                              class="param-input param-text point-text"
                              :value="pointText(branch)"
                              :placeholder="'离散 2,5 或区间 [1,4]'"
                              @input="setPointText(branch, $event.target.value)"
                            />
                            <span v-else class="param-value">{{ pointText(branch) || '（无）' }}</span>
                          </div>

                          <!-- 判定效果列表 -->
                          <div class="branch-sub">
                            <span class="branch-sub-label">判定效果</span>
                            <div
                              v-for="(eff, ei) in branch.effects"
                              :key="ei"
                              class="effect-row"
                            >
                              <select v-if="isEditing(key)" v-model="eff.action" class="param-select effect-action">
                                <option v-for="a in BRANCH_ACTIONS" :key="a" :value="a">{{ BRANCH_ACTION_LABELS[a] }}</option>
                              </select>
                              <span v-else class="param-value">{{ BRANCH_ACTION_LABELS[eff.action] || eff.action }}</span>
                              <template v-if="eff.action === 'apply_status'">
                                <input v-if="isEditing(key)" v-model="eff.status" class="param-input param-text" placeholder="状态标识 status" />
                                <span v-else class="param-value">{{ eff.status || '-' }}</span>
                              </template>
                              <template v-else>
                                <input v-if="isEditing(key)" v-model.number="eff.value" type="number" step="1" class="param-input param-num" placeholder="数值" />
                                <span v-else class="param-value">{{ eff.value ?? 0 }}</span>
                              </template>
                              <button v-if="isEditing(key)" class="btn btn-mini btn-delete" @click="removeEffect(branch, ei)">✕</button>
                            </div>
                            <button v-if="isEditing(key)" class="btn btn-mini btn-add" @click="addEffect(branch)">+ 添加判定效果</button>
                          </div>
                        </div>

                        <button v-if="isEditing(key)" class="btn btn-add" @click="addBranch(skill)">+ 添加判定分支</button>
                        <span v-if="!isEditing(key) && (!skill.dice_branches || !skill.dice_branches.length)" class="param-value">（无判定分支）</span>
                      </div>
                    </div>

                    <!-- 传统掷骰（has_dice = false 时显示） -->
                    <div v-else class="legacy-dice-zone">
                      <label class="param-row" :for="`skill-${key}-success-line`">
                        <span class="param-key">成功线</span>
                        <input v-if="isEditing(key)" :id="`skill-${key}-success-line`" v-model.number="skill.success_line" type="number" min="1" max="20" class="param-input" />
                        <span v-else class="param-value">{{ skill.success_line ?? 4 }}+</span>
                      </label>
                      <label class="param-row" :for="`skill-${key}-success-bonus`">
                        <span class="param-key">成功追加</span>
                        <input v-if="isEditing(key)" :id="`skill-${key}-success-bonus`" v-model.number="skill.success_bonus_damage" type="number" step="1" class="param-input" />
                        <span v-else class="param-value">+{{ skill.success_bonus_damage ?? 0 }}</span>
                      </label>
                      <label class="param-row" :for="`skill-${key}-is-manual-roll`">
                        <span class="param-key">手动摇骰</span>
                        <template v-if="isEditing(key)">
                          <input :id="`skill-${key}-is-manual-roll`" type="checkbox" v-model="skill.is_manual_roll" />
                          <span class="param-value">{{ skill.is_manual_roll ? 'ON' : 'OFF' }}</span>
                        </template>
                        <span v-else class="param-value">{{ skill.is_manual_roll ? '⚡ 手动' : '自动' }}</span>
                      </label>
                    </div>
                  </div>

                  <!-- 内联编辑操作栏：保存本词条 / 收起 -->
                  <div class="ov-detail-actions">
                    <button class="btn btn-save" @click="saveConfig" :disabled="saving">💾 保存本词条</button>
                    <button class="btn" @click="toggleOverview(key)">收起 ▴</button>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
      <!-- 系统参数面板 (保留原有) -->
      <section class="panel" v-if="Object.keys(editableConfig.systems || {}).length > 0">
        <div class="panel-header">
          <h2>[ 系统参数 ]</h2>
          <span class="panel-badge">{{ Object.keys(editableConfig.systems || {}).length }} 项</span>
        </div>
        <div class="panel-body">
          <div v-for="(sys, key) in editableConfig.systems" :key="key" class="system-card">
            <div class="system-label">{{ sys.label || key }}</div>
            <div class="system-params">
              <div v-for="(val, pkey) in getSystemParams(sys)" :key="pkey" class="param-row">
                <span class="param-key">{{ pkey }}</span>
                <select v-if="pkey === 'visibility'" v-model="sys[pkey]" class="param-select">
                  <option value="normal">正常</option>
                  <option value="reduced">降低</option>
                  <option value="blind">盲视</option>
                </select>
                <input v-else :type="typeof val === 'number' ? 'number' : 'text'"
                  v-model="sys[pkey]" class="param-input"
                  :class="{ 'param-text': typeof val === 'string' }"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 配置元信息 -->
      <section class="panel panel-meta" v-if="editableConfig._meta">
        <div class="panel-header">
          <h2>[ 配置元信息 ]</h2>
        </div>
        <div class="panel-body meta-body">
          <div>版本: {{ editableConfig._meta.version }}</div>
          <div>更新: {{ editableConfig._meta.date }}</div>
          <div>原则: {{ editableConfig._meta.principle }}</div>
        </div>
      </section>
  </div>

    <!-- Phase 12: AI 技能导入弹窗 -->
    <div v-if="showAiImport" class="wizard-overlay" @click.self="showAiImport=false">
      <div class="wizard-panel ai-import-panel">
        <div class="wizard-header">
          <h2>🤖 导入AI生成技能</h2>
          <button class="btn" @click="showAiImport=false">✕ 关闭</button>
        </div>
        <div class="wizard-body">
          <p class="wizard-desc">粘贴 AI 生成器输出的技能 JSON（支持单个对象或数组）</p>
          <textarea
            id="ai-import-json"
            name="ai_import_json"
            v-model="aiImportJson"
            class="ai-import-textarea"
            placeholder='粘贴技能 JSON，例如：[{"id":"plasma_storm","name":"等离子风暴","action_type":"attack","damage_kind":"thermal","base_damage":18,...}]'
            rows="12"
          ></textarea>
          <div class="ai-import-actions">
            <button class="btn" @click="showAiImport=false">取消</button>
            <button class="btn btn-primary" @click="importAiSkills">导入技能</button>
          </div>
          <p v-if="aiImportResult" :class="aiImportSuccess ? 'import-success' : 'import-error'">{{ aiImportResult }}</p>
        </div>
      </div>
    </div>

    <!-- Excel 导入预览模态框 -->
    <div v-if="showExcelModal" class="excel-overlay" @click.self="showExcelModal = false">
      <div class="excel-modal">
        <div class="excel-modal-header">
          <h3>📥 Excel 导入预览</h3>
          <button class="excel-close" @click="showExcelModal = false">✕</button>
        </div>

        <div class="excel-counts">
          <span class="count-badge badge-new">新增 {{ excelPreview.counts.new }} 条</span>
          <span class="count-badge badge-update">修改 {{ excelPreview.counts.update }} 条</span>
          <span class="count-badge badge-total">共 {{ excelPreview.counts.total }} 条</span>
          <span v-if="excelPreview.errors.length" class="count-badge badge-error">
            ❌ {{ excelPreview.errors.length }} 处错误 · 禁止确认
          </span>
        </div>

        <div v-if="excelPreview.errors.length" class="excel-block excel-errors">
          <div class="excel-block-title err-title">⛔ 错误（必须修正后才能导入）</div>
          <div v-for="(err, i) in excelPreview.errors" :key="'err' + i" class="excel-line err-line">
            行 {{ err.row || '-' }} · <b>{{ err.key || err.field }}</b> · {{ err.message }}
          </div>
        </div>

        <div v-if="excelPreview.warnings.length" class="excel-block excel-warnings">
          <div class="excel-block-title warn-title">⚠ 警告</div>
          <div v-for="(w, i) in excelPreview.warnings" :key="'warn' + i" class="excel-line warn-line">
            行 {{ w.row || '-' }} · <b>{{ w.key || w.field }}</b> · {{ w.message }}
          </div>
        </div>

        <div class="excel-list-wrap">
          <div
            v-for="(skill, key) in excelPreview.skills"
            :key="key"
            class="excel-row"
            :class="isExistingSkill(key) ? 'row-update' : 'row-new'"
          >
            <span class="excel-tag" :class="isExistingSkill(key) ? 'tag-update' : 'tag-new'">
              {{ isExistingSkill(key) ? '修改' : '新增' }}
            </span>
            <span class="excel-key">{{ key }}</span>
            <span class="excel-name">{{ skill.label || skill.name }}</span>
            <span class="excel-cat">{{ skill.category }}</span>
          </div>
        </div>

        <div class="excel-modal-footer">
          <button class="btn btn-ghost" @click="showExcelModal = false">取消</button>
          <button
            class="btn btn-primary"
            :disabled="(excelPreview.errors && excelPreview.errors.length) || excelLoading"
            @click="confirmExcelImport"
          >
            {{ excelLoading ? '导入中...' : '确认导入' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 隐藏的 Excel 文件选择器 -->
    <input
      type="file"
      ref="excelInput"
      @change="onExcelSelected"
      accept=".xlsx,.xls"
      style="display: none"
    />

</template>

<script setup>
import { ref, reactive, onMounted, computed, nextTick } from 'vue'
import { glossaryAPI } from '@/api/client.js'
import {
  hydrateSkill,
  serializeSkillToContract,
  SKILL_CATEGORIES,
  CATEGORY_LABELS,
  TARGET_SCOPES,
  TARGET_SCOPE_LABELS,
  SKILL_SHAPES,
  SKILL_SHAPE_LABELS,
  DAMAGE_KINDS,
  DAMAGE_KIND_LABELS,
  ACTION_TYPES,
  ACTION_TYPE_LABELS,
  DICE_TYPES,
  BRANCH_ACTIONS,
  BRANCH_ACTION_LABELS,
  SKILL_FIELD_DEFS
} from '@/contracts/skillContract.js'

// 数据驱动：按分区筛选字段定义
const compatFieldDefs = SKILL_FIELD_DEFS.filter(d => d.section === 'compat')
const automationFieldDefs = SKILL_FIELD_DEFS.filter(d => d.section === 'automation')

// JSON 字段的显示 / 写入（编辑消费模型、骰子区间等）
function jsonStr(v) {
  if (v === null || v === undefined) return ''
  try { return JSON.stringify(v) } catch (e) { return String(v) }
}
function setJson(obj, key, str) {
  if (str === '' || str === null) { obj[key] = null; return }
  try { obj[key] = JSON.parse(str) } catch (e) { /* 解析失败保留原值，避免误删 */ }
}
function displayVal(v, def) {
  if (def && def.type === 'bool') return v ? '是' : '否'
  if (def && def.type === 'json') return jsonStr(v)
  if (def && def.type === 'select') {
    const o = (def.options || []).find(x => x.value === v)
    return o ? o.label : (v || '-')
  }
  if (v === '' || v === null || v === undefined) return '-'
  return v
}

const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const saveMsg = ref('')
const saveMsgTimeout = ref(null)
const pendingDeletes = ref([])
const skillKeyEdits = reactive({})

// 词条中枢首页：点击词条 bar 内联展开编辑（手风琴，单开）—— 取代原「跳转/滚动到独立编辑面板」式样
const expandedKey = ref(null)
const toggleOverview = (key) => { expandedKey.value = expandedKey.value === key ? null : key }
// 展开的词条直接变为「编辑 & 保存」式样
const isEditing = (key) => expandedKey.value === key

// 词条搜索框：输入即筛选，点击结果跳转并展开对应词条
const searchText = ref('')
const showResults = ref(false)
const filteredSkills = computed(() => {
  const q = searchText.value.trim().toLowerCase()
  if (!q) return []
  return Object.entries(editableConfig.skills)
    .filter(([key, sk]) => {
      const hay = (key + ' ' + (sk.name || '') + ' ' + (sk.category || '') + ' ' + (sk.description || '')).toLowerCase()
      return hay.includes(q)
    })
    .slice(0, 12)
    .map(([key, sk]) => ({ key, skill: sk }))
})
function onSearchInput() { showResults.value = true }
function onSearchBlur() { setTimeout(() => { showResults.value = false }, 150) }
function onSearchEnter() {
  if (filteredSkills.value.length) onPickSearch(filteredSkills.value[0].key)
}
// 点击搜索结果：普通模式跳转展开；对比模式加入对比槽位
function onPickSearch(key) {
  if (compareMode.value) {
    pickForCompare(key)
  } else {
    jumpToSkill(key)
  }
  searchText.value = ''
  showResults.value = false
}
// 跳转并展开指定词条（展开后滚动进视图）
function jumpToSkill(key) {
  if (!editableConfig.skills[key]) return
  expandedKey.value = key
  nextTick(() => {
    const el = document.getElementById('skill-card-' + key)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

// 对比模式：勾选后可通过搜索或下拉菜单选取两个词条，并排编辑
const compareMode = ref(false)
const compareA = ref('')
const compareB = ref('')
const skillA = computed(() => (compareA.value ? editableConfig.skills[compareA.value] : null))
const skillB = computed(() => (compareB.value ? editableConfig.skills[compareB.value] : null))
// 对比表字段（核心 + 兼容/自动化，按字段定义驱动）
const compareFields = [
  { key: 'name', label: '名称 name', type: 'text' },
  { key: 'category', label: '分类 category', type: 'select', options: SKILL_CATEGORIES, labels: CATEGORY_LABELS },
  { key: 'description', label: '描述 description', type: 'text' },
  { key: 'target_scope', label: '施放对象 target_scope', type: 'select', options: TARGET_SCOPES, labels: TARGET_SCOPE_LABELS },
  { key: 'skill_shape', label: '技能形态 skill_shape', type: 'select', options: SKILL_SHAPES, labels: SKILL_SHAPE_LABELS },
  { key: 'damage_kind', label: '伤害种类 damage_kind', type: 'select', options: DAMAGE_KINDS, labels: DAMAGE_KIND_LABELS },
  { key: 'action_type', label: '动作类型 action_type', type: 'select', options: ACTION_TYPES, labels: ACTION_TYPE_LABELS },
  ...compatFieldDefs.map(d => ({ key: d.key, label: d.label, type: 'def', def: d })),
  ...automationFieldDefs.map(d => ({ key: d.key, label: d.label, type: 'def', def: d })),
]
function pickForCompare(key) {
  if (!compareA.value) compareA.value = key
  else if (!compareB.value) compareB.value = key
  else compareA.value = key // 两槽已满则替换 A
}
function onCompareToggle() {
  if (!compareMode.value) return
  nextTick(() => {
    const el = document.querySelector('.compare-panel')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}
function onCompareSelect() { /* v-model 已绑定 compareA / compareB */ }
function clearCompare() {
  compareA.value = ''
  compareB.value = ''
}

// Excel 导入（两步法）状态
const excelInput = ref(null)
const showExcelModal = ref(false)
const excelLoading = ref(false)
const excelPreview = ref({
  skills: {},
  counts: { new: 0, update: 0, total: 0 },
  warnings: [],
  errors: [],
})

const editableConfig = reactive({
  _meta: {},
  skills: {},
  systems: {}
})


// 获取系统参数 (过滤 label/description/deterministic)
function getSystemParams(sys) {
  const params = {}
  for (const [key, val] of Object.entries(sys)) {
    if (!['label', 'description', 'deterministic', 'deterministic_probability'].includes(key)) {
      params[key] = val
    }
  }
  return params
}

// 格式化系统参数值
function formatSystemValue(key, val) {
  if (key === 'chance') return Math.round(val * 100) + '%'
  if (key === 'damage_percent') return Math.round(val * 100) + '%'
  return val
}

// 切换效果标签
function toggleEffect(skill, effectValue) {
  if (!skill.status_effects) skill.status_effects = []
  const idx = skill.status_effects.indexOf(effectValue)
  if (idx >= 0) {
    skill.status_effects.splice(idx, 1)
  } else {
    skill.status_effects.push(effectValue)
  }
}


// 技能 KEY 编辑失焦时同步
function onSkillKeyBlur(oldKey) {
  const newKey = skillKeyEdits[oldKey]
  if (!newKey || newKey === oldKey || !editableConfig.skills[oldKey]) return
  if (editableConfig.skills[newKey] && newKey !== oldKey) {
    // key 冲突：回退
    skillKeyEdits[oldKey] = oldKey
    return
  }
  // 重命名 key
  editableConfig.skills[newKey] = editableConfig.skills[oldKey]
  delete editableConfig.skills[oldKey]
  delete skillKeyEdits[oldKey]
  skillKeyEdits[newKey] = newKey
}

// 添加新词条
function addNewSkill() {
  const timestamp = Date.now()
  const newKey = 'new_skill_' + timestamp
  editableConfig.skills[newKey] = hydrateSkill({
    key: newKey,
    name: '新词条',
    category: 'melee',
    target_scope: 'enemy',
    cast_range: { min: 1, max: 1 },
    skill_shape: 'single',
    damage_kind: 'kinetic',
    action_type: 'attack',
    has_dice: false,
    dice_type: 6,
    dice_branches: []
  })
  skillKeyEdits[newKey] = newKey
}

// 删除词条
function deleteSkill(key) {
  if (!confirm(`确认删除词条「${editableConfig.skills[key]?.name || editableConfig.skills[key]?.label || key}」？此操作需保存后生效。`)) return
  pendingDeletes.value.push(key)
  delete editableConfig.skills[key]
  delete skillKeyEdits[key]
}

// 加载配置
// ───────── 投骰多分支动态表单助手（Step 3） ─────────
function addBranch(skill) {
  if (!skill.dice_branches) skill.dice_branches = []
  skill.dice_branches.push({
    id: 'br_' + Math.random().toString(36).slice(2, 9),
    label: `判定${skill.dice_branches.length + 1}`,
    points: [],
    effects: []
  })
}
function removeBranch(skill, index) {
  if (skill.dice_branches) skill.dice_branches.splice(index, 1)
}
function addEffect(branch) {
  if (!branch.effects) branch.effects = []
  branch.effects.push({ action: 'damage', value: 0, status: null, target: 'enemy' })
}
function removeEffect(branch, index) {
  if (branch.effects) branch.effects.splice(index, 1)
}
function parsePointText(text) {
  const tokens = String(text || '').split(',').map(s => s.trim()).filter(Boolean)
  const points = []
  for (const t of tokens) {
    const m = t.match(/^\[(\d+)\s*,\s*(\d+)\]$/)
    if (m) {
      const a = Number(m[1]); const b = Number(m[2])
      points.push({ kind: 'range', min: Math.min(a, b), max: Math.max(a, b) })
    } else if (/^\d+$/.test(t)) {
      points.push({ kind: 'exact', value: Number(t) })
    }
  }
  return points
}
function pointText(branch) {
  return (branch.points || [])
    .map(p => (p.kind === 'range' ? `[${p.min},${p.max}]` : String(p.value)))
    .join(', ')
}
function setPointText(branch, text) {
  branch.points = parsePointText(text)
}

// ── Excel 导入（两步法）──
function isExistingSkill(key) {
  return !!editableConfig.skills[key]
}

function triggerExcelUpload() {
  excelInput.value?.click()
}

async function onExcelSelected(e) {
  const file = e.target.files && e.target.files[0]
  if (!file) return
  const fd = new FormData()
  fd.append('file', file)
  excelLoading.value = true
  try {
    const res = await glossaryAPI.importExcel(fd)
    excelPreview.value = res.data || excelPreview.value
    showExcelModal.value = true
  } catch (err) {
    saveMsg.value = '✗ Excel 解析失败: ' + (err.response?.data?.message || err.message)
    console.error('[Glossary] Excel 解析失败:', err)
  } finally {
    excelLoading.value = false
    if (e.target) e.target.value = ''
  }
}

async function confirmExcelImport() {
  if (excelPreview.value.errors && excelPreview.value.errors.length) return
  excelLoading.value = true
  try {
    const res = await glossaryAPI.importApply({
      skills: excelPreview.value.skills,
      _delete_skills: [],
    })
    saveMsg.value = `✓ 导入成功：新增/更新 ${res.data.applied?.length || 0} 条`
    showExcelModal.value = false
    await loadConfig()
    if (saveMsgTimeout.value) clearTimeout(saveMsgTimeout.value)
    saveMsgTimeout.value = setTimeout(() => { saveMsg.value = '' }, 5000)
  } catch (err) {
    saveMsg.value = '✗ 导入失败: ' + (err.response?.data?.message || err.message)
    console.error('[Glossary] Excel 导入失败:', err)
  } finally {
    excelLoading.value = false
  }
}

async function loadConfig() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await glossaryAPI.getConfig()
    const data = res.data
    const glossary = data.glossary || data // 柔性兼容 3006 网关 glossary 包裹层
    editableConfig._meta = { ...glossary._meta }
    editableConfig.skills = {}
    Object.entries(glossary.skills || {}).forEach(([k, sk]) => {
      editableConfig.skills[k] = hydrateSkill(sk)
    })
    editableConfig.systems = { ...glossary.systems }

    // 初始化 key 编辑缓存
    for (const key of Object.keys(glossary.skills || {})) {
      skillKeyEdits[key] = key
    }
    // 清空删除列表
    pendingDeletes.value = []
    loading.value = false
  } catch (e) {
    console.error('加载词条配置失败:', e)
    loadError.value = e.response?.data?.error || '无法连接到后端网关，请检查服务状态'
    loading.value = false
  }
}

// 保存配置
async function saveConfig() {
  saving.value = true
  saveMsg.value = ''
  try {
    const config = {
      _meta: {
        ...editableConfig._meta,
        date: new Date().toISOString().replace('T', ' ').substring(0, 19),
        generated_from: 'GlossaryView.vue 结构化 CRUD 编辑界面'
      },
      skills: Object.fromEntries(
        Object.entries(editableConfig.skills).map(([k, s]) => [k, serializeSkillToContract(s)])
      ),
      systems: { ...editableConfig.systems }
    }

    // 附加待删除列表
    if (pendingDeletes.value.length > 0) {
      config._delete_skills = [...pendingDeletes.value]
    }

    const res = (await glossaryAPI.saveConfig(config)).data
    saveMsg.value = '✓ ' + res.message

    // 清空待删除列表
    pendingDeletes.value = []

    // 保存成功后重新拉取确认同步
    await loadConfig()

    if (saveMsgTimeout.value) clearTimeout(saveMsgTimeout.value)
    saveMsgTimeout.value = setTimeout(() => { saveMsg.value = '' }, 5000)
  } catch (e) {
    console.error('保存配置失败:', e)
    saveMsg.value = '✗ 保存失败: ' + (e.response?.data?.error || e.message)
  } finally {
    saving.value = false
  }
}


// ===== Phase 11: 万能槽位分步创建向导 =====
const showWizard = ref(false)

// Phase 12: AI 技能导入
const showAiImport = ref(false)
const aiImportJson = ref('')
const aiImportResult = ref('')
const aiImportSuccess = ref(false)
const wizardStep = ref(1)
const wizardForm = reactive({
  _key: '',
  label: '新词条',
  action_type: 'attack',
  attack_stat: 'melee',
  category: 'melee',
  target_filter: 'enemy',
  cast_range: 1,
  min_cast_range: 0,
  aoe_radius: 0,
  damage_kind: 'kinetic',
  height_bonus_per_diff: 0,
  dice_type: '1d6',
  success_line: 4,
  success_bonus_damage: 0,
  is_manual_roll: false,
  accuracy_mod: 0,
  evasion_mod: 0,
  base_damage: 0,
  status_effects_str: '',
  requires_unmoved: false,
  requires_stealth: false,
  requires_hp_below: 0,
  target_on_terrain: '',
  description: '',
  deterministic: true,
  has_dice: false,
  dice_branches: []
})

const wizardStepLabel = computed(() => {
  const labels = { 1: '主语 Subject', 2: '谓语 Predicate', 3: '定语 Attribute', 4: '状语 Adverbial', 5: '补语 Complement', 6: '确认 Review' }
  return labels[wizardStep.value] || ''
})

function toggleWizard() {
  showWizard.value = !showWizard.value
  wizardStep.value = 1
  const now = Date.now()
  Object.assign(wizardForm, {
    _key: 'new_skill_' + now,
    label: '新词条',
    action_type: 'attack',
    attack_stat: 'melee',
    category: 'melee',
    target_filter: 'enemy',
    cast_range: 1,
    min_cast_range: 0,
    aoe_radius: 0,
    range_type: 'radial',
    beam_width: 1,
    damage_kind: 'kinetic',
    height_bonus_per_diff: 0,
    dice_type: '1d6',
    success_line: 4,
    success_bonus_damage: 0,
    is_manual_roll: false,
    accuracy_mod: 0,
    evasion_mod: 0,
    base_damage: 0,
    status_effects_str: '',
    requires_unmoved: false,
    requires_stealth: false,
    requires_hp_below: 0,
    target_on_terrain: '',
    description: '',
    deterministic: true,
    has_dice: false,
    dice_branches: []
  })
}

function commitWizardSkill() {
  const key = wizardForm._key || 'new_skill_' + Date.now()
  const statusEffects = wizardForm.status_effects_str
    ? wizardForm.status_effects_str.split(',').map(s => s.trim()).filter(Boolean)
    : []
  const wizardRaw = {
    key: key,
    name: wizardForm.label || '新词条',
    category: wizardForm.category,
    target_filter: wizardForm.target_filter,
    cast_range: wizardForm.cast_range,
    min_cast_range: wizardForm.min_cast_range,
    aoe_radius: wizardForm.aoe_radius,
    range_type: wizardForm.range_type || 'radial',
    beam_width: wizardForm.range_type === 'directional_beam' ? (wizardForm.beam_width || 1) : 0,
    base_damage: wizardForm.base_damage,
    status_effects: statusEffects,
    deterministic: wizardForm.deterministic,
    damage_kind: wizardForm.damage_kind,
    accuracy_mod: wizardForm.accuracy_mod,
    evasion_mod: wizardForm.evasion_mod,
    height_bonus_per_diff: wizardForm.height_bonus_per_diff,
    action_type: wizardForm.action_type,
    attack_stat: wizardForm.attack_stat,
    requires_unmoved: wizardForm.requires_unmoved,
    requires_stealth: wizardForm.requires_stealth,
    requires_hp_below: wizardForm.requires_hp_below || 0,
    target_on_terrain: wizardForm.target_on_terrain || '',
    dice_type: wizardForm.dice_type,
    success_line: wizardForm.success_line,
    success_bonus_damage: wizardForm.success_bonus_damage,
    is_manual_roll: wizardForm.is_manual_roll,
    has_dice: wizardForm.has_dice,
    dice_branches: wizardForm.has_dice
      ? wizardForm.dice_branches
          .map(b => ({
            points: parseWizardPoints(b.pointsStr),
            effects: (b.effects || []).map(e => ({ action: e.action, value: Number(e.value) || 0, status: e.status || null }))
          }))
          .filter(b => b.points.length && b.effects.length)
      : []
  }
  editableConfig.skills[key] = hydrateSkill(wizardRaw)
  skillKeyEdits[key] = key
  showWizard.value = false
  alert(`词条「${editableConfig.skills[key].name}」已创建！请保存以同步规则。`)
}

function addWizardBranch() {
  wizardForm.dice_branches.push({ pointsStr: '', effects: [{ action: 'damage', value: 0, status: '' }] })
}

// 将向导输入的点数字符串解析为 points 数组（支持逗号分隔与区间 -）
function parseWizardPoints(str) {
  if (!str) return []
  const out = []
  String(str).split(',').forEach(part => {
    const t = part.trim()
    if (!t) return
    if (t.includes('-')) {
      const [a, b] = t.split('-').map(n => parseInt(n, 10))
      if (!isNaN(a) && !isNaN(b)) out.push([Math.min(a, b), Math.max(a, b)])
    } else {
      const n = parseInt(t, 10)
      if (!isNaN(n)) out.push(n)
    }
  })
  return out
}

function scrollToSkill(key) {
  const el = document.getElementById('skill-card-' + key)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function toggleAiImport() {
  showAiImport.value = !showAiImport.value
  aiImportResult.value = ''
  aiImportJson.value = ''
}

async function importAiSkills() {
  aiImportResult.value = ''
  if (!aiImportJson.value.trim()) {
    aiImportResult.value = '请粘贴技能 JSON'
    aiImportSuccess.value = false
    return
  }
  try {
    let skills = JSON.parse(aiImportJson.value)
    if (!Array.isArray(skills)) skills = [skills]

    const config = JSON.parse(JSON.stringify(skillsData.value))
    let imported = 0
    let skipped = 0

    for (const skill of skills) {
      if (!skill.id || !skill.name) {
        skipped++
        continue
      }
      // 标准化万能语法字段
      const normalized = {
        id: skill.id,
        name: skill.name,
        label: skill.label || skill.name,
        description: skill.description || '',
        category: skill.category || skill.action_type || 'attack',
        base_damage: skill.base_damage ?? 0,
        cast_range: skill.cast_range ?? 1,
        min_cast_range: skill.min_cast_range ?? 0,
        aoe_radius: skill.aoe_radius ?? 0,
        target_filter: skill.target_filter || 'enemy',
        action_type: skill.action_type || 'attack',
        attack_stat: skill.attack_stat || 'melee',
        damage_kind: skill.damage_kind || 'kinetic',
        dice_type: skill.dice_type || '1d6',
        success_line: skill.success_line ?? 4,
        success_bonus_damage: skill.success_bonus_damage ?? 0,
        is_manual_roll: skill.is_manual_roll ?? false,
        height_bonus_per_diff: skill.height_bonus_per_diff ?? 0,
        accuracy_mod: skill.accuracy_mod ?? 0,
        evasion_mod: skill.evasion_mod ?? 0,
        requires_unmoved: skill.requires_unmoved ?? false,
        requires_stealth: skill.requires_stealth ?? false,
        status_effects: skill.status_effects || [],
        bonuses: skill.bonuses || [],
        damage_kind_modifiers: skill.damage_kind_modifiers || {}
      }

      if (config.skills[skill.id]) {
        if (!confirm(`技能 "${skill.name}" (${skill.id}) 已存在，是否覆盖？`)) {
          skipped++
          continue
        }
      }
      config.skills[skill.id] = normalized
      imported++
    }

    if (imported > 0) {
      await saveConfig(config)
      skillsData.value = config
      aiImportResult.value = `成功导入 ${imported} 个技能${skipped > 0 ? '，跳过 ' + skipped + ' 个' : ''}`
      aiImportSuccess.value = true
      aiImportJson.value = ''
      setTimeout(() => { aiImportResult.value = ''; showAiImport.value = false }, 2000)
    } else {
      aiImportResult.value = '没有可导入的技能（' + skipped + ' 个被跳过）'
      aiImportSuccess.value = false
    }
  } catch (e) {
    aiImportResult.value = 'JSON 解析失败: ' + e.message
    aiImportSuccess.value = false
  }
}

onMounted(() => {
  loadConfig()
})
</script>

<style scoped>
* { box-sizing: border-box; }
.page-container {
  background: #001620; font-family: 'Fira Code', 'Courier New', monospace;
  color: #c1e8ff;
}
.page-content {
  flex: 1; overflow-y: auto;
}

.page-header { padding: 24px 32px 16px; border-bottom: 1px solid rgba(159,142,120,0.15); }
.page-header h1 { margin: 0 0 8px; font-size: 18px; font-weight: 700; color: #ffb000; letter-spacing: 2px; }
.header-meta { font-size: 10px; color: rgba(193,232,255,0.4); display: flex; align-items: center; gap: 8px; }
.sep { color: rgba(255,176,0,0.2); }
.dot-live { width: 6px; height: 6px; background: #13ff43; border-radius: 50%; display: inline-block; margin-right: 4px; }
.meta-version { color: rgba(255,176,0,0.5); }

.action-bar { display: flex; flex-direction: column; gap: 10px; padding: 16px 32px; border-bottom: 1px solid rgba(159,142,120,0.1); }
.action-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.action-row-compare { justify-content: space-between; }
.action-spacer { flex: 1 1 auto; }
.btn {
  padding: 8px 16px; font-size: 11px; font-weight: 700; letter-spacing: 1px;
  border: 1px solid rgba(159,142,120,0.25); background: rgba(0,0,0,0.2);
  color: #c1e8ff; cursor: pointer; transition: all 0.2s; font-family: inherit;
}
.btn:hover { border-color: rgba(255,176,0,0.4); color: #ffd597; }
.btn.active { background: rgba(255,176,0,0.1); border-color: #ffb000; color: #ffb000; }
.btn-add { border-color: rgba(0,180,220,0.3); color: #00b4dc; }
.btn-add:hover { border-color: #00b4dc; background: rgba(0,180,220,0.1); }
.btn-save { background: linear-gradient(90deg, #ffb000, #ff8c00); border-color: #ffb000; color: #1a1a1a; font-weight: 700; }
.btn-save:hover:not(:disabled) { background: linear-gradient(90deg, #ffc233, #ffa033); border-color: #ffb000; }
.btn-save:disabled { opacity: 0.4; cursor: not-allowed; filter: grayscale(0.3); }
.btn-delete { border-color: rgba(255,82,82,0.3); color: #ff5252; padding: 4px 12px; font-size: 11px; }
.btn-delete:hover { border-color: #ff5252; background: rgba(255,82,82,0.15); }
.btn-reload { border-color: rgba(0,180,220,0.25); }
/* Excel 导入 / AI 导入 主按钮 —— 之前依赖 NewUnitEditorView 的全局 .btn-primary/.btn-ghost，
   但本组件 scoped 样式下未定义，导致按钮仅有基础 .btn 样式、无主/次视觉区分。现补齐。 */
.btn-primary { border-color: #ffb000; color: #1a1a1a; background: linear-gradient(90deg, #ffb000, #ff8c00); font-weight: 700; }
.btn-primary:hover:not(:disabled) { background: linear-gradient(90deg, #ffc233, #ffa033); border-color: #ffb000; }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; filter: grayscale(0.3); }
.btn-ghost { border-color: rgba(159,142,120,0.35); color: #c9bda5; background: transparent; }
.btn-ghost:hover:not(:disabled) { background: rgba(159,142,120,0.08); border-color: rgba(159,142,120,0.55); color: #e2d8c2; }
.save-msg { font-size: 11px; color: #13ff43; letter-spacing: 1px; }
.delete-hint { font-size: 10px; color: #ff5252; letter-spacing: 1px; }

.loading-state, .error-state { text-align: center; padding: 80px 20px; }
.loading-state p { color: rgba(193,232,255,0.5); font-size: 14px; margin: 8px 0; }
.loading-hint { font-size: 11px; color: rgba(193,232,255,0.2); }
.error-msg { color: #ff5252; font-size: 14px; }
.error-state .btn { margin-top: 16px; }

.glossary-panels { flex: 1; overflow-y: auto; padding: 24px 32px; }
.panel { border: 1px solid rgba(159,142,120,0.12); margin-bottom: 24px; background: rgba(0,0,0,0.1); }
.panel-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid rgba(159,142,120,0.1); }
.panel-header h2 { margin: 0; font-size: 14px; font-weight: 700; color: #ffb000; letter-spacing: 1px; }
.panel-badge { font-size: 9px; padding: 2px 10px; background: rgba(19,255,67,0.06); border: 1px solid rgba(19,255,67,0.2); color: rgba(19,255,67,0.6); letter-spacing: 1px; }
.panel-body { padding: 12px 20px 20px; }
/* 词条中枢首页 · 总览列表 */
.overview-list { display: flex; flex-direction: column; gap: 6px; }
.overview-item {
  display: flex; align-items: center; gap: 12px;
  width: 100%; text-align: left; cursor: pointer;
  padding: 8px 12px; background: rgba(0,0,0,0.2);
  border: 1px solid rgba(159,142,120,0.12);
  color: #c1e8ff; font-size: 12px; font-family: monospace;
}
.overview-item:hover { border-color: rgba(255,176,0,0.4); background: rgba(255,176,0,0.06); }
.ov-key { color: #ffb000; font-weight: 700; min-width: 120px; }
.ov-name { color: #c1e8ff; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ov-cat { font-size: 10px; padding: 2px 8px; border-radius: 2px; background: rgba(159,142,120,0.15); color: #9f8e78; }
.ov-dice { font-size: 11px; color: #13ff43; }
.ov-chevron { margin-left: 4px; color: #ffb000; font-size: 11px; flex: 0 0 auto; transition: transform .15s; }
/* 词条 bar 内联展开容器（手风琴）：展开后整页自然滚动，不拦截页面滚动 */
.overview-item-wrap { border-radius: 4px; }
.overview-item-wrap.ov-expanded > .overview-item { border-color: #ffb000; background: rgba(255,176,0,0.1); }
.overview-item-wrap.ov-expanded .ov-chevron { transform: rotate(180deg); }
.ov-detail { padding: 12px 14px 16px; margin: 2px 0 8px; background: rgba(0,0,0,0.28); border: 1px solid rgba(255,176,0,0.22); border-radius: 0 0 4px 4px; }
.ov-detail .skill-card { border: none; background: transparent; padding: 0; }
.ov-detail .skill-card-header { padding: 4px 0 12px; border-bottom: 1px solid rgba(255,176,0,0.12); margin-bottom: 12px; }
.ov-detail-actions { display: flex; gap: 10px; margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(159,142,120,0.15); }

.empty-state { text-align: center; padding: 40px; color: rgba(193,232,255,0.3); font-size: 12px; }

/* 词条卡片 */
.skill-card { border: 1px solid rgba(159,142,120,0.1); margin-bottom: 16px; padding: 16px; background: rgba(0,0,0,0.15); transition: all 0.2s; }
.skill-card:hover { border-color: rgba(255,176,0,0.15); }
.skill-card.deleted-card { opacity: 0.35; border-color: rgba(255,82,82,0.2); }
.skill-card-header { display: flex; align-items: flex-end; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
.skill-id-group, .skill-label-group, .skill-category-group { display: flex; flex-direction: column; gap: 2px; }
.skill-id-label { font-size: 9px; color: rgba(193,232,255,0.35); letter-spacing: 1px; text-transform: uppercase; }
.skill-id-input { width: 140px; padding: 4px 8px; font-size: 12px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,176,0,0.3); color: #ffd597; font-family: inherit; outline: none; }
.skill-id-input:focus { border-color: #ffb000; }
.skill-id-value { font-size: 13px; font-weight: 700; color: #ffb000; letter-spacing: 1px; }
.skill-label-input { width: 160px; padding: 4px 8px; font-size: 12px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,176,0,0.3); color: #ffd597; font-family: inherit; outline: none; }
.skill-label-value { font-size: 13px; color: #ffd597; }

/* 描述 */
.skill-desc-row { margin-bottom: 12px; display: flex; flex-direction: column; gap: 4px; }
.skill-desc-input { width: 100%; padding: 6px 8px; font-size: 11px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,176,0,0.2); color: #c1e8ff; font-family: inherit; resize: vertical; outline: none; }
.skill-desc-input:focus { border-color: #ffb000; }
.skill-desc-text { font-size: 11px; color: rgba(193,232,255,0.5); font-style: italic; }

/* 通用字段 */
.universal-fields { margin-bottom: 8px; }
.uf-row { display: flex; gap: 12px; margin-bottom: 6px; flex-wrap: wrap; }

/* 状态效果标签 */
.status-effects-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.status-tag {
  padding: 3px 10px; font-size: 10px; border: 1px solid rgba(159,142,120,0.2);
  color: rgba(193,232,255,0.5); cursor: pointer; transition: all 0.15s;
  display: flex; align-items: center; gap: 4px; user-select: none;
}
.status-tag:hover { border-color: rgba(255,176,0,0.3); color: #ffb000; }
.status-tag.active { border-color: #ffb000; background: rgba(255,176,0,0.1); color: #ffb000; }
.status-checkbox { display: none; }

/* 骰子属性区域 */
.dice-fields { margin-top: 8px; padding-top: 10px; border-top: 1px solid rgba(255,176,0,0.1); }
.dice-section-label {
  font-size: 9px; color: rgba(255,176,0,0.4); letter-spacing: 2px;
  margin-bottom: 6px; text-transform: uppercase;
}

/* Phase 10 属性分流插槽 */
.phase10-fields { margin-top: 8px; padding-top: 10px; border-top: 1px solid rgba(0,180,220,0.15); }
.phase10-label { color: rgba(0,180,220,0.5) !important; }

/* 系统参数 */
.system-card { border: 1px solid rgba(159,142,120,0.08); margin-bottom: 10px; padding: 12px; background: rgba(0,0,0,0.1); }
.system-label { font-size: 12px; font-weight: 700; color: #ffd597; margin-bottom: 8px; letter-spacing: 1px; }
.system-params { display: flex; flex-wrap: wrap; gap: 8px; }

.panel-meta .meta-body { font-size: 10px; color: rgba(193,232,255,0.35); display: flex; flex-wrap: wrap; gap: 24px; line-height: 1.8; }

/* Phase 11: 万能槽位分步创建向导 */
.wizard-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center;
  z-index: 9999; backdrop-filter: blur(4px);
}
.wizard-panel {
  background: #001620; border: 1px solid rgba(255,176,0,0.3);
  border-radius: 4px; width: 520px; max-height: 85vh;
  display: flex; flex-direction: column;
  box-shadow: 0 0 40px rgba(255,176,0,0.08);
}
.wizard-header {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 18px; border-bottom: 1px solid rgba(159,142,120,0.1);
}
.wizard-header h2 { margin: 0; font-size: 15px; color: #ffb000; letter-spacing: 2px; }
.wizard-step-indicator { font-size: 10px; color: rgba(0,180,220,0.7); margin-left: auto; }
.wizard-body { padding: 16px; overflow-y: auto; flex: 1; }
.wizard-desc { font-size: 11px; color: rgba(193,232,255,0.45); margin-bottom: 12px; }
.wiz-field { margin-bottom: 10px; }
.wiz-field label { display: block; font-size: 9px; color: rgba(255,176,0,0.55); margin-bottom: 3px; letter-spacing: 1px; text-transform: uppercase; }
.wiz-field select, .wiz-input {
  width: 100%; padding: 5px 8px; background: rgba(0,0,0,0.3);
  border: 1px solid rgba(255,176,0,0.25); color: #ffd597;
  font-family: inherit; font-size: 12px; outline: none;
}
.wiz-field select:focus, .wiz-input:focus { border-color: #ffb000; box-shadow: 0 0 0 2px rgba(255,176,0,0.15); outline: none; }
.wiz-hint { display: block; font-size: 9px; color: rgba(193,232,255,0.25); margin-top: 1px; }
.wiz-check { margin-bottom: 8px; color: #c1e8ff; font-size: 12px; }
.wiz-check input { margin-right: 5px; }
.wiz-sep { border: none; border-top: 1px dashed rgba(159,142,120,0.2); margin: 14px 0 10px; }
.wiz-branches { margin-top: 6px; display: flex; flex-direction: column; gap: 12px; }
.wiz-branch { border: 1px solid rgba(19,255,67,0.2); background: rgba(19,255,67,0.03); padding: 10px; }
.wiz-branch-head { display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: #13ff43; margin-bottom: 8px; }
.wiz-effects { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
.wiz-effects select { width: auto; min-width: 120px; }
.wiz-effects input[type="number"] { width: 80px; }
.wiz-effects input[type="text"] { width: 130px; }
.wiz-x { background: rgba(255,64,64,0.15); color: #ff6b6b; border: 1px solid rgba(255,64,64,0.3); padding: 3px 8px; cursor: pointer; font-size: 10px; }
.wiz-add { background: rgba(19,255,67,0.1); color: #13ff43; border: 1px solid rgba(19,255,67,0.25); padding: 4px 10px; cursor: pointer; font-size: 11px; margin-top: 4px; }
.wiz-preview { background: rgba(0,0,0,0.2); border: 1px solid rgba(159,142,120,0.1); padding: 10px; }
.wiz-preview-line { font-size: 11px; color: #c1e8ff; margin-bottom: 5px; }
.wizard-footer {
  display: flex; gap: 6px; padding: 10px 18px;
  border-top: 1px solid rgba(159,142,120,0.1); justify-content: space-between;
}

/* Phase 12: AI 导入样式 */
.btn-ai-import {
  background: rgba(147, 112, 219, 0.15);
  border: 1px solid rgba(147, 112, 219, 0.25);
  color: #d4b8ff;
}
.btn-ai-import:hover {
  background: rgba(147, 112, 219, 0.25);
  border-color: rgba(147, 112, 219, 0.4);
}
.ai-import-panel { max-width: 540px; }
.ai-import-textarea {
  width: 100%;
  padding: 10px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 176, 0, 0.22);
  color: #c1e8ff;
  font-family: 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.5;
  resize: vertical;
  margin-bottom: 12px;
  border-radius: 4px;
}
.ai-import-textarea:focus {
  border-color: rgba(147, 112, 219, 0.4);
  outline: none;
}
.ai-import-textarea::placeholder { color: rgba(193, 232, 255, 0.25); }
.ai-import-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.import-success { color: #4caf50; font-size: 12px; margin-top: 8px; }
.import-error { color: #f44336; font-size: 12px; margin-top: 8px; }
/* ===== Step 2/3 结构化三区块 + 投骰多分支 ===== */
.skill-key-badge {
  font-size: 11px; font-weight: 700; color: #ffb000; letter-spacing: 1px;
  padding: 2px 10px; background: rgba(255,176,0,0.08); border: 1px solid rgba(255,176,0,0.25);
  font-family: inherit;
}
.skill-name-badge {
  font-size: 13px; font-weight: 600; color: #c1e8ff; font-family: inherit; flex: 1;
}

.edit-block {
  border: 1px solid rgba(159,142,120,0.12);
  margin-top: 12px; background: rgba(0,0,0,0.12);
}
.block-title {
  font-size: 12px; font-weight: 700; color: #ffb000; letter-spacing: 1px;
  padding: 8px 14px; border-bottom: 1px solid rgba(159,142,120,0.1);
  background: rgba(255,176,0,0.06); cursor: default;
}
/* 词条详细参数区：对齐「词条对比」框的网格排版（键列 | 值列 + 行分隔 + 暖色输入） */
.block-body {
  display: block; padding: 0; gap: 0;
  border: 1px solid rgba(159,142,120,0.18); border-radius: 6px;
  overflow: hidden; margin: 4px 0 12px;
}
.block-row { display: block; }
.param-hint { flex: 0 0 100% !important; width: 100% !important; margin: 0 0 10px 0 !important; padding: 0 12px 8px; color: #7fb3d5 !important; text-align: left; display: flex; align-items: center; min-height: 18px; }
.block-row .param-row { flex: none; min-width: auto; }
.block-row .param-key { min-width: auto; }
.compat-slot {
  margin-top: 8px; padding: 0 14px 12px; border-top: 1px dashed rgba(159,142,120,0.1);
}
/* 兼容插槽内的嵌套 .block-body 不再加外层边框，避免双重框线 */
.compat-slot .block-body { border: none; border-radius: 0; overflow: visible; margin: 6px 0 10px; }
.compat-slot summary {
  font-size: 10px; color: rgba(180,220,255,0.7); cursor: pointer; letter-spacing: 1px;
  padding: 8px 0; user-select: none;
}
.compat-slot summary:hover { color: #ffb000; }

.param-row {
  display: grid; grid-template-columns: 1.1fr 1fr; align-items: center; gap: 0;
  min-width: auto; padding: 0 12px; border-bottom: 1px solid rgba(159,142,120,0.12);
}
.param-row:last-child { border-bottom: none; }
.param-row-wide { min-width: 100%; }
.param-key {
  font-size: 11px; color: #c9bda5; font-weight: 600; letter-spacing: 0.5px;
  text-transform: none; background: rgba(0,0,0,0.22);
  align-self: stretch; display: flex; align-items: center; padding: 8px 12px 8px 0;
}
.param-input, .param-select {
  width: 100%; padding: 5px 8px; font-size: 13px;
  background: rgba(0,0,0,0.35); color: #ffd597;
  border: 1px solid rgba(255,176,0,0.22); border-radius: 4px;
  font-family: inherit; outline: none;
}
.param-input:focus, .param-select:focus { border-color: #ffb000; box-shadow: 0 0 0 2px rgba(255,176,0,0.15); }
.param-text { min-width: 160px; }
.param-num { max-width: 96px; width: 100%; }
.range-inputs { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: #94a3b8; }
.range-inputs .param-num { max-width: 80px; }
.point-text { min-width: 200px; }
.param-value { font-size: 13px; color: #e2d8c2; }

.has-dice-row { display: flex; flex-direction: row; align-items: center; gap: 10px; min-width: auto; padding: 8px 12px; border-bottom: 1px solid rgba(159,142,120,0.12); }
.has-dice-row input[type="checkbox"] { width: 16px; height: 16px; accent-color: #ffb000; }

.dice-branch-zone { width: 100%; border-top: 1px dashed rgba(255,176,0,0.2); margin-top: 10px; padding-top: 10px; }
.legacy-dice-zone { width: 100%; }
.branches-list { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; padding-left: 4px; }
.branch-card {
  border: 1px solid rgba(255,176,0,0.2); background: rgba(255,176,0,0.03);
  padding: 10px 12px;
}
.branch-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.branch-title { font-size: 12px; font-weight: 700; color: #ffb000; letter-spacing: 1px; }
.branch-sub { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.branch-sub-label {
  font-size: 9px; color: rgba(193,232,255,0.45); letter-spacing: 1px; text-transform: uppercase;
  padding-top: 5px; min-width: 64px;
}
.effect-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
.effect-action { min-width: 120px; }
.btn-mini { padding: 2px 10px; font-size: 10px; letter-spacing: 0; }

/* ── Excel 上传按钮 ── */
.btn-upload {
  border-color: rgba(56, 189, 248, 0.5);
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.08);
  transition: all 0.2s ease;
}
.btn-upload:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.18);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.4);
}
.btn-upload:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Excel 导入预览模态框 ── */
.excel-overlay {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.78);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  backdrop-filter: blur(4px);
}
.excel-modal {
  width: min(640px, 92vw);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(160deg, #11203a 0%, #0b1426 100%);
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 12px;
  box-shadow: 0 0 40px rgba(56, 189, 248, 0.15);
  overflow: hidden;
}
.excel-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid rgba(56, 189, 248, 0.2);
}
.excel-modal-header h3 { margin: 0; font-size: 15px; color: #e2f4ff; letter-spacing: 1px; }
.excel-close {
  background: transparent; border: none; color: #94a3b8; font-size: 16px; cursor: pointer;
}
.excel-close:hover { color: #ef4444; }

.excel-counts { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 20px; }
.count-badge {
  font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 999px;
  border: 1px solid transparent;
}
.badge-new { color: #22c55e; border-color: rgba(34,197,94,0.4); background: rgba(34,197,94,0.1); }
.badge-update { color: #38bdf8; border-color: rgba(56,189,248,0.4); background: rgba(56,189,248,0.1); }
.badge-total { color: #94a3b8; border-color: rgba(148,163,184,0.3); background: rgba(148,163,184,0.08); }
.badge-error { color: #ef4444; border-color: rgba(239,68,68,0.5); background: rgba(239,68,68,0.12); }

.excel-block { padding: 8px 20px; max-height: 180px; overflow-y: auto; }
.excel-block-title { font-size: 12px; font-weight: 700; margin-bottom: 6px; }
.err-title { color: #ef4444; }
.warn-title { color: #f59e0b; }
.excel-line { font-size: 12px; padding: 3px 0; line-height: 1.5; }
.err-line { color: #fca5a5; }
.warn-line { color: #fcd34d; }

.excel-list-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 8px 20px;
  border-top: 1px solid rgba(56, 189, 248, 0.12);
  margin-top: 4px;
}
.excel-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; margin-bottom: 6px; border-radius: 8px;
  border-left: 3px solid transparent;
  background: rgba(255,255,255,0.02);
  transition: background 0.15s ease;
}
.excel-row:hover { background: rgba(56,189,248,0.06); }
.row-new { border-left-color: #22c55e; }
.row-update { border-left-color: #38bdf8; }
.excel-tag {
  font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px;
}
.tag-new { color: #22c55e; background: rgba(34,197,94,0.12); }
.tag-update { color: #38bdf8; background: rgba(56,189,248,0.12); }
.excel-key { font-family: monospace; font-size: 12px; color: #cbd5e1; min-width: 90px; }
.excel-name { flex: 1; font-size: 13px; color: #e2e8f0; }
.excel-cat { font-size: 11px; color: #94a3b8; }

.excel-modal-footer {
  display: flex; justify-content: flex-end; gap: 12px;
  padding: 14px 20px; border-top: 1px solid rgba(56, 189, 248, 0.2);
}
.excel-modal-footer .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

/* ===== 词条搜索框（替换原「编辑模式」按钮） ===== */
.search-box { position: relative; display: inline-block; }
.glossary-search {
  width: calc(280px - 4ch);
  max-width: 42vw;
  padding: 7px 11px;
  background: rgba(0,0,0,0.35);
  color: #ffd597;
  border: 1px solid rgba(255,176,0,0.25);
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color .15s, box-shadow .15s;
}
.glossary-search::placeholder { color: rgba(255,213,151,0.4); }
.glossary-search:focus {
  border-color: #ffb000;
  box-shadow: 0 0 0 2px rgba(255,176,0,0.15);
}
.search-results {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 50;
  min-width: 280px;
  max-height: 320px;
  overflow-y: auto;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: rgba(20,18,14,0.98);
  border: 1px solid rgba(255,176,0,0.3);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
}
.search-results li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.search-results li:hover { background: rgba(255,176,0,0.12); }
.search-results li.cmp-a { background: rgba(56,189,248,0.14); }
.search-results li.cmp-b { background: rgba(168,85,247,0.14); }
.search-results .sr-key { font-family: monospace; color: #ffb000; font-weight: 700; }
.search-results .sr-name { color: #e2d8c2; flex: 1; }
.search-results .sr-cat { font-size: 11px; color: #94a3b8; }
.search-no { padding: 10px; text-align: center; color: #94a3b8; font-size: 12px; }

/* ===== 对比模式勾选 ===== */
.compare-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 1px solid rgba(159,142,120,0.35);
  border-radius: 4px;
  color: #c9bda5;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
  transition: all .15s;
}
.compare-toggle:hover { border-color: rgba(159,142,120,0.55); color: #e2d8c2; }
.compare-toggle.active {
  border-color: #38bdf8;
  color: #38bdf8;
  background: rgba(56,189,248,0.1);
}
.compare-toggle input { accent-color: #38bdf8; cursor: pointer; }
.compare-select {
  padding: 7px 10px;
  background: rgba(0,0,0,0.35);
  color: #ffd597;
  border: 1px solid rgba(255,176,0,0.25);
  border-radius: 4px;
  font-size: 13px;
  max-width: 200px;
  outline: none;
}
.compare-select:focus { border-color: #ffb000; }

/* ===== 对比面板：双列并排 ===== */
.compare-grid {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(159,142,120,0.18);
  border-radius: 6px;
  overflow: hidden;
}
.cmp-row {
  display: grid;
  grid-template-columns: 1.1fr 1fr 1fr;
  border-bottom: 1px solid rgba(159,142,120,0.12);
}
.cmp-row:last-child { border-bottom: none; }
.cmp-cell {
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  border-right: 1px solid rgba(159,142,120,0.1);
}
.cmp-cell:last-child { border-right: none; }
.cmp-key {
  color: #c9bda5;
  font-weight: 600;
  background: rgba(0,0,0,0.22);
}
.cmp-head { background: rgba(255,176,0,0.08); }
.cmp-head .cmp-key { color: #ffb000; }
.cmp-av { color: #38bdf8; font-weight: 700; }
.cmp-bv { color: #a855f7; font-weight: 700; }
.cmp-cat { font-size: 11px; color: #94a3b8; font-weight: 400; }
.cmp-val { color: #e2d8c2; }
.cmp-section { background: rgba(0,0,0,0.18); }
.cmp-input {
  width: 100%;
  padding: 5px 8px;
  background: rgba(0,0,0,0.35);
  color: #ffd597;
  border: 1px solid rgba(255,176,0,0.22);
  border-radius: 4px;
  font-size: 13px;
  outline: none;
}
.cmp-input:focus { border-color: #ffb000; }
.cmp-num { max-width: 90px; }
.cmp-json { font-family: monospace; font-size: 11px; }
.range-inputs { display: inline-flex; align-items: center; gap: 4px; color: #94a3b8; }
</style>
