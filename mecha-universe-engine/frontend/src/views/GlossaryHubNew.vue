<template>
  <div class="gh-studio">
    <!-- 批次3.3 字段跳转气泡：从某原子字段跳入画布编辑时顶部提示 -->
    <transition name="toast-pop">
      <div v-if="jumpField" class="jump-toast">
        <span class="jt-dot">🎯</span>
        <span class="jt-text">正在编辑「{{ jumpField.atom.label }}」的 <b>{{ jumpField.toast }}</b> 字段 — 在画布上绘制后点「保存并返回」<span class="en-sub">Editing field — draw on canvas then "Save & Return"</span></span>
        <button class="jt-save" @click="saveJumpAndReturn">保存并返回<span class="en-sub">Save & Return</span></button>
        <button class="jt-cancel" @click="cancelJump">取消<span class="en-sub">Cancel</span></button>
      </div>
    </transition>
    <!-- 三栏布局：左(词条列表+只读浮层E) | 中(画布B+字段表单D) | 右(原子面板C) -->
    <div class="studio-3col">
      <!-- 左栏：词条列表（不动）+ 并入的 E 浮层（当前词条只读属性） -->
      <aside class="studio-left">
        <div class="studio-skill-panel">
          <SkillListPanel :skills="skills" :selected-key="selectedKey" :active-cat="activeCat" :core-keys="coreKeys" :dirty-keys="dirtyKeys" @select="onSelect" @create="createSkill" @update:activeCat="v => activeCat = v" />
        </div>
        <!-- e. 词条属性只读卡（原浮层，现并入左栏底部） -->
        <div class="entry-float">
          <h3>E · 当前词条属性（只读）<span class="en-sub">E · Current Entry Properties (Read-only)</span></h3>
          <div class="entry-card" v-if="draft">
            <div class="ec-row"><label>名称<span class="en-sub">Name</span></label><input v-if="editing" v-model="draft.name" class="ec-name-input" placeholder="词条名称" /><span v-else class="ec-val">{{ draft.name || draft.label || selectedKey }}</span></div>
            <div class="ec-row"><label>Key</label><span class="ec-val">{{ selectedKey }}</span></div>
            <div class="ec-row"><label>分类<span class="en-sub">Category</span></label><span class="ec-val">{{ draft.category || draft.action_type || '—' }}</span></div>
            <div class="ec-row"><label>射程<span class="en-sub">Range</span></label><span class="ec-val">{{ rangeSummary }}</span></div>
            <template v-if="draft.timing">
              <div class="ec-phase">WHEN 时机<span class="en-sub">WHEN Timing</span></div>
              <span class="ec-chip">{{ (draft.timing && (draft.timing.trigger || draft.timing.type)) || 'none' }}</span>
            </template>
            <div class="ec-phase">ROLL 掷骰<span class="en-sub">ROLL Dice</span></div>
            <span class="ec-chip">{{ (draft.roll && draft.roll.mode) || 'none' }}</span>
            <div class="ec-phase">DO 目标解析<span class="en-sub">DO Target Resolve</span></div>
            <span class="ec-chip">{{ (draft.target && draft.target.type) || '—' }}</span>
            <div class="ec-phase">DO 效果<span class="en-sub">DO Effect</span></div>
            <span v-if="!draft.effects || !draft.effects.length" class="ec-chip" style="opacity:.5">（空）</span>
            <span v-for="(e, i) in (draft.effects || [])" :key="i" class="ec-chip">{{ e.type || e.label || JSON.stringify(e) }}</span>
            <div class="ec-phase">COST 代价<span class="en-sub">COST Cost</span></div>
            <span class="ec-chip">AP {{ (draft.cost && draft.cost.ap) ?? draft.ap_cost ?? 0 }}</span>
          </div>
          <div v-else class="entry-empty">← 从左侧选择一个词条<span class="en-sub">Select an entry from the left</span></div>
        </div>
      </aside>

      <!-- 中栏：六段编排 D（上）+ 画布 B（下，视图按钮 a 紧贴画布上方） -->
      <div class="studio-center">
      <!-- a. 画布选项按钮（竖条）。六段式置顶：复用射程六边形网格画布，原子拖入六边形段格 -->
      <div class="studio-zone-a">
        <button :class="['studio-a-btn', { active: viewLayer === 'hexsix' }]" @click="setViewLayer('hexsix')">六段式<span class="en-sub">Six-Phase</span></button>
        <button :class="['studio-a-btn', { active: viewLayer === 'range' }]" @click="setViewLayer('range')">射程<span class="en-sub">Range</span></button>
        <button :class="['studio-a-btn', { active: viewLayer === 'aoe' }]" @click="setViewLayer('aoe')">AOE</button>
        <button :class="['studio-a-btn', { active: viewLayer === 'mapcannon' }]" @click="setViewLayer('mapcannon')">地图炮<span class="en-sub">Map Cannon</span></button>
        <button :class="['studio-a-btn', { active: viewLayer === 'battle' }]" @click="setViewLayer('battle')">战场模拟<span class="en-sub">Battle Sim</span></button>
      </div>

      <!-- b. 射程/攻击范围画布（600×400） -->
      <div class="studio-zone-b">
        <!-- 统一单 Canvas 工作台：射程/AOE/地图炮/六段式 共享同一画布与相机（不跳变） -->
        <div v-show="viewLayer !== 'battle'" class="studio-hex-view">
          <div class="zb-head">
            <span>{{ viewTitle }}</span>
            <span class="zb-tag">{{ editing ? '✎ 绘制模式' : '👁 只读预览' }}<span class="en-sub">Draw / Preview</span></span>
          </div>
          <!-- 射程范围输入（仅射程视图）：起始/结束，双向绑定 target，改动即重绘画布 -->
          <div v-if="viewLayer === 'range' && draft" class="range-input-bar">
            <label>起始范围<span class="en-sub">Start Range</span>
              <input type="number" min="0" max="18" v-model.number="draft.target.min_range" @change="onRangeInput" />
            </label>
            <label>结束范围<span class="en-sub">End Range</span>
              <input type="number" min="0" max="18" v-model.number="draft.target.max_range" @change="onRangeInput" />
            </label>
            <span class="rib-tip">格（中心为自己，19×19 居中）<span class="en-sub">cells (self at center, 19×19)</span></span>
            <button class="rib-btn" @click="applyRangeToMapCannon" title="按射程区间(起始~结束)映射为地图炮范围">↧ 应用到地图炮<span class="en-sub">Apply to Map Cannon</span></button>
          </div>
          <!-- AOE 目标点 / 攻击半径设置条（仅 AOE 视图） -->
          <div v-if="viewLayer === 'aoe' && draft" class="range-input-bar aoe-bar">
            <button class="rib-btn" :class="{ active: aoeMode === 'target' }" @click="aoeMode = aoeMode === 'target' ? null : 'target'">① 设置目标点<span class="en-sub">Set Target Point</span></button>
            <label>攻击半径<span class="en-sub">Attack Radius</span>
              <input type="number" min="0" max="18" v-model.number="draft.aoe.radius" @change="onAoeRadiusChange" />
            </label>
            <span class="rib-tip">目标点 ({{ draft.aoe?.center?.q ?? 9 }},{{ draft.aoe?.center?.r ?? 9 }}) · 半径 {{ draft.aoe?.radius ?? 0 }} 格<span class="en-sub">Target (q,r) · Radius N cells</span></span>
            <span class="rib-warn" v-if="!draft.aoe?.center">⚠ 请先「① 设置目标点」（须在射程内），环带以目标点为心<span class="en-sub">Set a target point within range first</span></span>
          </div>
          <!-- 地图炮范围输入（与射程「同样的方式、同样的内容」：[min,max] 环带，仅换紫色） -->
          <div v-if="viewLayer === 'map' && draft" class="range-input-bar">
            <label>起始范围<span class="en-sub">Start Range</span>
              <input type="number" min="0" max="18" v-model.number="draft.target.min_range" @change="onRangeInput" />
            </label>
            <label>结束范围<span class="en-sub">End Range</span>
              <input type="number" min="0" max="18" v-model.number="draft.target.max_range" @change="onRangeInput" />
            </label>
            <span class="rib-tip">格（中心为自己，19×19 居中）· 与射程同 [min,max] 环带，仅紫色区分<span class="en-sub">cells · same [min,max] band as Range, purple only</span></span>
          </div>
          <div class="zb-stage">
            <div class="zb-canvas-wrap">
              <HexCanvasEditor v-if="draft" ref="hexEditor" :view-mode="canvasViewMode" :lanes="lanes" :active-lane-index="activeLaneIndexForCanvas" :range-ctx="rangeCtx" @drop-atom="onCanvasDropAtom" @select-lane="onCanvasSelectLane" @place-map="onCanvasPlaceMap" @select-aoe-point="onSelectAoePoint" @mc-set-dir="onMcSetDir" @mc-complete="onMcComplete" @mc-clear="onMcClear" />
              <div v-else class="empty-canvas-hint">
                <span class="empty-icon">📋</span>
                <span>请先在左侧词条列表中选择一个词条<span class="en-sub">Select an entry from the left list first</span></span>
              </div>
            </div>
          </div>
          <div class="zb-legend">
            <template v-if="viewLayer === 'hexsix'">
              <span v-for="s in HEXSIX_LEGEND" :key="s"><i class="dot" style="background:#ffd479"></i>{{ s }}</span>
              <span class="zb-tip">点格选中段 · 从右侧拖原子入格<span class="en-sub">Click a cell to select · drag atoms from the right</span></span>
            </template>
            <template v-else-if="viewLayer === 'battle'">
              <span><i class="dot" style="background:#5dd47f"></i>射手<span class="en-sub">Shooter</span></span>
              <span><i class="dot" style="background:#ff8a80"></i>靶子<span class="en-sub">Target</span></span>
              <span><i class="dot" style="background:#f5c542"></i>命中<span class="en-sub">Hit</span></span>
            </template>
            <template v-else-if="viewLayer === 'aoe'">
              <span><i class="dot" style="background:#ffd479"></i>玩家棋子<span class="en-sub">Player Token</span></span>
              <span><i class="dot" style="background:rgba(91,214,255,.45)"></i>目标落点<span class="en-sub">Target Drop</span></span>
              <span><i class="dot" style="background:rgba(91,214,255,.7)"></i>攻击范围（目标点周围 攻击半径 环）<span class="en-sub">Attack Ring</span></span>
            </template>
            <template v-else-if="viewLayer === 'map'">
              <span><i class="dot" style="background:#b69bff"></i>自身（地图炮）<span class="en-sub">Self (Map Cannon)</span></span>
              <span><i class="dot" style="background:rgba(120,90,200,.45)"></i>盲区（min 内不可落点）<span class="en-sub">Blind Zone</span></span>
              <span><i class="dot" style="background:rgba(182,155,255,.7)"></i>可命中线（min~max 环带）<span class="en-sub">Lethal Line</span></span>
              <span class="zb-tip" v-if="editing">与射程同 [min,max] 环带 · 数字为环号<span class="en-sub">Same [min,max] band · number = ring</span></span>
            </template>
            <template v-else>
              <span><i class="dot" style="background:rgba(200,40,40,.55)"></i>死区（min 内）<span class="en-sub">Dead Zone</span></span>
              <span><i class="dot" style="background:rgba(80,200,120,.45)"></i>可命中线（min~max 环带）<span class="en-sub">Lethal Line</span></span>
              <span><i class="dot" style="background:#ffd479"></i>地图炮手绘格<span class="en-sub">Hand-drawn Cell</span></span>
              <span class="zb-tip" v-if="editing">选方向→点击绘格→「六向补全」镜像全向<span class="en-sub">Pick dir → click → mirror all 6 dirs</span></span>
            </template>
          </div>
        </div>

        <!-- 战场模拟视图（B 区切换显示，子集，不输出 JSON） -->
        <div v-show="viewLayer === 'battle'" class="studio-battle-view">
          <div class="zb-head">
            <span>战场模拟<span class="en-sub">Battle Simulation</span></span>
            <span class="zb-tag">前端战场效果<span class="en-sub">Front-end Battle FX</span></span>
          </div>
          <div class="bs-controls">
            <label>靶子<span class="en-sub">Target</span><input type="number" v-model.number="targetCount" min="0" max="12" @change="genTargets" /></label>
            <label>射手<span class="en-sub">Shooter</span>
              <select v-model="shooterPos" @change="genTargets">
                <option value="left">左<span class="en-sub">Left</span></option>
                <option value="right">右<span class="en-sub">Right</span></option>
                <option value="top">上<span class="en-sub">Top</span></option>
                <option value="center">中<span class="en-sub">Center</span></option>
              </select>
            </label>
            <button class="sim-btn" :class="{ active: placeMode }" @click="togglePlaceMode">
              {{ placeMode ? '✓ 放置中' : '手动放置' }}<span class="en-sub">Placing / Manual</span>
            </button>
            <button class="sim-btn sim-run" @click="runTest" :disabled="bsPhase === 'rolling'">
              {{ bsPhase === 'rolling' ? '⏳ 引擎结算中…' : '▶ 模拟使用技能' }}<span class="en-sub">Engine Resolving / Simulate</span>
            </button>
            <button class="sim-btn" v-if="bsPhase === 'resolved'" @click="resetSim">↺ 重置画布<span class="en-sub">Reset Canvas</span></button>
          </div>
          <div class="bs-canvas-wrap" ref="bsWrap">
            <canvas
              ref="battleCanvas"
              class="battle-canvas"
              @mousedown="onBattleDown"
              @mousemove="onBattleMove"
              @mouseup="onBattleUp"
              @mouseleave="onBattleUp"
              @wheel.prevent="onBattleWheel"
              @click="onBattleClick"
            ></canvas>
            <div class="bs-cam-hint">拖拽平移 · 滚轮缩放<span class="en-sub">Drag to pan · scroll to zoom</span></div>
            <div class="bs-phase-tag" v-if="bsPhase !== 'idle'">
              {{ bsPhase === 'rolling' ? '引擎结算中' : '已结算（真实伤害已回写画布）' }}<span class="en-sub">Resolving / Resolved</span>
            </div>
          </div>
          <div class="zb-legend">
            <span><i class="dot" style="background:#5dd47f"></i>射手<span class="en-sub">Shooter</span></span>
            <span><i class="dot" style="background:#ff8a80"></i>靶子<span class="en-sub">Target</span></span>
            <span><i class="dot" style="background:#f5c542"></i>命中<span class="en-sub">Hit</span></span>
            <span><i class="dot" style="background:#ff4d4f"></i>击杀<span class="en-sub">Kill</span></span>
            <span><i class="dot" style="background:#7db4ff"></i>状态<span class="en-sub">Status</span></span>
          </div>
          <!-- Phase 4 端到端：真实引擎结算结果（结构化展示，非裸 JSON） -->
          <div class="bs-result" v-if="runResult || runError">
            <div class="bs-result-head">
              引擎结算结果<span class="en-sub">Engine Resolution Result</span>
              <span class="bs-src" v-if="runResult?.source === 'canvas'">画布真实状态<span class="en-sub">Canvas Real State</span></span>
              <span class="bs-src stub" v-else-if="runResult?.source === 'stub'">桩位基准<span class="en-sub">Stub Baseline</span></span>
            </div>
            <pre v-if="runError" class="bs-err">{{ runError }}</pre>
            <template v-else>
              <div class="bs-summary">
                <span class="bs-sum-item">词条：<span class="en-sub">Entry</span><b>{{ runResult.skillName }}</b></span>
                <span class="bs-sum-item">总伤害：<span class="en-sub">Total DMG</span><b>{{ runResult.final_damage }}</b></span>
                <span class="bs-sum-item">应用原子：<span class="en-sub">Atoms</span><b>{{ runResult.effectsApplied }}</b></span>
                <span class="bs-sum-item">引擎：<span class="en-sub">Engine</span><b>{{ runResult.engine }}</b></span>
              </div>
              <div class="bs-targets">
                <div class="bs-tgt" v-for="(rw, i) in (runResult.rewind || [])" :key="i">
                  <span class="bs-tgt-id">{{ rw.id }}</span>
                  <span class="bs-tgt-hp" :class="{ dead: rw.targetAfter && rw.targetAfter.hp <= 0 }">
                    HP {{ rw.targetAfter ? rw.targetAfter.hp : '-' }}/{{ rw.targetAfter ? rw.targetAfter.maxHp : '-' }}
                  </span>
                  <span class="bs-tgt-dmg" v-if="rw.finalDamage">−{{ rw.finalDamage }}</span>
                  <span class="bs-tgt-status" v-if="rw.targetAfter && rw.targetAfter.statusEffects && rw.targetAfter.statusEffects.length">
                    ◈ {{ rw.targetAfter.statusEffects.map(s => s.type || s.label).join(',') }}
                  </span>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>

    <!-- 下半区：D(六段编排) | C(原子面板) = 8:2 -->
    <div class="studio-zone-d">
        <div class="zone-d-head">
          <h3>D · 六段编排画布<span class="en-sub">D · Six-Phase Composer</span></h3>
          <div class="zone-d-actions">
            <button class="studio-save" @click="toggleEdit">✎ 保存 / 编辑<span class="en-sub">Save / Edit</span></button>
            <!-- 添加段：下拉菜单选择预设段类型（置于标题旁） -->
            <button class="add-lane-btn" @click="toggleAddLane">＋ 添加段<span class="en-sub">Add Phase</span></button>
            <select v-if="addLaneOpen" class="add-lane-select" v-model="addLaneKey" @change="addLaneFromPreset(addLaneKey); addLaneKey = ''">
              <option value="">选择段类型…<span class="en-sub">Choose phase type…</span></option>
              <option v-for="p in ADD_LANE_PRESETS" :key="p.key" :value="p.key">{{ p.name }}（{{ p.key }}）</option>
            </select>
          </div>
        </div>
        <div class="hint">六段式（WHEN/IF/ROLL/DO/AFTER/COST）：拖拽段头可调整六段顺序；从右侧原子面板拖原子到本段泳道；点段头「＋ 子段」可在选中的段上挂一层子树（≤3）。点段选中，保存即写回词条。<span class="en-sub">Drag phase headers to reorder · drag atoms from the right panel into lanes · "＋ 子段" nests a sub-lane (≤3) · click a phase to select, Save writes back.</span></div>
        <div class="lanes-scroll">
          <div class="lanes-h">
            <div v-for="(lane, i) in lanes" :key="lane.key" class="lane-col">
              <div class="lane" :class="{ selected: selectedLane === i, 'drag-over-lane': dragOverLane === i }" @click="selectedLane = i" @dragover.prevent="onLaneColDragOver($event, i)" @drop.prevent="onLaneColDrop($event, i)">
                <div class="lane-head" :class="{ 'order-locked': isLaneOrderLocked(i) }" :draggable="!isLaneOrderLocked(i)" @dragstart="onLaneDragStart($event, i)" @dragend="onLaneDragEnd" :title="isLaneOrderLocked(i) ? '该段受六段硬边约束锁定，不可移动（WHEN 锚定首位）' : '拖拽段头可调整六段顺序（受硬边约束）'">
                  <span class="ord">{{ i + 1 }}</span>
                  <span class="name">{{ lane.name }}<span v-if="isLaneOrderLocked(i)" class="lock-badge">🔒</span></span>
                  <span class="desc">{{ lane.desc }}</span>
                  <button class="nest-btn" @click.stop="addNest(i)" title="在选中段上添加子段（≤3层）">＋ 子段<span class="en-sub">Sub-phase</span></button>
                  <button class="lane-del" v-if="lane.key !== 'WHEN' && pendingDelete !== i" @click.stop="askDeleteLane(i)" title="删除该段">✕</button>
                  <span v-if="pendingDelete === i" class="del-confirm">
                    <span class="del-tip">删除？<span class="en-sub">Delete?</span></span>
                    <button class="del-yes" @click.stop="confirmDeleteLane">确认<span class="en-sub">Confirm</span></button>
                    <button class="del-no" @click.stop="cancelDeleteLane">取消<span class="en-sub">Cancel</span></button>
                  </span>
                </div>
                <div class="lane-body" :data-lane="i"
                     @dragover.prevent="onLaneDragOver($event, i)"
                     @drop.prevent="onLaneDrop($event, i)">
                  <span v-if="!lane.atoms.length" class="empty-tip">拖入原子…<span class="en-sub">Drop atoms…</span></span>
                  <div v-for="(a, j) in lane.atoms" :key="j" class="atom-card" :data-grp="a.grp">
                    <div class="ac-head">
                      <span class="ac-title">{{ a.label }}</span>
                      <span v-if="a.bypassTag" class="bypass-tag">旁路伤害模式<span class="en-sub">Bypass Damage Mode</span></span>
                      <button class="ac-del" @click.stop="removeAtom(i, j)">✕</button>
                    </div>
                    <div v-if="a.fields && a.fields.length" class="ac-params">
                    <div v-for="f in a.fields" :key="f.key" class="ac-field">
                      <span class="ac-f-label">{{ f.label }}</span>
                      <select v-if="f.type === 'select'" v-model="a.params[f.key]" :disabled="f.fixed" @change="(lane.key === 'ROLL' && a.effectType === 'roll_segment') ? regenRollBranches(a) : null">
                        <option v-for="(o, oi) in f.options" :key="oi" :value="typeof o === 'object' ? o.value : o">{{ typeof o === 'object' ? o.label : o }}</option>
                      </select>
                      <select v-else-if="f.type === 'bool'" v-model="a.params[f.key]">
                        <option :value="true">是<span class="en-sub">Yes</span></option>
                        <option :value="false">否<span class="en-sub">No</span></option>
                      </select>
                      <div v-else-if="f.type === 'number'" class="numwrap">
                        <span class="num-mode" :class="{ formula: isFormula(a, f.key) }" @click="toggleNumMode(a, f.key)">{{ isFormula(a, f.key) ? '公式' : '固定' }}<span class="en-sub">Formula / Fixed</span></span>
                        <input type="text" v-model="a.params[f.key]" :disabled="f.fixed" :placeholder="isFormula(a, f.key) ? '如 melee × 1' : '数字'" @change="(lane.key === 'ROLL' && a.effectType === 'roll_segment') ? regenRollBranches(a) : null" />
                      </div>
                      <input v-else type="text" v-model="a.params[f.key]" :disabled="f.fixed" :placeholder="f.type === 'json' ? '{…} JSON' : ''" @change="(lane.key === 'ROLL' && a.effectType === 'roll_segment') ? regenRollBranches(a) : null" />
                      <button v-if="isJumpField(f)" class="ac-jump" title="在画布上编辑此字段" @click.stop="jumpToCanvas(a, f)">🎯</button>
                    </div>
                    </div>
                    <!-- H1/H2 词条布置进六段式时：画布联动三件套 -->
                    <div v-if="a.effectType === 'map_cannon' || a.effectType === 'aoe'" class="ac-canvas-bar">
                      <div class="ac-cb-row">
                        <label class="ac-cb-label">范围类型<span class="en-sub">Range Type</span></label>
                        <select class="ac-cb-select" :value="a.effectType" @change="onCanvasTypeChange(a, $event.target.value)">
                          <option value="map_cannon">地图炮<span class="en-sub">Map Cannon</span></option>
                          <option value="aoe">AOE</option>
                        </select>
                        <button class="ac-cb-sync" @click="syncCanvasToDraft">↧ 同步画布<span class="en-sub">Sync Canvas</span></button>
                      </div>
                      <p class="ac-cb-hint">请到画布绘制攻击范围（上方「地图炮 / AOE」切换图层）<span class="en-sub">Draw the attack area on the canvas (switch layer above)</span></p>
                    </div>
                    <!-- IF 条件分支：保持包裹在 IF 原子内（蓝色标识），与 ROLL 掷骰平行分支区分 -->
                    <div v-if="lane.key === 'IF' && a.effectType === 'condition' && a.showBranches" class="branches if-branch">
                      <div v-for="(b, bi) in (a.branches || [])" :key="bi" class="branch">
                        <div class="branch-head">
                          <span class="br-cond">⚑ 条件分支 {{ bi + 1 }}<span class="en-sub">Condition Branch</span></span>
                          <input class="br-range" type="text" v-model="b.lower" placeholder="下" />
                          <span class="br-tilde">~</span>
                          <input class="br-range" type="text" v-model="b.upper" placeholder="上" />
                          <input class="br-label" type="text" v-model="b.label" placeholder="分支标签" />
                          <button class="br-del" @click.stop="removeBranch(a, bi)">✕</button>
                        </div>
                        <div class="branch-lanes">
                          <div v-for="(sl, sci) in (b.subLanes || ensureBranchSubLanes(b))" :key="sci" class="lane-col branch-col">
                            <div class="lane">
                              <div class="lane-head order-locked">
                                <span class="ord">{{ sl.ord || (sci + 1) }}</span>
                                <span class="name">{{ sl.name }}</span>
                              </div>
                              <div class="lane-body" @dragover.prevent="onBranchDragOver($event)" @drop.prevent="onBranchDrop($event, a, bi)">
                                <span v-if="!sl.atoms || !sl.atoms.length" class="empty-tip">拖入<span class="en-sub">Drop in</span></span>
                                <div v-for="(ba, bj) in (sl.atoms || [])" :key="bj" class="atom-card" :data-grp="ba.grp">
                                  <div class="ac-head">
                                    <span class="ac-title">{{ ba.label }}</span>
                                    <button class="ac-del" @click.stop="removeBranchAtom(a, bi, bj)">✕</button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <!-- 子树层（嵌套 ≤3） -->
                <div v-if="lane.nest" class="subtree">
                  <div class="subtree-label">↳ 子树层 1<span class="en-sub">Subtree Layer 1</span></div>
                  <div class="lane-body subtree-body" data-nest="1"
                       @dragover.prevent="onNestDragOver($event, i)"
                       @drop.prevent="onNestDrop($event, i)">
                    <span v-if="!lane.nest.atoms.length" class="empty-tip">拖入原子…<span class="en-sub">Drop atoms…</span></span>
                    <div v-for="(a, j) in lane.nest.atoms" :key="j" class="atom-card" :data-grp="a.grp">
                      <div class="ac-head">
                        <span class="ac-title">{{ a.label }}</span>
                        <button class="ac-del" @click.stop="removeNestAtom(i, j)">✕</button>
                      </div>
                      <div v-if="a.fields && a.fields.length" class="ac-params">
                        <div v-for="f in a.fields" :key="f.key" class="ac-field">
                          <span class="ac-f-label">{{ f.label }}</span>
                          <select v-if="f.type === 'select'" v-model="a.params[f.key]" :disabled="f.fixed"><option v-for="o in f.options" :key="o" :value="o">{{ o }}</option></select>
                          <select v-else-if="f.type === 'bool'" v-model="a.params[f.key]"><option :value="true">是<span class="en-sub">Yes</span></option><option :value="false">否<span class="en-sub">No</span></option></select>
                          <div v-else-if="f.type === 'number'" class="numwrap">
                            <span class="num-mode" :class="{ formula: isFormula(a, f.key) }" @click="toggleNumMode(a, f.key)">{{ isFormula(a, f.key) ? '公式' : '固定' }}<span class="en-sub">Formula / Fixed</span></span>
                            <input type="text" v-model="a.params[f.key]" :disabled="f.fixed" :placeholder="isFormula(a, f.key) ? '如 melee × 1' : '数字'" />
                          </div>
                          <input v-else type="text" v-model="a.params[f.key]" :disabled="f.fixed" :placeholder="f.type === 'json' ? '{…} JSON' : ''" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
            <!-- ROLL 段的结果分支：独立于主循环，作为 lanes-h 内与六段主链同级的平行段卡片（不再包裹在 ROLL 原子卡片内） -->
            <template v-for="(rb, rbi) in rollBranchFlat" :key="'RB' + rbi">
                <div class="lane-col roll-branch-col"
                     :class="{ 'drag-over-lane': dragOverBranch === (rb.laneIndex + '-' + rb.branchIndex) }"
                     @dragover.prevent="onBranchColDragOver($event, rb.laneIndex, rb.branchIndex)"
                     @drop.prevent="onBranchColDrop($event, rb.laneIndex, rb.branchIndex)"
                     @click="selectedLane = rb.laneIndex">
                  <div class="lane roll-branch">
                    <div class="lane-head roll-branch-head">
                      <span class="ord">🎲</span>
                      <span class="name">结果 {{ rb.branchIndex + 1 }}<span class="en-sub">Result</span><span class="rb-tag">掷骰分支<span class="en-sub">Roll Branch</span></span></span>
                      <span class="desc">{{ rb.branch.label || (rb.branch.lower + '~' + rb.branch.upper) || '未命名结果' }}</span>
                      <span class="rb-range">{{ rb.branch.lower != null && rb.branch.lower !== '' ? rb.branch.lower : '−∞' }} ~ {{ rb.branch.upper != null && rb.branch.upper !== '' ? rb.branch.upper : '∞' }}</span>
                      <button class="br-del" @click.stop="removeBranch(rollSegOf(lanes[rb.laneIndex]), rb.branchIndex)">✕</button>
                    </div>
                    <!-- 每个结果分支内复用主六段标准泳道样式 -->
                    <div class="branch-lanes">
                      <div v-for="(sl, sci) in (rb.branch.subLanes || ensureBranchSubLanes(rb.branch))" :key="sci" class="lane-col branch-col">
                        <div class="lane">
                          <div class="lane-head order-locked">
                            <span class="ord">{{ sl.ord || (sci + 1) }}</span>
                            <span class="name">{{ sl.name }}</span>
                            <span class="desc">{{ sl.desc }}</span>
                          </div>
                          <div class="lane-body" @dragover.prevent="onBranchDragOver($event)" @drop.prevent="onBranchDrop($event, rollSegOf(lanes[rb.laneIndex]), rb.branchIndex)">
                            <span v-if="!sl.atoms || !sl.atoms.length" class="empty-tip">拖入<span class="en-sub">Drop in</span></span>
                            <div v-for="(ba, bj) in (sl.atoms || [])" :key="bj" class="atom-card" :data-grp="ba.grp">
                              <div class="ac-head">
                                <span class="ac-title">{{ ba.label }}</span>
                                <span v-if="ba.bypassTag" class="bypass-tag">旁路伤害模式<span class="en-sub">Bypass Damage Mode</span></span>
                                <button class="ac-del" @click.stop="removeBranchAtom(rollSegOf(lanes[rb.laneIndex]), rb.branchIndex, bj)">✕</button>
                              </div>
                              <div v-if="ba.fields && ba.fields.length" class="ac-params">
                                <div v-for="f in ba.fields" :key="f.key" class="ac-field">
                                  <span class="ac-f-label">{{ f.label }}</span>
                                  <select v-if="f.type === 'select'" v-model="ba.params[f.key]" :disabled="f.fixed"><option v-for="(o, oi) in f.options" :key="oi" :value="typeof o === 'object' ? o.value : o">{{ typeof o === 'object' ? o.label : o }}</option></select>
                                  <select v-else-if="f.type === 'bool'" v-model="ba.params[f.key]"><option :value="true">是<span class="en-sub">Yes</span></option><option :value="false">否<span class="en-sub">No</span></option></select>
                                  <div v-else-if="f.type === 'number'" class="numwrap">
                                    <span class="num-mode" :class="{ formula: isFormula(ba, f.key) }" @click="toggleNumMode(ba, f.key)">{{ isFormula(ba, f.key) ? '公式' : '固定' }}<span class="en-sub">Formula / Fixed</span></span>
                                    <input type="text" v-model="ba.params[f.key]" :disabled="f.fixed" :placeholder="isFormula(ba, f.key) ? '如 melee × 1' : '数字'" />
                                  </div>
                                  <input v-else type="text" v-model="ba.params[f.key]" :disabled="f.fixed" />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>

      <!-- 右栏：原子面板 C（定高可滚，分组默认收起） -->
      <aside class="studio-right">
      <div class="studio-zone-c">
        <h3>C · 原子面板 <span class="cnt">{{ filteredAtomCount }}</span></h3>
        <input class="atom-search" v-model="atomSearch" placeholder="🔍 搜索原子 / 编号 / 中文…" />
        <div class="atom-groups">
          <div v-for="grp in filteredAtomGroups" :key="grp.grp" class="atom-group" :class="{ collapsed: collapsedGroups.includes(grp.grp) }">
            <div class="grp-title" @click="toggleGroup(grp.grp)">
              {{ grp.title }}<span class="en-sub" v-if="grp.enTitle">{{ grp.enTitle }}</span> <span class="grp-count">({{ grp.atoms.length }})</span>
            </div>
            <div class="grp-items">
              <span v-for="a in grp.atoms" :key="a.key" class="atom-chip" :data-grp="a.grp"
                    :title="stLabel(a.st)" draggable="true" @dragstart="onAtomDragStart($event, a)">
                <span class="chip-st" :class="stClass(a.st)"></span>
                <span class="chip-label">{{ a.label }}<span class="en-sub" v-if="a.enLabel">{{ a.enLabel }}</span></span>
              </span>
            </div>
          </div>
        </div>
        <div class="legend">
        <div><span class="chip-st st-ok"></span> 绿 · 引擎 handler 已就绪<span class="en-sub">Green · engine handler ready</span></div>
        <div><span class="chip-st st-alias"></span> 琥珀 · 需补 TYPE_ALIAS 别名<span class="en-sub">Amber · needs TYPE_ALIAS</span></div>
        <div><span class="chip-st st-new"></span> 红 · 引擎需新建<span class="en-sub">Red · engine to build</span></div>
        <div class="legend-total">A-K 共 {{ totalAtomCount }} 原子 · 已对齐引擎 {{ engineHandlerCount }} 个真实 handler（含 7 个 GAP：collinear/charge_stack/cooldown/damage_share/armor_pierce/reflect_damage/prerequisite_clear）<span class="en-sub">A–K: N atoms · M handlers aligned (7 GAPs)</span></div>
        </div>
      </div>
      </aside><!-- /studio-right -->
    </div><!-- /studio-3col -->
  <!-- Phase 2-2：IF/ROLL 多实例数量选择器（2~4） -->
  <div v-if="multiDrop.open" class="multi-drop-mask" @click.self="cancelMultiInstance">
    <div class="multi-drop-modal">
      <div class="md-title">为「{{ (lanes[multiDrop.laneIndex] && lanes[multiDrop.laneIndex].name) || '' }}」选择实例数量<span class="en-sub">Choose instance count</span></div>
      <div class="md-hint">将自动在相邻空位放置对应数量的分支槽位<span class="en-sub">Adjacent branch slots will be auto-placed</span></div>
      <div class="md-btns">
        <button v-for="n in [2,3,4]" :key="n" class="md-btn" @click="confirmMultiInstance(n)">{{ n }} 个<span class="en-sub">instances</span></button>
        <button class="md-cancel" @click="cancelMultiInstance">取消<span class="en-sub">Cancel</span></button>
      </div>
    </div>
  </div>
  </div><!-- /gh-studio -->
</template>

<script setup>
import { atomGroups } from '../battle/glossary/atomGroups.js'
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import apiClient from '../api/client.js'
import SkillListPanel from '../components/glossary-hub/SkillListPanel.vue'
import HexCanvasEditor from '../components/glossary-editor/HexCanvasEditor.vue'
import { hexToPixel, pixelToHex, HEX_WIDTH, HEX_HEIGHT, HEX_RADIUS } from '@/utils/hexUtils'
import { drawHexPath } from '@/utils/hexDraw'

const CORE_KEYS = ['melee_strike', 'ranged_shot', 'shield_wall', 'repair', 'overdrive', 'beam_cannon']
const MC_DIR_KEYS = ['right', 'rightup', 'leftup', 'left', 'leftdown', 'rightdown']

const skills = ref({})
const selectedKey = ref('')
const activeCat = ref('all')
const editing = ref(false)
const dirtyKeys = ref([])
const hexEditor = ref(null)

const coreKeys = CORE_KEYS
const selectedSkillName = computed(() => {
  const s = skills.value[selectedKey.value]
  return s ? (s.name || s.label || selectedKey.value) : ''
})

const draftMeta = computed(() => {
  const d = draft.value
  if (!d) return null
  return {
    timing: (d.timing && d.timing.trigger) || (d.trigger && d.trigger.type) || 'none',
    roll: (d.roll && d.roll.mode) ? d.roll.mode : 'none',
    costEnforce: !!(d.cost && d.cost.enforce),
    conditionsCount: Array.isArray(d.conditions) ? d.conditions.length : 0
  }
})

const draft = ref(null)

function buildRangeFromSkill(skill) {
  const category = skill.category || 'ranged'
  const bonus = Number(skill.bonus_range) || 0
  let rangeEnd = 3
  if (category === 'melee') rangeEnd = 1 + bonus
  else if (category === 'ranged') rangeEnd = 3 + bonus
  else if (category === 'auto') rangeEnd = 0
  const aoeSpread = (skill.aoe && skill.aoe.spread) ? Number(skill.aoe.spread) : 0
  const mcShapes = {}
  for (const k of MC_DIR_KEYS) mcShapes[k] = []
  const rawDirs = skill.map_cannon && skill.map_cannon.directions
  if (rawDirs && !Array.isArray(rawDirs) && typeof rawDirs === 'object') {
    for (const k of MC_DIR_KEYS) {
      const cells = rawDirs[k]
      if (Array.isArray(cells)) {
        mcShapes[k] = cells
          .map(c => Array.isArray(c) ? { q: Number(c[0]), r: Number(c[1]) } : { q: Number(c.q), r: Number(c.r) })
          .filter(c => Number.isFinite(c.q) && Number.isFinite(c.r))
      }
    }
  } else if (Array.isArray(rawDirs)) {
    mcShapes[MC_DIR_KEYS[0]] = rawDirs
      .map(d => ({ q: Number(d[0]), r: Number(d[1]) }))
      .filter(c => Number.isFinite(c.q) && Number.isFinite(c.r))
  }
  const hasMc = MC_DIR_KEYS.some(k => mcShapes[k].length > 0)
  return {
    layer: 'range',
    rangeStart: 0,
    rangeEnd,
    hitKind: hasMc ? 'mapcannon' : (aoeSpread > 0 ? 'aoe' : 'mapcannon'),
    mcDir: MC_DIR_KEYS[0],
    mcShapes,
    aoeCells: {},
    aoeSpread
  }
}

function syncRangeToSkill(range) {
  if (!range || !draft.value) return
  const category = draft.value.category || 'ranged'
  let bonus = 0
  if (category === 'melee') bonus = (range.rangeEnd || 1) - 1
  else if (category === 'ranged') bonus = (range.rangeEnd || 3) - 3
  draft.value.bonus_range = bonus
  if (!draft.value.target) draft.value.target = {}
  const re = Number(range.rangeEnd) || 0
  if (category === 'melee') { draft.value.target.min_range = 1; draft.value.target.max_range = re }
  else if (category === 'ranged') { draft.value.target.min_range = 1; draft.value.target.max_range = re }
  else { draft.value.target.min_range = 0; draft.value.target.max_range = 0 }
  // AOE 数据模型：{ center: 目标落点(锚目标点), radius: 攻击半径 }，与射程独立
  if (!draft.value.aoe) draft.value.aoe = { center: null, radius: 0 }
  if (!draft.value.map_cannon) draft.value.map_cannon = { directions: {} }
  const out = {}
  for (const k of MC_DIR_KEYS) {
    const cells = (range.mcShapes && range.mcShapes[k]) || []
    out[k] = Array.isArray(cells) ? cells.map(c => ({ q: c.q, r: c.r })) : []
  }
  draft.value.map_cannon.directions = out
}

async function loadConfig() {
  try {
    const { data } = await apiClient.get('/combat-glossary/hub-config')
    if (data.success) skills.value = data.glossary.skills || {}
  } catch (e) {
    console.error('加载词条库失败', e)
  }
  // 方案 A：拉取原子元数据清单（atomRegistry.listMeta 后端真相源），把语义名回填到原子面板，
  // 打通「可视化编辑语义树 → 标准 v2 Tree（type=语义名）→ 引擎转译执行」闭环。
  try {
    const { data: metaRes } = await apiClient.get('/combat-glossary/atom-meta')
    if (metaRes && metaRes.success && Array.isArray(metaRes.atoms)) {
      const byHandler = new Map()
      metaRes.atoms.forEach((m) => { if (m.handlerKey) byHandler.set(m.handlerKey, m.semantic) })
      // 前端 atomGroups 的 atom.key/effectType 即引擎 handlerKey，回填对应 semantic
      atomGroups.forEach((g) => g.atoms.forEach((a) => {
        // ★ 2026-09-02：硬编码优先 —— 原子定义中已显式声明 semantic 的**不覆盖**。
        //   原因：B_ENTRY 与 B_HIT_CALLBACK 共用 handlerKey 'trigger_entry'，
        //   byHandler 是 Map 后写覆盖，两者会被回填成同一个语义名，导致 entry_type 参数丢失。
        if (a.semantic) return
        const sem = byHandler.get(a.key) || byHandler.get(a.effectType)
        if (sem) a.semantic = sem
      }))
    }
  } catch (e) {
    console.warn('加载原子元数据失败（降级为引擎 key 直传）', e)
  }
}

async function createSkill() {
  try {
    const { data } = await apiClient.post('/combat-glossary/hub-config', { name: '新技能草稿' })
    if (data && data.success) {
      const key = data.key
      skills.value[key] = data.skill
      selectedKey.value = key
      onSelect(key)
      editing.value = true
      dirtyKeys.value = dirtyKeys.value.filter(k => k !== key)
    }
  } catch (e) {
    const msg = e?.response?.data?.message || e.message
    alert('新建失败：' + msg)
  }
}

function onSelect(key) {
  selectedKey.value = key
  editing.value = false
  const s = skills.value[key]
  if (!s) { draft.value = null; return }
  const copy = JSON.parse(JSON.stringify(s))
  copy.skill_key = key
  if (!copy.effects) copy.effects = []
  if (!copy.target) copy.target = { type: 'SINGLE_ENEMY', filter: { unit_types: [], status: 'none' } }
  if (!copy.aoe) copy.aoe = { center: null, radius: 0 }
  if (!copy.entryType) copy.entryType = 'skill'
  if (!copy.action_type) copy.action_type = 'attack'
  if (!copy.target_scope) copy.target_scope = 'SINGLE_ENEMY'
  if (!copy.trigger) copy.trigger = { type: 'none' }
  if (!copy.faction) copy.faction = { limited_to: 'all', limit_count: 'faction_once', stance: 'attack' }
  copy.range = buildRangeFromSkill(copy)
  if (!copy.timing) copy.timing = { trigger: (copy.trigger && copy.trigger.type) || 'none' }
  if (!copy.conditions) copy.conditions = []
  if (!copy.roll) copy.roll = { mode: 'none', generator: { method: 'dice' }, segments: [] }
  if (!copy.cost) copy.cost = { ap: copy.ap_cost || 0, charges: 0, durability: 0, cooldown: 0, limit_scope: 'match', enforce: false }
  if (!copy.target) copy.target = { type: 'SINGLE_ENEMY', filter: { unit_types: [], status: 'none' } }
  if (copy.target.min_range == null || copy.target.max_range == null) {
    const cat = copy.category || 'ranged'
    const bonus = Number(copy.bonus_range) || 0
    if (cat === 'melee') { copy.target.min_range = 1; copy.target.max_range = 1 + bonus }
    else if (cat === 'ranged') { copy.target.min_range = 1; copy.target.max_range = 3 + bonus }
    else { copy.target.min_range = 0; copy.target.max_range = 0 }
  }
  draft.value = reactive(copy)
  syncLanesFromDraft()
  resetCanvasCtx()
  syncTargetToCanvas()
}

// 把当前词条的目标解析(target) 与 IF 段(conditions) 同步给画板（第五部分：画板是目标解析/IF 的可视化末端）
function syncTargetToCanvas() {
  const d = draft.value
  if (!d) return
  const t = d.target || {}
  // 射程真相源优先级：target.min_range/max_range 优先，回退 draft.range 旧字段
  let minR = t.min_range
  let maxR = t.max_range
  if (minR == null || maxR == null) {
    const r = d.range || {}
    minR = r.rangeStart ?? 1
    maxR = Math.max(r.rangeEnd ?? 1, minR)
  }
  // shape 真相源优先级：aoe.shape > target.shape > range.hitKind(mapcannon→custom) > circle
  let shape = 'circle'
  if (d.aoe && d.aoe.shape) shape = d.aoe.shape
  else if (t.shape) shape = t.shape
  else if (d.range && d.range.hitKind === 'mapcannon') shape = 'custom'
  else if (d.range && d.range.hitKind === 'line') shape = 'line'
  rangeCtx.target = {
    type: t.type || 'SINGLE_ENEMY',
    min_range: Number(minR) || 0,
    max_range: Number(maxR) || 0,
    shape,
    cast_range: t.cast_range
  }
  rangeCtx.shape = shape
  rangeCtx.conditions = Array.isArray(d.conditions) ? d.conditions.slice() : []
  // 还原地图炮已存格：真相源优先 draft.range.mcShapes，回退 map_cannon.directions，避免覆盖清除用户绘制
  if (!rangeCtx.mcShapes) rangeCtx.mcShapes = {}
  const mcSrc = (d.range && d.range.mcShapes) || (d.map_cannon && d.map_cannon.directions) || {}
  for (const k of MC_DIR_KEYS) {
    const cells = mcSrc[k]
    rangeCtx.mcShapes[k] = Array.isArray(cells) ? cells.map(c => ({ q: c.q, r: c.r })) : []
  }
  rangeCtx.mcDir = (d.range && d.range.mcDir) || 'right'
  // AOE 目标点 / 攻击半径（目标点是射程内某一点，未设则 null；半径=攻击范围）
  rangeCtx.aoeCenter = (d.aoe && d.aoe.center && typeof d.aoe.center.q === 'number') ? { q: d.aoe.center.q, r: d.aoe.center.r } : null
  rangeCtx.aoeSpread = (d.aoe && typeof d.aoe.radius === 'number') ? d.aoe.radius : 0
}

// AOE 精准点选：设置目标落点（须落在射程范围内）
function onSelectAoePoint(h) {
  const d = draft.value
  if (!d) return
  if (!d.aoe) d.aoe = { center: null, radius: 0 }
  // 校验：目标点必须在射程范围内（距单位中心 9,9 的轴向距离 ≤ max_range 且 ≥ min_range）
  const maxR = (d.target && d.target.max_range) || 0
  const minR = (d.target && d.target.min_range) || 0
  const hexDist = (aq, ar, bq, br) => Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(aq + ar - bq - br))
  const dist = hexDist(h.q, h.r, 9, 9)
  if (maxR > 0 && (dist > maxR || dist < minR)) {
    console.warn('[GlossaryHub] 目标点超出射程范围，已忽略', { q: h.q, r: h.r, dist, minR, maxR })
    return
  }
  d.aoe.center = { q: h.q, r: h.r }
  syncTargetToCanvas()
}

// AOE 攻击半径改动：写回 aoe.radius 并重绘画布
function onAoeRadiusChange() {
  syncTargetToCanvas()
}

// 射程起始/结束范围输入框改动：写回 target 并重绘画布环带
function onRangeInput() {
  const d = draft.value
  if (!d) return
  if (!d.target) d.target = {}
  let minR = Number(d.target.min_range) || 0
  let maxR = Number(d.target.max_range) || 0
  if (maxR < minR) maxR = minR
  d.target.min_range = minR
  d.target.max_range = maxR
  syncTargetToCanvas()
}

async function toggleEdit() {
  if (editing.value) {
    try {
      await saveCurrent()
    } catch (e) {
      return
    }
  }
  editing.value = !editing.value
}

async function saveCurrent() {
  if (!draft.value || !selectedKey.value) return
  if (coreKeys.includes(selectedKey.value)) {
    alert('核心技能受保护，不可保存覆盖')
    return
  }
  if (!draft.value.name || !String(draft.value.name).trim()) {
    alert('保存失败：词条名称（name）不能为空')
    return
  }
  if (!selectedKey.value || !String(selectedKey.value).trim()) {
    alert('保存失败：词条 key 不能为空')
    return
  }
  syncRangeToSkill(draft.value.range)
  writeLanesToDraft()
  const payload = { ...draft.value }
  delete payload.range
  delete payload.skill_key
  try {
    await apiClient.put('/combat-glossary/hub-config/' + selectedKey.value, payload)
    dirtyKeys.value = dirtyKeys.value.filter(k => k !== selectedKey.value)
    skills.value[selectedKey.value] = JSON.parse(JSON.stringify(draft.value))
  } catch (e) {
    const msg = e?.response?.data?.message || e.message
    alert('保存失败：' + msg + '\n（你的编辑内容已保留在本地，请重试保存）')
  }
}

watch(() => draft.value && draft.value.range, (r) => {
  if (editing.value && r) syncRangeToSkill(r)
}, { deep: true })

watch(() => [draft.value && draft.value.category, draft.value && draft.value.bonus_range], () => {
  if (!draft.value || !draft.value.range) return
  if (editing.value) return
  const rebuilt = buildRangeFromSkill(draft.value)
  draft.value.range.rangeStart = rebuilt.rangeStart
  draft.value.range.rangeEnd = rebuilt.rangeEnd
  if (!draft.value.target) draft.value.target = {}
  const cat = draft.value.category || 'ranged'
  const bonus = Number(draft.value.bonus_range) || 0
  if (cat === 'melee') { draft.value.target.min_range = 1; draft.value.target.max_range = 1 + bonus }
  else if (cat === 'ranged') { draft.value.target.min_range = 1; draft.value.target.max_range = 3 + bonus }
  else { draft.value.target.min_range = 0; draft.value.target.max_range = 0 }
}, { deep: true })

// ===== 画布视图切换（射程/AOE/地图炮/战场模拟/六段式填充六边形） =====
// AOE 视图：点击设置目标点（锚目标点，攻击半径扩散），与射程视图独立
const viewLayer = ref('range')
// AOE 精准点选模式：'target'=选目标点，null=普通
const aoeMode = ref(null)
function setViewLayer(l) {
  viewLayer.value = l
  if (l !== 'aoe') aoeMode.value = null
  if (l === 'battle') nextTick(() => resizeBattle())
}

// 六段式蜂窝：6 段对应 6 个六边形格（中心 + 5 环绕），复用射程六边形网格画布
// ★ 2026-09-02 同步：与 GlossaryStudio.vue 及六段定稿一致（WHO 已删除，AFTER 为后效段）
const HEXSIX_LEGEND = ['WHEN', 'IF', 'ROLL', 'DO', 'AFTER', 'COST']

// B 区画布交互数据（射程/AOE/地图炮绘制落点在此维护）
const rangeCtx = reactive({
  path: [],     // 路径连线
  // 地图炮六向补全数据（与 MC_DIR_KEYS 一致）
  mcShapes: { right: [], rightup: [], leftup: [], left: [], leftdown: [], rightdown: [] },
  mcDir: 'right',
  brush: 'range',
  radius: 1,
  rangeMax: 3,
  // —— 第五部分：画板是「目标解析 / IF 段」的可视化末端 ——
  // 射程真相源：优先读 target（目标解析），回退到 draft.range（旧字段）
  target: null,        // { type, min_range, max_range, shape, cast_range }
  conditions: [],      // IF 段空间类条件数组（条件图层 Cond）
  shape: 'circle',     // circle | line | custom
  aoeCenter: null,          // AOE 目标点（射程内某一点，未设时为 null）
  aoeSpread: 0               // AOE 攻击范围半径（格）
})

// 用户在表单/泳道中修改词条时，实时把目标解析/IF 段同步给画板
watch(() => draft.value, () => syncTargetToCanvas(), { deep: true })

// 传给 HexCanvasEditor 的视图模式
const canvasViewMode = computed(() => {
  switch (viewLayer.value) {
    case 'hexsix': return 'hexsix'
    case 'range': return 'range'
    case 'aoe': return 'aoe'
    case 'mapcannon': return 'map'
    case 'battle': return 'range'
    default: return 'range'
  }
})

// 六段式模式下，D 区选中的段高亮对应六边形格
const activeLaneIndexForCanvas = computed(() => {
  if (viewLayer.value !== 'hexsix') return -1
  return selectedLane.value >= 0 ? selectedLane.value : 0
})

const viewTitle = computed(() => {
  switch (viewLayer.value) {
    case 'hexsix': return '六段式填充六边形（点击段格选中 · 拖入原子）'
    case 'range': return '射程 / 攻击范围画布'
    case 'aoe': return 'AOE 范围画布'
    case 'mapcannon': return '地图炮范围画布'
    case 'battle': return '战场模拟画布'
    default: return '画布'
  }
})

// 聚合删除/切换词条时重置绘制落点
function resetCanvasCtx() {
  rangeCtx.path = []
}

// ===== Phase 2-2：IF/ROLL 多实例数量选择器 =====
// 仅对「自身就需要分支」的原子触发：condition（条件分支）/ roll_segment（掷骰区间）。
// 普通效果原子（如 apply_damage）拖入 ROLL 段应直接添加，不弹选择器、不生成分段。
const multiDrop = ref({ open: false, laneIndex: -1, atom: null, source: '' })
function tryStartMultiInstance(laneIndex, atom, source) {
  const lane = lanes.value[laneIndex]
  if (!lane) return false
  if (lane.key !== 'IF' && lane.key !== 'ROLL') return false
  if (!atom) return false
  // 只有 condition / roll_segment 这类分支宿主才需要多实例选择器与分段生成
  const needsBranch = atom.effectType === 'condition' || atom.effectType === 'roll_segment'
  if (!needsBranch) return false
  multiDrop.value = { open: true, laneIndex, atom, source }
  return true
}
function confirmMultiInstance(count) {
  const { laneIndex, atom, source } = multiDrop.value
  multiDrop.value = { open: false, laneIndex: -1, atom: null, source: '' }
  const lane = lanes.value[laneIndex]
  if (!lane || !atom) return
  const built = buildLaneAtom(atom, false)
  // 多实例：主实例 + (count-1) 个分支占位（IF=条件分支 / ROLL=区间分支）
  lane.atoms.push(built)
  const hasBranchHost = built.effectType === 'condition' || built.effectType === 'roll_segment'
  if (!hasBranchHost) built.showBranches = true
  // roll_segment 已由 buildLaneAtom 按定义自动生成分段，不再叠加空分支
  if (built.effectType === 'roll_segment') return
  for (let k = 1; k < count; k++) {
    if (!built.branches) built.branches = []
    built.branches.push(makeBranch('', '', ''))
  }
  selectedLane.value = laneIndex
  syncLanesToDraft()
}
function cancelMultiInstance() {
  multiDrop.value = { open: false, laneIndex: -1, atom: null, source: '' }
}

// ===== 统一画布 Drop：六段式拖入原子 → 落入对应段 lane.atoms =====
function onCanvasDropAtom({ laneIndex, atom, cell }) {
  if (!atom) return
  if (laneIndex != null && laneIndex >= 0) {
    if (lanes.value[laneIndex]) {
      // Phase 2-2：IF/ROLL 段触发多实例选择器
      if (tryStartMultiInstance(laneIndex, atom, 'canvas')) return
      lanes.value[laneIndex].atoms.push(buildLaneAtom(atom, false))
      selectedLane.value = laneIndex
      syncLanesToDraft()
    }
  } else if (cell && (viewLayer.value === 'range' || viewLayer.value === 'aoe' || viewLayer.value === 'mapcannon')) {
    // 非段格普通落点（暂仅记录，射程核心由 category 推导）
    console.log('[Canvas] spatial drop at', cell)
  }
}
// B 区六段格点击选中 → 联动 D 区高亮
function onCanvasSelectLane(idx) {
  if (idx == null || idx < 0) return
  selectedLane.value = idx
}
// 地图炮绘制落点回写（点击即在范围内 toggle，无矩形限制）
function onCanvasPlaceMap(h) {
  if (!h) return
  const dir = draft.value.range.mcDir || 'right'
  const shapes = { ...(draft.value.range.mcShapes || {}) }
  if (!shapes[dir]) shapes[dir] = []
  const list = shapes[dir].map(c => ({ q: c.q, r: c.r }))
  const idx = list.findIndex(c => c.q === h.q && c.r === h.r)
  if (idx >= 0) list.splice(idx, 1)
  else list.push({ q: h.q, r: h.r })
  shapes[dir] = list
  draft.value.range.mcShapes = shapes
  rangeCtx.mcShapes = { ...shapes }
}
// 地图炮六向补全/清除/设方向（来自 HexCanvasEditor）
function onMcComplete(shapes) {
  if (!shapes) return
  const merged = { ...(draft.value.range.mcShapes || {}) }
  for (const k of MC_DIR_KEYS) {
    merged[k] = Array.isArray(shapes[k]) ? shapes[k].map(c => ({ q: c.q, r: c.r })) : (merged[k] || [])
  }
  draft.value.range.mcShapes = merged
  // 同时直接同步画布工作副本并整体替换引用，确保点按立即重绘（不依赖 watch 异步链路）
  rangeCtx.mcShapes = { ...merged }
}
function onMcClear() {
  const cleared = {}
  for (const k of MC_DIR_KEYS) cleared[k] = []
  draft.value.range.mcShapes = cleared
  rangeCtx.mcShapes = { ...cleared }
}
function onMcSetDir(dir) {
  if (MC_DIR_KEYS.includes(dir)) {
    draft.value.range.mcDir = dir
    rangeCtx.mcDir = dir
  }
}
// 将 lanes（含拖入写入）同步回 draft.tree（经既有 laneToNode 序列化路径）
function syncLanesToDraft() {
  if (!draft.value) return
  draft.value.tree = lanes.value.map(laneToNode)
  draft.value.schema_version = 2
}

// H1/H2 原子卡片「范围类型」下拉：选完跳转到相应画布图层
function onCanvasTypeChange(atom, val) {
  if (val === 'aoe') setViewLayer('aoe')
  else if (val === 'map_cannon') setViewLayer('mapcannon')
  // 注：仅切换画布视图；原子 effectType 的真实替换需拖入对应 H 组原子，
  // 此处保留卡片当前类型，避免误覆盖已绘制范围。
}

// ===== 批次3.3 字段级跳转↔返回状态机 =====
// jumpField: 当前从某原子字段跳入画布编辑的上下文；非空时顶部显示气泡提示
const jumpField = ref(null)
// 字段 key → 目标画布视图 + 回填取值函数
const JUMP_FIELD_MAP = {
  range:        { view: 'range',      toast: '射程',     pick: () => ({ range: rangeCtx.range }) },
  min_range:    { view: 'range',      toast: '最小射程', pick: () => ({ min_range: rangeCtx.range }) },
  max_range:    { view: 'range',      toast: '最大射程', pick: () => ({ max_range: rangeCtx.range }) },
  cast_range:   { view: 'range',      toast: '可选落点射程', pick: () => ({ cast_range: rangeCtx.range }) },
  direction:    { view: 'range',      toast: '方向',     pick: () => ({ direction: rangeCtx.dir }) },
  shape:        { view: 'aoe',        toast: '覆盖形状', pick: () => ({ shape: rangeCtx.shape }) },
  spread:       { view: 'aoe',        toast: '覆盖半径', pick: () => ({ spread: rangeCtx.range }) },
  length:       { view: 'mapcannon',  toast: '延伸长度', pick: () => ({ length: rangeCtx.range }) },
  width:        { view: 'mapcannon',  toast: '展开宽度', pick: () => ({ width: rangeCtx.range }) },
  mcShapes:     { view: 'mapcannon',  toast: '六向手绘格', pick: () => ({ mcShapes: rangeCtx.mcShapes }) },
}
function isJumpField(f) { return !!JUMP_FIELD_MAP[f.key] }
function jumpToCanvas(atom, f) {
  const m = JUMP_FIELD_MAP[f.key]
  if (!m) return
  jumpField.value = { atom, fieldKey: f.key, label: f.label, toast: m.toast }
  setViewLayer(m.view)
  // 若该字段已有值，预填画布上下文，保证往返一致
  if (atom.params && atom.params[f.key] != null) {
    if (f.key === 'direction') rangeCtx.dir = atom.params[f.key]
    else if (f.key === 'shape') rangeCtx.shape = atom.params[f.key]
    else if (f.key === 'mcShapes') {
      const v = atom.params[f.key] || {}
      rangeCtx.mcShapes = { ...rangeCtx.mcShapes, ...v }
      draft.value.range.mcShapes = { ...(draft.value.range.mcShapes || {}), ...v }
    }
    else if (['range','min_range','max_range','cast_range','spread','length','width'].includes(f.key)) {
      const v = Number(atom.params[f.key]) || 0
      rangeCtx.range = v
    }
  }
}
function saveJumpAndReturn() {
  const jf = jumpField.value
  if (!jf) return
  const m = JUMP_FIELD_MAP[jf.fieldKey]
  const picked = m.pick()
  const [k, v] = Object.entries(picked)[0]
  if (!jf.atom.params) jf.atom.params = {}
  jf.atom.params[k] = v
  if (selectedKey.value && !coreKeys.includes(selectedKey.value)) {
    if (!dirtyKeys.value.includes(selectedKey.value)) dirtyKeys.value = [...dirtyKeys.value, selectedKey.value]
  }
  jumpField.value = null
  console.log('[GlossaryHub] 字段跳转返回回填：', jf.fieldKey, '=', v)
}
function cancelJump() { jumpField.value = null }

// 由半径生成一圈单元格（range 字段跳转时预填画布，便于直观核对）
function buildRingCells(radius) {
  const out = []
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      out.push({ q, r })
    }
  }
  return out
}

// 由 target.min/max_range 环带展开为绝对坐标格子（19×19 体系，中心 9,9）。
// 射程是纯区间模型，无自由绘制落点。
function currentRangeCells() {
  const d = draft.value
  if (!d) return []
  const minR = Number(d.target && d.target.min_range) || 0
  const maxR = Number(d.target && d.target.max_range) || 0
  if (maxR <= 0) return []
  const out = []
  const hexAxialDist = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r))
  for (const cell of buildRingCells(maxR)) {
    if (hexAxialDist(cell.q, cell.r) < minR) continue
    out.push({ q: cell.q + 9, r: cell.r + 9 })
  }
  return out
}

// 把射程画的内容映射为地图炮（二者互斥：清空 AOE）
function applyRangeToMapCannon() {
  const d = draft.value
  if (!d) return
  const cells = currentRangeCells()
  if (!d.map_cannon) d.map_cannon = { directions: {} }
  // 全部放入 right 向（结构兼容现有读取），其余方向清空
  const out = {}
  for (const k of MC_DIR_KEYS) out[k] = []
  out.right = cells.map(c => ({ q: c.q, r: c.r }))
  d.map_cannon.directions = out
  d.map_cannon.center = { q: 9, r: 9 }
  // 互斥：AOE 与地图炮独立；切地图炮时清空 AOE
  d.aoe = { center: null, radius: 0 }
  syncTargetToCanvas()
  console.log('[GlossaryHub] 射程已映射到地图炮，格数', cells.length)
}
function syncCanvasToDraft() {
  if (!draft.value || !draft.value.range) return
  syncRangeToSkill(draft.value.range)
  // 标记脏数据并给出反馈，确保保存后即可被战斗引擎正确读取
  if (selectedKey.value && !coreKeys.includes(selectedKey.value)) {
    if (!dirtyKeys.value.includes(selectedKey.value)) dirtyKeys.value = [...dirtyKeys.value, selectedKey.value]
  }
  console.log('[GlossaryHub] 画布范围已同步到词条 draft（map_cannon/aoe）')
}

// ===== 只读词条浮层：射程摘要 =====
const rangeSummary = computed(() => {
  const d = draft.value
  if (!d) return '—'
  const t = d.target || {}
  if (t.max_range == null && t.min_range == null) return '—'
  const min = t.min_range ?? 0
  const max = t.max_range ?? 0
  return `min ${min} / max ${max}`
})

// ===== 六段编排面板（可写状态，由当前词条六段字段初始化，支持拖入原子 / 加子段） =====
const selectedLane = ref(-1)
// 六段固定骨架（对齐设计稿 / 2026-08-23 规范）：WHEN→IF→ROLL→DO→AFTER→COST
// WHO(主语/目标解析) 已并入 DO 段内首原子，不再作为独立主段。
// 存量词条 d.target.type 在 initLanesFromDraft 投影为 DO 段首原子，落库时反向写回。
const LANE_SKELETON = [
  { key: 'WHEN', name: 'WHEN 时机', desc: '触发闸门', grp: 'A' },
  { key: 'IF', name: 'IF 条件', desc: '前置判定', grp: 'B' },
  { key: 'ROLL', name: 'ROLL 掷骰', desc: '随机/分支', grp: 'D' },
  { key: 'DO', name: 'DO 执行', desc: '效果堆叠/目标解析', grp: 'F' },
  { key: 'AFTER', name: 'AFTER 后效', desc: '延时生效/回合末结算', grp: 'G' },
  { key: 'COST', name: 'COST 代价', desc: 'AP/冷却', grp: 'E' }
]
// 从词条六段字段派生每段的初始原子展示
function deriveLaneAtoms(laneKey, d) {
  if (!d) return []
  switch (laneKey) {
    case 'WHEN': {
      const t = (d.timing && (d.timing.trigger || d.timing.type)) || (d.trigger && d.trigger.type) || 'none'
      return [{ grp: 'A', key: 'timing_' + t, label: '时机: ' + t }]
    }
    case 'IF': {
      const c = (d.conditions && d.conditions.length) ? d.conditions : []
      if (!c.length) return [{ grp: 'B', key: 'cond_none', label: '条件: none' }]
      return c.map((x, i) => ({ grp: 'B', key: 'cond_' + i, label: '条件: ' + (x.type || x.key || JSON.stringify(x)) }))
    }
    case 'ROLL': {
      const r = (d.roll && d.roll.mode) || 'none'
      return [{ grp: 'D', key: 'roll_' + r, label: '掷骰: ' + r }]
    }
    case 'DO': {
      // WHO(主语/目标解析) 并入 DO 段首原子：从 d.target.type 派生展示
      const targetAtoms = []
      const w = (d.target && d.target.type) || 'none'
      if (w && w !== 'none') {
        targetAtoms.push({ grp: 'C', key: 'target_' + w, label: '目标解析: ' + w, effectType: 'target_selection', fields: TARGET_FIELDS, params: { target_type: w } })
      }
      const e = d.effects || []
      if (!targetAtoms.length && !e.length) return [{ grp: 'F', key: 'do_none', label: '效果: none' }]
      const effectAtoms = e.map((x, i) => {
        const type = x.type || x.label || ('效果' + i)
        // 读回的扁平 effect 映射回可编辑原子实例（参数直接来自后端值）
        const fields = EFFECT_FIELDS[type] || []
        const params = {}
        fields.forEach(f => { params[f.key] = (x[f.key] !== undefined) ? x[f.key] : f.default })
        return { grp: 'F', key: 'do_' + i, label: '效果: ' + type, effectType: type, fields, params }
      })
      return [...targetAtoms, ...effectAtoms]
    }
    case 'AFTER': {
      // 延时后效段：从 d.effects 中筛选 after 标记 或 d.after 字段
      const after = (d.after && d.after.effects) || []
      if (!after.length) return [{ grp: 'G', key: 'after_none', label: '后效: none' }]
      return after.map((x, i) => {
        const type = x.type || x.label || ('后效' + i)
        const fields = EFFECT_FIELDS[type] || []
        const params = {}
        fields.forEach(f => { params[f.key] = (x[f.key] !== undefined) ? x[f.key] : f.default })
        return { grp: 'G', key: 'after_' + i, label: '后效: ' + type, effectType: type, fields, params }
      })
    }
    case 'COST': {
      const ap = (d.cost && d.cost.ap) ?? d.ap_cost ?? 0
      return [{ grp: 'E', key: 'cost_ap', label: 'AP: ' + ap }]
    }
    default: return []
  }
}
// ===== 六段式坐标锚定（方案 B：WHEN 锁定 (5,10) 不可移动/擦除） =====
// 与 HexCanvasEditor 的星形公式同源；写入 lane.coord 作为数据真相源，
// 画布优先读 lane.coord。WHEN 恒为 (5,10)。顺序无关（按 key 查）。
// 以 WHEN 为锚点展开相对星形：coord[i] = WHEN + (neigh[i] - neigh[whenIndex])，
// 这样 WHEN(key='WHEN') 严格落在 (5,10)，其余 5 点围绕它形成六格星形。
import { getHexNeighbors } from '../utils/hexUtils.js'
const HEXSIX_KEY_BY_NEIGHBOR = ['IF', 'WHEN', 'ROLL', 'DO', 'AFTER', 'COST']
const _HX_NEIGH = getHexNeighbors(0, 0)
const _WHEN_ANCHOR = { q: 5, r: 10 }
const _HX_WHEN_IDX = HEXSIX_KEY_BY_NEIGHBOR.indexOf('WHEN')
const _HX_COORDS = _HX_NEIGH.map((c, i) => ({
  q: _WHEN_ANCHOR.q + (c.q - _HX_NEIGH[_HX_WHEN_IDX].q),
  r: _WHEN_ANCHOR.r + (c.r - _HX_NEIGH[_HX_WHEN_IDX].r),
}))
const LANE_COORD_BY_KEY = {}
HEXSIX_KEY_BY_NEIGHBOR.forEach((k, i) => { LANE_COORD_BY_KEY[k] = _HX_COORDS[i] })
// 动态新增段（非六段固定 key）的坐标：以 WHEN 为锚向外环偏移，避免叠在原点
function dynamicCoord(index) {
  const ring = 3
  const ang = (Math.PI * 2 / 6) * (index % 6) + index * 0.6
  return {
    q: _WHEN_ANCHOR.q + Math.round(ring * Math.cos(ang)),
    r: _WHEN_ANCHOR.r + Math.round(ring * Math.sin(ang))
  }
}
function withLaneCoord(s, extra) {
  const coord = LANE_COORD_BY_KEY[s.key] || dynamicCoord(extra && extra._dynIdx != null ? extra._dynIdx : 0)
  return Object.assign({ key: s.key, name: s.name, desc: s.desc, grp: s.grp, coord }, extra)
}
// ===== 步骤3·段树回读：schema_version=2 的 d.tree → 可编辑泳道 =====
// 契约原子 {type, atom_key, ...params} → 段内原子实例（补回 fields 骨架用于渲染表单）
function findAtomDef(type, atomKey) {
  for (const g of atomGroups) {
    for (const a of g.atoms) {
      if (atomKey && a.key === atomKey) return a
    }
  }
  // 方案 A：语义名优先匹配（type 可能是语义名如 D6_armor_pierce）
  for (const g of atomGroups) {
    for (const a of g.atoms) {
      if (a.semantic && a.semantic === type) return a
    }
  }
  for (const g of atomGroups) {
    for (const a of g.atoms) {
      if (a.effectType === type) return a
    }
  }
  return null
}
function contractToAtom(e) {
  const def = findAtomDef(e.type, e.atom_key)
  const fields = (def && def.fields) || EFFECT_FIELDS[e.type] || []
  const params = {}
  fields.forEach(f => { params[f.key] = (e[f.key] !== undefined) ? e[f.key] : f.default })
  // 伤害族回读：flat_value 反投影回编辑器 value（若该原子定义里用的是 value）
  if (e.flat_value !== undefined && fields.some(f => f.key === 'value') && params.value === undefined) {
    params.value = e.flat_value
  }
  return {
    grp: (def && def.grp) || 'F',
    key: e.atom_key || (def && def.key) || e.type,
    label: (def && def.label) || e.type,
    effectType: e.type,
    semantic: e._semantic || (def && def.semantic) || undefined, // 方案 A：回读时保留语义名
    fields,
    params,
    mode: {}
  }
}
function nodeToLane(node, skel) {
  const atoms = (node.atoms || []).map(contractToAtom)
  // 分支回挂到本段第一个可分叉原子上（roll_segment / condition）
  if (node.branches && node.branches.length) {
    let host = atoms.find(a => a.effectType === 'roll_segment' || a.effectType === 'condition')
    if (!host) {
      host = { grp: skel.grp, key: 'branch_host', label: '分叉宿主', effectType: 'roll_segment', fields: [], params: {}, mode: {} }
      atoms.push(host)
    }
    host.showBranches = true
    host.branches = node.branches.map(b => ({
      lower: b.lower != null ? b.lower : '',
      upper: b.upper != null ? b.upper : '',
      label: b.label || b.when || '',
      atoms: [
        ...((b.effects || []).map(contractToAtom)),
        ...((b.children || []).flatMap(c => (c.atoms || []).map(contractToAtom)))
      ].filter((a, i, arr) => arr.findIndex(x => x.key === a.key && x.effectType === a.effectType) === i)
    }))
  }
  const nest = (node.children && node.children.length && !(node.branches || []).length)
    ? { atoms: (node.children[0].atoms || []).map(contractToAtom) }
    : null
  return { key: skel.key, name: skel.name, desc: skel.desc, grp: skel.grp, atoms, nest }
}

const lanes = ref([])
const SKELETON_KEYS = LANE_SKELETON.map(s => s.key)
function initLanesFromDraft() {
  const d = draft.value
  // schema_version=2：优先按段树回读（保真往返）
  if (d && Number(d.schema_version) === 2 && Array.isArray(d.tree) && d.tree.length) {
    const byPhase = {}
    d.tree.forEach(n => { if (n && n.phase) byPhase[n.phase] = n })
    // 1) 先还原固定六段骨架（缺失补空，保证 WHEN 锚定始终存在）
    const restored = LANE_SKELETON.map(s => byPhase[s.key]
      ? withLaneCoord(s, nodeToLane(byPhase[s.key], s))
      : withLaneCoord(s, { atoms: [], nest: null }))
    // 目标解析(原 WHO 段)并入 DO 段首原子：从契约真相 draft.target.type 还原「目标定义」原子
    const doLaneRestore = restored.find(l => l.key === 'DO')
    if (doLaneRestore && d.target && d.target.type && !doLaneRestore.atoms.some(a => a.effectType === 'target_selection')) {
      const tt = d.target.type
      const def = (atomGroups.find(g => g.grp === 'W') || { atoms: [] }).atoms.find(a => a.fields && a.fields.target_type === tt)
        || (atomGroups.find(g => g.grp === 'W') || { atoms: [] }).atoms[1]
      if (def) {
        doLaneRestore.atoms.unshift(Object.assign({}, def, {
          effectType: 'target_selection',
          fields: { target_type: tt },
          target_type: tt
        }))
      }
    }
    // 2) 追加六段以外的自定义段（EXTRA/REACT/TRIGGER/COND/CUSTOM…），实现增删持久化
    d.tree.forEach(n => {
      if (n && n.phase && !SKELETON_KEYS.includes(n.phase)) {
        const sk = LANE_SKELETON.find(s => s.grp === n.grp) // 仅用于取坐标锚，不强制匹配
        const coord = withLaneCoord({ key: n.phase, name: n.name || n.phase, desc: n.desc || '自定义段', grp: n.grp || 'Z' }, {})
        restored.push(Object.assign(coord, nodeToLane(n, { key: n.phase, name: n.name || n.phase, desc: n.desc || '自定义段', grp: n.grp || 'Z' })))
      }
    })
    lanes.value = restored
    return
  }
  lanes.value = LANE_SKELETON.map(s => withLaneCoord(s, {
    atoms: deriveLaneAtoms(s.key, d),
    nest: null
  }))
}
// 选中词条时初始化编排（在 onSelect 末尾调用）
function syncLanesFromDraft() { initLanesFromDraft() }

// ===== 动态增删段（前端可自由添加/删除六段以外的自定义段）=====
let _dynCounter = 0
// 添加段下拉预设（除六段外的常见扩展语义）
const ADD_LANE_PRESETS = [
  { key: 'EXTRA', name: '附加段' },
  { key: 'REACT', name: '反应段' },
  { key: 'TRIGGER', name: '触发段' },
  { key: 'COND', name: '条件段' },
  { key: 'CUSTOM', name: '自定义段' }
]
const addLaneOpen = ref(false)
const addLaneKey = ref('')
function toggleAddLane() { addLaneOpen.value = !addLaneOpen.value }
function addLaneFromPreset(k) {
  addLaneOpen.value = false
  if (!k) return
  if (lanes.value.some(l => l.key === k)) { alert('段「' + k + '」已存在'); return }
  const dynIdx = _dynCounter++
  const preset = ADD_LANE_PRESETS.find(p => p.key === k)
  const lane = withLaneCoord(
    { key: k, name: preset ? preset.name : k, desc: '自定义段', grp: 'Z' },
    { _dynIdx: dynIdx, atoms: [], nest: null }
  )
  lanes.value.push(lane)
  syncLanesToDraft()
}
// 删除段：WHEN 锚定段不可删；其余可删（用内联二次确认，避免原生 confirm 被浏览器拦截导致"点了没反应"）
const pendingDelete = ref(-1)
function askDeleteLane(i) {
  const lane = lanes.value[i]
  if (!lane) return
  if (lane.key === 'WHEN') { alert('WHEN 时机段为锚定段，不可删除'); return }
  pendingDelete.value = i
}
function cancelDeleteLane() { pendingDelete.value = -1 }
function confirmDeleteLane() {
  const i = pendingDelete.value
  pendingDelete.value = -1
  if (i < 0 || !lanes.value[i]) return
  lanes.value.splice(i, 1)
  if (selectedLane.value >= lanes.value.length) selectedLane.value = Math.max(0, lanes.value.length - 1)
  syncLanesToDraft()
}

// ===== 拖拽：原子面板 → 六段泳道（携带 effectType/semantic/fields/默认 params） =====
function onAtomDragStart(e, atom) {
  e.dataTransfer.setData('text/atom', JSON.stringify({
    grp: atom.grp, key: atom.key, label: atom.label,
    effectType: atom.effectType, semantic: atom.semantic, fields: atom.fields || []
  }))
  e.dataTransfer.effectAllowed = 'copy'
}
// 由拖入的原子数据构造段内原子实例（含默认 params / 区间分支骨架）
function buildLaneAtom(a, isSegment) {
  const inst = {
    grp: a.grp, key: a.key, label: a.label,
    effectType: a.effectType || 'unknown',
    semantic: a.semantic || a.semantic_cache, // 方案 A：携带语义名（如 D6_armor_pierce），保存时优先作 type
    fields: a.fields || [],
    params: defaultParamsOf(a),
    mode: {}
  }
  if (isSegment || a.effectType === 'roll_segment') {
    inst.showBranches = true
    // 阶段0：每个 branch 是一行「完整六段子链」，注入空 subLanes 骨架（决策点3：复用 LANE_SKELETON）
    // 按 roll 原子定义自动生成分段（sides/threshold/segment_count/mapping）
    inst.branches = generateRollBranches(inst)
  }
  // 阶段0 隐患3：roll_segment 伤害原子带 [旁路伤害模式] Tag（按实际路由判定显隐）
  if (a.effectType === 'roll_segment') {
    inst.bypassTag = isBypassAtom(a)
  }
  return inst
}
// 旁路判定：当前原子走 direct_damage 旁路（过渡期，C 项未合入前恒真；C 项合入后按真实路由判定）
function isBypassAtom(a) {
  const t = (a && a.effectType) || ''
  // 过渡期：segment 伤害统一走 direct_damage 旁路（不穿透护甲），需打 Tag 提示
  return t === 'roll_segment' || t === 'direct_damage' || t === 'direct_damage_split'
}
// 懒加载补齐某 branch 的 subLanes 空结构（隐患2 Pre-flight：避免空分支 drop 写 undefined）
// 纯函数：返回可用数组；若原 subLanes 缺失/长度不符，则写入补齐后的结构并返回
function ensureBranchSubLanes(branch) {
  if (!branch) return []
  if (!Array.isArray(branch.subLanes) || branch.subLanes.length !== LANE_SKELETON.length) {
    branch.subLanes = LANE_SKELETON.map((s, idx) => ({ key: s.key, name: s.name, desc: s.desc, ord: idx + 1, atoms: [] }))
  }
  return branch.subLanes
}
function onLaneDragOver(e, i) { e.currentTarget.classList.add('drag-over') }
function onLaneDrop(e, i) {
  e.currentTarget.classList.remove('drag-over')
  const raw = e.dataTransfer.getData('text/atom')
  if (!raw) return
  try {
    const a = JSON.parse(raw)
    // Phase 2-2：IF/ROLL 段触发多实例选择器
    if (tryStartMultiInstance(i, a, 'panel')) return
    lanes.value[i].atoms.push(buildLaneAtom(a, false))
  } catch { /* ignore */ }
}
function onNestDragOver(e, i) { e.currentTarget.classList.add('drag-over') }
function onNestDrop(e, i) {
  e.currentTarget.classList.remove('drag-over')
  const raw = e.dataTransfer.getData('text/atom')
  if (!raw) return
  try {
    const a = JSON.parse(raw)
    if (!lanes.value[i].nest) lanes.value[i].nest = { atoms: [] }
    lanes.value[i].nest.atoms.push(buildLaneAtom(a, false))
  } catch { /* ignore */ }
}

// ===== 段内原子增删 =====
function removeAtom(laneIdx, atomIdx) {
  lanes.value[laneIdx].atoms.splice(atomIdx, 1)
}
function removeNestAtom(laneIdx, atomIdx) {
  const n = lanes.value[laneIdx].nest
  if (!n) return
  n.atoms.splice(atomIdx, 1)
  if (!n.atoms.length) lanes.value[laneIdx].nest = null
}
// 在选中的段上添加子段（点「＋ 子段」按钮；≤3 层，目前支持 1 层）
function addNest(i) {
  // 先看点击的是哪个段：按钮在 lane-head，但用户期望作用于「当前选中的段」
  const target = (selectedLane.value >= 0) ? selectedLane.value : i
  selectedLane.value = target
  if (!lanes.value[target].nest) lanes.value[target].nest = { atoms: [] }
}

// ===== 六段之间顺序调整（拖拽段头重排） =====
// Phase 2-4（#12）：六段硬边约束，编辑器灰掉禁插（不自动重排、不弹窗）
// 合法相对顺序（WHEN 永远首位，其后按逻辑链 WHEN→IF→ROLL→DO→AFTER→COST）
// ★ 2026-09-02 同步：与 GlossaryStudio.vue 一致（删 WHO、插 AFTER）
const LANE_LEGAL_ORDER = ['WHEN', 'IF', 'ROLL', 'DO', 'AFTER', 'COST']
// 判断当前 lanes 的 key 序列是否仍满足合法相对顺序（允许缺失，但不允许逆序）
function isLaneOrderValid(keys) {
  const pos = k => LANE_LEGAL_ORDER.indexOf(k)
  for (let a = 0; a < keys.length; a++) {
    for (let b = a + 1; b < keys.length; b++) {
      if (pos(keys[a]) > pos(keys[b])) return false
    }
  }
  return true
}
// 某段是否「锁定不可拖」：WHEN 永远锁定；其余段在拖动会破坏合法顺序时锁定
function isLaneOrderLocked(i) {
  const lanesNow = lanes.value || []
  if (!lanesNow[i]) return false
  if (lanesNow[i].key === 'WHEN') return true // WHEN 锚定首位，不可移动
  return false
}
const dragOverLane = ref(-1)
function onLaneDragStart(e, i) {
  if (isLaneOrderLocked(i)) {
    // WHEN 锚点或受约束段：禁止拖拽（灰掉禁插）
    e.dataTransfer.effectAllowed = 'none'
    e.preventDefault()
    return
  }
  e.dataTransfer.setData('text/lane', String(i))
  e.dataTransfer.effectAllowed = 'move'
}
function onLaneDragEnd() { dragOverLane.value = -1 }
function onLaneColDragOver(e, i) {
  // 仅当拖拽源是「段」时才高亮，避免与原子拖放冲突
  if (e.dataTransfer.types.includes('text/lane')) {
    dragOverLane.value = i
  }
}
function onLaneColDrop(e, i) {
  dragOverLane.value = -1
  const raw = e.dataTransfer.getData('text/lane')
  if (raw === '') return // 原子拖放不在此处理
  const from = Number(raw)
  if (Number.isNaN(from) || from === i) return
  if (isLaneOrderLocked(from)) return // 锚点段禁止移动
  const arr = lanes.value
  // 试算移动后的顺序，若破坏合法相对顺序则拒绝（不重排、不弹窗）
  const trial = arr.slice()
  const [moved] = trial.splice(from, 1)
  trial.splice(i, 0, moved)
  if (!isLaneOrderValid(trial.map(l => l.key))) return
  const [movedReal] = arr.splice(from, 1)
  arr.splice(i, 0, movedReal)
  // 重排后修正选中段索引
  if (selectedLane.value === from) selectedLane.value = i
  else if (selectedLane.value > from && selectedLane.value <= i) selectedLane.value--
  else if (selectedLane.value < from && selectedLane.value >= i) selectedLane.value++
}

// ===== 编排写回词条（步骤3·递归段树）=====
// 产物为「双形」：
//   1) d.tree + d.schema_version=2 —— 递归段树，供 skillExecutor._walkPhaseTree 消费（支持 IF/ROLL 分叉）
//   2) d.effects / d.roll.segments —— v1 扁平投影，保持存量引擎路径与旧读端不破坏
// 段树节点：{ phase:'WHEN'|'IF'|'ROLL'|'DO'|'AFTER'|'COST', atoms:[{type,params}], branches:[{lower,upper,label,when?,children:[node]}] }

// 段内原子实例 → 契约原子 { type, ...params }（承担字段名归一，如 damage 类 value→flat_value）
function atomToContract(a) {
  const p = { ...(a.params || {}) }
  const t = a.effectType
  // 方案 A：保存时语义名优先（如 D6_armor_pierce），后端 atomRegistry.resolve 翻译为引擎 key；
  // 未携带 semantic 时回退引擎 key（如 armor_pierce），双向兼容存量/旧链路。
  const type = a.semantic || t
  // 伤害族：编辑器 value 语义统一落到引擎认的 flat_value
  if ((t === 'direct_damage' || t === 'damage' || t === 'direct_damage_split') && p.value !== undefined && p.flat_value === undefined) {
    p.flat_value = p.value
    delete p.value
  }
  return { type, atom_key: a.key, _semantic: a.semantic || undefined, ...p }
}
// 段内原子数组 → 契约数组（过滤未识别原子）
function atomsToContract(list) {
  return (list || [])
    .filter(a => a && a.effectType && a.effectType !== 'unknown' && a.effectType !== 'target_selection')
    .map(atomToContract)
}
// 分支 → 段树分支节点（阶段1：子链语义——分支内按六段 subLanes 形成完整子链 children）
const GRP_TO_PHASE = { A: 'WHEN', B: 'IF', C: 'DO', D: 'DO', E: 'COST', F: 'DO', G: 'AFTER', H: 'DO', I: 'DO', J: 'DO', K: 'COST' }
function branchToNode(b, parentPhase) {
  // 阶段1：优先用 subLanes（六段子链）构建 children；兼容旧数据无 subLanes 时退化到 grp 归段
  const rawSub = (b.subLanes && b.subLanes.length === LANE_SKELETON.length)
    ? b.subLanes
    : null
  let children
  if (rawSub) {
    children = rawSub.map(sl => ({
      phase: sl.key,                 // WHEN/IF/ROLL/DO/AFTER/COST（决策点3：固定六段）
      atoms: atomsToContract(sl.atoms || []),
      branches: []
    }))
    // WHEN 段内的触发原子若自身带分支，则在该子链节点上继续派生 children（递归分行）
    children.forEach(cn => {
      const trig = (cn.atoms || []).find(a => a.effectType === 'trigger' && a.showBranches && a.branches && a.branches.length)
      if (trig) cn.branches = trig.branches.map(bb => branchToNode(bb, cn.phase))
    })
  } else {
    // 旧数据兜底：按 grp 归段
    const buckets = {}
    ;(b.atoms || []).forEach(a => {
      const ph = (a.effectType === 'trigger') ? 'WHEN'
        : (a.effectType === 'condition') ? 'IF'
        : (a.effectType === 'roll_segment') ? 'ROLL'
        : (GRP_TO_PHASE[a.grp] || 'DO')
      if (!buckets[ph]) buckets[ph] = []
      buckets[ph].push(a)
    })
    children = Object.keys(buckets).map(ph => ({
      phase: ph,
      atoms: atomsToContract(buckets[ph]),
      branches: []
    }))
  }
  const node = {
    label: b.label || '',
    children,
    // 兼容平铺读取：分支的 DO 段效果投影一份（供存量引擎/旧读端）
    effects: atomsToContract(
      (rawSub
        ? (rawSub.find(s => s.key === 'DO')?.atoms || [])
        : (b.atoms || [])).filter(a => (a.effectType !== 'trigger' && a.effectType !== 'condition' && a.effectType !== 'roll_segment'))
    )
  }
  if (parentPhase === 'ROLL') {
    node.lower = Number(b.lower) || 1
    node.upper = Number(b.upper) || 6
  } else {
    // IF 分叉：lower/upper 复用为条件表达式槽（留空则视为 else 分支）；g集合决策点2：统一 gate_condition
    node.when = b.label || ''
    node.gate_condition = b.label || ''   // 阶段2 引擎统一闸门（IF 条件 / ROLL 区间归一）
    if (b.lower !== '' && b.lower != null) node.lower = Number(b.lower)
    if (b.upper !== '' && b.upper != null) node.upper = Number(b.upper)
  }
  return node
}
// 单条泳道 → 段树节点
function laneToNode(lane) {
  const phase = lane.key
  const node = {
    phase,
    atoms: atomsToContract(lane.atoms),
    branches: []
  }
  ;(lane.atoms || []).forEach(a => {
    if (a.showBranches && a.branches && a.branches.length) {
      a.branches.forEach(b => node.branches.push(branchToNode(b, phase)))
    }
  })
  // 子段（＋子段 按钮产出的 nest）→ children 递归一层
  if (lane.nest && lane.nest.atoms && lane.nest.atoms.length) {
    node.children = [{ phase, atoms: atomsToContract(lane.nest.atoms), branches: [] }]
  }
  return node
}

function writeLanesToDraft() {
  const d = draft.value
  if (!d) return

  // ---- 1) 递归段树（新契约） ----
  const tree = lanes.value.map(laneToNode)
  // 保存时若六段核心段（WHEN/IF/ROLL/DO/AFTER/COST）被删除，则补一个 none 占位节点，
  // 避免段树缺段导致引擎/后端按"段不存在"误判；none 即该段显式为空。
  const present = new Set(tree.map(n => n.phase))
  LANE_SKELETON.forEach(s => {
    if (!present.has(s.key)) {
      tree.push({ phase: s.key, atoms: [], branches: [], none: true })
    }
  })
  d.tree = tree
  d.schema_version = 2

  // ---- 2) v1 扁平投影（保持存量引擎/旧读端不破坏） ----
  const doLane = lanes.value.find(l => l.key === 'DO')
  if (doLane) {
    const effs = atomsToContract(doLane.atoms)
    if (effs.length) d.effects = effs
    // 目标解析(原 WHO 段)：DO 段首 target_selection 原子投影到契约真相 draft.target.type
    const tgt = doLane.atoms.find(a => a.effectType === 'target_selection')
    if (tgt) {
      const tt = (tgt.fields && tgt.fields.target_type !== undefined) ? tgt.fields.target_type : (tgt.target_type || 'SINGLE_ENEMY')
      d.target = Object.assign({}, d.target, { type: tt })
    }
  }
  const ifLane = lanes.value.find(l => l.key === 'IF')
  if (ifLane) {
    const conds = atomsToContract(ifLane.atoms.filter(a => a.effectType === 'condition'))
    if (conds.length) d.conditions = conds
  }
  const rollLane = lanes.value.find(l => l.key === 'ROLL')
  if (rollLane) {
    const segAtoms = rollLane.atoms.filter(a => a.showBranches && a.branches && a.branches.length)
    if (segAtoms.length) {
      const segments = []
      segAtoms.forEach(a => a.branches.forEach(b => {
        segments.push({
          lower: Number(b.lower) || 1,
          upper: Number(b.upper) || 6,
          label: b.label || a.label,
          effects: atomsToContract(b.atoms)
        })
      }))
      if (segments.length) {
        d.roll = { mode: 'segment', generator: { method: 'flat', value: 0 }, segments }
      }
    }
  }
  // AFTER 后效段：已由主链 laneToNode 写入 d.tree 的 {phase:'AFTER'} 节点（单一真相源），
  // 后端战斗核心/模拟管道只消费 d.tree，不读 d.after，故此处不再写冗余 d.after 扁平字段。
}

// 原子数据已收口至 @/battle/glossary/atomGroups.js（单一真相源，禁止在此内嵌副本）
// ===== 原子面板：搜索 / 折叠 / 引擎状态点 =====
const atomSearch = ref('')
// 默认全收起分组；搜索时（有 atomSearch 关键字）自动展开命中组，便于直接拖拽
const collapsedGroups = ref(atomGroups.map(g => g.grp))
watch(atomSearch, (q) => {
  if (q && q.trim()) collapsedGroups.value = []
  else collapsedGroups.value = atomGroups.map(g => g.grp)
})
function toggleGroup(g) {
  const i = collapsedGroups.value.indexOf(g)
  if (i >= 0) collapsedGroups.value.splice(i, 1)
  else collapsedGroups.value.push(g)
}
const stClass = (st) => ({ ok: 'st-ok', alias: 'st-alias', new: 'st-new' }[st] || 'st-ok')
const stLabel = (st) => ({ ok: '引擎已就绪（handler / 段树求值器已接通）', alias: '由调度层承接（WHEN 时机，非 effectExecutor handler）', new: '引擎需新建' }[st] || '')
const totalAtomCount = computed(() => atomGroups.reduce((n, g) => n + g.atoms.length, 0))
// 引擎 effectExecutor 已注册真实 handler 真名（与 atomGroups.effectType 一一对应，避免 UNKNOWN_TYPE）
const ENGINE_HANDLERS = [
  'instant_kill','damage_bonus_dice','damage_reduction','direct_damage','damage',
  'duel_resolution','luck_resolution','plunder_attempt','grant_extra_turn','block_movement',
  'assist_choice','remove_buff','modify_stat','custom',
  // ★ 2026-09-02 新增登记（后端均已真实实现）：COST 代价三原子 / 词条联动 / 运行时目标解析 / 生成单位
  //   注：'spawn_items'（后端 handleSpawnItems 为空壳）已由 'spawn_unit' 取代
  'cost_ap','cost_energy','cost_durability','trigger_entry','resolve_target','spawn_unit',
  'enter_stealth','exit_stealth','stealth_attack_bonus','stealth_evasion',
  'height_advantage','terrain_kind_modifier','manual_roll','equipment_lock',
  'resource_recovery','recover','recovery','durability_consumption','slot_occupancy',
  'shield','charge_layer','mutual_exclusion','permanent_disable',
  'action_debt','preempt','order_rewrite','forfeit_move','skip_mobility','displace',
  'visibility','selectable','scan_reveal','plunder',
  'direct_damage_split','grant_revoke_action','limit_no_chain','map_cannon','aoe',
  'rewrite_entry','player_optional','interrupt_window',
  'collinear','charge_stack','cooldown','damage_share','armor_pierce','reflect_damage','prerequisite_clear',
  // 以下为「契约层承接」的别名 effectType（不进入 effectExecutor，由 draft.target / draft.branches 等契约字段承载）
  'target_selection'  // 目标定义：写回 draft.target.type
]
const engineHandlerCount = ENGINE_HANDLERS.length
// 校验：原子面板的 effectType 必须命中引擎真 handler（X 组手动/自定义类例外）
const unknownAtomTypes = computed(() => {
  const set = new Set(ENGINE_HANDLERS)
  const bad = []
  atomGroups.forEach(g => g.atoms.forEach(a => {
    if (!set.has(a.effectType)) bad.push(`${a.grp}/${a.key}:${a.effectType}`)
  }))
  return bad
})
const filteredAtomGroups = computed(() => {
  const q = (atomSearch.value || '').trim().toLowerCase()
  if (!q) return atomGroups
  return atomGroups
    .map(g => ({ ...g, atoms: g.atoms.filter(a =>
      a.label.toLowerCase().includes(q) || a.key.toLowerCase().includes(q)) }))
    .filter(g => g.atoms.length)
})
const filteredAtomCount = computed(() => filteredAtomGroups.value.reduce((n, g) => n + g.atoms.length, 0))

// ===== 数字双模（固定值 / 公式） =====
function isFormula(a, key) { return !!(a.mode && a.mode[key]) }
function toggleNumMode(a, key) { if (!a.mode) a.mode = {}; a.mode[key] = !a.mode[key] }

// ===== IF / ROLL 段分叉分支（branches） =====
// 构造一条标准分段（注入完整六段子链骨架 subLanes）
function makeBranch(lower, upper, label) {
  return {
    lower, upper, label: label || '',
    atoms: [],
    subLanes: LANE_SKELETON.map((s, idx) => ({ key: s.key, name: s.name, desc: s.desc, ord: idx + 1, atoms: [] }))
  }
}

/**
 * 根据 ROLL 原子的定义（params）自动生成对应数量/区间的分段。
 * 支持三种语义：
 *  - roll_segments（二分）：sides → [1..floor(sides/2)] / [floor(sides/2)+1..sides]（无成功阈值，按骰面数中分）
 *  - roll_segments_m（多段等分）：sides + segment_count → 均匀划分 N 段
 *  - roll_segments_color（分色映射）：mapping 文本 "1-3:red;4-6:black" → 解析区间+标签
 * 其它：无 sides/segment_count 默认 1 段 [1..sides||6]
 * 已有分支的 atoms 按区间覆盖关系尽量保留（lower/upper 落在新区间则迁移）。
 */
function generateRollBranches(atom) {
  const p = atom.params || {}
  const key = atom.key
  const rawSides = Number(p.sides) || 6
  const sides = Math.max(1, Math.min(20, rawSides))
  let specs = []
  if (key === 'roll_segments') {
    // roll 类原子不再有成功阈值选项：按骰面数中分二分
    const th = Math.max(1, Math.floor(sides / 2))
    specs = [
      { lower: 1, upper: th, label: '低区' },
      { lower: th + 1, upper: sides, label: '高区' }
    ]
  } else if (key === 'roll_segments_m' && p.segment_count != null && p.segment_count !== '') {
    const n = Math.max(1, Math.min(sides, Number(p.segment_count) || 3))
    const step = sides / n
    for (let k = 0; k < n; k++) {
      const lo = Math.floor(k * step) + 1
      const hi = k === n - 1 ? sides : Math.floor((k + 1) * step)
      specs.push({ lower: lo, upper: hi, label: `分段 ${k + 1}` })
    }
  } else if (key === 'roll_segments_color' && p.mapping) {
    // mapping 形如 "1-3:red;4-6:black"，每段 "lo-hi:label"
    specs = String(p.mapping).split(';').map(s => s.trim()).filter(Boolean).map(seg => {
      const m = seg.match(/^(\d+)\s*-\s*(\d+)\s*:\s*(.+)$/)
      if (m) return { lower: Number(m[1]), upper: Number(m[2]), label: m[3].trim() }
      const m2 = seg.match(/^(\d+)\s*:\s*(.+)$/)
      if (m2) return { lower: Number(m2[1]), upper: Number(m2[1]), label: m2[2].trim() }
      return null
    }).filter(Boolean)
  }
  if (!specs.length) specs = [{ lower: 1, upper: sides, label: '' }]
  // 保留旧分支已填 atoms：按旧区间中点落入新区间迁移
  const old = (atom.branches || []).map(b => ({
    mid: ((Number(b.lower) || 1) + (Number(b.upper) || 1)) / 2,
    atoms: b.atoms || []
  }))
  return specs.map(s => {
    const nb = makeBranch(s.lower, s.upper, s.label)
    const hit = old.find(o => o.mid >= s.lower && o.mid <= s.upper)
    if (hit) nb.atoms = hit.atoms
    return nb
  })
}

// ROLL 字段变更后重新生成分段（保留已填内容）
function regenRollBranches(a) {
  if (!a || a.effectType !== 'roll_segment') return
  a.showBranches = true
  a.branches = generateRollBranches(a)
  syncLanesToDraft()
}

function addBranch(a) {
  if (!a.branches) a.branches = []
  a.showBranches = true
  // 阶段0：默认连续区间（从上一条 upper+1 起算，避免重叠）；注入 subLanes 完整六段子链
  const prev = a.branches[a.branches.length - 1]
  const start = prev && Number(prev.upper) ? Number(prev.upper) + 1 : (a.branches.length === 0 ? 1 : a.branches.length + 1)
  const end = start + (a.branches.length === 0 ? 2 : 2) // 默认每分支 3 点跨度
  a.branches.push(makeBranch(start, Math.min(6, end), ''))
}
// ===== ROLL 结果分支「提升为平行段」辅助 =====
// 取某 lane 的 roll_segment 宿主原子（分支数据挂在它上面）
function rollSegOf(lane) {
  if (!lane || !lane.atoms) return null
  return lane.atoms.find(a => a.effectType === 'roll_segment') || null
}
// 取某 lane 的掷骰结果分支列表（空数组则不渲染平行段）
function rollBranchesOf(lane) {
  const seg = rollSegOf(lane)
  return (seg && seg.branches) || []
}
// 把所有 ROLL 段的结果分支拍平为 [{ laneIndex, branchIndex, branch }]，供 lanes-h 内独立 v-for 渲染（与主六段平行）
const rollBranchFlat = computed(() => {
  const out = []
  lanes.value.forEach((lane, li) => {
    if (lane.key !== 'ROLL') return
    const seg = rollSegOf(lane)
    if (!seg || !seg.branches) return
    seg.branches.forEach((b, bi) => out.push({ laneIndex: li, branchIndex: bi, branch: b }))
  })
  return out
})
const dragOverBranch = ref('')
function onBranchColDragOver(e, i, bi) { dragOverBranch.value = i + '-' + bi }
function onBranchColDrop(e, i, bi) {
  dragOverBranch.value = ''
  const lane = lanes.value[i]
  if (!lane) return
  const seg = rollSegOf(lane)
  if (!seg) return
  onBranchDrop(e, seg, bi)
}
function removeBranch(a, bi) { if (a.branches) a.branches.splice(bi, 1) }
function removeBranchAtom(a, bi, bj) {
  if (a.branches && a.branches[bi]) a.branches[bi].atoms.splice(bj, 1)
}
function onBranchDragOver(e) { e.currentTarget.classList.add('drag-over') }
function onBranchDrop(e, a, bi) {
  e.currentTarget.classList.remove('drag-over')
  const raw = e.dataTransfer.getData('text/atom')
  if (!raw) return
  try {
    const atom = JSON.parse(raw)
    if (!a.branches) a.branches = []
    if (!a.branches[bi]) a.branches[bi] = { lower: '', upper: '', label: '', atoms: [], subLanes: LANE_SKELETON.map(s => ({ key: s.key, name: s.name, atoms: [] })) }
    // 隐患2 Pre-flight：确保分支 subLanes 已初始化（兼容旧数据无 subLanes）
    ensureBranchSubLanes(a.branches[bi])
    a.branches[bi].atoms.push(buildLaneAtom(atom, false))
  } catch { /* ignore */ }
}
// 阶段0 统一写入入口（供画布 drop 与表单落点复用，保证两路写同一份数据）
// 落点：主链 lane[i].atoms[col] 或 分支 branch.subLanes[col].atoms
function addAtomToSlot(atom, { laneIdx, col, branch, branchIdx } = {}) {
  if (!atom) return
  if (branch && branch.subLanes) {
    ensureBranchSubLanes(branch) // 隐患2：空分支自动懒加载补齐
    const slot = branch.subLanes[col] || (branch.subLanes[col] = { key: LANE_SKELETON[col].key, name: LANE_SKELETON[col].name, atoms: [] })
    slot.atoms.push(buildLaneAtom(atom, false))
  } else if (laneIdx != null && lanes.value[laneIdx]) {
    lanes.value[laneIdx].atoms.push(buildLaneAtom(atom, false))
  }
}

// 由原子定义生成默认 params（拖入时初始化）
function defaultParamsOf(atomDef) {
  const p = {}
  ;(atomDef.fields || []).forEach(f => { p[f.key] = f.default })
  return p
}

// 目标解析(原 WHO 段)原子的可编辑字段
const TARGET_FIELDS = [
  { key: 'target_type', label: '目标类型', type: 'select', options: ['SINGLE_ENEMY', 'ALL_ENEMIES', 'SELF', 'ALL_ALLIES', 'RANDOM_ENEMY', 'LOWEST_HP_ENEMY', 'ADJACENT'] }
]
// 读回后端 effects 时，按 effectType 映射可编辑字段（与原子面板 fields 对齐）
const EFFECT_FIELDS = {
  damage: [{ key: 'damage_mode', label: '模式', type: 'select', options: ['flat', 'override', 'multiplier'] }, { key: 'flat_value', label: '数值', type: 'number' }, { key: 'fixed_rate_multiplier', label: '倍率', type: 'number' }],
  status: [{ key: 'status', label: '状态名', type: 'text' }, { key: 'value', label: '数值', type: 'number' }, { key: 'duration', label: '时长', type: 'number' }, { key: 'stacks', label: '层数', type: 'number' }],
  heal: [{ key: 'amount', label: '治疗量', type: 'number' }],
  buff: [{ key: 'buff_type', label: '类型', type: 'select', options: ['attack', 'defense', 'mobility'] }, { key: 'value', label: '数值', type: 'number' }, { key: 'duration', label: '时长', type: 'number' }],
  displacement: [{ key: 'distance', label: '距离', type: 'number' }]
}

// ===== 战场模拟（子集：仅前端画布效果，不输出 JSON；20×20 Even-R 六边形蜂窝） =====
const battleCanvas = ref(null)
const bsWrap = ref(null)
const targetCount = ref(3)
// Phase 4 端到端：靶场真实引擎结算结果（文本日志，不依赖画布渲染）
const runResult = ref(null)
const runError = ref('')

const shooterPos = ref('left')
const placeMode = ref(false)
let manualTargets = []
const BC_COLS = 20
const BC_ROWS = 20
// 战场模拟独立镜头
const bsOffset = ref({ x: 0, y: 0 })
const bsScale = ref(1)
const bsPan = ref(false)
const bsPanStart = ref({ x: 0, y: 0, ox: 0, oy: 0 })
let bsMoved = false

function shooterCell() {
  const cq = Math.floor(BC_COLS / 2), cr = Math.floor(BC_ROWS / 2)
  return { left: [2, cr], right: [BC_COLS - 3, cr], top: [cq, 2], center: [cq, cr] }[shooterPos.value] || [2, cr]
}
function randomTargets(n) {
  const sp = shooterCell()
  const spots = []
  for (let r = 0; r < BC_ROWS; r++) for (let c = 0; c < BC_COLS; c++) {
    const dist = Math.abs(c - sp[0]) + Math.abs(r - sp[1])
    if (dist < 2) continue
    spots.push([c, r])
  }
  const out = []
  for (let i = 0; i < n && spots.length; i++) {
    const idx = Math.floor(Math.random() * spots.length)
    out.push({ x: spots[idx][0], y: spots[idx][1] })
    spots.splice(idx, 1)
  }
  return out
}
function genTargets() {
  const n = Math.max(0, Math.min(40, Number(targetCount.value) || 0))
  manualTargets = randomTargets(n)
  drawBattle()
}
function buildUnits() {
  const sp = shooterCell()
  // ★ Phase 3/4：每个画布单位携带真实战斗属性，供 simulate-skill 真实引擎结算
  // 画布 x/y 即六角网格坐标 (q,r)，与引擎坐标系一致（Phase 2 自由画布语义）。
  const shooter = {
    x: sp[0], y: sp[1], q: sp[0], r: sp[1],
    id: '__shooter__', color: '#5dd47f', label: '射手', isShooter: true,
    faction: 'earth', role: 'attack', hp: 100, maxHp: 100, armor: 0, attack: 12, defense: 0,
    energy: 5, statusEffects: [], currentStats: {},
  }
  const units = [shooter]
  manualTargets.forEach((t, _i) => units.push({
    x: t.x, y: t.y, q: t.x, r: t.y,
    id: `tgt_${t.x}_${t.y}`, color: '#ff8a80', label: '靶', isShooter: false,
    faction: 'maxion', role: 'defense', hp: 100, maxHp: 100, armor: 0, attack: 8, defense: 0,
    energy: 5, statusEffects: [], currentStats: {},
  }))
  return { cols: BC_COLS, rows: BC_ROWS, units }
}
function bsWorldToScreen(wx, wy) {
  return { x: bsOffset.value.x + wx * bsScale.value, y: bsOffset.value.y + wy * bsScale.value }
}
function bsHexToScreen(q, r) {
  const p = hexToPixel(q, r, 1, 1, 0)
  return bsWorldToScreen(p.x, p.y)
}
function bsInitCamera() {
  const bc = battleCanvas.value
  if (!bc) return
  const W = bc.width, H = bc.height
  const corners = [
    hexToPixel(0, 0, 1, 1, 0),
    hexToPixel(BC_COLS - 1, 0, 1, 1, 0),
    hexToPixel(0, BC_ROWS - 1, 1, 1, 0),
    hexToPixel(BC_COLS - 1, BC_ROWS - 1, 1, 1, 0),
  ]
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of corners) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y) }
  minX -= HEX_WIDTH; maxX += HEX_WIDTH
  minY -= HEX_HEIGHT; maxY += HEX_HEIGHT
  const regionH = maxY - minY
  bsScale.value = H / regionH
  bsOffset.value = { x: HEX_WIDTH - minX * bsScale.value, y: 0 - minY * bsScale.value }
}
function drawBattle() {
  const bc = battleCanvas.value
  if (!bc) return
  const W = bc.width, H = bc.height
  const c = bc.getContext('2d')
  c.clearRect(0, 0, W, H)
  const { cols, rows, units } = buildUnits()
  for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
    const s = bsHexToScreen(col, r)
    drawHexPath(c, s.x, s.y, HEX_RADIUS * bsScale.value)
    c.strokeStyle = 'rgba(255,255,255,0.06)'; c.lineWidth = 0.5; c.stroke()
    c.fillStyle = (col + r) % 2 ? 'rgba(30,38,50,.45)' : 'rgba(20,26,34,.45)'; c.fill()
  }
  units.forEach(u => {
    const s = bsHexToScreen(u.x, u.y)
    const rad = HEX_RADIUS * bsScale.value * 0.42
    c.fillStyle = u.color; c.beginPath(); c.arc(s.x, s.y, rad, 0, Math.PI * 2); c.fill()
    // ★ Phase 3 跳转/回写状态机着色：已结算态按引擎真实结果高亮
    if (u.hit) {
      // 命中：金色描边；若 HP 归零则红色（击杀）
      const dead = u.maxHp && u.hp <= 0
      c.strokeStyle = dead ? '#ff4d4f' : '#f5c542'
      c.lineWidth = dead ? 3 : 2
      c.beginPath(); c.arc(s.x, s.y, rad + 3, 0, Math.PI * 2); c.stroke()
    }
    if (u.stealth) { c.globalAlpha = .35; c.fillStyle = u.color; c.beginPath(); c.arc(s.x, s.y, rad, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1 }
    // ★ Phase 4 HP 条：单位有真实 HP 时绘制血条
    if (u.maxHp && u.maxHp > 0) {
      const bw = rad * 2, bh = 3
      const bx = s.x - rad, by = s.y - rad - 6
      c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(bx, by, bw, bh)
      const ratio = Math.max(0, Math.min(1, u.hp / u.maxHp))
      c.fillStyle = ratio > 0.5 ? '#5dd47f' : ratio > 0.25 ? '#f5c542' : '#ff4d4f'
      c.fillRect(bx, by, bw * ratio, bh)
    }
    // ★ Phase 3 状态图标：statusEffects 非空气泡标记
    if (Array.isArray(u.statusEffects) && u.statusEffects.length) {
      c.fillStyle = '#7db4ff'; c.font = '9px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'
      c.fillText('◈' + u.statusEffects.length, s.x, s.y + rad + 7)
    }
    c.fillStyle = '#fff'; c.font = '10px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(u.label, s.x, s.y)
  })
}
function resizeBattle() {
  const bc = battleCanvas.value
  if (!bc || !bsWrap.value) return
  const w = Math.max(1, bsWrap.value.clientWidth || 600)
  const h = Math.max(1, bsWrap.value.clientHeight || 400)
  if (bc.width !== w) bc.width = w
  if (bc.height !== h) bc.height = h
  bsInitCamera()
  drawBattle()
}
function togglePlaceMode() {
  placeMode.value = !placeMode.value
}
function bsScreenToHex(sx, sy) {
  const wx = (sx - bsOffset.value.x) / bsScale.value
  const wy = (sy - bsOffset.value.y) / bsScale.value
  return pixelToHex(wx, wy, 1, 1, 0, HEX_WIDTH, HEX_HEIGHT)
}
function onBattleClick(e) {
  const bc = battleCanvas.value
  if (!bc) return
  if (bsMoved) { bsMoved = false; return }
  const rect = bc.getBoundingClientRect()
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top
  const h = bsScreenToHex(sx, sy)
  if (h.q < 0 || h.q >= BC_COLS || h.r < 0 || h.r >= BC_ROWS) return
  const sp = shooterCell()
  if (h.q === sp[0] && h.r === sp[1]) return
  if (!placeMode.value) return
  const idx = manualTargets.findIndex(t => t.x === h.q && t.y === h.r)
  if (idx >= 0) manualTargets.splice(idx, 1); else manualTargets.push({ x: h.q, y: h.r })
  drawBattle()
}
function onBattleDown(e) {
  const bc = battleCanvas.value
  if (!bc) return
  const rect = bc.getBoundingClientRect()
  bsPan.value = true
  bsMoved = false
  bsPanStart.value = { x: e.clientX - rect.left, y: e.clientY - rect.top, ox: bsOffset.value.x, oy: bsOffset.value.y }
  if (e.button === 1) e.preventDefault()
  bc.style.cursor = 'grabbing'
}
function onBattleMove(e) {
  if (!bsPan.value) return
  const bc = battleCanvas.value
  if (!bc) return
  const rect = bc.getBoundingClientRect()
  const x = e.clientX - rect.left, y = e.clientY - rect.top
  const dx = x - bsPanStart.value.x, dy = y - bsPanStart.value.y
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) bsMoved = true
  bsOffset.value = { x: bsPanStart.value.ox + dx, y: bsPanStart.value.oy + dy }
  drawBattle()
}
function onBattleUp() {
  if (bsPan.value) { bsPan.value = false; if (battleCanvas.value) battleCanvas.value.style.cursor = '' }
}
function onBattleWheel(e) {
  const bc = battleCanvas.value
  if (!bc) return
  e.preventDefault()
  const rect = bc.getBoundingClientRect()
  const x = e.clientX - rect.left, y = e.clientY - rect.top
  const before = { x: (x - bsOffset.value.x) / bsScale.value, y: (y - bsOffset.value.y) / bsScale.value }
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
  const newScale = Math.min(4, Math.max(0.2, bsScale.value * factor))
  bsScale.value = newScale
  bsOffset.value = { x: x - before.x * newScale, y: y - before.y * newScale }
  drawBattle()
}
// ★ Phase 3 跳转/回写状态机：idle(未结算) → rolling(引擎结算中) → resolved(已回写画布)
const bsPhase = ref('idle')
const simSnapshot = ref(null)   // 结算前画布单位快照，用于「重置」回到 idle

async function runTest() {
  if (!selectedKey.value) { runError.value = '请先选择并保存一个词条'; return }
  const { units } = buildUnits()
  simSnapshot.value = JSON.parse(JSON.stringify(units))   // 备份，便于重置
  bsPhase.value = 'rolling'
  try {
    // Phase 4 端到端：把画布真实单位状态作为 battleStateStarter 上传，跑真实引擎 pure 结算
    const battleStateStarter = {
      round: 1,
      units: units.map(u => ({
        id: u.id, q: u.q, r: u.r,
        faction: u.faction, role: u.role,
        hp: u.hp, maxHp: u.maxHp, armor: u.armor, attack: u.attack, defense: u.defense, energy: u.energy,
        statusEffects: u.statusEffects, currentStats: u.currentStats,
      })),
    }
    const tree = lanes.value.map(laneToNode)
    const res = await apiClient.post('/combat-glossary/hub-config/simulate-skill', {
      key: selectedKey.value,
      draft: { tree, schema_version: 2, __segment_model__: true },
      battleStateStarter,
    })
    runResult.value = res.data
    runError.value = ''

    // ★ Phase 3 回写：用引擎真实结算结果（rewind）涂抹画布单位
    const rewind = res.data?.rewind || []
    // 建立 单位id → 模拟后快照 的查表
    const afterById = {}
    rewind.forEach(rw => {
      if (rw && rw.id != null) afterById[rw.id] = rw
    })
    const shooter = units.find(u => u.isShooter)
    units.forEach(u => {
      const rw = afterById[u.id]
      if (u.isShooter) {
        // 施法者：按 casterAfter 回写（自身 buff/能量/状态）
        if (rw && rw.casterAfter) {
          u.hp = rw.casterAfter.hp ?? u.hp
          u.maxHp = rw.casterAfter.maxHp ?? u.maxHp
          u.statusEffects = rw.casterAfter.statusEffects || []
        }
        return
      }
      if (!rw) return
      const before = u.hp
      const afterHp = rw.targetAfter?.hp
      // 命中判定：模拟后 HP 下降 或 产生了伤害 或 产生状态效果
      const tookDamage = (afterHp != null && afterHp < before) || (rw.finalDamage > 0)
      const gainedStatus = Array.isArray(rw.targetAfter?.statusEffects) && rw.targetAfter.statusEffects.length > 0
      u.hit = tookDamage || gainedStatus
      if (afterHp != null) u.hp = afterHp
      u.maxHp = rw.targetAfter?.maxHp ?? u.maxHp
      u.statusEffects = rw.targetAfter?.statusEffects || []
    })
    bsPhase.value = 'resolved'
    drawBattle()
  } catch (e) {
    const msg = e?.response?.data?.message || e.message || String(e)
    runError.value = msg
    runResult.value = null
    bsPhase.value = 'idle'
    console.error('[BattleCanvas] simulate-skill 请求失败', e)
  }
}

// ★ Phase 3 重置：回到结算前画布，清空回写着色
function resetSim() {
  if (simSnapshot.value) {
    const { units } = buildUnits()
    // buildUnits 是重新生成，这里用快照恢复 HP/状态
    const snapById = {}
    simSnapshot.value.forEach(s => { snapById[s.id] = s })
    units.forEach(u => {
      const s = snapById[u.id]
      if (s) { u.hp = s.hp; u.maxHp = s.maxHp; u.statusEffects = s.statusEffects || [] }
      u.hit = false
    })
  }
  bsPhase.value = 'idle'
  runResult.value = null
  runError.value = ''
  drawBattle()
}

let resizeObserver = null
onMounted(() => {
  loadConfig()
  nextTick(() => {
    if (bsWrap.value) {
      resizeObserver = new ResizeObserver(resizeBattle)
      resizeObserver.observe(bsWrap.value)
    }
    resizeBattle()
    genTargets()
  })
  const bc = battleCanvas.value
  if (bc) bc.addEventListener('click', onBattleClick)
})
onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect()
  const bc = battleCanvas.value
  if (bc) bc.removeEventListener('click', onBattleClick)
})
</script>

<style scoped>
.gh-studio {
  display: flex;
  flex-direction: column;
  /* 严格一屏高：不多(不拉伸超出一屏)不少(不小于一屏)，
     彻底消灭左右栏被 min-height:100% 无限撑高的问题 */
  height: 100vh;
  max-height: 100vh;
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

/* ===== 三栏布局：左(词条列表+E浮层) | 中(画布B+六段编排D) | 右(原子面板C) ===== */
.studio-3col {
  display: flex;
  flex: 1;
  min-height: 0;
  height: 100%;
  padding: 12px;
  gap: 10px;
  box-sizing: border-box;
  flex-wrap: nowrap;
  align-items: stretch;
}
/* 左栏：词条列表（上）+ E 浮层只读卡（下，定高可滚） */
.studio-left {
  flex: 0 0 110px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid #2b3340;
  background: #161b22;
}
.studio-skill-panel {
  flex: 1 1 auto;
  min-height: 120px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.studio-zone-a {
  display: flex;
  flex-direction: row;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 6px;
}
.studio-a-btn {
  font-size: 11px;
  padding: 5px 10px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid #2b3340;
  background: #1c2230;
  color: #9fb0c4;
  letter-spacing: 1px;
  white-space: nowrap;
}
.studio-a-btn.active {
  color: #ffb000;
  border-color: #ffb000;
  background: rgba(255,176,0,.1);
  font-weight: 700;
}
/* 中栏：六段编排 D（上）+ 画布 B（下），纵向布局，各自可滚 */
.studio-center {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  /* 允许纵向滚动兜底：当总高不足以容纳泳道+画布时，整体可滚，
     画布绝不会被 overflow:hidden 裁出画面外 */
  overflow-y: auto;
  overflow-x: hidden;
}
/* D 六段编排置顶：min-height:0 + 内部滚动，内容再多也只在自己框内滚，绝不撑开父容器挤压画布 */
.studio-zone-d { order: 0; flex: 1 1 50%; min-height: 0; overflow-y: auto; }
.studio-zone-a { order: 1; flex: 0 0 auto; }
/* 画布 B 与泳道平分剩余高度；min-height 保证即使空间紧张也至少可见，超出部分在画布框内滚动 */
.studio-zone-b { order: 2; flex: 1 1 50%; min-height: 240px; }
/* 右栏：原子面板 C（定宽 + 整体可滚） */
.studio-right {
  flex: 0 0 220px;
  flex-shrink: 0;
  min-width: 180px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid #2b3340;
  background: #161b22;
}
.studio-zone-b {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.zb-head {
  font-size: 12px;
  color: #7fe7ff;
  margin-bottom: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.zb-tag { font-size: 10px; color: #9fb0c4; border: 1px solid #2b3340; border-radius: 3px; padding: 0 5px; }
/* 射程起始/结束范围输入条 */
.range-input-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  color: #cdd8e6;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.range-input-bar label { display: inline-flex; align-items: center; gap: 5px; }
.range-input-bar input {
  width: 52px;
  background: #0f131c;
  border: 1px solid #2b3340;
  border-radius: 4px;
  color: #ffd479;
  font-size: 12px;
  padding: 2px 4px;
  text-align: center;
}
.range-input-bar .rib-tip { color: #6f7e90; font-size: 10px; }
.range-input-bar .rib-btn {
  background: #1a2230;
  border: 1px solid #2b3340;
  border-radius: 4px;
  color: #ffd479;
  font-size: 11px;
  padding: 2px 8px;
  cursor: pointer;
}
.range-input-bar .rib-btn:hover { background: #243044; border-color: #3a4658; }
.range-input-bar .rib-btn.active { background: #ffd479; color: #1a1205; border-color: #ffd479; }
.range-input-bar .rib-warn { color: #ffb454; font-size: 10px; margin-left: 4px; }
.zb-stage { position: relative; display: flex; justify-content: center; flex: 1 1 auto; min-height: 0; }
.zb-canvas-wrap {
  position: relative;
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
  background: #0f131c;
  border: 1px solid rgba(159,142,120,.18);
  border-radius: 8px;
  overflow: auto;
}
.zb-legend { display: flex; gap: 10px; flex-wrap: wrap; font-size: 10px; color: #9fb0c4; margin-top: 4px; }
.dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; margin-right: 3px; }

/* 战场模拟视图 */
.bs-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
.bs-controls label { font-size: 10px; color: #9fb0c4; display: inline-flex; align-items: center; gap: 4px; }
.bs-controls input[type=number] { width: 44px; background: rgba(0,0,0,.35); color: #e6edf3; border: 1px solid rgba(255,176,0,.22); border-radius: 4px; padding: 2px 4px; font-size: 11px; }
.bs-controls select { background: rgba(0,0,0,.35); color: #e6edf3; border: 1px solid rgba(255,176,0,.22); border-radius: 4px; padding: 2px 5px; font-size: 11px; }
.sim-btn { font-size: 11px; font-weight: 700; border: 1px solid #ff8ab3; color: #ff8ab3; background: rgba(255,138,179,.1); border-radius: 5px; padding: 3px 10px; cursor: pointer; margin-left: auto; }
.sim-btn.active { background: rgba(255,176,0,.25); border-color: #ffb000; color: #ffb000; }
.sim-run { margin-left: 0; }
.bs-canvas-wrap { position: relative; width: 100%; height: 420px; background: #0f131c; border: 1px solid rgba(255,138,179,.18); border-radius: 8px; overflow: hidden; }
.battle-canvas { display: block; width: 100%; height: 100%; cursor: grab; }
.battle-canvas:active { cursor: grabbing; }
.bs-cam-hint { position: absolute; right: 10px; bottom: 8px; padding: 3px 8px; background: rgba(0,0,0,.55); color: rgba(255,255,255,.7); border: 1px solid rgba(255,255,255,.18); border-radius: 6px; font-size: 11px; pointer-events: none; }
.empty-canvas-hint { display: flex; align-items: center; justify-content: center; gap: 10px; height: 100%; color: rgba(255,212,121,.55); font-size: 14px; user-select: none; }
.empty-icon { font-size: 24px; }
/* Phase 4 端到端：引擎结算结果日志 */
.bs-result { margin-top: 8px; border: 1px solid rgba(0,206,209,.3); border-radius: 8px; background: rgba(0,206,209,.06); padding: 8px 10px; }
.bs-result-head { font-size: 11px; font-weight: 700; color: #7fe7ff; margin-bottom: 6px; }
.bs-result pre { margin: 0; font-size: 10px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; max-height: 260px; overflow: auto; }
.bs-ok { color: #9fe7c8; }
.bs-err { color: #ff9b9b; }
/* Phase 3/4 模拟状态机 UI */
.bs-phase-tag {
  position: absolute; top: 10px; left: 10px; z-index: 5;
  font-size: 10px; padding: 3px 8px; border-radius: 10px;
  background: rgba(0,206,209,.18); color: #7fe7ff; border: 1px solid rgba(0,206,209,.4);
  pointer-events: none;
}
.bs-src { font-size: 9px; padding: 1px 6px; border-radius: 8px; margin-left: 6px; background: rgba(95,212,127,.2); color: #5dd47f; }
.bs-src.stub { background: rgba(255,138,128,.2); color: #ff8a80; }
.bs-summary { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; color: #c6d3e2; margin-bottom: 6px; }
.bs-summary b { color: #ffd479; }
.bs-targets { display: flex; flex-direction: column; gap: 3px; }
.bs-tgt { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 10px; padding: 2px 4px; border-radius: 4px; background: rgba(0,0,0,.2); }
.bs-tgt-id { color: #9fb0c4; }
.bs-tgt-hp { color: #9fe7c8; }
.bs-tgt-hp.dead { color: #ff4d4f; font-weight: 700; }
.bs-tgt-dmg { color: #ff9b9b; }
.bs-tgt-status { color: #7db4ff; }

/* e. 词条浮层（已并入左栏底部，普通块，定高可滚） */
.entry-float {
  flex: 0 0 auto;
  max-height: 40%;
  overflow-y: auto;
  background: #11161f;
  border-top: 1px solid #2b3340;
  border-radius: 0 0 8px 8px;
  padding: 10px;
}
.entry-float h3 { font-size: 12px; color: #ffb000; margin-bottom: 6px; }
.entry-card .ec-row { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 7px; }
.entry-card .ec-row label { color: #9fb0c4; font-size: 11px; min-width: 54px; flex-shrink: 0; }
.entry-card .ec-val { font-size: 12px; color: #e6edf3; font-weight: 600; line-height: 1.5; word-break: break-all; }
.entry-card .ec-name-input { flex: 1; min-width: 0; padding: 3px 6px; font-size: 12px; color: #e6edf3; background: rgba(0,0,0,0.5); border: 1px solid #5dd4ff; border-radius: 4px; font-weight: 600; }
.entry-card .ec-phase { font-size: 11px; color: #7fe7ff; margin: 4px 0 2px; font-weight: 600; }
.entry-card .ec-chip { display: inline-block; background: rgba(0,0,0,.3); border: 1px solid #2b3340; border-radius: 4px; padding: 1px 6px; margin: 2px 3px 2px 0; font-size: 10px; color: #c1e8ff; }
.entry-empty { color: #6b7a8f; }

/* ===== 中栏下半：D(六段编排) + 右栏 C(原子面板) ===== */
.studio-zone-d { display: flex; flex-direction: column; padding: 12px; border-top: 1px solid #2b3340; min-width: 0; min-height: 0; overflow-y: auto; }
.zone-d-head { display: flex; align-items: center; justify-content: space-between; }
.zone-d-head h3 { font-size: 12px; color: #ffb000; margin: 0; }
.zone-d-actions { display: flex; gap: 8px; }
.studio-save { background: rgba(255,176,0,.16); border: 1px solid rgba(255,176,0,.55); color: #ffb000; border-radius: 6px; padding: 5px 12px; font-size: 12px; cursor: pointer; }
.studio-save:hover { background: rgba(255,176,0,.28); }
.hint { color: #9fb0c4; font-size: 11px; margin: 4px 0 10px; }
.lanes-scroll { flex: 1; overflow-x: auto; overflow-y: auto; padding-bottom: 6px; min-height: 358px; }
.lanes-h { display: flex; gap: 10px; min-width: max-content; }
.lane-col { width: 240px; flex-shrink: 0; display: flex; flex-direction: column; }
.lane { border: 1.5px solid #2b3340; border-radius: 10px; margin-bottom: 8px; background: #1c2230; cursor: pointer; transition: .15s; }
.lane.selected { border-color: #7fe7ff; box-shadow: 0 0 0 1px #7fe7ff; }
.lane.drag-over-lane { border-color: #ffb000; background: rgba(255,176,0,.08); box-shadow: 0 0 0 1px #ffb000; }
.lane-head { cursor: grab; }
.lane-head:active { cursor: grabbing; }
.lane-head { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-bottom: 1px solid #2b3340; }
.lane-head .ord { width: 20px; height: 20px; border-radius: 50%; background: #ffb000; color: #1a1300; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 11px; flex-shrink: 0; }
.lane-head .name { font-weight: 600; font-size: 12px; flex-shrink: 0; }
.lane-head .desc { color: #9fb0c4; font-size: 10px; flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
/* Phase 2-4（#12）：受六段硬边约束锁定的段头，灰掉禁插 */
.lane-head.order-locked { cursor: not-allowed; opacity: 0.78; background: rgba(255,212,121,0.06); border-left: 3px solid #ffd479; }
.lane-head.order-locked .ord { background: #8a6d2a; color: #ffe6a8; }
.lock-badge { margin-left: 4px; font-size: 11px; filter: grayscale(0.2); }
/* Phase 2-2：IF/ROLL 多实例数量选择器 modal */
.multi-drop-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; z-index: 9999; }
.multi-drop-modal { background: #16202c; border: 1px solid #2a3a4a; border-radius: 12px; padding: 22px 26px; min-width: 280px; box-shadow: 0 12px 40px rgba(0,0,0,0.5); }
.md-title { color: #ffd479; font-weight: 700; font-size: 15px; margin-bottom: 6px; }
.md-hint { color: #9fb0c4; font-size: 12px; margin-bottom: 16px; }
.md-btns { display: flex; gap: 10px; align-items: center; }
.md-btn { background: #1f2e3d; color: #cfe3f5; border: 1px solid #36506a; border-radius: 8px; padding: 8px 16px; cursor: pointer; font-size: 14px; }
.md-btn:hover { background: #2a4258; border-color: #5aa0ff; }
.md-cancel { background: transparent; color: #8aa0b5; border: none; cursor: pointer; margin-left: 6px; }
.lane-body { padding: 8px 10px; display: flex; flex-wrap: wrap; gap: 6px; min-height: 36px; }
.empty-tip { color: #9fb0c4; font-size: 11px; font-style: italic; }
.atom-card { background: #0e1824; border: 1px solid #2b3a4a; border-left: 3px solid #7fe7ff; border-radius: 5px; padding: 5px 8px; font-size: 11px; min-width: 130px; display: block; }
.atom-card .ac-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.atom-card .ac-title { font-weight: 600; color: #7fe7ff; }
.atom-card .ac-del { color: #ff8a80; cursor: pointer; font-size: 10px; border: none; background: none; padding: 0; flex-shrink: 0; }
.atom-card .ac-del:hover { color: #ff6b6b; }
/* 阶段0 隐患3：[旁路伤害模式] Tag（过渡期 roll_segment/direct_damage 走旁路，C项合入后按实际路由自动消失） */
.bypass-tag { display: inline-block; margin-left: 4px; padding: 0 5px; font-size: 9px; line-height: 15px; border-radius: 3px; color: #ffd479; background: rgba(255,170,0,0.14); border: 1px solid rgba(255,170,0,0.4); flex-shrink: 0; }
/* 阶段0 分行模型：分支内复用主六段标准泳道卡（lane-col > lane） */
.branch-lanes { display: flex; gap: 8px; margin-top: 6px; padding-left: 8px; border-left: 2px dashed #3a4a5a; overflow-x: auto; }
.branch-col { width: 200px; flex-shrink: 0; }
.branch-col .lane { margin-bottom: 0; }
.branch-col .lane-head .desc { display: none; } /* 分支内空间紧凑，隐藏 desc 仅留段名 */
/* ROLL 结果分支「提升为平行段」：与六段主链同级平铺，琥珀色明显区分于 IF 条件分支 */
.roll-branch-col { width: 220px; flex-shrink: 0; }
.roll-branch { border: 1.5px solid rgba(255,176,0,0.5); border-radius: 10px; margin-bottom: 8px; background: linear-gradient(180deg, rgba(255,176,0,0.07), rgba(28,34,48,0.9)); }
.roll-branch-head { background: rgba(255,176,0,0.12); border-bottom: 1px solid rgba(255,176,0,0.35); }
.roll-branch-head .ord { background: #ffb000; color: #1a1205; }
.rb-tag { display: inline-block; margin-left: 6px; font-size: 9px; line-height: 14px; padding: 0 5px; border-radius: 3px; color: #ffd479; background: rgba(255,170,0,0.18); border: 1px solid rgba(255,170,0,0.45); }
.rb-range { margin-left: 6px; font-size: 10px; color: #ffce8a; background: rgba(255,176,0,0.1); border: 1px solid rgba(255,176,0,0.3); border-radius: 4px; padding: 1px 5px; flex-shrink: 0; }
/* 一级分段(橙框)内包裹的二级子段：加蓝色框标识（设计稿 §3 二级子段=蓝框） */
.branch-lanes { border: 1px dashed rgba(90,160,255,0.45); border-radius: 8px; padding: 5px; margin: 4px 4px 6px; background: rgba(90,160,255,0.05); }
.branch-lanes > .branch-col .lane { border: 1px solid rgba(90,160,255,0.5); }
.branch-lanes > .branch-col .lane-head { background: rgba(90,160,255,0.12); border-bottom: 1px solid rgba(90,160,255,0.35); }
.br-del { margin-left: 4px; font-size: 10px; color: #ff9a8f; background: none; border: 1px solid rgba(214,69,60,.4); border-radius: 4px; padding: 2px 6px; cursor: pointer; flex-shrink: 0; }
.br-del:hover { background: rgba(214,69,60,.18); }
/* IF 条件分支（包裹式）保留，加蓝色标识以示与 ROLL 掷骰分支区分 */
.branch.if-branch .branch-head { border-left: 3px solid #4ea8ff; }
/* 段内参数内联编辑 */
.ac-params { display: flex; flex-direction: column; gap: 3px; margin-top: 5px; padding-top: 5px; border-top: 1px dashed rgba(127,231,255,.25); }
.ac-field { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 10px; color: #9fb0c4; }
.ac-field select, .ac-field input { background: #0f131c; color: #c1e8ff; border: 1px solid rgba(255,176,0,.25); border-radius: 4px; padding: 2px 4px; font-size: 10px; max-width: 90px; }
/* H1/H2 原子卡片：画布联动三件套 */
.ac-canvas-bar { margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(214,69,60,.4); }
.ac-cb-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ac-cb-label { font-size: 10px; color: #9fb0c4; white-space: nowrap; }
.ac-cb-select { background: #0f131c; color: #ffd27f; border: 1px solid rgba(255,176,0,.45); border-radius: 4px; padding: 2px 4px; font-size: 10px; }
.ac-cb-sync { background: rgba(214,69,60,.16); border: 1px solid rgba(214,69,60,.6); color: #ff7a6e; border-radius: 5px; padding: 3px 8px; font-size: 10px; cursor: pointer; white-space: nowrap; }
.ac-cb-sync:hover { background: rgba(214,69,60,.3); }
.ac-cb-hint { margin: 5px 0 0; font-size: 10px; color: #ffb000; opacity: .85; line-height: 1.4; }
/* 泳道拖拽可放置态 */
.lane-body.drag-over { background: rgba(255,176,0,.08); outline: 1px dashed rgba(255,176,0,.4); border-radius: 6px; }
/* 段头「＋ 子段」按钮 */
.nest-btn { margin-left: auto; font-size: 10px; color: #7fe7ff; background: none; border: 1px solid rgba(0,206,209,.4); border-radius: 4px; padding: 2px 6px; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
.nest-btn:hover { background: rgba(0,206,209,.15); }
/* 段头「✕ 删除」按钮（WHEN 除外） */
.lane-del { margin-left: 4px; font-size: 10px; color: #ff9a8f; background: none; border: 1px solid rgba(214,69,60,.4); border-radius: 4px; padding: 2px 6px; cursor: pointer; flex-shrink: 0; }
.lane-del:hover { background: rgba(214,69,60,.18); }
/* 内联二次确认（替代原生 confirm，避免被浏览器拦截） */
.del-confirm { margin-left: 4px; display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; }
.del-tip { font-size: 10px; color: #ff9a8f; }
.del-yes { font-size: 10px; color: #fff; background: rgba(214,69,60,.8); border: none; border-radius: 4px; padding: 2px 6px; cursor: pointer; }
.del-yes:hover { background: rgba(214,69,60,1); }
.del-no { font-size: 10px; color: #cdd6e0; background: none; border: 1px solid #2a3a4a; border-radius: 4px; padding: 2px 6px; cursor: pointer; }
.del-no:hover { background: rgba(255,255,255,.08); }
/* 添加段栏 */
.add-lane-bar { display: flex; align-items: center; gap: 8px; margin: 6px 0 2px; padding-left: 2px; }
.add-lane-btn { font-size: 11px; color: #ffe6a8; background: rgba(255,212,121,.08); border: 1px dashed rgba(255,212,121,.5); border-radius: 5px; padding: 5px 10px; cursor: pointer; }
.add-lane-btn:hover { background: rgba(255,212,121,.18); }
.add-lane-select { font-size: 11px; background: #060c12; border: 1px solid #2a3a4a; color: #dce6f0; border-radius: 4px; padding: 4px 6px; }
/* 子树层（嵌套 ≤3，当前支持 1 层） */
.subtree { margin: 6px 10px 0; padding-left: 10px; border-left: 2px dashed rgba(255,176,0,.35); }
.subtree-label { font-size: 10px; color: #ffb000; opacity: .8; margin-bottom: 4px; }
.subtree-body { min-height: 30px; }

/* 右栏 C：原子面板（定高可滚，分组默认收起） */
.studio-zone-c { flex: 1 1 auto; overflow-y: auto; padding: 12px 10px; min-width: 0; }
.studio-zone-c h3 { font-size: 12px; color: #7fe7ff; margin-bottom: 6px; }
.hint-c { color: #9fb0c4; font-size: 10px; margin-bottom: 8px; }
.atom-group { margin-bottom: 8px; border: 1px solid #2b3340; border-radius: 6px; }
.atom-group .grp-title { font-size: 11px; color: #9fb0c4; margin: 0; padding: 6px 8px; letter-spacing: .5px; cursor: pointer; display: flex; align-items: center; gap: 6px; user-select: none; }
.atom-group .grp-title::before { content: '▸'; color: #ffb000; transition: transform .12s; font-size: 9px; }
.atom-group.collapsed .grp-title::before { transform: rotate(90deg); }
.atom-group .grp-items { padding: 4px 8px 8px; }
.atom-group.collapsed .grp-items { display: none; }
.atom-chip { display: block; background: #1c2230; border: 1px dashed #2b3340; border-radius: 5px; padding: 4px 7px; margin: 2px 0; font-size: 11px; cursor: grab; user-select: none; transition: .15s; color: #c1e8ff; }
.atom-chip:hover { border-color: #ffb000; color: #ffb000; }
.atom-chip:active { cursor: grabbing; }

/* 局部覆盖复用组件 HexCanvasEditor 的字号（仅本页面生效，不切断旧 glossary-hub） */
/* 画布区中文标题/按钮原 13~16px，统一压到 ≤12px */
.gh-studio :deep(.he-head-title) { font-size: 12px; }
.gh-studio :deep(.he-tab) { font-size: 12px; line-height: 15px; }
.gh-studio :deep(.he-dir-btn) { font-size: 12px; line-height: 1; }
.gh-studio :deep(.he-dir-btn.he-complete),
.gh-studio :deep(.he-dir-btn.he-clear) { font-size: 12px; line-height: 15px; }
.gh-studio :deep(.he-pan-btn) { font-size: 12px; }
.gh-studio :deep(label) { font-size: 12px; }

/* 局部覆盖复用组件 SkillListPanel 的字号（仅本页面生效，不切断旧 glossary-hub） */
.gh-studio :deep(.slp-title) { font-size: 12px; }
.gh-studio :deep(.slp-new) { font-size: 12px; }
.gh-studio :deep(.slp-lock),
.gh-studio :deep(.slp-dirty) { font-size: 12px; }
.gh-studio :deep(.slp-name) { font-size: 12px; }
.gh-studio :deep(.slp-key) { font-size: 11px; }

/* ===== C 区原子面板：搜索 / 折叠 / 状态点 / 图例 ===== */
.studio-zone-c h3 .cnt { font-size: 9px; color: #9fb0c4; border: 1px solid #2b3340; border-radius: 3px; padding: 0 5px; font-weight: 400; margin-left: 4px; }
.atom-search {
  width: 100%; box-sizing: border-box; background: rgba(0,0,0,.3); border: 1px solid #2b3340;
  border-radius: 5px; color: #e6edf3; font-size: 11px; padding: 5px 7px; margin-bottom: 8px;
  font-family: inherit;
}
.atom-search:focus { outline: none; border-color: #ffb000; }
.atom-groups { flex: 1; min-height: 0; overflow-y: auto; }
.atom-group { margin-bottom: 8px; }
.atom-group .grp-title {
  font-size: 10px; color: #9fb0c4; margin-bottom: 4px; letter-spacing: .5px;
  display: flex; align-items: center; gap: 5px; cursor: pointer; user-select: none;
}
.atom-group .grp-title:hover { color: #c1e8ff; }
.atom-group .grp-title .caret { font-size: 8px; transition: .15s; }
.atom-group .grp-title .grp-count { opacity: .6; font-weight: 400; }
.atom-group.collapsed .caret { transform: rotate(-90deg); }
.atom-group.collapsed .grp-items { display: none; }
.grp-items { display: flex; flex-direction: column; gap: 2px; }
.atom-chip {
  display: flex; align-items: center; gap: 6px; background: #1c2230; border: 1px dashed #2b3340;
  border-radius: 5px; padding: 4px 7px; margin: 2px 0; font-size: 11px; cursor: grab; user-select: none; transition: .15s; color: #c1e8ff;
}
.atom-chip:hover { border-color: #ffb000; color: #ffb000; transform: translateX(2px); }
.atom-chip:active { cursor: grabbing; }
.atom-chip .chip-st { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.atom-chip .chip-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-ok { background: #5dd47f; } .st-alias { background: #ffb000; } .st-new { background: #ff8a80; }
.studio-zone-c .legend { font-size: 9px; color: #9fb0c4; border-top: 1px solid #2b3340; padding-top: 6px; margin-top: 6px; line-height: 1.7; }
.studio-zone-c .legend .chip-st { display: inline-block; margin-right: 4px; }
.studio-zone-c .legend .legend-total { margin-top: 4px; opacity: .7; }

/* 批次3.3 字段跳转气泡 */
.jump-toast {
  position: sticky; top: 0; z-index: 30;
  display: flex; align-items: center; gap: 10px;
  margin: 0 0 8px; padding: 9px 14px;
  background: linear-gradient(90deg, #1d3a4d, #14313f);
  border: 1px solid #2f9bd6; border-radius: 7px;
  color: #d6f3ff; font-size: 12.5px; box-shadow: 0 4px 18px rgba(0,0,0,.4);
}
.jump-toast .jt-dot { font-size: 15px; }
.jump-toast .jt-text b { color: #7fe7ff; }
.jump-toast .jt-save {
  margin-left: auto; padding: 5px 13px; border: 1px solid #3fae6a; border-radius: 5px;
  background: #1e4a33; color: #b6ffcf; cursor: pointer; font-size: 12px;
}
.jump-toast .jt-save:hover { background: #266b48; }
.jump-toast .jt-cancel {
  padding: 5px 11px; border: 1px solid #5a6472; border-radius: 5px;
  background: #2a323d; color: #c2ccd8; cursor: pointer; font-size: 12px;
}
.jump-toast .jt-cancel:hover { background: #36404d; }
.toast-pop-enter-active, .toast-pop-leave-active { transition: all .22s ease; }
.toast-pop-enter-from, .toast-pop-leave-to { opacity: 0; transform: translateY(-8px); }

/* ===== D 区原子卡片：参数表单 / 数字双模 ===== */
.ac-f-label { color: #9fb0c4; font-size: 10px; flex: 1; min-width: 0; }
.ac-field select, .ac-field input { background: #0f131c; color: #c1e8ff; border: 1px solid rgba(255,176,0,.25); border-radius: 4px; padding: 2px 4px; font-size: 10px; max-width: 96px; font-family: inherit; }
.ac-field select:disabled, .ac-field input:disabled { opacity: .55; cursor: not-allowed; }
.numwrap { flex: 1; display: flex; gap: 3px; align-items: center; min-width: 0; }
.num-mode { flex: 0 0 auto; font-size: 9px; padding: 2px 4px; border-radius: 3px; cursor: pointer; border: 1px solid #2b3340; background: #1c2230; color: #9fb0c4; }
.num-mode.formula { border-color: #c08cff; color: #c08cff; background: rgba(192,140,255,.12); }

/* ===== IF / ROLL 段分叉分支容器 ===== */
.branches { margin-top: 7px; padding-left: 9px; border-left: 2px solid rgba(255,176,0,.4); display: flex; flex-direction: column; gap: 7px; }
.branch { border: 1px solid rgba(255,176,0,.28); border-radius: 7px; background: rgba(255,176,0,.035); }
.branch.drag-over { border-color: #ffb000; background: rgba(255,176,0,.1); }
.branch-head { display: flex; align-items: center; gap: 5px; padding: 4px 7px; border-bottom: 1px dashed rgba(255,176,0,.22); }
.branch-head .br-cond { font-size: 10px; color: #ffb000; font-weight: 600; }
.branch-head .br-range { width: 30px; background: rgba(0,0,0,.35); color: #ffb000; border: 1px solid #2b3340; border-radius: 3px; padding: 1px 3px; font-size: 10px; text-align: center; font-family: inherit; }
.branch-head .br-tilde { color: #9fb0c4; font-size: 10px; }
.branch-head .br-label { flex: 1; min-width: 0; background: transparent; border: none; color: #9fb0c4; font-size: 10px; font-family: inherit; }
.branch-head .br-label:focus { outline: none; color: #e6edf3; }
.branch-head .br-del { color: #ff8a80; border: none; background: none; cursor: pointer; font-size: 10px; padding: 0 2px; }
.branch-body { padding: 5px 7px; display: flex; flex-direction: column; gap: 5px; min-height: 26px; }
.branch-body.drag-over { border: 1.5px dashed #ffb000; border-radius: 6px; background: rgba(255,176,0,.08); }
.br-subphase { font-size: 9px; color: #9fb0c4; letter-spacing: .5px; margin-top: 2px; }
.add-branch { font-size: 10px; color: #ffb000; background: none; border: 1px dashed rgba(255,176,0,.45); border-radius: 5px; padding: 3px 0; cursor: pointer; width: 100%; font-family: inherit; }
.add-branch:hover { background: rgba(255,176,0,.1); }
</style>
