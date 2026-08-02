<template>
<div class="dm-battle-layout flex flex-row w-full h-full absolute inset-0">
    <!-- ===== CENTER: Battlefield ===== -->
    <div class="dm-main flex-1 flex flex-col h-full overflow-hidden" ref="dmMainRef">
      <!-- Header -->
      <div class="battle-header">
        <h1>{{ battleMapName || '战场' }}</h1>
        <div class="header-meta">
          <span class="meta-item"><span class="dot-live danger"></span> {{ phaseText }}</span>
          <span class="sep">|</span>
          <span class="meta-item">{{ battlefieldSize }}</span>
          <span class="sep">|</span>
          <span class="meta-item">{{ currentFactionLabel }} | 第 {{ battleState?.round || 1 }} 轮</span>
        </div>
        <span class="header-id">#{{ route.params.id?.slice(0,8) }}</span>
      </div>

      <!-- Toolbar -->
      <div class="battle-toolbar">
        <button class="toolbar-btn" @click="hexGrid?.zoomIn()">放大 +</button>
        <button class="toolbar-btn" @click="hexGrid?.zoomOut()">缩小 -</button>
        <button class="toolbar-btn" @click="hexGrid?.zoomReset()">1:1</button>
        <span class="toolbar-info">缩放: {{ Math.round((hexGrid?.scale || 1) * 100) }}% | 悬停: {{ hoverCoord || '-' }}</span>

        <!-- Deploy mode controls -->
        <template v-if="isDeployPhase">
          <span class="dm-badge">部署模式</span>
          <span class="toolbar-info" style="margin-left:6px;">{{ selectedDeployUnit ? '已选: ' + (selectedDeployUnit.name || 'Unit-'+selectedDeployUnit.id) + ' → 点击地图放置' : '从下方阵营框点击棋子 → 点击地图放置' }}</span>
        </template>

        <!-- Selection mode indicator -->
        <template v-if="selectedUnit && !isDeployPhase">
          <span class="dm-badge selected">已选中: {{ selectedUnit.name }}</span>
          <button class="toolbar-btn" @click="clearSelection">取消选择</button>
        </template>

        <button class="toolbar-btn" @click="endTurn" :disabled="isDeployPhase" style="margin-left:auto;">结束回合</button>
      </div>

      <!-- Canvas Area: HexGridCanvasEngine 无状态大一统画布内核 -->
      <!-- Phase 29-DOM_Purge: 违章建筑 .game-canvas-sandbox 已物理拆除，DOM 结构与编辑器对齐 -->
      <HexGridCanvasEngine
        ref="hexGrid"
        :grid-data="gridData"
        :draw-fn="safeDrawBattleScene"
        :show-coords="showCoords"
        :show-hover="true"
        :use-terrain-cache="false"
        :iso-config="isoConfig"
        :extrude="extrudeEnabled"
        :terrain-materials="terrainMaterials"
        @cell-clicked="onHexClick"
      />
      <!-- Legend (浮动壳, 锚定于 .dm-main position:relative) -->
      <div class="map-legend" style="position:absolute; bottom:12px; left:12px; z-index:10; pointer-events:none;">
        <span v-for="(info, key) in usedTerrains" :key="key" class="legend-item">
          <i class="legend-swatch" :style="{ background: info.color }"></i>{{ info.name }}
        </span>
      </div>

      <!-- 需求② 略缩图栏（右下角浮动层，pointer-events:auto 可交互） -->
      <div class="floating-card battle-minimap" style="position:absolute; bottom:12px; right:12px; z-index:10;">
        <BattleMinimap
          :grid-data="gridData"
          :cells="cells"
          :units="allUnits"
          :engine="hexGrid"
          :size="180"
        />
      </div>

      <!-- Phase8: Manual Dice Roll Overlay -->
      <div v-if="diceRollState.active" class="dice-overlay" @click.self="cancelDiceRoll">
        <div class="dice-panel">
          <div class="dice-title">{{ diceRollState.skillName }}</div>
          <div class="dice-info">{{ diceRollState.diceType }} | Success: {{ diceRollState.successLine }}+</div>
          <div class="dice-result-area">
            <div v-if="diceRollState.animationPhase === 'idle'" class="dice-prompt">
              Click dice or press <kbd>Space</kbd> to roll
            </div>
            <div v-else-if="diceRollState.animationPhase === 'rolling'" class="dice-rolling">
              <span class="dice-number">{{ diceRollState.rollResult }}</span>
            </div>
            <div v-else class="dice-result">
              <div class="dice-number final">{{ diceRollState.rollResult }}</div>
              <div :class="diceRollState.isSuccess ? 'result-success' : 'result-fail'">
                {{ diceRollState.isSuccess ? 'SUCCESS' : 'FAIL' }}
              </div>
              <div v-if="diceRollState.isSuccess" class="bonus-info">
                +{{ diceRollState.bonusDamage }} Bonus Damage
              </div>
            </div>
          </div>
          <div class="dice-actions">
            <button v-if="diceRollState.animationPhase === 'idle'" class="dice-btn roll" @click="startDiceRoll">Roll Dice</button>
            <button v-if="diceRollState.animationPhase === 'result'" class="dice-btn confirm" @click="resolveDiceRoll">Confirm Attack</button>
            <button class="dice-btn cancel" @click="cancelDiceRoll">Cancel</button>
          </div>
        </div>
      </div>


      <!-- ===== Phase 13: Faction Panel (Floating Draggable Collapsible) ===== -->
      <div
        class="floating-card floating-faction-panel"
        :class="{ collapsed: factionPanelCollapsed }"
        :style="{ left: factionPanelPos.left + 'px', top: factionPanelPos.top + 'px' }"
        ref="factionPanelRef"
      >
        <div class="floating-card-dragbar" @mousedown.stop="startDrag($event, 'factionPanel')">
          <span class="floating-card-title">🗂️ 阵营单位</span>
          <button class="floating-card-collapse-btn" @click.stop="toggleFactionPanel" :title="factionPanelCollapsed ? '展开' : '折叠'">
            {{ factionPanelCollapsed ? '▶' : '◀' }}
          </button>
        </div>
        <div class="floating-card-body" v-show="!factionPanelCollapsed">
      <!-- Faction Boxes (bottom) -->
      <div class="faction-boxes">
        <div v-for="faction in factionGroups" :key="faction.key" class="faction-box" :class="'faction-' + faction.key">
          <div class="faction-header">
            <span class="faction-dot" :style="{background: faction.color}"></span>
            <span class="faction-name">{{ faction.label }}</span>
            <span class="faction-count">{{ faction.units.length }}</span>
            <button class="faction-jump-btn" @click.stop="toggleJumpInput(faction.key)" title="坐标跳转">⊕</button>
          </div>
          <!-- 坐标跳转输入栏（每个阵营独立） -->
          <div class="jump-input-row" v-if="jumpVisible[faction.key]">
            <input class="jump-input" v-model="jumpStates[faction.key].q" placeholder="Q坐标(字母)" type="text" maxlength="2" />
            <input class="jump-input" v-model="jumpStates[faction.key].r" placeholder="R坐标(数字)" type="number" min="0" />
            <button class="jump-go-btn" @click="doJump(faction.key)" :disabled="!jumpStates[faction.key].q || jumpStates[faction.key].r === ''">跳转</button>
            <button class="jump-cancel-btn" @click="jumpVisible[faction.key] = false; clearJump(faction.key)">✕</button>
          </div>
          <!-- 阵营技能按钮 -->
          <div class="faction-skills-row" v-if="getFactionSkills(faction.role || faction.key).length > 0">
            <button
              v-for="skill in getFactionSkills(faction.role || faction.key)"
              :key="skill.key"
              class="faction-skill-btn"
              :class="{ disabled: isSkillDisabled(faction.key, skill.key) }"
              :title="skillTooltip(faction.key, skill.key)"
              @click.stop="useFactionSkill(faction.key, skill.key)"
            >
              <span class="skill-icon">{{ skill.icon }}</span>
              <span class="skill-label">{{ skill.label }}</span>
            </button>
          </div>
          <div class="faction-units">
            <div
              v-for="unit in faction.units"
              :key="unit.id"
              :class="['faction-unit-card', { 'selected': (isDeployPhase ? selectedDeployUnit?.id : selectedUnit?.id) === unit.id, 'dead': isUnitDead(unit) }]"
              @click="isUnitDead(unit) ? null : (isDeployPhase ? startDeployUnit(unit) : selectUnitById(unit))"
            >
              <div class="fu-name">{{ unit.name || ('Unit-' + unit.id) }}</div>
              <div class="fu-bars">
                <div class="fu-bar" title="HP"><span class="fu-fill hp" :style="{width: ((unit.hp || 0) / (unit.maxHp || unit.hp || 100) * 100) + '%'}"></span></div>
                <div class="fu-bar" title="护盾"><span class="fu-fill shield" :style="{width: (unit.shield || 0) + '%'}"></span></div>
              </div>
              <div class="fu-pos" v-if="unit.q !== undefined">
                {{ formatCoord(unit.q, unit.r) }}
                <span v-if="unit.has_moved" class="fu-moved">已移动</span>
              </div>
              <div class="fu-pos" v-else>
                未部署
                <button class="fu-deploy-btn" @click.stop="startDeployUnit(unit)">部署</button>
              </div>
            </div>
            <div v-if="!faction.units.length" class="fu-empty">无单位</div>
          </div>
        </div>
      </div>
        </div><!-- end floating-card-body -->
      </div><!-- end floating-card -->
    </div><!-- end dm-main -->

    <!-- ===== RIGHT: Action Panel (Floating Draggable Collapsible) ===== -->
    <div
      class="floating-card floating-action-panel"
      :class="{ collapsed: actionPanelCollapsed }"
      :style="{ left: actionPanelPos.left + 'px', top: actionPanelPos.top + 'px' }"
      ref="actionPanelRef"
    >
      <!-- Phase 13: 抓取条 (Drag Bar) -->
      <div class="floating-card-dragbar" @mousedown.stop="startDrag($event, 'actionPanel')">
        <span class="floating-card-title">⚔ 行动面板</span>
        <button class="floating-card-collapse-btn" @click.stop="toggleActionPanel" :title="actionPanelCollapsed ? '展开' : '折叠'">
          {{ actionPanelCollapsed ? '▶' : '◀' }}
        </button>
      </div>
      <!-- Phase 13: 卡片内容 (折叠时隐藏) -->
      <div class="floating-card-body" v-show="!actionPanelCollapsed">
      <!-- Deploy Phase Panel -->
      <template v-if="isDeployPhase">
        <div class="ap-header">
          <span class="ap-deploy-title">⚙ 部署阶段</span>
        </div>
        <div v-if="selectedDeployUnit" class="ap-stats">
          <div class="ap-section-title">待部署单位</div>
          <div class="ap-stat-row"><span>名称</span><span class="ap-stat-val">{{ selectedDeployUnit.name || 'Unit-'+selectedDeployUnit.id }}</span></div>
          <div class="ap-stat-row"><span>类型</span><span class="ap-stat-val">{{ selectedDeployUnit.type || '?' }}</span></div>
          <div class="ap-stat-row"><span>攻击</span><span class="ap-stat-val">{{ selectedDeployUnit.attack || '?' }}</span></div>
          <div class="ap-stat-row"><span>防御</span><span class="ap-stat-val">{{ selectedDeployUnit.defense || '?' }}</span></div>
          <div class="ap-mobility-block">
            <div class="ap-stat-row"><span>机动</span><span class="ap-stat-val">{{ deployMobilityBreakdown.total || selectedDeployUnit.mobility || '—' }}</span></div>
            <div class="ap-stat-sub"><span>主机体移动力</span><span>{{ deployMobilityBreakdown.mainBody || 0 }}</span></div>
            <div class="ap-stat-sub"><span>额外移动力{{ deployMobilityBreakdown.extraType ? '(' + mobTypeLabel(deployMobilityBreakdown.extraType) + ')' : '' }}</span><span>{{ deployMobilityBreakdown.extra || 0 }}</span></div>
          </div>
          <div class="ap-stat-row"><span>射程</span><span class="ap-stat-val">{{ selectedDeployUnit.range || 1 }}</span></div>
        </div>
        <div class="ap-mode-hint deploy-hint" v-if="selectedDeployUnit">
          <span>🖱 点击地图格子放置单位</span>
          <button class="ap-cancel-btn" @click="selectedDeployUnit = null">✕ 取消</button>
        </div>
        <div v-else class="ap-empty">
          <div class="ap-empty-icon">📦</div>
          <div class="ap-empty-text">从下方阵营框中<br/>点击棋子选择部署</div>
        </div>
        <div class="ap-stats" style="margin-top:8px;">
          <div class="ap-stat-row"><span>待部署</span><span class="ap-stat-val" style="color:#ffb000;">{{ deployPool.length }}</span></div>
          <div class="ap-stat-row"><span>已部署</span><span class="ap-stat-val" style="color:#ffb000;">{{ deployedCount }}</span></div>
        </div>
        <button class="ap-action-btn deploy-finish" @click="finishDeployment" :disabled="deploying" style="margin-top:8px; background:rgba(255,176,0,0.12); color:#ffb000; border-color:rgba(255,176,0,0.3);">
          <span class="ap-action-label">⚔ 开始战斗</span>
        </button>
      </template>

      <!-- Combat Phase Panel -->
      <template v-else-if="selectedUnit">
        <div class="ap-header">
          <div class="ap-unit-icon" :style="{borderColor: getFactionColor(selectedUnit.faction)}">
            {{ (selectedUnit.name || 'U')[0] }}
          </div>
          <div class="ap-unit-info">
            <div class="ap-name">{{ selectedUnit.name || 'Unknown' }}</div>
            <div class="ap-faction">{{ getFactionLabel(selectedUnit.faction) }}</div>
          </div>
        </div>

        <div class="ap-stats">
          <div class="ap-stat-row"><span>HP</span><span class="ap-stat-val">{{ selectedUnit.hp ?? '?' }}/{{ selectedUnit.maxHp || selectedUnit.hp || 100 }}</span></div>
          <div class="ap-stat-row"><span>护盾</span><span class="ap-stat-val">{{ selectedUnit.shield || 0 }}</span></div>
          <div class="ap-stat-row"><span>攻击</span><span class="ap-stat-val">{{ selectedUnit.attack ?? '?' }}</span></div>
          <div class="ap-stat-row"><span>防御</span><span class="ap-stat-val">{{ selectedUnit.defense ?? '?' }}</span></div>
          <div class="ap-mobility-block">
            <div class="ap-stat-row"><span>机动</span><span class="ap-stat-val">{{ mobilityBreakdown.total || selectedUnit.mobility || selectedUnit['机动'] || '—' }}<span v-if="selectedUnit.mobility_buff && selectedUnit.mobility_buff_turns > 0" class="mob-buff-chip">+{{ selectedUnit.mobility_buff }}</span></span></div>
            <div class="ap-stat-sub"><span>主机体移动力</span><span>{{ mobilityBreakdown.mainBody || 0 }}</span></div>
            <div class="ap-stat-sub"><span>额外移动力{{ mobilityBreakdown.extraType ? '(' + mobTypeLabel(mobilityBreakdown.extraType) + ')' : '' }}</span><span>{{ mobilityBreakdown.extra || 0 }}</span></div>
          </div>
          <div class="ap-stat-row"><span>射程</span><span class="ap-stat-val">{{ basicAttackRange(selectedUnit) }}</span></div>
          <div class="ap-stat-row" v-if="selectedUnit.q !== undefined"><span>位置</span><span class="ap-stat-val">{{ formatCoord(selectedUnit.q, selectedUnit.r) }}</span></div>
        </div>

        <!-- 状态效果（自动化技能 statusEffects：剩余次数/回合 + 条件标签） -->
        <div class="ap-status-effects" v-if="selectedUnit.statusEffects && selectedUnit.statusEffects.length">
          <div class="ap-panel-subtitle">状态效果</div>
          <div
            v-for="se in selectedUnit.statusEffects"
            :key="se.id"
            class="se-chip"
            :class="['se-' + (se.applies_on || 'attack')]"
          >
            <span class="se-label">{{ se.label || se.source }}</span>
            <span class="se-val" v-if="se.value">{{ se.applies_on === 'defense' ? ('减伤' + se.value) : (se.applies_on === 'attack' ? ('增伤' + se.value) : (se.applies_on === 'attack_debuff_target' ? ('削敌机动' + se.value) : '')) }}</span>
            <span class="se-count" :title="(se.consumption && se.consumption.mode === 'counter') ? '剩余生效次数' : '剩余生效回合'">
              {{ se.consumption && se.consumption.mode === 'counter' ? ('剩' + se.consumption.remaining + '次') : ('剩' + (se.consumption ? se.consumption.remaining : '?') + '回合') }}
            </span>
            <span class="se-cond" v-if="se.trigger && se.trigger.type === 'conditional'" :title="conditionLabel(se.trigger)">{{ conditionLabel(se.trigger) }}</span>
          </div>
        </div>

        <!-- 被动/防御技能 -->
        <div class="ap-passive" v-if="passiveSkills.length">
          <div class="ap-section-title">被动技能</div>
          <div class="ap-passive-item" v-for="ps in passiveSkills" :key="ps.id">
            <span class="ps-name">{{ ps.name }}</span>
            <span class="ps-desc" v-if="ps.description">{{ getPassiveSkillDesc(ps) }}</span>
          </div>
        </div>

        <div class="ap-actions" v-if="!isVisitor">
          <div class="ap-section-title">可用行动</div>

          <button
            class="ap-action-btn"
            :class="{ active: actionMode === 'move' }"
            @click="startAction('move')"
            :disabled="selectedUnit.has_moved || selectedUnit.standby"
          >
            <span class="ap-action-icon">➤</span>
            <span class="ap-action-label">移动</span>
            <span class="ap-action-hint">机动 {{ mobilityBreakdown.total || selectedUnit.mobility || selectedUnit['机动'] || 3 }}</span>
          </button>

          <button
            class="ap-action-btn"
            :class="{ active: actionMode === 'tactical' }"
            @click="startAction('tactical')"
            :disabled="selectedUnit.has_acted || selectedUnit.standby"
          >
            <span class="ap-action-icon">⚔</span>
            <span class="ap-action-label">战术行动</span>
            <span class="ap-action-hint">{{ activeSkillCount + 1 }}种方式</span>
          </button>

          <button class="ap-action-btn" @click="startAction('defend')" :disabled="selectedUnit.has_defended || selectedUnit.standby">
            <span class="ap-action-icon">🛡</span>
            <span class="ap-action-label">防御</span>
            <span class="ap-action-hint">+护盾</span>
          </button>

          <button class="ap-action-btn" @click="startAction('wait')" :disabled="selectedUnit.standby">
            <span class="ap-action-icon">⏸</span>
            <span class="ap-action-label">待机</span>
          </button>

          <div v-if="selectedUnit.standby" class="ap-standby-badge">该单位已完成回合（待机）</div>
        </div>

        <!-- Tactical action: skill/weapon selection -->
        <div class="ap-tactical" v-if="actionMode === 'tactical'">
          <div class="ap-section-title">选择战术行动</div>

          <!-- 普通攻击 -->
          <button
            class="ap-skill-btn ap-basic-attack"
            :class="{ active: selectedAttackSkill === null }"
            @click="selectTacticalSkill(null)"
          >
            <div class="sk-top">
              <span class="sk-name">⚔ 普通攻击</span>
            </div>
            <div class="sk-meta">
              <span class="sk-attrinfo">{{ weaponAttrLabel }} 射程{{ basicAttackRange(selectedUnit) }}</span>
              <span class="skill-type-badge badge-basic">基础</span>
              <span class="sk-durability-label" v-if="selectedUnit.right_hand_durability !== undefined">右:{{ selectedUnit.right_hand_durability }} 左:{{ selectedUnit.left_hand_durability !== undefined ? selectedUnit.left_hand_durability : '?' }}</span>
            </div>
          </button>

          <!-- 分组技能列表 -->
          <template v-for="group in skillGroups" :key="group.slot">
            <div class="ap-skill-group-label">
              <span>{{ group.label }}</span>
              <span class="sk-durability" v-if="group.durability !== undefined">
                耐久: <b :style="{color: group.durability <= 0 ? '#ff4d4d' : '#ffb000'}">{{ group.durability }}</b>
              </span>
            </div>
            <button
              v-for="skill in group.skills"
              :key="skill.id"
              class="ap-skill-btn"
              :title="getActiveSkillTooltip(skill)"
              :class="{
                active: selectedAttackSkill?.id === skill.id,
                'skill-disabled': group.durability !== undefined && group.durability <= 0
              }"
              @click="onTacticalSkillClick(skill)"
              :disabled="group.durability !== undefined && group.durability <= 0"
            >
              <div class="sk-top">
                <span class="sk-name">{{ skill.name }}</span>
              </div>
              <div class="sk-meta">
                <span class="sk-attrinfo">{{ skill.attributeLabel || '实体' }} 射程{{ skill.type === 'scout' ? '射击值×1' : (skill.rangeLabel || (skill.range_min !== undefined ? skill.range_min + (skill.range_max ? '-' + skill.range_max : '') : '') || (skill.cast_range ?? skill.range) || '1') }}<template v-if="(skill.aoe_radius ?? skill.aoe_range)"> 辐射范围{{ skill.aoe_radius ?? skill.aoe_range }}</template></span>
                <span class="skill-type-badge" :class="'badge-' + (skill.category || 'special')">{{ skill.typeLabel || skill.type || skill.category }}</span>
                <span class="sk-durability-label" v-if="group.durability !== undefined">耐久 <b :style="{color: group.durability <= 0 ? '#ff4d4d' : '#ffb000'}">{{ group.durability }}</b></span>
              </div>
              <div class="sk-desc" v-if="skill.description">{{ skill.description }}</div>
              <div class="sk-tags">
                <span v-if="skill.guaranteed_hit" class="sk-tag tag-hit">必中</span>
                <span v-if="skill.crit_boost" class="sk-tag tag-crit">暴击</span>
                <span v-if="skill.pierce" class="sk-tag tag-pierce">穿透</span>
                <span v-if="skill.lifesteal" class="sk-tag tag-leech">吸血</span>
                <!-- Phase 11: 万能语法标签 -->
                <span v-if="getSkillPhase10Tags(skill).length > 0" class="sk-tags-group">
                  <span v-for="tag in getSkillPhase10Tags(skill)" :key="tag.key" class="sk-tag" :class="tag.cssClass">{{ tag.label }}</span>
                </span>
              </div>
            </button>
          </template>

          <!-- RoyRoy 部署按钮 -->
          <div class="ap-skill-group-label" v-if="selectedUnit.royroy && !selectedUnit.royroy_deployed">RoyRoy</div>
          <button
            v-if="selectedUnit.royroy && !selectedUnit.royroy_deployed"
            class="ap-skill-btn ap-royroy-deploy"
            :class="{ active: royroyDeployMode }"
            @click="startRoyroyDeploy"
          >
            <div class="sk-top">
              <span class="sk-name">🤖 部署 RoyRoy</span>
              <span class="skill-type-badge badge-deploy">部署</span>
            </div>
            <div class="sk-meta">
              <span class="sk-attrinfo">ATK {{ selectedUnit.royroy.attack || '?' }} | DEF {{ selectedUnit.royroy.defense || '?' }} | HP {{ selectedUnit.royroy.hp || '?' }}</span>
            </div>
          </button>
          <!-- RoyRoy 回收按钮（规则5：仅已部署且未损毁时可回收，不消耗行动点） -->
          <button
            v-if="selectedUnit.royroy && selectedUnit.royroy_deployed && selectedUnit.royroy_status !== 'destroyed'"
            class="ap-skill-btn ap-royroy-retrieve"
            @click="retrieveRoyroy"
          >
            <div class="sk-top">
              <span class="sk-name">🤖 回收 RoyRoy</span>
              <span class="skill-type-badge badge-retrieve">回收</span>
            </div>
            <div class="sk-meta">
              <span class="sk-attrinfo">HP {{ selectedUnit.royroy.hp }}/{{ selectedUnit.royroy.maxHp }} | 冷却 {{ selectedUnit.royroy.cooldownRound || 0 }} 轮</span>
            </div>
          </button>
        </div>

        <!-- Action mode hint -->
        <!-- 胜利条件显示 -->
        <div class="ap-victory-info" v-if="victoryInfo">
          <div class="ap-section-title">胜利条件</div>
          <div class="victory-type">{{ victoryLabel(victoryInfo) }}</div>
          <div class="victory-detail" v-if="victoryInfo.hold_round">坚守至第 {{ victoryInfo.hold_round }} 轮</div>
          <div class="victory-detail">当前轮次: {{ victoryInfo.round_number || 1 }}</div>
          <div class="victory-cooldown" v-if="factionCooldowns">
            <div v-if="factionCooldowns.fireCoverageUsed">🔥 火力覆盖: 已使用</div>
            <div v-else>🔥 火力覆盖: 可用</div>
            <div v-if="factionCooldowns.fogSystemUsed && factionCooldowns.fogCooldownRemaining > 0">🌫 迷雾: 冷却 {{ factionCooldowns.fogCooldownRemaining }} 轮</div>
            <div v-else-if="factionCooldowns.fogSystemUsed">🌫 迷雾: 已使用</div>
            <div v-else>🌫 迷雾: 可用</div>
          </div>
        </div>

        <div class="ap-mode-hint" v-if="actionMode">
          <span v-if="actionMode === 'move'">点击目标六角格移动</span>
          <span v-else-if="actionMode === 'tactical' && royroyDeployMode">
            🖱 点击相邻空格部署 RoyRoy
          </span>
          <span v-else-if="actionMode === 'tactical' && selectedAttackSkill">
            <span class="skill-hint-name">[{{ selectedAttackSkill.name || '普通攻击' }}]</span> → 点击目标单位
          </span>
          <span v-else-if="actionMode === 'tactical'">请先选择攻击方式</span>
          <span v-else>执行 {{ actionMode }} 操作</span>
          <button class="ap-cancel-btn" @click="cancelAction">✕</button>
        </div>
      </template>

      <div v-else class="ap-empty">
        <div class="ap-empty-icon">◈</div>
        <div class="ap-empty-text">点击战场上的棋子<br/>查看可用行动</div>
      </div>
      </div><!-- end floating-card-body -->
    </div><!-- end floating-card -->

    <!-- ===== Phase: 行动记录面板 (Floating Draggable Collapsible) ===== -->
    <div
      class="floating-card floating-action-log"
      :class="{ collapsed: actionLogCollapsed }"
      :style="{ left: actionLogPos.left + 'px', top: actionLogPos.top + 'px' }"
      ref="actionLogRef"
    >
      <div class="floating-card-dragbar" @mousedown.stop="startDrag($event, 'actionLog')">
        <span class="floating-card-title">📋 行动记录</span>
        <span class="log-count">{{ sidebarActionLog.length }}</span>
        <button class="floating-card-collapse-btn" @click.stop="toggleActionLog" :title="actionLogCollapsed ? '展开' : '折叠'">
          {{ actionLogCollapsed ? '▶' : '◀' }}
        </button>
      </div>
      <div class="floating-card-body action-log-body" v-show="!actionLogCollapsed" :style="{ maxHeight: actionLogHeight + 'px' }" ref="logContainer">
        <div v-for="(entry, i) in sidebarActionLog" :key="i" :class="['log-entry', 'log-' + entry.type]">
          <span class="log-time">{{ entry.time }}</span>
          <span class="log-msg">{{ entry.message }}</span>
        </div>
        <div v-if="!sidebarActionLog.length" class="log-empty">等待行动...</div>
      </div>
    </div><!-- end floating-card -->
  </div>

  <!-- 实时胜利结算遮罩（后端 evaluateVictory 触发） -->
  <div v-if="battleResult && battleResult.victory" class="victory-overlay" @click.self="closeBattleResult">
    <div class="victory-card">
      <div class="victory-title">🏆 战斗结束</div>
      <div class="victory-winner">获胜阵营：{{ battleResult.winner }}</div>
      <div class="victory-cond">胜利方式：{{ victoryCondLabel(battleResult.condition) }}</div>
      <div class="victory-msg" v-if="battleResult.message">{{ battleResult.message }}</div>
      <button class="victory-close" @click="closeBattleResult">关闭</button>
    </div>
  </div>

  <!-- Phase 31: 战斗结算弹窗 -->
  <AttackReportModal v-if="showAttackReport" :report="attackReport" @close="closeAttackReport" />

  <!-- Batch D-4.3: 反应奇袭 QTE 面板 + 暗绿 Screen Tone 滤镜 -->
  <div v-if="screenToneOn" class="surprise-screen-tone"></div>
  <div v-if="surpriseUI" class="surprise-qte-overlay">
    <div class="surprise-qte-card">
      <div class="surprise-qte-title">⚡ 反应奇袭！</div>
      <div class="surprise-qte-sub">你的单位处于伏击之中，是否发动反应奇袭？</div>
      <div class="surprise-qte-timer">剩余 {{ surpriseSeconds }} 秒（超时自动放弃）</div>
      <div class="surprise-qte-actions">
        <button class="surprise-btn replace" :disabled="surpriseUI.available_choices && !surpriseUI.available_choices.includes('replace')" @click="submitSurprise('replace')">发动（替换）</button>
        <button class="surprise-btn counter" :disabled="surpriseUI.available_choices && !surpriseUI.available_choices.includes('counter')" @click="submitSurprise('counter')">反击</button>
        <button class="surprise-btn giveup" @click="submitSurprise('giveup')">放弃</button>
      </div>
    </div>
  </div>

  <!-- Batch D-4.2: 移动伏击红屏警报 -->
  <div v-if="ambushAlert" class="ambush-alert-overlay">
    <div class="ambush-alert-text">⚠ 你已陷入伏击！</div>
  </div>
</template>

<script setup>
// ================================================================
//  Phase 16 审计: 战场端鼠标拾取管线完整对账
//  ================================================================
//  点击管道: 鼠标 → HexGridCanvas.getHexAtEvent() → canvasPosToHex()
//            → ① r = round(flatY/(1.5*HEX_RADIUS*spacingV))  [Even-R刚性]
//            → ② flatX = (worldX - shearX*flatY)/scaleX         [消去shearX]
//            → ③ q = round((flatX/spacingH - evenOffset)/sqrt3*HEX_RADIUS)
//            → emit('hex-click', {q,r}) → NewBattleView.onHexClick()
//  渲染管道: NewBattleView.hexToPixel(q,r) → pointyTopCenter(q,r) → flatX,flatY
//            → HexGridCanvas CTM: translate→scale→transform(scaleX,0,shearX,scaleY,0,0)
//  验证: spacingH/spacingV 显式传递 (line ~47-48)，与 hexUtils DEFAULT 同位
//  状态: onMounted中 sanitizeUnitEquipment(L2436) + safeDrawBattleScene(L598-618) + sanitizeBattlefieldTerrain(L2494)
//  ✅ 所有入口已对账: 逆变换原子化、防爆清洗器激活、Canvas崩溃边界捕获
// ================================================================
import { ref, inject, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { drawHexPath, drawGroundItemToken } from '../utils/hexDraw.js'
import { HEX_WIDTH, HEX_HEIGHT, HEX_APOTHEM, HEX_RADIUS, DEFAULT_SPACING_H, DEFAULT_SPACING_V, DEFAULT_OFFSET_FACTOR, getHexNeighbors, TERRAIN_COLORS, UNIVERSAL_TERRAIN_MAP, convertMapFormat, ISO_DEFAULTS, pointyTopCenter, pointyTopToHex, computeDirection, syncTerrainFromGlossary } from '../utils/hexUtils.js'
import HexGridCanvasEngine from '../components/HexGridCanvasEngine.vue'
import { applySizeMobility, sizeRenderScale, normSize, SIZE_LABELS, sizeSevenBox } from '../utils/unitSize.js'
import BattleMinimap from '../components/BattleMinimap.vue'
import { unitSpriteResolver } from '../resolvers/unitSpriteResolver.js'
import { useUserStore } from '../stores/user'
import { connectBattleSocket, disconnectBattleSocket } from '../utils/battleSocket.js'
import { useApStore } from '../stores/apStore.js'
import { useMoveStore } from '../stores/moveStore.js'
import { useLogStore } from '../stores/logStore.js'
import { enqueueState, freezeQueue, unfreezeQueue } from '../utils/animationQueue.js'
import { useRoute, useRouter } from 'vue-router'
// ===== 特殊触发词条反应弹窗（斩杀/决斗/抢夺/幸运/援助/再动/空投）=====
import ExecuteDialog from '../components/reactions/ExecuteDialog.vue'
import DuelDialog from '../components/reactions/DuelDialog.vue'
import SnatchDialog from '../components/reactions/SnatchDialog.vue'
import LuckyRoll from '../components/reactions/LuckyRoll.vue'
import CoverWindow from '../components/reactions/CoverWindow.vue'
import ReactivateBanner from '../components/reactions/ReactivateBanner.vue'
import AirdropInfo from '../components/reactions/AirdropInfo.vue'
import AttackReportModal from '../components/AttackReportModal.vue'
import { combatAPI, hangarAPI, glossaryAPI, mapAPI } from '@/api/client'
import { rollDice as rollDiceUtil, parseDiceType as parseDiceTypeUtil } from '../utils/diceUtil.js'

// ================================================================
//  Phase 13: 地形数据向后兼容转换层 (Sanitizer)
//  自动将旧版纯文本字符串包装为 Phase 9.5 标准结构化对象
// ================================================================

/**
 * 旧版地形到 Phase 9.5 标准的结构化映射表
 * 格式: terrain_id → { terrain_hp, is_destructible, max_hp, destroyed_transform_to }
 * 数据源: UNIVERSAL_TERRAIN_MAP + Phase 9.5 战场地形设计文档
 */
const TERRAIN_SANITIZER_MAP = {
  forest:          { terrain_hp: 3, is_destructible: true,  max_hp: 3, destroyed_transform_to: 'plain' },
  mountain:        { terrain_hp: 5, is_destructible: true,  max_hp: 5, destroyed_transform_to: 'plain' },
  water:           { terrain_hp: 0, is_destructible: false, max_hp: 0, destroyed_transform_to: 'water' },
  fortress:        { terrain_hp: 10, is_destructible: true, max_hp: 10, destroyed_transform_to: 'plain' },
  wall:            { terrain_hp: 20, is_destructible: true, max_hp: 20, destroyed_transform_to: 'plain' },
  base:            { terrain_hp: 5,  is_destructible: true, max_hp: 5,  destroyed_transform_to: 'plain' },
  mothership:      { terrain_hp: 15, is_destructible: true, max_hp: 15, destroyed_transform_to: 'plain' },
  desert:          { terrain_hp: 0,  is_destructible: false, max_hp: 0, destroyed_transform_to: 'desert' },
  lunar:           { terrain_hp: 0,  is_destructible: false, max_hp: 0, destroyed_transform_to: 'lunar' },
  plain:           { terrain_hp: 0,  is_destructible: false, max_hp: 0, destroyed_transform_to: 'plain' },
  moon:            { terrain_hp: 0,  is_destructible: false, max_hp: 0, destroyed_transform_to: 'moon' },
  empty:           { terrain_hp: 0,  is_destructible: false, max_hp: 0, destroyed_transform_to: 'empty' },
  space:           { terrain_hp: 0,  is_destructible: false, max_hp: 0, destroyed_transform_to: 'space' },
  repair_station:  { terrain_hp: 3,  is_destructible: true, max_hp: 3,  destroyed_transform_to: 'plain' },
  spawn_earth:     { terrain_hp: 0,  is_destructible: false, max_hp: 0, destroyed_transform_to: 'spawn_earth' },
  spawn_maxion:    { terrain_hp: 0,  is_destructible: false, max_hp: 0, destroyed_transform_to: 'spawn_maxion' },
  spawn:           { terrain_hp: 0,  is_destructible: false, max_hp: 0, destroyed_transform_to: 'spawn' },
  lava:            { terrain_hp: 0,  is_destructible: false, max_hp: 0, destroyed_transform_to: 'lava' },
  ruin:            { terrain_hp: 2,  is_destructible: true, max_hp: 2,  destroyed_transform_to: 'plain' },
  crater:          { terrain_hp: 0,  is_destructible: false, max_hp: 0, destroyed_transform_to: 'crater' },
}

/**
 * 地形数据兼容转换: 将旧版纯文本字符串 → Phase 9.5 结构化对象
 * 
 * 输入: 可能是 'forest' 字符串, 或已经是 { terrain_id: 'forest', ... } 对象
 * 输出: 标准化对象 { terrain_id: '...', terrain_hp: N, is_destructible: bool, max_hp: N, destroyed_transform_to: '...' }
 * 
 * @param {string|object} cellValue - 单个格子的地形数据
 * @returns {object} 标准化的地形对象
 */
function sanitizeTerrainCell(cellValue) {
  // 已经是完整的结构化对象 (含 terrain_id 或 terrain_hp 字段)
  if (cellValue && typeof cellValue === 'object' && !Array.isArray(cellValue)) {
    if (cellValue.terrain_id || cellValue.terrain_hp !== undefined || cellValue.is_destructible !== undefined) {
      const tid = cellValue.terrain_id || cellValue.type || cellValue.terrain || 'void'
      const mapping = TERRAIN_SANITIZER_MAP[tid] || {}
      return {
        terrain_id: tid,
        terrain_hp: cellValue.terrain_hp ?? mapping.terrain_hp ?? 0,
        is_destructible: cellValue.is_destructible ?? mapping.is_destructible ?? false,
        max_hp: cellValue.max_hp ?? cellValue.terrain_hp ?? mapping.max_hp ?? 0,
        destroyed_transform_to: cellValue.destroyed_transform_to ?? mapping.destroyed_transform_to ?? 'plain',
      }
    }
  }

  // 旧版纯文本字符串格式 (如 "forest", "mountain")
  if (typeof cellValue === 'string') {
    const tid = cellValue
    const mapping = TERRAIN_SANITIZER_MAP[tid]
    if (mapping) {
      return {
        terrain_id: tid,
        terrain_hp: mapping.terrain_hp,
        is_destructible: mapping.is_destructible,
        max_hp: mapping.max_hp,
        destroyed_transform_to: mapping.destroyed_transform_to,
      }
    }
    // 未知地形类型, 返回默认值
    return {
      terrain_id: tid,
      terrain_hp: 0,
      is_destructible: false,
      max_hp: 0,
      destroyed_transform_to: 'plain',
    }
  }

  // 无效或 null/undefined, 返回默认 moon
  return {
    terrain_id: 'moon',
    terrain_hp: 0,
    is_destructible: false,
    max_hp: 0,
    destroyed_transform_to: 'moon',
  }
}

/**
 * 批量清洗 terrainMap: 遍历所有格子，逐个转换
 * 
 * @param {object} terrainMap - { "q,r": terrainIdString 或 terrainObject }
 * @returns {object} 清洗后的 terrainMap
 */
function sanitizeTerrainMap(terrainMap) {
  if (!terrainMap || typeof terrainMap !== 'object') return {}
  const sanitized = {}
  let convertedCount = 0
  Object.entries(terrainMap).forEach(([key, val]) => {
    const originalType = typeof val
    sanitized[key] = sanitizeTerrainCell(val)
    if (originalType === 'string' && val) convertedCount++
  })
  if (convertedCount > 0) {
    console.log(`[TerrainSanitizer] 已转换 ${convertedCount} 个旧版地形字符串 → Phase 9.5 结构化对象`)
  }
  return sanitized
}



// ================================================================
//  Phase 14: 装备 DKM 防爆器 — 出击数据双重防护
//  确保所有 unit 拥有完整的 equipment 三槽位 + damage_kind_modifiers
// ================================================================

/**
 * 防御性清洗单个单位的装备对象
 * 确保 left_hand / right_hand / other 三槽位俱全，
 * 每个槽位包含标准 damage_kind_modifiers 节点
 */
function sanitizeUnitEquipment(unit) {
  if (!unit || typeof unit !== 'object') return unit
  unit.equipment = unit.equipment || {}
  const slots = ['left_hand', 'right_hand', 'other']
  let fixed = 0
  slots.forEach(slot => {
    if (!unit.equipment[slot] || typeof unit.equipment[slot] !== 'object') {
      unit.equipment[slot] = {
        damage_kind_modifiers: { kinetic: 0, beam: 0, explosive: 0, corrosive: 0 }
      }
      fixed++
    } else {
      const dkm = unit.equipment[slot].damage_kind_modifiers
      if (!dkm || typeof dkm !== 'object') {
        unit.equipment[slot].damage_kind_modifiers = { kinetic: 0, beam: 0, explosive: 0, corrosive: 0 }
        fixed++
      } else {
        // 补全缺失的伤害类型键
        const kinds = ['kinetic', 'beam', 'explosive', 'corrosive']
        let patched = false
        kinds.forEach(k => {
          if (!(k in dkm)) { dkm[k] = 0; patched = true }
        })
        if (patched) fixed++
      }
    }
  })
  if (fixed > 0) {
    console.log(`[EquipmentSanitizer] 单位 "${unit.name || unit.id}": 修复 ${fixed} 个装备槽位`)
  }
  return unit
}

/**
 * 批量清洗战场中所有单位的装备
 * 覆盖 battleState.units + deployPool
 */
function sanitizeAllUnitsEquipment() {
  const state = battleState.value
  let count = 0

  // 清洗 battlefieldState 中的 units
  if (state && state.units && Array.isArray(state.units)) {
    state.units.forEach(u => {
      const before = JSON.stringify(u.equipment || {})
      sanitizeUnitEquipment(u)
      if (JSON.stringify(u.equipment || {}) !== before) count++
    })
  }

  // 清洗 deployPool 中的单位
  if (deployPool.value && Array.isArray(deployPool.value)) {
    deployPool.value.forEach(u => sanitizeUnitEquipment(u))
  }

  if (count > 0) {
    console.log(`[EquipmentSanitizer] 已清洗 ${count} 个单位的装备 DKM 槽位 (总计 ${state?.units?.length || 0} 个战场单位)`)
    try { addLog('system', `[防爆] 已自动修复 ${count} 个单位的装备数据`) } catch(_) {}
  }
  return count
}

/**
 * 全局错误边界 — Canvas 渲染异常捕获
 * 防止 drawBattleScene 静默黑屏
 */
function safeDrawBattleScene(ctx, opts) {
  try {
    drawBattleScene(ctx, opts)
  } catch (e) {
    console.error('[CanvasCRASH] drawBattleScene 运行时报错:', e.message || e)
    console.error('[CanvasCRASH] 错误堆栈:', e.stack || '(无堆栈)')
    // 尝试在 Canvas 上绘制错误信息
    try {
      ctx.save()
      ctx.fillStyle = '#ff4444'
      ctx.font = 'bold 20px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('⚠ 渲染异常，请刷新页面', ctx.canvas.width / 2, 40)
      ctx.font = '14px monospace'
      ctx.fillStyle = '#ff8888'
      ctx.fillText(e.message || 'Unknown Error', ctx.canvas.width / 2, 65)
      ctx.restore()
    } catch(_) {}
    throw e  // 重新抛出以保持错误传播
  }
}
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const user = computed(() => userStore.user)

// ===== Batch C/D: 实时推送消费（socket 叠加在 refreshState 之上）=====
const surpriseUI = ref(null)      // 反应奇袭 QTE 数据
// 模块3：全端暗绿滤镜（Spectator Tone）改为 computed——只要存在活跃的 pendingSurprise
// （无论触发方 C、非操作方 A/B 或观战者 Visitor），全员叠加滤镜掩盖 10 秒挂起等待。
const screenToneOn = computed(() => {
  const s = battleState.value?.surprise || battleState.value?.pendingSurprise
  return !!(s && !s.settled && s.phase !== 'done' && s.phase !== 'settled')
})
const ambushAlert = ref(false)    // 移动伏击红屏警报
const surpriseSeconds = ref(10)   // QTE 倒计时
let surpriseTimer = null

// Batch C-2: Pinia stores（行动点 / 移动 / 战报）
const apStore = useApStore()
const moveStore = useMoveStore()
const logStore = useLogStore()

// Batch C-4: 我的阵营推导（方案A：factionRoles 已是 faction→role，绝不能用 userId 当 key 查）
// 优先级：① userStore.user.faction ② 部署池/已部署单位中 ownerId===当前用户 的 faction
// 注意：必须查「初始数据源」(deployPool/units)，不能只查场上 units，否则开局部署期玩家会被误判 Visitor 死锁部署 UI
const myFaction = computed(() => {
  const f = userStore.user?.faction || user.value?.faction
  if (f) return f
  const myId = userStore.user?.id || user.value?.id
  if (!myId) return null
  // 优先部署池（含未部署单位），其次已部署 units；按 ownerId 匹配当前玩家
  const poolMine = (deployPool.value || []).filter(u => String(u.ownerId) === String(myId))
  const deployedMine = (allUnits.value || []).filter(u => String(u.ownerId) === String(myId))
  const mine = poolMine.length ? poolMine : deployedMine
  if (mine.length) return mine[0].faction || null
  return null
})

// 访客视图——GM 或 myFaction 属于当前战局合法参战阵营(在 factionRoles 的 keys 中)则非访客
const isVisitor = computed(() => {
  const myId = userStore.user?.id || user.value?.id
  if (!myId) return true
  const role = userStore.user?.role
  if (role === 'REFEREE' || role === 'DOMINATOR') return false
  const faction = myFaction.value
  if (!faction) return true
  // 方案A：factionRoles 的 key 即所有合法参战 faction
  return !(factionRoles.value && Object.prototype.hasOwnProperty.call(factionRoles.value, faction))
})

// === Phase 6: 词条库配置动态同步（前端UI全量动态绑定）===
const glossaryConfig = ref(null)

// 需求④ 从词条库地形定义提取素材 url → terrainId→url 映射，传入引擎做 CanvasPattern 平铺
const terrainMaterials = computed(() => {
  const gc = glossaryConfig.value
  const terrains = gc?.glossary?.terrains || gc?.terrains || {}
  const map = {}
  for (const [k, v] of Object.entries(terrains)) {
    if (v && v.material_url) map[k] = v.material_url
  }
  return map
})

async function loadGlossaryConfig() {
  try {
    const res = await glossaryAPI.getConfig()
    glossaryConfig.value = res.data
    // 方案A：把词条库地形同步进前端唯一地形表(UNIVERSAL_TERRAIN_MAP)，
    // 使战场配色/移动预览(cost)以 glossary.move_cost 为准，与后端真实移动路径同源。
    const gc = res.data?.glossary || res.data
    syncTerrainFromGlossary(gc?.terrains || {})
    // Phase 29-H: 合并 glossarySkills 填充，消除 onMounted 重复请求
    if (res.data?.skills) glossarySkills.value = res.data.skills
  } catch (e) {
    console.warn('[GlossarySync] 加载词条配置失败:', e.message || e)
  }
}

/** 根据词条库动态生成被动技能描述文本（8大核心词条） */
function getPassiveSkillDesc(skill) {
  const gc = glossaryConfig.value
  if (!gc || !gc.skills) return skill.description || ''

  const gs = gc.skills[skill.type]
  if (!gs) return skill.description || ''

  // Phase 11: 构建万能语法信息行
  const phase10Info = getPhase10SkillInfo(gs)
  let baseDesc = ''
  switch (skill.type) {
    case 'block':
      baseDesc = `被动：受到敌人攻击时伤害-${gs.reduction}`
      break
    case 'execute':
      baseDesc = `近战伤害结算后，目标HP<${gs.hp_threshold_percent}%最大HP时直接斩杀`
      break
    case 'focused_fire':
      baseDesc = `放弃移动，获得固定伤害加成+${gs.bonus}`
      break
    case 'throw':
      baseDesc = `主动：射程1~${gs.max_range}格，目标周围辐射范围${gs.aoe_range}格所有目标下次伤害+${gs.value}`
      break
    case 'sweep':
      baseDesc = `主动：扇形射程${gs.max_range}格攻击，不进行机动值判定。精准命中单体造成伤害${gs.damage_modifier_precise}，射程内所有目标伤害由所有目标均摊`
      break
    case 'duel':
      baseDesc = `双方在攻击范围内且HP<对方${gs.stat_comparison}时触发，攻击力高者胜`
      break
    case 'snatch':
      baseDesc = `伤害值>被攻击者武器攻击值时触发，伤害减为×${gs.damage_multiplier}并获得武器`
      break
    case 'lucky':
      baseDesc = `获得空投时可再次移动并攻击`
      break
    case 'reactivate':
      baseDesc = `击杀敌军时触发，额外一回合（不连续触发）`
      break
    default:
      baseDesc = skill.description || ''
      break
  }
  if (phase10Info) baseDesc += ' | ' + phase10Info
  return baseDesc
}

/**
 * Phase 11: 从词条库提取万能语法信息预览
 * 返回格式化字符串显示 Phase 10 关键字段
 */
function getPhase10SkillInfo(gs) {
  if (!gs) return ''
  const parts = []
  if (gs.action_type) parts.push(mapActionType(gs.action_type))
  if (gs.damage_kind && gs.damage_kind !== 'kinetic') parts.push(mapDamageKind(gs.damage_kind))
  if (gs.min_cast_range) parts.push(`最小${gs.min_cast_range}格`)
  if (gs.accuracy_mod) parts.push(`命中${gs.accuracy_mod > 0 ? '+' : ''}${gs.accuracy_mod}`)
  if (gs.evasion_mod) parts.push(`回避${gs.evasion_mod > 0 ? '+' : ''}${gs.evasion_mod}`)
  if (gs.height_bonus_per_diff) parts.push(`高地×${gs.height_bonus_per_diff}`)
  if (gs.is_manual_roll) parts.push('掷骰判定')
  if (gs.requires_unmoved) parts.push('需未移动')
  if (gs.requires_stealth) parts.push('需潜行')
  return parts.join(' · ')
}

function mapActionType(type) {
  const map = { attack: '攻击', heal: '治疗', buff: '增益', debuff: '减益', passive: '被动' }
  return map[type] || type
}

function mapDamageKind(kind) {
  const map = { kinetic: '动能', beam: '光束', explosive: '爆炸', corrosive: '腐蚀', thermal: '热熔' }
  return map[kind] || kind
}

/**
 * Phase 11: 生成技能卡片的万能语法标签
 */
function getSkillPhase10Tags(skill) {
  const gc = glossaryConfig.value
  if (!gc || !gc.skills) return []
  const gs = gc.skills[skill.type]
  if (!gs) return []
  const tags = []
  if (gs.damage_kind && gs.damage_kind !== 'kinetic') {
    tags.push({ key: 'dk', label: mapDamageKind(gs.damage_kind), cssClass: 'tag-dkind' })
  }
  if (gs.action_type) {
    tags.push({ key: 'at', label: mapActionType(gs.action_type), cssClass: 'tag-atype' })
  }
  if (gs.is_manual_roll) {
    tags.push({ key: 'mr', label: '掷骰', cssClass: 'tag-dice' })
  }
  if (gs.height_bonus_per_diff) {
    tags.push({ key: 'hb', label: `高地×${gs.height_bonus_per_diff}`, cssClass: 'tag-height' })
  }
  if (gs.min_cast_range) {
    tags.push({ key: 'mcr', label: `≥${gs.min_cast_range}格`, cssClass: 'tag-range' })
  }
  if (gs.accuracy_mod) {
    tags.push({ key: 'am', label: `命中${gs.accuracy_mod > 0 ? '+' : ''}${gs.accuracy_mod}`, cssClass: 'tag-acc' })
  }
  return tags
}

/** 给主动技能按钮动态生成 tooltip */
function getActiveSkillTooltip(skill) {
  const gc = glossaryConfig.value
  if (!gc || !gc.skills) return skill.description || ''

  const gs = gc.skills[skill.type]
  if (!gs) return skill.description || ''

  const phase10Info = getPhase10SkillInfo(gs)
  let base = ''
  switch (skill.type) {
    case 'focused_fire':
      base = `${skill.name}: 放弃移动，固定伤害加成 +${gs.bonus}`
      break
    case 'sweep':
      base = `${skill.name}: 扇形${gs.max_range}格范围，精准伤害${gs.damage_modifier_precise}`
      break
    case 'throw':
      base = `${skill.name}: 1~${gs.max_range}格，AOE伤害+${gs.value}`
      break
    // Phase 30: directional_beam 地图炮
    case 'directional_beam':
      base = `${skill.name}: 前方${gs.cast_range || gs.max_range}格直线范围(宽${gs.beam_width || 1}格)`
      break
    default:
      base = skill.description || skill.name || ''
      break
  }
  if (phase10Info) base += '\n' + phase10Info
  return base
}


const battleState = ref({})
const hexGrid = ref(null)
// 需求③ 战场挤出开关（默认开启，营造 2.5D 立体感）
const extrudeEnabled = ref(true)
const showCoords = ref(true)
const terminalLogs = ref([])
const phaseText = ref('加载中...')
const unitImageCache = {} // 缓存单位图片

// === Phase 2: 单位视觉状态（朝向 + 动画状态机）===
// 客户端侧维护，不依赖后端数据，跨 refreshState() 持久化
const unitSpriteState = reactive(new Map())

/** 获取单位的视觉状态 */
function getUnitVisual(unit) {
  const state = unitSpriteState.get(unit.unitId || unit.id)
  return {
    direction: state?.direction ?? 0,
    actionState: state?.actionState ?? 'idle',
  }
}

// === Phase 30-Cover: 七视图图片缓存与解析（按方向移动方向选帧，不全则回退正视图） ===
const _sevenViewCache = new Map()
/**
 * 计算 PNG 底部不透明像素行（脚底）的源坐标 y。
 * 从底向上扫描，返回最靠下且有 alpha 的行；失败（如跨域污染）返回 -1。
 * 结果挂到 img._footY / img._ih，供绘制时按真实脚底重新锚定（消除伪浮空）。
 */
/**
 * 计算 PNG 底部不透明像素行（脚底）的源坐标 y。
 * 从底向上扫描，返回最靠下且有 alpha 的行；失败（如跨域污染）返回 -1。
 * 结果挂到 img._footY / img._ih，供绘制时按真实脚底重新锚定（消除伪浮空）。
 */
function computeSevenFootRow(img) {
  try {
    const w = img.naturalWidth, h = img.naturalHeight
    if (!w || !h) return -1
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const cx = c.getContext('2d')
    cx.drawImage(img, 0, 0)
    const data = cx.getImageData(0, 0, w, h).data
    for (let y = h - 1; y >= 0; y--) {
      const rowOff = y * w * 4
      for (let x = 0; x < w; x++) {
        if (data[rowOff + x * 4 + 3] > 16) return y
      }
    }
    return h - 1
  } catch (e) {
    return -1 // 异常（跨域污染等）→ 回退到不重锚定
  }
}
function resolveSevenView(viewUrls, direction = 0) {
  if (!viewUrls) return null
  let map = viewUrls
  if (typeof map === 'string') { try { map = JSON.parse(map) } catch { return null } }
  if (!map || typeof map !== 'object') return null
  const url = map[String(direction)] || map[direction] || map['0'] || map[0]
  if (!url) return null
  let img = _sevenViewCache.get(url)
  if (!img) {
    img = new Image()
    img.onload = () => {
      // 加载完成后算一次脚底行，缓存到元素上（只算一次）
      img._footY = computeSevenFootRow(img)
      img._ih = img.naturalHeight
      if (hexGrid.value) hexGrid.value.redraw()
    }
    // 加固：单张七视图 404 时也要触发重绘，让棋盘落到圆标+字母降级，避免画面卡在空帧
    img.onerror = () => {
      console.warn(`[resolveSevenView] 加载失败，降级回退: ${url}`)
      if (hexGrid.value) hexGrid.value.redraw()
    }
    img.src = url
    _sevenViewCache.set(url, img)
  }
  return (img.complete && img.naturalWidth > 0) ? img : null
}

/** 设置单位的视觉状态 */
function setUnitVisual(unitId, direction, actionState) {
  const existing = unitSpriteState.get(unitId) || {}
  unitSpriteState.set(unitId, {
    direction: direction ?? existing.direction ?? 0,
    actionState: actionState ?? existing.actionState ?? 'idle',
  })
}

// === Phase 30-Cover: 战场状态规范化（前端从 position 取坐标；补全渲染所需字段） ===
function safeParseJson(v) { try { return JSON.parse(v) } catch { return v } }

// === 唯一的「机动 → 移动力」权威解析（系统性修复 · 2026-07-24 链路级修正） ===
// 与后端 computeMobility 完全一致：机体 2:1（基础最低 5）；装备(载具/背包) 3:1；Royroy 等不计入。
// 无部件时回退 stats.mobility / stats.speed / 顶层（旧语义，移动点即数值）。
function resolveUnitMobility(raw) {
  if (!raw || typeof raw !== 'object') return 0
  const stats = (raw.stats && typeof raw.stats === 'object') ? raw.stats : {}
  const toNum = (x) => (typeof x === 'number' && !isNaN(x) ? x : null)
  const normType = (t) => String(t || '').trim()
  // 分部位移动力（按规则换算）
  let partsSum = 0
  const parts = raw.attributes?.parts || (raw.parts && typeof raw.parts === 'object' ? raw.parts : null)
  if (parts && typeof parts === 'object') {
    for (const p of Object.values(parts)) {
      if (p && typeof p === 'object') {
        const type = normType(p.normalizedType || p.type)
        const m = toNum(p['机动']) ?? toNum(p.mobility)
        if (m == null) continue
        if (type === '机体') partsSum += Math.max(5, Math.ceil(m / 2))
        else if (type === '载具' || type === '背包') partsSum += Math.ceil(m / 3)
        // 武器 / 防具 / 跟随(Royroy) 不计入
      }
    }
  }
  // 体型机动修正：s +10% / m 0 / l -5% / xl -10%（与后端 computeMobility 同源）
  if (partsSum > 0) return applySizeMobility(partsSum, raw.size)
  const candidates = [
    toNum(stats.mobility),
    toNum(stats.speed),
    toNum(raw.mobility),
    toNum(raw['机动']),
    toNum(raw.main_机动),
  ]
  for (const c of candidates) if (c != null) return c
  return 0
}

// 阵亡判定（稳健版）：显式 dead 标记为真才判死；hp 字段缺失/0 一律视为存活（后端部署池单位历史上无 hp 字段，
// 旧逻辑 (unit.hp ?? 0) <= 0 会把所有待部署单位误判为阵亡，导致标灰划掉无法部署）。
// 仅当 hp 是有效正数且 <= 0 时才判死（真打死的场面由战斗结算写回 currentStats.hp）。
function isUnitDead(unit) {
  if (!unit || typeof unit !== 'object') return false
  if (unit.dead === true) return true
  const h = Number(unit.hp)
  // 只有真正拿到有效 HP 数值且 <= 0 才算死；NaN / 0 / undefined 都视为未死
  if (!isNaN(h) && h > 0) return false
  return false
}

// === 机动拆解（行动面板专用，响应式）：主机体移动力 + 额外移动力（载具/背包）===
// 来源：unit.parts / unit.attributes.parts（分部位中文「机动」）/ 兜底 unit.equipState。
// 背包与载具互斥，故额外移动力只取一种；若部件被舍弃，依赖 selectedUnit 响应式重算。
// 数值一律按规则换算（与后端 computeMobility 同源）：机体 2:1(最低5)、装备 3:1。
function calcMobilityBreakdown(unit) {
  const empty = { mainBody: 0, extra: 0, extraType: '', total: 0 }
  if (!unit || typeof unit !== 'object') return empty
  const parts = unit.parts || (unit.attributes && unit.attributes.parts) || null
  let mainBody = 0
  let extra = 0
  let extraType = ''
  const normType = (t) => String(t || '').trim()
  const addPart = (p, key) => {
    if (!p || typeof p !== 'object') return
    const type = normType(p.normalizedType || p.type)
    const m = typeof p['机动'] === 'number' ? p['机动'] : (typeof p.mobility === 'number' ? p.mobility : 0)
    if (type === '机体' || key === '主机体') mainBody += Math.max(5, Math.ceil(m / 2))
    else if (type === '载具' || type === '背包') { if (!extraType) extraType = type; extra += Math.ceil(m / 3) }
  }
  if (parts && typeof parts === 'object') {
    for (const [k, p] of Object.entries(parts)) addPart(p, k)
  }
  // 装备状态兜底（武器/防具/载具/背包，不含主机体）
  if (unit.equipState && Array.isArray(unit.equipState)) {
    for (const e of unit.equipState) {
      const type = normType(e.type)
      const m = typeof e.mobility === 'number' ? e.mobility : 0
      if (type === '机体') mainBody += Math.max(5, Math.ceil(m / 2))
      else if (type === '载具' || type === '背包') { if (!extraType) extraType = type; extra += Math.ceil(m / 3) }
    }
  }
  // 体型机动修正（与 resolveUnitMobility / 后端 computeMobility 同源）
  const size = unit.size || 'm'
  return { mainBody: applySizeMobility(mainBody, size), extra: applySizeMobility(extra, size), extraType, total: applySizeMobility(mainBody, size) + applySizeMobility(extra, size) }
}
function mobTypeLabel(t) {
  if (t === '载具') return '载具'
  if (t === '背包') return '背包'
  return t || ''
}
// 状态效果条件标签：将 trigger 配置翻译为人类可读文案（仅 近战/远程 · 仅 x伤害）
function conditionLabel(t) {
  if (!t || t.type !== 'conditional') return ''
  const at = (t.attack_type && t.attack_type.length)
    ? t.attack_type.map(a => (a === 'melee' ? '近战' : a === 'ranged' ? '远程' : a)).join('/')
    : '任意攻击'
  const dk = (t.damage_kind && t.damage_kind.length) ? t.damage_kind.join('/') : '任意伤害'
  return '仅 ' + at + ' · ' + dk
}
function normalizeBattleState(state) {
  if (!state || !state.units) return state
  const units = Array.isArray(state.units) ? state.units : Object.values(state.units)
  for (const u of units) {
    if (!u) continue
    // 坐标契约：position 是真理源，同步出顶层 q/r（棋盘其余读取 unit.q/unit.r 处无需改动）
    if (u.position && u.q === undefined) { u.q = u.position.q; u.r = u.position.r }
    // id 别名：战斗逻辑用 unitId，前端多处用 unit.id
    if (u.unitId !== undefined && u.id === undefined) u.id = u.unitId
    // HP 条
    if (u.currentStats && u.hp === undefined) u.hp = u.currentStats.hp
    // 四维/护盾/护甲：后端 createBattleUnit 把它们放在 currentStats 内，
    // 而行动面板读的是顶层 attack/defense/range/shield/armor/maxHp。
    // 仅当顶层缺失时从 currentStats 提上来（不覆盖已有顶层值）。
    if (u.currentStats) {
      const cs = u.currentStats
      if (u.attack === undefined && cs.attack !== undefined) u.attack = cs.attack
      if (u.defense === undefined && cs.defense !== undefined) u.defense = cs.defense
      if (u.range === undefined && cs.range !== undefined) u.range = cs.range
      if (u.shield === undefined && cs.shield !== undefined) u.shield = cs.shield
      if (u.armor === undefined && cs.armor !== undefined) u.armor = cs.armor
      // maxHp 兜底：currentStats 未携带时回退到当前 hp（载入时多为满血），避免 HP 条按 /100 误显为残血
      if (u.maxHp === undefined) u.maxHp = cs.maxHp ?? u.hp
    }
    // 阶段修复：统一解析「机动」，消除 ? 与错误的 0
    // 兼容 stats.mobility / stats.speed / attributes.parts.*.机动（合计）/ 顶层 mobility / 机动 / main_机动
    if (u.mobility === undefined) u.mobility = resolveUnitMobility(u)
    if (u.moveRange === undefined || u.moveRange === 0) u.moveRange = u.mobility
    // 七视图兼容（view_urls 字符串 → viewUrls 对象）
    if (u.view_urls !== undefined && u.viewUrls === undefined) {
      u.viewUrls = typeof u.view_urls === 'string' ? safeParseJson(u.view_urls) : u.view_urls
    }
    // 行动点 → 旧布尔按钮字段（保持模板 :disabled 逻辑不变）：移动/战术/防御三类点用尽即置灰
    if (u.has_moved === undefined) u.has_moved = (u.action_points?.MOVE ?? 1) <= 0
    if (u.has_acted === undefined) u.has_acted = (u.action_points?.ATTACK ?? 1) <= 0
    if (u.has_defended === undefined) u.has_defended = (u.action_points?.DEFEND ?? 1) <= 0
    // 体型机动补偿 Buff：被更大机体攻击后下回合移动 +N（由后端 BuffManager 写入）
    if (u.mobility_buff === undefined) u.mobility_buff = 0
    if (u.mobility_buff_turns === undefined) u.mobility_buff_turns = 0
  }
  return state
}

// === Phase 3: 平滑位移插值引擎 (Lerp) ===
// unitLerpState: Map<unitId, { fromX, fromY, toX, toY, startTime, duration, onComplete }>
const unitLerpState = reactive(new Map())
let _lerpAnimId = null

/** 启动单位平滑位移动画 (flatX/flatY 空间线性插值) */
function startLerpAnimation(unitId, fromFlat, toFlat, duration = 300, onComplete = null) {
  unitLerpState.set(unitId, {
    fromX: fromFlat.flatX,
    fromY: fromFlat.flatY,
    toX:   toFlat.flatX,
    toY:   toFlat.flatY,
    startTime: performance.now(),
    duration,
    onComplete,
  })
  if (!_lerpAnimId) _tickLerp()
}

/** 强制停止某单位的位移动画 */
function stopLerpAnimation(unitId) {
  unitLerpState.delete(unitId)
}

/** 清除所有位移动画 */
function clearAllLerp() {
  unitLerpState.clear()
  if (_lerpAnimId) { cancelAnimationFrame(_lerpAnimId); _lerpAnimId = null }
}

/** 每帧 tick：更新插值位置 + 触发重绘 */
function _tickLerp() {
  const now = performance.now()
  let hasActive = false

  unitLerpState.forEach((entry, id) => {
    const elapsed = now - entry.startTime
    const rawT = Math.min(elapsed / entry.duration, 1.0)
    // easeInOutCubic: 开始慢 → 中间快 → 结束慢，更自然的机甲移动感
    const t = rawT < 0.5 ? 4 * rawT * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 3) / 2
    entry.currentX = entry.fromX + (entry.toX - entry.fromX) * t
    entry.currentY = entry.fromY + (entry.toY - entry.fromY) * t

    if (rawT >= 1.0) {
      entry.currentX = entry.toX
      entry.currentY = entry.toY
      const cb = entry.onComplete
      unitLerpState.delete(id)
      if (cb) cb()
    } else {
      hasActive = true
    }
  })

  hexGrid.value?.redraw()

  if (hasActive) {
    _lerpAnimId = requestAnimationFrame(_tickLerp)
  } else {
    _lerpAnimId = null
  }
}

/** 获取单位当前在屏幕上的绘制坐标 (考虑 lerp 插值) */
function getUnitDrawFlat(unit) {
  const lerpEntry = unitLerpState.get(unit.id)
  if (lerpEntry && lerpEntry.currentX !== undefined && lerpEntry.currentY !== undefined) {
    return { flatX: lerpEntry.currentX, flatY: lerpEntry.currentY }
  }
  // fallback: 静态六角中心坐标（spacingH/spacingV 是 ref，必须解包 .value）
  const { flatX, flatY } = pointyTopCenter(unit.q, unit.r, HEX_RADIUS, spacingH.value, spacingV.value)
  return { flatX, flatY }
}

// ===== 模块4：动画队列基建（视觉特效队列 + 提交门控）=====
// 收到新状态变更时禁止粗暴覆写：先把机甲开火/受击/奇袭爆闪特效推入队列播放，
// 播放完毕后再同步硬数值（HP/AP）到 battleState。
const visualEffects = reactive([])     // [{ id, type, flatX, flatY, faction, bornAt, ttl }]
let _effId = 0
let _effTickId = null
const GATE_MS = 520                    // 特效播放窗口：硬数值延迟同步时长
const stateFrozen = ref(false)         // 伏击红警期间：刷新状态直接提交，不门控
let _commitTimer = null
let _pendingRaw = null

function enqueueEffect(type, q, r, faction) {
  if (q === undefined || r === undefined) return
  const { flatX, flatY } = pointyTopCenter(q, r, HEX_RADIUS, spacingH.value, spacingV.value)
  visualEffects.push({ id: ++_effId, type, flatX, flatY, faction, bornAt: performance.now(), ttl: type === 'burst' ? 720 : 520 })
  if (!_effTickId) _effTickId = requestAnimationFrame(_tickEffects)
}
function _tickEffects() {
  const now = performance.now()
  let alive = false
  for (let i = visualEffects.length - 1; i >= 0; i--) {
    if (now - visualEffects[i].bornAt > visualEffects[i].ttl) visualEffects.splice(i, 1)
    else alive = true
  }
  hexGrid.value?.redraw()
  _effTickId = alive ? requestAnimationFrame(_tickEffects) : null
}
// 比对前后战局：抽取 HP 下降的单位 -> 受击(hit)特效
function diffBattleEffects(prev, next) {
  const out = []
  if (!prev || !prev.units || !next || !next.units) return out
  const prevArr = Array.isArray(prev.units) ? prev.units : Object.values(prev.units)
  const nextArr = Array.isArray(next.units) ? next.units : Object.values(next.units)
  const prevMap = {}
  prevArr.forEach(u => { if (u && u.id != null) prevMap[u.id] = u })
  nextArr.forEach(u => {
    if (!u || u.q === undefined) return
    const before = prevMap[u.id]
    if (before && (before.hp ?? 0) - (u.hp ?? 0) > 0) out.push({ type: 'hit', q: u.q, r: u.r, faction: u.faction })
  })
  return out
}
function flushCommit() {
  _commitTimer = null
  const next = _pendingRaw
  _pendingRaw = null
  if (next) commitState(next)
}

const hoverCoord = ref('')
// Deploy phase
const isDeployPhase = ref(false)
const deployPool = ref([])
const deployedCount = computed(() => {
  // 已部署 = 已落入战局状态且拥有坐标 q 的单位（allUnits 仅含 battleState.units，即已部署单位）
  return allUnits.value.filter(u => u.q !== undefined).length
})
const selectedDeployUnit = ref(null)
const deploying = ref(false)

// Unit selection & action system
const selectedUnit = ref(null)
const actionMode = ref(null)  // 'move' | 'tactical' | 'defend' | 'wait'
const selectedAttackSkill = ref(null)

// 行动面板机动拆解（响应式：依赖 selectedUnit/selectedDeployUnit 的 parts，装备舍弃即重算）
const mobilityBreakdown = computed(() => calcMobilityBreakdown(selectedUnit.value))
const deployMobilityBreakdown = computed(() => calcMobilityBreakdown(selectedDeployUnit.value))
// ===== 特殊触发词条反应 UI 状态机（消费后端回传的 reaction_* 字段）=====
const reactionUI = reactive({
  execute: null,    // { targetId, roll, hp, targetName }
  reactivate: null, // { unitId, name }
  lucky: null,      // { effect, roll }
  snatch: null,     // { attackerId, targetId, damage, bestWeaponAttack, targetWeapon, attackerName, targetName }
  cover: null,      // { attackerId, victimId, helperId, expireAt, options, attackerName, victimName, helperName }
  duel: null,       // { attackerId, defenderId, attackerName, defenderName }
  airdropInfo: null // { q, r, kind, label }
})

// Phase8: 手动掷骰拦截状态机
const diceRollState = reactive({
  active: false,
  skillName: '',
  skillConfig: null,
  unitId: null,
  targetId: null,
  diceType: '1d6',
  successLine: 4,
  bonusDamage: 0,
  animationPhase: 'idle',
  rollResult: 0,
  rollAnimTimer: null,
  isSuccess: false,
  pendingAttackPayload: null,
})

const glossarySkills = ref({})  // Phase8: 词条库技能配置缓存  // skill selected for tactical action (null = normal attack)
const royroyDeployMode = ref(false)  // RoyRoy hex-click deployment mode
const sidebarActionLog = inject('sidebarActionLog')

// 阵营能力冷却 & ACE 信息
const factionCooldowns = ref({})
const aceUnits = ref({})
const victoryInfo = ref(null)
// 实时胜利结算结果（来自 /attack 与 /end-turn 响应的 victory 字段）
const battleResult = ref(null)
function closeBattleResult() { battleResult.value = null }
function victoryCondLabel(c) {
  const m = { annihilate: '歼灭', assassinate: '斩首', hold_position: '据守', capture: '占领', destroy_facility: '摧毁设施' }
  return m[c] || c || '未知'
}

// Phase 31: 战斗结算弹窗（攻击发起时展示双方机体视图 / HP / 伤害公式）
const attackReport = ref(null)
const showAttackReport = ref(false)
function closeAttackReport() { showAttackReport.value = false }
// 从行动面板/地图单位快照出弹窗所需的最小字段
function unitSnapshot(u) {
  if (!u) return {}
  return {
    id: u.id || u.unitId,
    name: u.name || u.codename || ('Unit-' + (u.id || u.unitId)),
    faction: u.faction,
    hp: safeHp(u),
    maxHp: safeHp(u),
    viewUrls: u.viewUrls || u.view_urls || {},
    size: u.size || 'm',
  }
}
// 拦截弹窗：攻击方阵营与当前行动阵营不符（回合制门控）
function showBlockedAttackReport(attacker, target) {
  attackReport.value = {
    blocked: true,
    reason:
      `当前是「${getRoleLabel(battleState.value?.activeFaction)}」阵营的回合，\n` +
      `你选择的攻击单位「${attacker?.name || '?'}(${getFactionLabel(attacker?.faction)})」不属于该阵营，无法在其回合之外发起攻击。\n\n` +
      `请先结束当前回合，待该单位所属阵营成为行动阵营后，再选中它发起攻击；\n` +
      `或当前就选中「${getRoleLabel(battleState.value?.activeFaction)}」阵营的单位去攻击对方。`,
    attacker: unitSnapshot(attacker),
    target: unitSnapshot(target),
    formula: null,
    finalDamage: 0,
    dodged: false,
  }
  showAttackReport.value = true
}

// 坐标跳转（每个阵营独立）
const jumpVisible = reactive({})
const jumpStates = reactive({})
function toggleJumpInput(factionKey) {
  if (!jumpStates[factionKey]) {
    jumpStates[factionKey] = { q: '', r: '' }
  }
  jumpVisible[factionKey] = !jumpVisible[factionKey]
}
function clearJump(factionKey) {
  if (jumpStates[factionKey]) {
    jumpStates[factionKey].q = ''
    jumpStates[factionKey].r = ''
  }
}
// 阵营能力面板
const showFactionAbilities = ref(false)

// ===== Hex Config（已迁移至 ../utils/hexUtils.js）=====
// Phase 29-Fix: 统一为 ref 响应式，与 NewBattlefieldView 保持一致
const spacingH = ref(DEFAULT_SPACING_H)      // 1.00 (响应式)
const spacingV = ref(DEFAULT_SPACING_V)      // 1.00 (响应式)
// ISO 等距参数 — 从后端视角配置动态加载，fallback 到 ISO_DEFAULTS 全量
const ISO = reactive({ ...ISO_DEFAULTS })
// ================================================================
//  Phase 13: 地形数据容器 (Phase 16 补全声明)
//  存储 "q,r" → { terrain_id, terrain_hp, is_destructible, max_hp, destroyed_transform_to }
// ================================================================
const terrainMap = reactive({})

// ================================================================
//  Phase 13: 悬浮可拖拽折叠卡片状态管理 (Phase 16 补全声明)
// ================================================================

// 行动面板状态
const actionPanelRef = ref(null)
const actionPanelCollapsed = ref(false)
const actionPanelPos = reactive({ left: 0, top: 60 })

// 阵营面板状态
const factionPanelRef = ref(null)
const factionPanelCollapsed = ref(false)
const factionPanelPos = reactive({ left: 0, top: 0 })

// 行动记录面板状态（战报栏浮动窗：锚定战场左侧边缘）
const actionLogRef = ref(null)
const dmMainRef = ref(null)
const actionLogCollapsed = ref(false)
const actionLogPos = reactive({ left: 2, top: 120 })
const actionLogHeight = ref(480)
const logContainer = ref(null)

// 拖拽状态 (共享)
const dragState = reactive({
  active: false,
  target: '',       // 'actionPanel' | 'factionPanel'
  startMouseX: 0,
  startMouseY: 0,
  startLeft: 0,
  startTop: 0,
})

// 拖拽初始化函数
function initFloatingCardPositions() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  
  // 行动面板: 右上区域
  actionPanelPos.left = vw - 250
  actionPanelPos.top = 60
  
  // 阵营面板: 底部区域
  factionPanelPos.left = Math.max(0, (vw - 600) / 2)
  factionPanelPos.top = vh - 240

  // 行动记录面板: 锚定战场左侧边缘
  // 垂直滚动条贴地图左缘（卡片左缘 = 地图左缘），水平滚动条贴地图下缘（卡片底 = 地图底 - 12）
  const dm = dmMainRef.value
  if (dm) {
    const rect = dm.getBoundingClientRect()
    actionLogPos.left = Math.round(rect.left + 2)
    const h = Math.min(Math.max(rect.height - 140, 200), 560)
    actionLogHeight.value = Math.round(h)
    actionLogPos.top = Math.round(rect.bottom - h - 12)
  } else {
    actionLogPos.left = 2
    actionLogPos.top = 120
    actionLogHeight.value = 480
  }
}

// 开始拖拽
function startDrag(event, panelId) {
  dragState.active = true
  dragState.target = panelId
  dragState.startMouseX = event.clientX
  dragState.startMouseY = event.clientY
  
  const pos = panelId === 'actionPanel' ? actionPanelPos
            : panelId === 'factionPanel' ? factionPanelPos
            : actionLogPos
  dragState.startLeft = pos.left
  dragState.startTop = pos.top
  
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
  event.preventDefault()
}

// 拖拽移动
function onDragMove(event) {
  if (!dragState.active) return
  const dx = event.clientX - dragState.startMouseX
  const dy = event.clientY - dragState.startMouseY
  
  const pos = dragState.target === 'actionPanel' ? actionPanelPos
            : dragState.target === 'factionPanel' ? factionPanelPos
            : actionLogPos
  const cardW = dragState.target === 'actionLog' ? 270 : 220
  pos.left = Math.max(0, Math.min(window.innerWidth - cardW, dragState.startLeft + dx))
  pos.top = Math.max(0, Math.min(window.innerHeight - 40, dragState.startTop + dy))
}

// 拖拽结束
function onDragEnd() {
  dragState.active = false
  dragState.target = ''
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
}

// 切换行动面板折叠状态
function toggleActionPanel() {
  actionPanelCollapsed.value = !actionPanelCollapsed.value
}

// 切换阵营面板折叠状态
function toggleFactionPanel() {
  factionPanelCollapsed.value = !factionPanelCollapsed.value
}

// 切换行动记录面板折叠状态
function toggleActionLog() {
  actionLogCollapsed.value = !actionLogCollapsed.value
}



async function loadViewConfig() {
  try {
    const res = await glossaryAPI.getConfig()
    const vc = res.data?._view
    if (vc && typeof vc === 'object') {
      // 只覆盖存在的字段，其余保持 ISO_DEFAULTS
      if (typeof vc.shearX === 'number') ISO.shearX = vc.shearX
      if (typeof vc.shearY === 'number') ISO.shearY = vc.shearY
      if (typeof vc.scaleX === 'number') ISO.scaleX = vc.scaleX
      if (typeof vc.scaleY === 'number') ISO.scaleY = vc.scaleY
      if (typeof vc.rotation === 'number') ISO.rotation = vc.rotation
      if (typeof vc.topFlat === 'number') ISO.topFlat = vc.topFlat
      if (typeof vc.bottomFlat === 'number') ISO.bottomFlat = vc.bottomFlat
      console.log('[ViewConfig] 已加载视角配置:', JSON.stringify(vc))
    } else {
      // 后端无 _view 字段，使用完整的 ISO_DEFAULTS（与地图编辑器一致）
      console.log('[ViewConfig] 后端无视角配置，使用 ISO_DEFAULTS 基准值')
    }
  } catch (e) {
    console.warn('[ViewConfig] 加载视角配置失败，使用默认值:', e.message || e)
  }
}
const offsetFactor = DEFAULT_OFFSET_FACTOR

// ===== Terrain Types（配色来自 ../utils/hexUtils.js，成本保持本地定义）=====
// TERRAIN_MAP — 已迁移至 hexUtils.js 的 UNIVERSAL_TERRAIN_MAP
// 直接使用 UNIVERSAL_TERRAIN_MAP 作为全项目唯一地形真理

const FACTION_CONFIG = {
  earth:  { label: '地球联合', color: '#13ff43', order: 1 },
  maxion: { label: '马克西翁', color: '#ff4d4d', order: 2 },
  neutral:{ label: '中立',     color: '#ffb000', order: 3 },
  balon:  { label: '拜隆',     color: '#9c27b0', order: 4 },
  bailong:{ label: '拜隆军',   color: '#9c27b0', order: 4 },
  unknown:{ label: '未知阵营', color: '#888888', order: 99 },
}

// Phase 28: 阵营 Logo 缓存 { factionCode: HTMLImageElement }
const factionLogos = ref({})
const factionLogoLoaded = ref(false)

/**
 * Phase 28: 获取阵营 Logo 图像（已加载完成才返回）
 */
function getFactionLogoImage(factionCode) {
  if (!factionCode) return null
  const img = factionLogos.value[factionCode]
  if (img && img.complete && img.naturalWidth > 0) return img
  return null
}

/**
 * Phase 28: 异步加载阵营 Logo 列表
 */
async function loadFactionLogos() {
  try {
    const { data } = await hangarAPI.getFactions()
    const logos = {}
    let loadCount = 0
    const allFactions = data.factions || []
    allFactions.forEach(f => {
      const logoUrl = f.logoUrl || f.logo
      if (logoUrl) {
        const img = new Image()
        img.src = logoUrl
        logos[f.code] = img
        loadCount++
        img.onload = () => {
          factionLogos.value = { ...factionLogos.value, [f.code]: img }
          // Logo 加载完成后触发 Canvas 重绘
          if (hexGrid.value) hexGrid.value.redraw()
        }
        img.onerror = () => {
          // Logo 加载失败，不阻塞（Layer 3 兜底）
          console.warn(`[factionLogo] 加载失败: ${f.code}`)
        }
        // 立即缓存（可能未加载完，但后续 getFactionLogoImage 会检查 complete）
        factionLogos.value = { ...factionLogos.value, [f.code]: img }
      }
    })
    factionLogoLoaded.value = true
    console.log(`[factionLogo] 阵营 Logo 加载中: ${loadCount} 个`)
  } catch (e) {
    console.warn('[factionLogo] 加载阵营列表失败，回退纯矢量:', e.message)
    factionLogoLoaded.value = true
  }
}

// ===== 阵营角色与技能配置 =====
const factionRoles = ref({})  // 从 localStorage 加载的角色设定

// 按角色定义的阵营技能
const ROLE_SKILLS = {
  attack: [
    { key: 'fire_cover', icon: '🔥', label: '火力覆盖', desc: '选目标格，周围2格内所有单位受5点固定伤害，每场1次' },
    { key: 'fog_system', icon: '🌫', label: '迷雾系统', desc: '发动迷雾降低敌方命中率（盲目-50%/部分-25%），每3轮1次' },
  ],
  defense: [
    { key: 'reinforcement', icon: '🛡', label: '增援', desc: '被动：被攻击时1格内友军可代受80%伤害，每次最多1名' },
    { key: 'supply', icon: '💚', label: '补给', desc: '被动：每个己方回合自动恢复4HP' },
  ],
  ambush: [
    { key: 'surprise', icon: '🗡', label: '奇袭', desc: '敌方攻击时触发先制进攻：跳过敌方回合并以70%攻击力反击，全员可用' },
    { key: 'conceal', icon: '👻', label: '隐匿', desc: '单位进入隐匿状态，持续3轮，全员可用' },
  ],
}

// 默认角色分配（准备室未设置时使用）
const DEFAULT_ROLES = {
  earth: 'attack',
  maxion: 'ambush',
  balon: 'defense',
  neutral: 'attack',
}

// 加载阵营角色设定
function loadFactionRoles() {
  try {
    const saved = localStorage.getItem('factionRoles')
    if (saved) {
      factionRoles.value = JSON.parse(saved)
    }
  } catch (e) {}
}
function getFactionRole(key) {
  // 方案A：角色名或单位对象(带 role)直接采用 role，无需再经 faction→role 映射
  if (key && typeof key === 'object') {
    return key.role || DEFAULT_ROLES[key.faction] || key.faction || 'attack'
  }
  if (key === 'attack' || key === 'defense' || key === 'ambush') return key
  return factionRoles.value[key] || DEFAULT_ROLES[key] || 'attack'
}
function getFactionSkills(factionKey) {
  const role = getFactionRole(factionKey)
  return ROLE_SKILLS[role] || ROLE_SKILLS['attack']
}

// ===== 技能禁用检查 & 提示 =====
function isSkillDisabled(factionKey, skillKey) {
  const cd = factionCooldowns.value
  if (!cd) return true
  const role = getFactionRole(factionKey)
  // 偷袭阵营技能全员可用（无视ACE）
  if (role === 'ambush' && (skillKey === 'surprise' || skillKey === 'conceal')) return false
  // 防守阵营被动技能全员可用（无视ACE，无冷却）
  if (role === 'defense' && (skillKey === 'reinforcement' || skillKey === 'supply')) return false
  // 火力覆盖检查
  if (skillKey === 'fire_cover') return !!cd.fireCoverageUsed
  // 迷雾系统检查（攻击阵营）
  if (skillKey === 'fog_system') {
    if (cd.fogCooldownRemaining > 0) return true
    return !!cd.fogSystemUsed
  }
  // ACE检查：攻击阵营技能有ACE时只有ACE能用
  const ace = cd.ace_units ? cd.ace_units[factionKey] : null
  if (ace && selectedUnit.value && String(selectedUnit.value.id) !== String(ace)) {
    return true
  }
  return false
}

function skillTooltip(factionKey, skillKey) {
  const role = getFactionRole(factionKey)
  const skills = ROLE_SKILLS[role] || []
  const skill = skills.find(s => s.key === skillKey)
  const base = skill ? skill.desc : skillKey
  const cd = factionCooldowns.value
  if (!cd) return base
  if (role === 'ambush' && (skillKey === 'surprise' || skillKey === 'conceal')) return base + ' (全员可用·无视ACE)'
  if (role === 'defense' && (skillKey === 'reinforcement' || skillKey === 'supply')) return base + ' (被动·全员可用)'
  if (skillKey === 'fire_cover' && cd.fireCoverageUsed) return base + ' [已使用]'
  if (skillKey === 'fog_system') {
    if (cd.fogCooldownRemaining > 0) return base + ` [冷却${cd.fogCooldownRemaining}轮]`
    if (cd.fogSystemUsed) return base + ' [已使用]'
  }
  const ace = cd.ace_units ? cd.ace_units[factionKey] : null
  if (ace && selectedUnit.value && String(selectedUnit.value.id) !== String(ace)) {
    return base + ' (需要ACE单位)'
  }
  return base + ' [可用]'
}

// ===== 统一的阵营技能使用 =====
async function useFactionSkill(factionKey, skillKey) {
  if (!selectedUnit.value) {
    addLog('error', '请先选择一个单位')
    return
  }
  try {
    const role = getFactionRole(factionKey)
    const skills = ROLE_SKILLS[role] || []
    const skill = skills.find(s => s.key === skillKey)
    if (!skill) { addLog('error', '未知技能'); return }

    if (skillKey === 'fire_cover') {
      if (!confirm('使用火力覆盖？每场战斗只能使用一次。')) return
      await combatAPI.action(route.params.id, {
        actionType: 'artillery',
        params: {
          centerQ: selectedUnit.value.q,
          centerR: selectedUnit.value.r,
          unitId: String(selectedUnit.value.id)
        }
      })
      addLog('action', `🔥 火力覆盖发动！中心: ${formatCoord(selectedUnit.value.q, selectedUnit.value.r)}`)
    } else if (skillKey === 'fog_system') {
      if (!confirm('使用迷雾系统？每3轮只能使用一次。')) return
      await combatAPI.fogSystem(route.params.id, {
        unitId: String(selectedUnit.value.id)
      })
      addLog('action', '🌫 迷雾系统发动！')
    } else if (skillKey === 'surprise') {
      if (!confirm('使用奇袭？将跳过你的下个回合，选择奇袭方式（顶替/先制/放弃）。')) return
      // 设置奇袭待命状态，在下一次攻击时触发
      surprisePending.value = true
      addLog('action', '🗡 奇袭待命！下一次敌方攻击时将提示选择奇袭方式')
    } else if (skillKey === 'conceal') {
      if (!confirm('使用隐匿？该单位将进入隐匿状态（持续3轮）。')) return
      await combatAPI.action(route.params.id, {
        actionType: 'conceal',
        unitId: String(selectedUnit.value.id)
      })
      addLog('action', `👻 ${selectedUnit.value.name} 进入隐匿状态`)
    } else if (skillKey === 'reinforcement') {
      addLog('info', '🛡 增援是【被动技能】：友军被攻击时，1格内可代受80%伤害（每攻最多1次）')
    } else if (skillKey === 'supply') {
      addLog('info', '💚 补给是【被动技能】：每个己方回合自动恢复4HP')
    }
    await loadFactionCooldowns()
    await refreshState()
  } catch (e) {
    addLog('error', `技能使用失败: ${e.response?.data?.error || e.message}`)
  }
}

function getTerrainDef(id) {
  // 从全项目唯一地形真理查询（宪法 v2.0：显式依赖）
  return UNIVERSAL_TERRAIN_MAP[id] || { name: id || '未知', color: '#333', cost: 1 }
}

function getFactionConfig(faction) {
  return FACTION_CONFIG[faction] || FACTION_CONFIG.unknown
}

function getFactionColor(faction) {
  return getFactionConfig(faction).color
}

function getFactionLabel(faction) {
  return getFactionConfig(faction).label
}

/** 角色键 → 中文名（activeFaction 现已是角色键 attack/defense/ambush） */
function getRoleLabel(role) {
  const idx = ['attack', 'defense', 'ambush'].indexOf(role)
  return ['攻击', '防守', '偷袭'][idx] || role || ''
}

/** 角色键 → 主色（战术化阵营配色，替代固有阵营 Logo 以避免 404） */
function getRoleColor(role) {
  const map = { attack: '#13ff43', defense: '#4da6ff', ambush: '#ff4d4d' }
  return map[role] || '#ffb000'
}

// ===== Data =====
// Phase 30-Fix: 后端返回的战场地图在 battleState.map 字段（非 battlefield_state）
// 兼容两种路径：map 优先，回退到 battlefield_state，最后回退到 battleState 自身
const battleMapName = computed(() => {
  return battleState.value?.map?.name || battleState.value?.map_name || '战场'
})
const battlefieldState = computed(() => {
  return battleState.value?.map || battleState.value?.battlefield_state || {}
})
const cells = computed(() => {
  // map.cells 可能是数组或 JSON 字符串
  const raw = battlefieldState.value?.cells
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') { try { return JSON.parse(raw) } catch(e) {} }
  return []
})
const allUnits = computed(() => battleState.value?.units
  ? (Array.isArray(battleState.value.units)
    ? battleState.value.units
    : Object.values(battleState.value.units))
  : []
)
const gridWidth = computed(() => {
  // Phase 30-Fix: 同时检查 map.width 和 map 数组范围
  const w = battlefieldState.value?.width
  if (w && w > 0) return w
  // 自动从 cells 数组推算宽度
  const cs = cells.value
  if (cs.length > 0) {
    const maxQ = Math.max(...cs.map(c => c.q ?? 0))
    return maxQ + 1
  }
  console.warn('[NewBattleView] 后端未提供有效战场宽度，等待数据加载...')
  return 0
})
const gridHeight = computed(() => {
  const h = battlefieldState.value?.height
  if (h && h > 0) return h
  const cs = cells.value
  if (cs.length > 0) {
    const maxR = Math.max(...cs.map(c => c.r ?? 0))
    return maxR + 1
  }
  console.warn('[NewBattleView] 后端未提供有效战场高度，等待数据加载...')
  return 0
})
const battlefieldSize = computed(() => {
  if (!gridWidth.value || !gridHeight.value) return '加载中...'
  return `${gridWidth.value}×${gridHeight.value}`
})

// Phase 30-Fix: gridData 从真实战场 map 数据注水，移除死数据降级
const gridData = computed(() => {
  const raw = cells.value
  if (!gridWidth.value || !gridHeight.value) {
    // 仍未获取到有效战场数据，尝试从已部署单位坐标推算最小尺寸，
    // 避免单位被画在 1×1 视口外导致"完全看不见"。
    const unitQs = allUnits.value.filter(u => u.q !== undefined).map(u => u.q)
    const unitRs = allUnits.value.filter(u => u.r !== undefined).map(u => u.r)
    const minW = unitQs.length > 0 ? Math.max(...unitQs) + 1 : 1
    const minH = unitRs.length > 0 ? Math.max(...unitRs) + 1 : 1
    return {
      width: minW,
      height: minH,
      cells: [],
      topologyParam: { spacingH: 1.0, spacingV: 1.0, offsetFactor: 0.0 }
    }
  }
  if (!raw || raw.length === 0) {
    console.warn('[NewBattleView] gridData 未获取到有效 cells，等待后端 push')
  }
  return {
    width: gridWidth.value,
    height: gridHeight.value,
    cells: raw.map(c => ({
      q: c.q,
      r: c.r,
      terrain: typeof c.terrain === 'object' ? c.terrain.terrain_id : c.terrain
    })),
    topologyParam: { spacingH: 1.0, spacingV: 1.0, offsetFactor: 0.0 }
  }
})

// Phase 29-ParitySync: isoConfig — 与编辑器严格对齐，强制回退 ISO_DEFAULTS
// 后端 _view 仅允许覆写 shearX/shearY，其余字段硬编码 ISO_DEFAULTS
const isoConfig = computed(() => ({
  shearX: ISO.shearX,
  shearY: ISO.shearY,
  scaleX: ISO_DEFAULTS.scaleX,
  scaleY: ISO_DEFAULTS.scaleY,
  rotation: ISO_DEFAULTS.rotation,
  topFlat: ISO_DEFAULTS.topFlat,
  bottomFlat: ISO_DEFAULTS.bottomFlat,
}))

// 稳健 HP 兜底：对 0 / undefined / null / NaN 都回退（后端部署池单位历史上无 hp 字段，曾被误判阵亡标灰）
function safeHp(u) {
  const h = Number(u?.hp)
  if (h > 0) return h
  const ch = Number(u?.currentStats?.hp)
  if (ch > 0) return ch
  return 100
}
async function loadDeployPool() {
  try {
      // 优先尝试后端部署池 API
  try {
    const poolRes = await combatAPI.getDeployPool(route.params.id)
    if (poolRes.data.units && poolRes.data.units.length > 0) {
      deployPool.value = poolRes.data.units.map(u => ({ ...u, mobility: u.mobility ?? resolveUnitMobility(u), hp: safeHp(u), maxHp: safeHp(u) }))
      console.log('[loadDeployPool] 后端部署池返回棋子数:', deployPool.value.length)
      return
    }
  } catch (e) {
    console.warn('[loadDeployPool] 部署池API不可用，回退到 hangar API:', e.message || e)
  }

  // Fallback:
  const res = await hangarAPI.getUnits()
    const allUnits = res.data?.units || res.data || []
    // Filter by units selected in preparation room
    try {
      const selectedIds = JSON.parse(localStorage.getItem('selectedUnitIds') || '[]')
      if (selectedIds.length > 0) {
        deployPool.value = allUnits.filter(u => selectedIds.includes(u.id)).map(u => ({ ...u, mobility: u.mobility ?? resolveUnitMobility(u), hp: safeHp(u), maxHp: safeHp(u) }))
      } else {
        deployPool.value = allUnits.map(u => ({ ...u, mobility: u.mobility ?? resolveUnitMobility(u), hp: safeHp(u), maxHp: safeHp(u) }))
      }
    } catch {
      deployPool.value = allUnits
    }
  } catch (e) {
    console.error('[loadDeployPool] API失败，使用默认数据:', e.message || e)
    deployPool.value = [
      { id: 1, name: '先驱者-7', type: '突击型', attack: 85, defense: 70, mobility: 60, hp: 100, shield: 50, range: 1, faction: 'earth', skills: [{name:'冲锋'}, {name:'重击'}] },
      { id: 2, name: '壁垒-3', type: '防御型', attack: 45, defense: 95, mobility: 30, hp: 100, shield: 80, range: 1, faction: 'earth' },
      { id: 3, name: '幽灵-9', type: '侦察型', attack: 55, defense: 40, mobility: 95, hp: 100, shield: 30, range: 2, faction: 'earth', skills: [{name:'隐匿'}] },
      { id: 4, name: '毁灭者-X', type: '重装型', attack: 80, defense: 60, mobility: 40, hp: 100, shield: 70, range: 2, faction: 'maxion', skills: [{name:'火力覆盖'}] },
      { id: 5, name: '猎手-2', type: '突击型', attack: 75, defense: 50, mobility: 70, hp: 100, shield: 40, range: 1, faction: 'maxion' },
      { id: 6, name: '哨兵-A', type: '侦察型', attack: 40, defense: 55, mobility: 80, hp: 100, shield: 35, range: 2, faction: 'neutral' },
    ]
  }
}

const factionGroups = computed(() => {
  // 方案A 战术化：按「战术角色 role」(attack/defense/ambush) 分组，不再按固有阵营 faction 分组。
  // 这样来自其他界面部署、但同属一个战术角色的友军单位会归到同一组，避免「看不到友军」。
  const ROLE_KEYS = ['attack', 'defense', 'ambush']
  const groups = {}
  ROLE_KEYS.forEach(r => { groups[r] = [] })
  // 已部署单位
  allUnits.value.forEach(u => {
    const r = u.role || getFactionRole(u.faction) || 'unknown'
    if (!groups[r]) groups[r] = []
    groups[r].push(u)
  })
  // 部署期：把部署池中尚未下场的单位也并入对应战术组，保证列表完整
  if (isDeployPhase.value) {
    deployPool.value.forEach(u => {
      const r = u.role || getFactionRole(u.faction) || 'unknown'
      if (!groups[r]) groups[r] = []
      const exists = groups[r].some(existing => existing.id === u.id)
      if (!exists) groups[r].push(u)
    })
  }
  return Object.entries(groups)
    .filter(([key]) => ROLE_KEYS.includes(key)) // 仅展示合法战术角色组
    .map(([key, units]) => ({
      key,
      role: key,
      label: getRoleLabel(key),                  // 攻击方 / 防守方 / 奇袭方（文字，避免固有阵营 Logo 404）
      color: getRoleColor(key),
      units,
      order: ['attack', 'defense', 'ambush'].indexOf(key),
    }))
    .sort((a, b) => a.order - b.order)
})

const usedTerrains = computed(() => {
  const found = {}
  cells.value.forEach(c => {
    const t = c.terrain || 'void'
    if (!found[t]) found[t] = getTerrainDef(t)
  })
  return found
})

// ===== Hex Math（包装函数，自动注入当前间距参数）=====
function hexToPixel(q, r) {
  // 尖顶 Pointy-Top Even-R Offset 中心公式（含间距缩放），映射为 { x, y }
  const { flatX, flatY } = pointyTopCenter(q, r, HEX_RADIUS, spacingH, spacingV)
  return { x: flatX, y: flatY }
}

function pixelToHex(px, py) {
  return pointyTopToHex(px, py, HEX_RADIUS, spacingH, spacingV)
}

// getHexNeighbors 仍从 hexUtils 导入；drawHexPath 已从 hexUtils 迁至 hexDraw.js（阶段 1 · §3.1g / §3.4e）

function hexToRGBA(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function colToLetter(q) {
  let result = '', n = q
  while (n >= 0) { result = String.fromCharCode(65 + (n % 26)) + result; n = Math.floor(n / 26) - 1 }
  return result
}

function formatCoord(q, r) { return `${colToLetter(q)}${r + 1}` }

// ===== Action Log =====
function addLog(type, message) {
  const now = new Date()
  const time = now.toTimeString().slice(0, 8)
  sidebarActionLog.value.unshift({ type, message, time })
  if (sidebarActionLog.value.length > 200) sidebarActionLog.value.pop()
  // 自动滚到顶部（最新记录在上）：由下方 watch 监听 sidebarActionLog 处理
}

// 行动记录自动滚动到顶部（最新在上）
watch(sidebarActionLog, () => {
  nextTick(() => {
    if (logContainer.value) logContainer.value.scrollTop = 0
  })
}, { deep: true })

// Phase 29-P0: ctx 已由 HexGridCanvasEngine 应用完整 CTM (translate→scale→ISO shear)
// 引擎已负责：地形填充、坐标标签、悬停高亮 → drawFn 只绘制战斗专用叠加层
function drawBattleScene(ctx, opts) {
  const isInViewport = opts?.isInViewport
  // Cell lookup
  const cellMap = {}
  cells.value.forEach(c => { cellMap[`${c.q},${c.r}`] = c })

  // Unit lookup
  const unitMap = {}
  allUnits.value.forEach(u => {
    if (u.q !== undefined) unitMap[`${u.q},${u.r}`] = u
  })

  // Movement range preview -- BFS with terrain cost on offset hex grid
  const moveRangeHexes = new Set()
  if (actionMode.value === 'move' && selectedUnit.value) {
    const su = selectedUnit.value
    // 移动力即移动值预算（移动点）：普通地形 1 点/格，特殊地形更多（与后端 tsFindPath 对齐）。
    // 优先取 moveRange（机体+载具+背包合计），回退 mobility（仅机体），最后兜底 3。不再 /10。
    const rawMob = su.moveRange || su.mobility || su['机动'] || 3
    // 体型机动补偿 Buff：被更大机体攻击后下回合移动 +N（与后端 /move 对齐）
    const buffMob = (su.mobility_buff && su.mobility_buff_turns > 0) ? (su.mobility_buff || 0) : 0
    const movePoints = Math.max(1, Math.round(Number(rawMob) + Number(buffMob)))
    const startKey = `${su.q},${su.r}`
    const visited = new Set([startKey])
    const queue = [{ q: su.q, r: su.r, cost: 0 }]
    while (queue.length > 0) {
      const cur = queue.shift()
      for (const n of getHexNeighbors(cur.q, cur.r)) {
        const nKey = `${n.q},${n.r}`
        if (visited.has(nKey)) continue
        if (n.q < 0 || n.q >= gridWidth.value || n.r < 0 || n.r >= gridHeight.value) continue
        const cell = cellMap[nKey]
        const terrain = getTerrainDef(cell?.terrain || 'void')
        const stepCost = terrain.cost || 1
        const newCost = cur.cost + stepCost
        if (newCost <= movePoints) {
          visited.add(nKey)
          queue.push({ q: n.q, r: n.r, cost: newCost })
          if (!unitMap[nKey]) {
            moveRangeHexes.add(nKey)
          }
        }
      }
    }
  }

  // RoyRoy deployable hexes
  const royroyHexes = new Set()
  if (royroyDeployMode.value && selectedUnit.value) {
    const su = selectedUnit.value
    const neighbors = getHexNeighbors(su.q, su.r)
    neighbors.forEach(n => {
      const nKey = `${n.q},${n.r}`
      if (n.q >= 0 && n.q < gridWidth.value && n.r >= 0 && n.r < gridHeight.value) {
        const cell = cellMap[nKey]
        const terrain = getTerrainDef(cell?.terrain || 'void')
        if (terrain.cost < 99 && !unitMap[nKey]) {
          royroyHexes.add(nKey)
        }
      }
    })
  }

  // Skill/Tactical range preview
  const skillRangeHexes = new Set()
  const validTargets = new Set()
  if (actionMode.value === 'tactical' && selectedUnit.value && !royroyDeployMode.value) {
    const su = selectedUnit.value
    const range = getSkillRange(selectedAttackSkill.value)
    // 审计报告 #4 修复：范围预览需排除最小施放距离(min_range)内的格
    const rangeMin = getSkillRangeMin(selectedAttackSkill.value)
    // BFS for hex range ring
    const startKey = `${su.q},${su.r}`
    const visited = new Set([startKey])
    const queue = [{ q: su.q, r: su.r, dist: 0 }]
    while (queue.length > 0) {
      const cur = queue.shift()
      if (cur.dist >= range) continue
      for (const n of getHexNeighbors(cur.q, cur.r)) {
        const nKey = `${n.q},${n.r}`
        if (visited.has(nKey)) continue
        if (n.q < 0 || n.q >= gridWidth.value || n.r < 0 || n.r >= gridHeight.value) continue
        visited.add(nKey)
        queue.push({ q: n.q, r: n.r, dist: cur.dist + 1 })
        const cell = cellMap[nKey]
        const terrain = getTerrainDef(cell?.terrain || 'void')
        // For range display, use raw hex distance (don't count terrain cost)
        // 同时排除 min_range 内的格（审计报告 #4）
        if (cur.dist + 1 <= range && cur.dist + 1 >= rangeMin) {
          skillRangeHexes.add(nKey)
        }
      }
    }
    // Highlight valid targets (enemy units in range)
    validTargets.clear()
    allUnits.value.forEach(u => {
      if (u.q === undefined || u.id === su.id) return
      // Check if target is in range
      const tKey = `${u.q},${u.r}`
      if (skillRangeHexes.has(tKey)) {
        // For normal attack or non-ally targeting skills
        const skill = selectedAttackSkill.value
        if (!skill || skill.targetType === 'enemy' || !skill.targetType) {
          // Check same faction (don't attack allies with normal attack)
          if (!skill && u.faction === su.faction) return
          if (skill && skill.targetType === 'ally' && u.faction !== su.faction) return
          if (skill && skill.targetType === 'enemy' && u.faction === su.faction) return
          validTargets.add(tKey)
        }
      }
    })
  }

  // Phase 29-P0: 战斗专用叠加层 — 引擎已负责地形/坐标/悬停，drawFn只绘制高亮&单位
  for (let r = 0; r < gridHeight.value; r++) {
    for (let q = 0; q < gridWidth.value; q++) {
      // 视口裁剪：跳过不可见的格子
      if (isInViewport && !isInViewport(q, r)) continue

      const { flatX, flatY } = pointyTopCenter(q, r, HEX_RADIUS, spacingH.value, spacingV.value)
      const cx = flatX
      const cy = flatY
      const hexKey = `${q},${r}`

      // Move range highlight
      if (moveRangeHexes.has(hexKey)) {
        ctx.fillStyle = 'rgba(0,180,220,0.15)'
        drawHexPath(ctx, cx, cy)
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,180,220,0.4)'
        ctx.lineWidth = 2
        drawHexPath(ctx, cx, cy)
        ctx.stroke()
      }

      // Skill range highlight (yellow ring)
      if (skillRangeHexes && skillRangeHexes.has(hexKey)) {
        const isTarget = validTargets && validTargets.has(hexKey)
        if (isTarget) {
          // Valid target cell → red highlight + crosshair
          ctx.fillStyle = 'rgba(255,77,77,0.2)'
          drawHexPath(ctx, cx, cy)
          ctx.fill()
          ctx.strokeStyle = 'rgba(255,77,77,0.6)'
          ctx.lineWidth = 2.5
          drawHexPath(ctx, cx, cy)
          ctx.stroke()
          ctx.fillStyle = 'rgba(255,77,77,0.8)'
          ctx.font = '14px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('⊕', cx, cy)
        } else {
          // Range cell → yellow outline
          ctx.fillStyle = 'rgba(255,176,0,0.08)'
          drawHexPath(ctx, cx, cy)
          ctx.fill()
          ctx.strokeStyle = 'rgba(255,176,0,0.3)'
          ctx.lineWidth = 1.5
          drawHexPath(ctx, cx, cy)
          ctx.stroke()
        }
      }

      // RoyRoy deploy highlight
      if (royroyHexes && royroyHexes.has(hexKey)) {
        ctx.fillStyle = 'rgba(156,39,176,0.2)'
        drawHexPath(ctx, cx, cy)
        ctx.fill()
        ctx.strokeStyle = 'rgba(156,39,176,0.6)'
        ctx.lineWidth = 2.5
        ctx.setLineDash([4, 3])
        drawHexPath(ctx, cx, cy)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(206,147,216,0.9)'
        ctx.font = '14px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('◇', cx, cy)
      }
    }
  }

  // ================================================================
  //  Draw units — Billboard 2D 垂直站立渲染 (Phase 2)
  //  按 screenY Z-order 排序，逃逸 ISO 矩阵以保持 1:1 正常比例
  // ================================================================

  // 从 HexGridCanvas 暴露的 API 获取变换参数
  const iso = hexGrid.value?.ISO || ISO_DEFAULTS
  const s = hexGrid.value?.scale || 1
  const ox = hexGrid.value?.offsetX || 0
  const oy = hexGrid.value?.offsetY || 0

  // 预计算各 unit 的屏幕 Y，用于 Z-order 排序
  // Phase 3: 使用 getUnitDrawFlat 获取考虑 lerp 插值的实时坐标
  const unitsWithScreenY = allUnits.value
    .filter(u => u.q !== undefined)
    .map(u => {
      const { flatX, flatY } = getUnitDrawFlat(u)
      const screenY = oy + s * (iso.scaleY * flatX + iso.shearY * flatY)
      return { unit: u, flatX, flatY, screenY }
    })
    .sort((a, b) => a.screenY - b.screenY)  // Y小(靠后)先绘 → Y大(靠前)覆盖

  if (unitsWithScreenY.length > 0) {
    const first = unitsWithScreenY[0]
    const fx = ox + s * (iso.scaleX * first.flatX + iso.shearX * first.flatY)
    const fy = oy + s * (iso.shearY * first.flatX + iso.scaleY * first.flatY)
    console.log('[drawBattleScene] units=', unitsWithScreenY.length, 'first unit q/r=', first.unit.q, first.unit.r, 'screenXY=', Math.round(fx), Math.round(fy))
  }

  unitsWithScreenY.forEach(({ unit, flatX, flatY }) => {
    if (unit.q === undefined) return
    // 幽灵清理：血条归零或显式 dead 的单位直接从战场消失，不绘制机体与血条
    if (isUnitDead(unit)) return

    // ===== 模块1：物理迷雾（Fog of War Masking）=====
    // 敌方隐匿单位：绝不在 Canvas 上绘制其机体模型与血条，确保绝对隐形。
    // （后端暴露字段为 unit.stealth；ownerId/faction 判定的「我方单位」仍可见自己的隐匿单位）
    const isStealth = unit.stealth === true
    const myId = user.value?.userId
    const myFactionResolved = myFaction.value
    // 方案A：友军判定基于「战术角色 role」而非固有 faction。
    // myRole = 当前玩家固有 faction 经 factionRoles 翻译出的战术角色；与 unit.role 比对，
    // 这样其他界面部署但同角色的友军（即使 faction 不同）也能正确解盲、不被迷雾截断。
    const myRole = getFactionRole(myFactionResolved)
    const unitRole = unit.role || getFactionRole(unit.faction)
    const isMyUnit = unit.ownerId === myId || (myRole && unitRole === myRole)
    // 上帝视角豁免（2026-07-30）：房主(isHost)或 DOMINATOR/REFEREE 管理员可见全部 stealth 单位
    const isGod = !!(
      (battleState.value?.hostId && myId && String(battleState.value.hostId) === String(myId)) ||
      ['dominator', 'referee'].includes((user.value?.role || '').toString().toLowerCase())
    )
    if (isStealth && !isMyUnit && !isGod) return
    const isConcealed = isStealth && !isGod

    // 阵营主色与选中态（供下方矢量降级圆标 / 选中环使用）
    const fc = getFactionColor(unit.faction)
    const isSelected = selectedUnit.value?.id === unit.id || selectedDeployUnit.value?.id === unit.id

    // === Step A: 计算屏幕空间锚点 (unit 脚底中心) ===
    const screenX = ox + s * (iso.scaleX * flatX + iso.shearX * flatY)
    const screenY = oy + s * (iso.shearY * flatX + iso.scaleY * flatY)

    // === Step B: 逃逸 ISO 矩阵 ===
    ctx.save()

    // === Step C: 重置为单位矩阵，定位到屏幕像素 ===
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.translate(screenX, screenY)
    ctx.scale(s, s)  // 只缩放，不倾斜
    // 像素风锐化：禁用平滑插值，确保 S/M/L/XL 放大单位保持硬朗边缘（含浏览器前缀兜底）
    ctx.imageSmoothingEnabled = false
    ctx.webkitImageSmoothingEnabled = false
    ctx.mozImageSmoothingEnabled = false

    // === Step C2: 脚底投影椭圆（需求③：挤出 + 有高度时阴影加深；否则轻量） ===
    const _tid = (cellMap[`${unit.q},${unit.r}`]?.terrain) || 'void'
    const _colH = (UNIVERSAL_TERRAIN_MAP[_tid]?.height) || 0
    const _projA = (extrudeEnabled.value && _colH > 0) ? 0.34 : 0.16
    ctx.beginPath()
    ctx.ellipse(0, 0, HEX_RADIUS * 0.52, HEX_RADIUS * 0.3, 0, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(0,0,0,${_projA})`
    ctx.fill()

    // === Step D: 查询切图纹理 ===
    const visual = getUnitVisual(unit)
    // unitCode 净化：只允许英文/数字/下划线/连字符，避免中文 type（如"突击型"）泄漏进 /assets/sprites/units/ 路径
    const rawCode = unit.unitCode || unit.sprite_key || unit.type || String(unit.id)
    const unitCode = /^[a-zA-Z0-9_-]+$/.test(rawCode) ? rawCode : 'DEFAULT'
    const fallbackCode = 'DEFAULT'

    // === Phase 30-Cover: 七视图棋子优先渲染（不全则回退圆标+字母） ===
    const sizeScale = sizeRenderScale(unit.size)
    const _sevenImg = resolveSevenView(unit.viewUrls || unit.view_urls, visual.direction)
    const _hasSeven = !!(_sevenImg && _sevenImg.complete && _sevenImg.naturalWidth > 0 && !isConcealed)
    if (_hasSeven) {
      const iw = _sevenImg.naturalWidth, ih = _sevenImg.naturalHeight
      // 体型工坊：每档尺寸锁定固定基础盒子（×1.6 放大），消除原图比例窜改体型层级
      const box = sizeSevenBox(unit.size)
      const maxW = box.w, maxH = box.h
      const aspect = iw / ih
      let dw, dh
      if (aspect > maxW / maxH) { dw = maxW; dh = dw / aspect } else { dh = maxH; dw = dh * aspect }
      // 盒子整体放大 60%（图片等比放大，保持原有盒子↔图片缩放比例）
      const BOX_ENLARGE = 1.6
      dw *= BOX_ENLARGE; dh *= BOX_ENLARGE
      // 锚定：默认把真实脚底(底部不透明行)钉在地面(FOOT_GAP=0)，作为非飞行单位标准。
      // 飞行单位保留原高度（盒子底边钉在地面，脚底随透明留白自然悬浮）。
      const FOOT_GAP = 0
      let topY = -dh
      const footY = _sevenImg._footY
      const isFlying = unit.flying === true || unit.flying === 'true' || unit.type === 'air'
      if (!isFlying && typeof footY === 'number' && footY >= 0 && footY < ih) {
        const pad = ih - footY // 脚底到画布底的透明留白（源像素）
        const bottomY = -FOOT_GAP + (pad / ih) * dh
        topY = bottomY - dh
      }
      ctx.drawImage(_sevenImg, -dw / 2, topY, dw, dh)
    }

    const sprite = !isConcealed
      ? unitSpriteResolver.getTexture(unitCode, visual.direction, visual.actionState, fallbackCode)
      : null

    const hasSprite = sprite && sprite.image.complete && sprite.image.naturalWidth > 0

    if (!_hasSeven && hasSprite && !isConcealed) {
      // ---- 2D 棋子以 1:1 正常比例绘制 (不受 ISO 压扁) ----
      ctx.drawImage(
        sprite.image,
        sprite.sx, sprite.sy, sprite.sw, sprite.sh,
        -sprite.anchorX * sizeScale, -sprite.anchorY * sizeScale,
        sprite.renderW * sizeScale, sprite.renderH * sizeScale
      )
    } else if (!_hasSeven && !isConcealed) {
      // ================================================================
      //  Phase 28-D: 三层视觉降级金字塔 — Layer 1 / 2 / 3
      // ================================================================
      // 获取朝向: 优先使用后端 unit.direction，其次用前端视觉状态
      const facingDir = (unit.direction !== undefined) ? unit.direction : visual.direction
      const rotAngle = (facingDir >= 1 && facingDir <= 6)
        ? (facingDir - 1) * 60 * Math.PI / 180  // 60° 倍数旋转
        : 0

      // Layer 2: 阵营 Logo 旋转底座 + 半透明首字母
      const factionLogo = getFactionLogoImage(unit.faction)
      if (factionLogo) {
        const logoSize = HEX_RADIUS * 0.85
        const halfLogo = logoSize / 2
        // ⚠️ 旋转 scope: 保存在独立 save/restore 内，确保 UI 元素不跟着旋转
        ctx.save()
        ctx.rotate(rotAngle)
        // 阵营 Logo 底图（置于六角格中心，随方向旋转）
        ctx.drawImage(factionLogo, -halfLogo, -halfLogo, logoSize, logoSize)
        // 半透明叠加首字母（旋转后仍居 Logo 中心）
        const letter = (unit.name || 'U')[0]
        ctx.fillStyle = hexToRGBA('#ffffff', 0.9)
        ctx.font = 'bold 13px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(letter, 0, -1)
        // 阴影描边提升可读性
        ctx.strokeStyle = hexToRGBA('#000000', 0.6)
        ctx.lineWidth = 2.5
        ctx.strokeText(letter, 0, -1)
        ctx.restore()  // ← 恢复旋转，后续 HP/选中环绝对正立
      } else {
        // Layer 3: 绝对死锁防御 — 纯矢量圆形 + 首字母（不旋转）
        const r = HEX_RADIUS * 0.4 * sizeScale
        ctx.beginPath()
        ctx.arc(0, 0, r, 0, Math.PI * 2)
        ctx.fillStyle = hexToRGBA(fc, 0.45)
        ctx.fill()
        ctx.strokeStyle = isSelected ? '#ffffff' : fc
        ctx.lineWidth = isSelected ? 3.5 : 2.5
        ctx.stroke()

        const letter = (unit.name || 'U')[0]
        ctx.fillStyle = fc
        ctx.font = 'bold 16px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(letter, 0, 0)
      }
    } else if (!_hasSeven) {
      // ---- 隐蔽状态: 低透明度圆形 + 首字母 ----
      const r = HEX_RADIUS * 0.4
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fillStyle = hexToRGBA(fc, 0.15)
      ctx.fill()
      ctx.strokeStyle = isSelected ? hexToRGBA('#ffffff', 0.5) : hexToRGBA(fc, 0.3)
      ctx.lineWidth = isSelected ? 3.5 : 2.5
      if (!isSelected) ctx.setLineDash([3, 4])
      ctx.stroke()
      ctx.setLineDash([])

      const letter = (unit.name || 'U')[0]
      ctx.fillStyle = hexToRGBA(fc, 0.6)
      ctx.font = 'bold 16px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(letter, 0, 0)
    }

    // ⚠️ 以下 UI 元素在 ctx.restore() 旋转恢复后绘制，绝对正立 (0°)
    // Selection ring
    if (isSelected) {
      ctx.beginPath()
      ctx.arc(0, 0, HEX_RADIUS * 0.5, 0, Math.PI * 2)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 3])
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Concealment indicator
    if (isConcealed) {
      ctx.beginPath()
      ctx.arc(0, -HEX_RADIUS * 0.33, 2.5, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,180,220,0.7)'
      ctx.fill()
    }

    // HP bar (在 billboard 空间内绘制，保证不变形、不旋转)
    const _maxHp = unit.maxHp || unit.hp || 100
    const hpPct = Math.max(0, Math.min(1, (unit.hp || 0) / _maxHp))
    const barW = HEX_RADIUS * 0.6
    const barH = 3
    const barY = HEX_RADIUS * 0.32
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(-barW / 2, barY, barW, barH)
    ctx.fillStyle = hpPct > 0.5 ? '#13ff43' : hpPct > 0.25 ? '#ffb000' : '#ff4d4d'
    ctx.fillRect(-barW / 2, barY, barW * hpPct, barH)

    // === Step E: 恢复 CTM ===
    ctx.restore()
  })

  // Draw deployed RoyRoy markers (sorted by flatY for correct iso layering)  // Draw deployed RoyRoy markers (sorted by flatY for correct iso layering)
  const sortedRoyUnits = [...allUnits.value]
    .filter(u => u.royroy_deployed && u.royroy_q !== undefined && u.royroy_r !== undefined)
    .sort((a, b) => {
      const { flatY: ay } = pointyTopCenter(a.royroy_q, a.royroy_r, HEX_RADIUS, spacingH, spacingV)
      const { flatY: by } = pointyTopCenter(b.royroy_q, b.royroy_r, HEX_RADIUS, spacingH, spacingV)
      return ay - by
    })
  sortedRoyUnits.forEach(unit => {
    if (!unit.royroy_deployed || unit.royroy_q === undefined || unit.royroy_r === undefined) return
    const { flatX: rfx, flatY: rfy } = pointyTopCenter(unit.royroy_q, unit.royroy_r, HEX_RADIUS, spacingH, spacingV)
    const rcx = rfx
    const rcy = rfy

    // Yellow circle background
    ctx.beginPath()
    ctx.arc(rcx, rcy, HEX_RADIUS * 0.28, 0, Math.PI * 2)
    ctx.fillStyle = "rgba(255, 180, 0, 0.35)"
    ctx.fill()
    ctx.strokeStyle = "rgba(255, 180, 0, 0.8)"
    ctx.lineWidth = 2
    ctx.stroke()

    // Yellow "R" letter
    ctx.fillStyle = "#ffb000"
    ctx.font = "bold 14px monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("R", rcx, rcy)
  })

  // === Step F: 空投补给 token（卡8）===
  const groundItems = battleState.value?.groundItems || []
  for (const item of groundItems) {
    const { flatX: gX, flatY: gY } = pointyTopCenter(item.q, item.r, HEX_RADIUS, spacingH, spacingV)
    drawGroundItemToken(ctx, gX, gY, null, { kind: item.kind, label: item.label })
  }

  // 模块4：绘制视觉特效叠层（开火/受击/奇袭爆闪），特效在屏幕像素空间绘制
  drawVisualEffects(ctx)
}

// 模块4：视觉特效渲染（逃逸 ISO 矩阵，屏幕像素空间绘制）
function drawVisualEffects(ctx) {
  const now = performance.now()
  const iso = hexGrid.value?.ISO || ISO_DEFAULTS
  const s = hexGrid.value?.scale || 1
  const ox = hexGrid.value?.offsetX || 0
  const oy = hexGrid.value?.offsetY || 0
  for (const e of visualEffects) {
    const age = (now - e.bornAt) / e.ttl
    if (age > 1) continue
    const screenX = ox + s * (iso.scaleX * e.flatX + iso.shearX * e.flatY)
    const screenY = oy + s * (iso.shearY * e.flatX + iso.scaleY * e.flatY)
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.translate(screenX, screenY)
    ctx.scale(s, s)
    const alpha = 1 - age
    if (e.type === 'hit') {
      const radius = HEX_RADIUS * (0.3 + age * 0.9)
      ctx.strokeStyle = `rgba(255,70,70,${alpha})`
      ctx.lineWidth = 3 * alpha
      ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke()
    } else if (e.type === 'muzzle') {
      ctx.fillStyle = `rgba(255,220,90,${alpha})`
      ctx.beginPath(); ctx.arc(0, -HEX_RADIUS * 0.35, HEX_RADIUS * 0.45 * alpha, 0, Math.PI * 2); ctx.fill()
    } else if (e.type === 'burst') {
      const radius = HEX_RADIUS * (0.3 + age * 1.4)
      ctx.strokeStyle = `rgba(105,240,174,${alpha})`
      ctx.lineWidth = 4 * alpha
      ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.restore()
  }
}

// ===== HexGridCanvas 事件处理器 =====

// ===== HexGridCanvas 事件处理器 (替代原 setupEvents + 原始 Canvas 事件) =====

function findUnitAt(q, r) {
  return allUnits.value.find(u => u.q === q && u.r === r)
}

function onHexClick({ q, r }) {
  if (q < 0 || q >= gridWidth.value || r < 0 || r >= gridHeight.value) return

  // Deploy mode
  if (isDeployPhase.value && selectedDeployUnit.value) { deployToHex(q, r); return }

  // RoyRoy deploy mode
  if (royroyDeployMode.value && selectedUnit.value) {
    const nKey = `${q},${r}`
    const neighbors = getHexNeighbors(selectedUnit.value.q, selectedUnit.value.r)
    const isAdjacent = neighbors.some(n => n.q === q && n.r === r)
    const isOccupied = allUnits.value.some(u => u.q === q && u.r === r)
    const cell = cells.value.find(c => c.q === q && c.r === r)
    const terrain = getTerrainDef(cell?.terrain || 'void')
    if (isAdjacent && !isOccupied && terrain.cost < 99) {
      deployRoyroyAt(q, r)
    } else {
      addLog('error', isOccupied ? '该格已有单位' : '只能部署在相邻空格')
    }
    return
  }

  // 空投补给 info（卡8）：点击地面补给箱优先弹出信息
  const gItem = (battleState.value?.groundItems || []).find(it => it.q === q && it.r === r)
  if (gItem) {
    reactionUI.airdropInfo = gItem
    return
  }

  // Action mode: move（阵营轮转门控）
  if (actionMode.value === 'move' && selectedUnit.value) {
    if (!isMyTurn(selectedUnit.value)) { addLog('warn', `当前行动阵营为 ${battleState.value?.activeFaction}，无法操作该单位`); return }
    executeMove(q, r); return
  }

  // Check if clicked on a unit
  const clickedUnit = findUnitAt(q, r)
  if (clickedUnit) {
    // 选中己方单位后点击「敌方单位」(不同阵营)：仅当处于战术模式(actionMode==='tactical')
    // 或已选中攻击技能(selectedAttackSkill)时才发起攻击；否则默认按选择处理(查看信息)
    if (selectedUnit.value && clickedUnit.id !== selectedUnit.value.id && clickedUnit.faction !== selectedUnit.value.faction) {
      if (actionMode.value === 'tactical' || selectedAttackSkill.value) {
        if (selectedAttackSkill.value) { executeSkillAttack(clickedUnit, selectedAttackSkill.value) }
        else { executeAttack(clickedUnit) }
        return
      }
    }
    // 否则（默认点击敌方=查看信息 / 点己方另一单位 / 未选单位时点敌人）按选择处理
    selectUnit(clickedUnit)
    return
  }

  // Clicked empty hex - show info
  if (!actionMode.value) {
    const cell = cells.value.find(c => c.q === q && c.r === r)
    const t = cell?.terrain || 'void'
    const def = getTerrainDef(t)
    terminalLogs.value.unshift(`// HEX ${formatCoord(q, r)} [${def.name}]`)
    if (terminalLogs.value.length > 5) terminalLogs.value.pop()
  }
}

function onHexHover({ q, r }) {
  if (q >= 0 && q < gridWidth.value && r >= 0 && r < gridHeight.value) {
    hoverCoord.value = formatCoord(q, r)
  } else {
    hoverCoord.value = ''
  }
}

function onHexContextMenu({ q, r }) {
  // 保留接口
}
// ===== Unit Selection =====
function selectUnit(unit) {
  selectedUnit.value = unit
  actionMode.value = null
  addLog('select', `选中 ${unit.name || 'Unit-'+unit.id} (${getFactionLabel(unit.faction)})`)
  hexGrid.value?.redraw()
}

function selectUnitById(unit) {
  if (unit.q !== undefined) {
    selectUnit(unit)
    // 居中到选中单位：战场为 iso 模式，必须走引擎自带的 centerOn（内部用 worldOf 等距变换），
    // 严禁用 hexToPixel 的平面坐标直接算 offset——否则相机跳到空白区，地形被推出屏幕、只剩棋子。
    hexGrid.value?.centerOn(unit.q, unit.r)
  }
  hexGrid.value?.redraw()
}

function clearSelection() {
  selectedUnit.value = null
  actionMode.value = null
  hexGrid.value?.redraw()
}

// ===== Actions =====
function startAction(mode) {
  if (!selectedUnit.value) return
  actionMode.value = mode
  selectedAttackSkill.value = null
  royroyDeployMode.value = false
  addLog('info', `${selectedUnit.value.name} 选择行动: ${mode}`)
  if (mode === 'defend' || mode === 'wait') {
    executeAction(mode)
  }
  if (mode === 'skip_tactical') {
    executeSkipTactical()
  }
  if (mode === 'skip_move') {
    executeSkipMove()
  }
  hexGrid.value?.redraw()
}

function cancelAction() {
  actionMode.value = null
  selectedAttackSkill.value = null
  royroyDeployMode.value = false
  hexGrid.value?.redraw()
}

async function executeAction(type, params = {}) {
  if (!selectedUnit.value) return
  const unit = selectedUnit.value
  try {
    if (type === 'defend') {
      addLog('action', `${unit.name} 进入防御姿态（受击 -3，直到下个自己回合）`)
      // Phase 2: 防御姿态视觉
      setUnitVisual(unit.unitId || unit.id, null, 'defend')
      // 真实后端调用：清零行动点 + 写入持续减伤 statusEffect（后端无 defend 分支时抛错由外层捕获）
      await combatAPI.action(route.params.id, { actionType: 'defend', params: { unitId: String(unit.id) } })
    } else if (type === 'wait') {
      addLog('action', `${unit.name} 原地待机`)
      // Phase 2: 待命视觉
      setUnitVisual(unit.unitId || unit.id, null, 'wait')
      try {
        await combatAPI.action(route.params.id, { actionType: 'wait', params: { unitId: String(unit.id) } })
      } catch (e) { /* offline fallback */ }
    } else if (type === 'skill') {
      addLog('action', `${unit.name} 使用技能: ${params.skill_id}`)
      try {
        await combatAPI.action(route.params.id, { actionType: 'skill', params: { unitId: String(unit.id), skill_id: String(params.skill_id) } })
      } catch (e) { /* offline fallback */ }
    }
    actionMode.value = null
    await refreshState()
  } catch (e) {
    addLog('error', `操作失败: ${e.response?.data?.error || e.message}`)
  }
}

// ===== Skill Groups (按来源分组技能) =====
const skillGroups = computed(() => {
  const unit = selectedUnit.value
  const skills = unit?.skills || []

  // 动态生成装备技能（如果技能数据中缺少来自武器的技能）
  const allSkills = [...skills]
  if (unit && skills.length === 0) {
    // 从装备数据生成技能标签
    const genSkill = (slot, label, equipType, melee, ranged, defense, durability, name) => {
      if (!melee && !ranged && !defense) return
      const s = {
        id: `gen_${slot}_skill_0`,
        name: name || label,
        type: equipType || 'melee',
        attribute: equipType === 'beam' ? 'beam' : 'kinetic',
        slot: slot,
        active: true,
        disabled: durability !== undefined && durability <= 0,
        category: (ranged && ranged > melee) ? 'ranged' : 'melee',
        slots: 1,
        targetType: 'enemy',
        needTarget: true,
        initCounter: 0,
        description: `${label} 攻击`,
        range: (ranged && ranged > 1) ? ranged : (melee || 1),
        range_min: (ranged && ranged > 1) ? ranged : (melee || 1),
        range_max: (ranged && ranged > 1) ? ranged : (melee || 1),
        original: { name: name || label }
      }
      if (melee && ranged && ranged > melee) s.range = ranged
      return s
    }

    if (unit.left_hand_melee || unit.left_hand_ranged) {
      const s = genSkill('left', unit.left_hand_name || '左手武器', unit.left_hand_type,
        unit.left_hand_melee, unit.left_hand_ranged, unit.left_hand_defense,
        unit.left_hand_durability, unit.left_hand_name || '左手武器')
      if (s) allSkills.push(s)
    }
    if (unit.right_hand_melee || unit.right_hand_ranged) {
      const s = genSkill('right', unit.right_hand_name || '右手武器', unit.right_hand_type,
        unit.right_hand_melee, unit.right_hand_ranged, unit.right_hand_defense,
        unit.right_hand_durability, unit.right_hand_name || '右手武器')
      if (s) allSkills.push(s)
    }
    if (unit.extra_melee || unit.extra_ranged || unit.extra_defense) {
      const s = genSkill('extra', unit.extra_name || '额外装备', unit.extra_type,
        unit.extra_melee, unit.extra_ranged, unit.extra_defense,
        unit.extra_durability, unit.extra_name || '额外装备')
      if (s) allSkills.push(s)
    }
  }

  if (!allSkills.length) return []

  // 过滤掉被动/防御技能（这些不会显示在战术行动列表中）
  const passiveTypes = new Set(['counter', 'block', 'assist', 'guard', 'blockade', 'scout', 'execute', 'duel', 'snatch', 'full_armor', 'coating', 'reactivate', 'lucky'])

  const groups = {}
  const slotLabels = {
    main: '机体技能',
    left: unit.left_hand_name ? `${unit.left_hand_name}` : '左手武器',
    right: unit.right_hand_name ? `${unit.right_hand_name}` : '右手武器',
    extra: unit.extra_name ? `${unit.extra_name}` : '额外装备',
    royroy: 'RoyRoy 技能',
  }

  const slotDurability = {
    left: unit.left_hand_durability,
    right: unit.right_hand_durability,
    extra: unit.extra_durability,
  }

  for (const skill of allSkills) {
    // 跳过被动技能
    if (passiveTypes.has(skill.type)) continue
    const slot = skill.slot || 'main'
    if (!groups[slot]) {
      groups[slot] = {
        slot,
        label: slotLabels[slot] || `${slot}技能`,
        durability: slotDurability[slot],
        skills: []
      }
    }
    groups[slot].skills.push(skill)
  }

  // 按 slot 顺序排列: main, left, right, extra, royroy
  const order = ['main', 'left', 'right', 'extra', 'royroy']
  return order.filter(s => groups[s]).map(s => groups[s])
})

// 被动/防御技能列表（显示在单位信息中，不参与战术选择）
const passiveSkills = computed(() => {
  const unit = selectedUnit.value
  const skills = unit?.skills || []
  if (!skills.length) return []
  const passiveTypes = new Set(['counter', 'block', 'assist', 'guard', 'blockade', 'scout', 'execute', 'duel', 'snatch', 'full_armor', 'coating', 'reactivate', 'lucky'])
  return skills.filter(s => passiveTypes.has(s.type))
})

// 主动技能数量（用于按钮计数）
const activeSkillCount = computed(() => {
  const unit = selectedUnit.value
  const skills = unit?.skills || []
  if (!skills.length) {
    // 从装备推算
    let count = 0
    if (unit) {
      if (unit.left_hand_melee || unit.left_hand_ranged) count++
      if (unit.right_hand_melee || unit.right_hand_ranged) count++
      if (unit.extra_melee || unit.extra_ranged) count++
    }
    return count
  }
  const passiveTypes = new Set(['counter', 'block', 'assist', 'guard', 'blockade', 'scout', 'execute', 'duel', 'snatch', 'full_armor', 'coating', 'reactivate', 'lucky'])
  return skills.filter(s => !passiveTypes.has(s.type)).length
})

// 武器属性中文映射（用于普通攻击显示）
const weaponAttrLabel = computed(() => {
  const map = { 'kinetic': '实体', 'beam': '光束', 'explosive': '爆炸', 'special': '特殊' }
  return map[(selectedUnit.value?.weaponType || '').toLowerCase()] || '实体'
})

// 基础攻击射程：以基础攻击技能自身属性(cast_range)为准，不再使用单位"范围" stat。
// 范围(range)仅保留作近战/远程分类信号（range>1 视为远程单位）。
// 数值与 skillExecutor.DEFAULT_RANGE_BY_CATEGORY 对齐（melee=1 / ranged=6）。
const BASIC_MELEE_RANGE = 1
const BASIC_RANGED_RANGE = 6
function isBasicRanged(unit) {
  return (unit?.range || 1) > 1
}
function basicAttackRange(unit) {
  return isBasicRanged(unit) ? BASIC_RANGED_RANGE : BASIC_MELEE_RANGE
}

// 选择战术行动的技能（null = 普通攻击）
function selectTacticalSkill(skill) {
  royroyDeployMode.value = false
  selectedAttackSkill.value = skill
  addLog('info', `选择: ${skill ? skill.name : '普通攻击'}`)
  hexGrid.value?.redraw()
}

// 自动化技能（助攻/守护/阻碍/侦察）：自身增益/减益，统一走 /skill 路由直接施放
const AUTOMATION_SELF_KEYS = new Set(['assist', 'guard', 'blockade', 'scout'])

// 战术技能点击分发：自动化自身技能直接施放，其余走原有攻击流程
function onTacticalSkillClick(skill) {
  const key = skill && (skill.key || skill.id)
  if (AUTOMATION_SELF_KEYS.has(key)) {
    castAutomationSkill(skill, null)
    return
  }
  selectTacticalSkill(skill)
}

// 施放自动化技能（POST /combat/:id/skill）
async function castAutomationSkill(skill, target) {
  if (!selectedUnit.value) return
  const unit = selectedUnit.value
  const payload = { skillType: skill.key || skill.id, casterUnitId: String(unit.id) }
  if (target) payload.targetUnitId = String(target.id)
  try {
    const res = await combatAPI.skill(route.params.id, payload)
    const r = res.data || {}
    addLog('action', `${unit.name} 发动 [${skill.name}]${target ? ` → ${target.name}` : ''}`)
    actionMode.value = null
    selectedAttackSkill.value = null
    await refreshState()
  } catch (e) {
    addLog('error', `技能发动失败: ${e.response?.data?.error || e.message}`)
  }
}

// 获取技能的施放范围（hex距离）
function getSkillRange(skill) {
  if (!skill) {
    // 普通攻击：射程以基础攻击技能属性(cast_range)为准，不再使用单位"范围" stat
    return basicAttackRange(selectedUnit.value)
  }
  // 优先读取技能自身施加范围字段（与后端 resolveSkillRange 对齐）：
  // cast_range 为权威攻击距离，缺省时回退 max_range / range_max / range。
  // 支持数字、"1-3" 字符串、{min,max} 对象。
  const maxFields = ['cast_range', 'max_range', 'range_max', 'range']
  for (const f of maxFields) {
    const v = skill[f]
    if (v === undefined || v === null) continue
    if (typeof v === 'number') return v
    if (typeof v === 'string') {
      const nums = String(v).split(/[-~]/).map(Number).filter(n => !isNaN(n))
      if (nums.length) return Math.max(...nums)
    }
    if (typeof v === 'object') {
      if (typeof v.max === 'number') return v.max
      if (typeof v.min === 'number') return v.min
    }
  }
  if (skill.range_min !== undefined) {
    return Math.max(skill.range_min, skill.range_max || skill.range_min)
  }
  // 默认：近战=1, 远程=技能分类默认射程（不再使用单位"范围" stat）
  // auto/automation(自动化) 默认 0（仅自身），与后端 DEFAULT_RANGE_BY_CATEGORY 对齐
  if (skill.category === 'melee') return 1
  if (skill.category === 'ranged') return BASIC_RANGED_RANGE
  if (skill.category === 'auto' || skill.category === 'automation') return 0
  return 1
}

// 获取技能的最小施放距离（hex距离）— 审计报告 #4 修复：范围预览需排除 min_range 内格
function getSkillRangeMin(skill) {
  if (!skill) return 0 // 普通攻击无最小距离
  // 优先读取技能自身最小距离字段（与后端 resolveSkillRange 对齐：
  // min_cast_range / min_range / range_min，支持数字或 "1-3" 字符串）
  const minFields = ['min_cast_range', 'min_range', 'range_min']
  for (const f of minFields) {
    const v = skill[f]
    if (v === undefined || v === null) continue
    if (typeof v === 'number') return v
    if (typeof v === 'string') {
      const nums = String(v).split(/[-~]/).map(Number).filter(n => !isNaN(n))
      if (nums.length) return Math.min(...nums)
    }
  }
  // 范围字符串 "1-3" / {min,max} 对象 → 取 min
  if (skill.range) {
    const parts = String(skill.range).split(/[-~]/)
    const nums = parts.map(Number).filter(n => !isNaN(n))
    return nums.length ? (nums[0] || 0) : 0
  }
  if (skill.cast_range && typeof skill.cast_range === 'object' && typeof skill.cast_range.min === 'number') {
    return skill.cast_range.min
  }
  return 0
}

// 进入 RoyRoy 部署模式（点击六角格选择位置）
function startRoyroyDeploy() {
  if (!selectedUnit.value?.royroy) return
  royroyDeployMode.value = true
  selectedAttackSkill.value = null
  addLog('info', '选择 RoyRoy 部署位置（点击相邻空格）')
  hexGrid.value?.redraw()
}

// 执行 RoyRoy 部署到指定六角格
function deployRoyroyAt(q, r) {
  if (!selectedUnit.value?.royroy) return
  const unit = selectedUnit.value
  combatAPI.action(route.params.id, {
    actionType: 'deploy_royroy',
    params: { unitId: String(unit.id), q, r, unit_data: unit }
  }).then(() => {
    addLog('deploy', `${unit.name} 部署 RoyRoy → ${formatCoord(q, r)}`)
    cancelAction()
    refreshState()
  }).catch(e => {
    addLog('error', `RoyRoy 部署失败: ${e.response?.data?.error || e.message}`)
  })
}

// 回收 RoyRoy（规则5：不消耗行动点，回血至满，冷却 round+2）
async function retrieveRoyroy() {
  if (!selectedUnit.value?.royroy) return
  const unit = selectedUnit.value
  try {
    const resp = await combatAPI.action(route.params.id, {
      actionType: 'retrieve_royroy',
      params: { unitId: String(unit.id) }
    })
    const cd = resp?.data?.cooldownRound ?? resp?.cooldownRound ?? (unit.royroy.cooldownRound || 0)
    addLog('deploy', `${unit.name} 回收 RoyRoy（回血至满，第 ${cd} 轮前不可再部署）`)
    cancelAction()
    await refreshState()
  } catch (e) {
    addLog('error', `RoyRoy 回收失败: ${e.response?.data?.error || e.message}`)
  }
}

// 当前阵营行动标签（攻击/防守/偷袭）
const currentFactionLabel = computed(() => {
  const af = battleState.value?.activeFaction
  if (!af) return '准备中'
  return getRoleLabel(af)
})

// 阵营轮转门控：unit 是否为当前行动角色（不再以势力键比较）
function isMyTurn(unit) {
  const af = battleState.value?.activeFaction
  if (!af) return true
  // 单人托管（所有单位同属一个 owner）→ 沙盒模式，放开阵营轮转门控，允许任意一方随时行动
  const us = battleState.value?.units
  if (us) {
    const list = Array.isArray(us) ? us : Object.values(us)
    const owners = new Set(list.map(u => u.ownerId).filter(Boolean))
    if (owners.size <= 1) return true
  }
  return getFactionRole(unit?.faction) === af
}

async function executeMove(tq, tr) {
  if (!selectedUnit.value) return
  const unit = selectedUnit.value
  const fromQ = unit.q, fromR = unit.r

  // Phase 3: 平滑位移 — 先发起 API，成功后沿 path 逐段行走 + 动态朝向
  try {
    const resp = await combatAPI.move(route.params.id, { unitId: String(unit.id), target_q: tq, target_r: tr })
    if (resp?.success === false || resp?.error) {
      throw new Error(resp.error || '移动失败')
    }
    if (resp?.ambushed) {
      ambushAlert.value = true
      freezeQueue() // 伏击红警期间冻结状态消费，防止推送撕裂动画
      stateFrozen.value = true // 模块4：冻结期间刷新状态直接提交，避免门控延迟 QTE/红警
      setTimeout(() => { ambushAlert.value = false; unfreezeQueue(); stateFrozen.value = false }, 2500)
    }
    const fromCoord = formatCoord(fromQ, fromR)
    const toCoord = formatCoord(tq, tr)
    addLog('move', `${unit.name} 从 ${fromCoord} 移动到 ${toCoord}`)
    actionMode.value = null

    // 阶段一：沿后端返回的路径逐段行走 + 切换七视图
    let lastDir = null
    const path = (resp?.path && resp.path.length >= 2) ? resp.path : [{ q: fromQ, r: fromR }, { q: tq, r: tr }]
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1]
      const segDir = computeDirection(a.q, a.r, b.q, b.r)
      if (segDir !== null) {
        setUnitVisual(unit.unitId || unit.id, segDir, 'move')
        lastDir = segDir
      }
      const { flatX: ax, flatY: ay } = pointyTopCenter(a.q, a.r, HEX_RADIUS, spacingH, spacingV)
      const { flatX: bx, flatY: by } = pointyTopCenter(b.q, b.r, HEX_RADIUS, spacingH, spacingV)
      await lerpSegment(unit.id, { flatX: ax, flatY: ay }, { flatX: bx, flatY: by }, 220)
    }
    stopLerpAnimation(unit.id)
    await refreshState()
    // 规则3：保留最后一步朝向，不重置回正面 0
    setUnitVisual(unit.unitId || unit.id, lastDir ?? 0, 'idle')
  } catch (e) {
    addLog('error', `移动失败: ${e.response?.data?.error || e.message}`)
    stopLerpAnimation(unit.id)
    setUnitVisual(unit.unitId || unit.id, 0, 'idle')
    cancelAction()
  }
}

// 单段 lerp 的 Promise 封装（供逐段行走）
function lerpSegment(unitId, from, to, duration) {
  return new Promise((resolve) => {
    startLerpAnimation(unitId, from, to, duration, () => resolve())
  })
}

// ===== 跳过战术环节 =====
async function executeSkipTactical() {
  if (!selectedUnit.value) return
  try {
    await combatAPI.action(route.params.id, {
      actionType: 'skip_tactical',
      params: { unitId: String(selectedUnit.value.id) }
    })
    addLog('action', `${selectedUnit.value.name} 跳过战术环节${selectedUnit.value.faction === 'maxion' ? '（移动后可恢复隐匿）' : ''}`)
    actionMode.value = null
    await refreshState()
  } catch (e) {
    addLog('error', `跳过失败: ${e.response?.data?.error || e.message}`)
    cancelAction()
  }
}

// ===== 跳过移动 =====
async function executeSkipMove() {
  if (!selectedUnit.value) return
  try {
    await combatAPI.action(route.params.id, {
      actionType: 'skip_move',
      params: { unitId: String(selectedUnit.value.id) }
    })
    addLog('action', `${selectedUnit.value.name} 跳过移动${selectedUnit.value.concealRestorePending ? '，恢复隐匿' : ''}`)
    actionMode.value = null
    await refreshState()
  } catch (e) {
    addLog('error', `跳过失败: ${e.response?.data?.error || e.message}`)
    cancelAction()
  }
}

// ===== 坐标跳转 =====
function letterToCol(letter) {
  const l = String(letter).toUpperCase().trim()
  if (l.length === 0 || l.charCodeAt(0) < 65 || l.charCodeAt(0) > 90) return -1
  if (l.length === 1) return l.charCodeAt(0) - 65
  if (l.length === 2) {
    return (l.charCodeAt(0) - 65 + 1) * 26 + (l.charCodeAt(1) - 65)
  }
  return -1
}
async function doJump(factionKey) {
  if (!selectedUnit.value) return
  const state = jumpStates[factionKey]
  if (!state) return
  const tq = letterToCol(state.q)
  const tr = parseInt(state.r)
  if (tq < 0 || isNaN(tr)) {
    addLog('error', '请输入有效的坐标（Q=字母如A/B/C，R=数字如0/1/2）')
    return
  }
  try {
    await combatAPI.jumpTo(route.params.id, {
      unitId: String(selectedUnit.value.id),
      target_q: tq,
      target_r: tr
    })
    addLog('move', `${selectedUnit.value.name} 跳转到 ${state.q.toUpperCase()}${tr}`)
    jumpVisible[factionKey] = false
    clearJump(factionKey)
    await refreshState()
  } catch (e) {
    addLog('error', `跳转失败: ${e.response?.data?.error || e.message}`)
  }
}

// 胜利条件标签
function victoryLabel(info) {
  if (!info) return '全歼'
  const labels = {
    annihilate: '全歼敌方',
    assassinate: '刺杀ACE',
    destroy_facility: '摧毁设施',
    hold_position: '坚守阵地',
    capture: '占领据点'
  }
  return (info.victory_conditions || ['annihilate']).map(c => labels[c] || c).join(' / ')
}

async function executeAttack(target) {
  if (!selectedUnit.value) return
  const attacker = selectedUnit.value
  if (!isMyTurn(attacker)) {
    addLog('warn', `当前行动阵营为 ${battleState.value?.activeFaction}，无法攻击`)
    showBlockedAttackReport(attacker, target)
    return
  }
  // H1 决斗预检：前端驱动（后端 /attack 不做预检），可决斗则弹窗让用户抉择
  try {
    const duelRes = await combatAPI.duelCheck(route.params.id, {
      casterUnitId: String(attacker.id),
      targetUnitId: String(target.id),
    })
    if (duelRes.data?.canDuel) {
      reactionUI.duel = {
        attackerId: String(attacker.id),
        defenderId: String(target.id),
        attackerName: attacker.name,
        defenderName: target.name,
      }
      return
    }
  } catch (e) {
    // 预检失败降级为普通攻击
  }
  await performPlainAttack(attacker, target)
}

// 普通攻击结算（决斗取消时复用）
async function performPlainAttack(attacker, target) {
  try {
    const attackType = isBasicRanged(attacker) ? 'ranged' : 'melee'
    const result = await combatAPI.attack(route.params.id, {
      attacker_id: String(attacker.id),
      target_id: String(target.id),
      attack_type: attackType,
    })

    // Phase 28-D: 攻击后更新攻击者朝向（后端计算并返回）
    if (result.data?.attacker_direction) {
      setUnitVisual(attacker.unitId || attacker.id, result.data.attacker_direction, 'attack')
    } else {
      // 兜底：前端计算朝向
      const dir = computeDirection(attacker.q, attacker.r, target.q, target.r)
      if (dir !== null) setUnitVisual(attacker.unitId || attacker.id, dir, 'attack')
    }

    if (result.data?.surprise_triggered) {
      addLog('action', `⚡ 奇袭触发！${attacker.name} vs ${target.name}`)
      enqueueEffect('burst', target.q, target.r, target.faction)   // 模块4：奇袭爆闪
    } else {
      addLog('attack', `${attacker.name} 攻击 ${target.name} → 伤害 ${result.data?.combat_result?.final_damage ?? result.data?.combat_result?.damage ?? '?'}`)
    }
    enqueueEffect('muzzle', attacker.q, attacker.r, attacker.faction) // 模块4：开火闪光
    actionMode.value = null
    await handleAttackResponse(result, attacker, target)
  } catch (e) {
    addLog('error', `攻击失败: ${e.response?.data?.error || e.message}`)
    cancelAction()
  }
}

// 消费 /attack 回传的反应事件，填充弹窗 UI
async function handleAttackResponse(result, attacker, target) {
  await refreshState()
  const data = result.data || {}
  const events = data.reaction_events || []
  for (const ev of events) {
    if (ev.evt === 'execute_lethal') {
      const tName = unitNameById(ev.payload?.targetId) || target?.name || '目标'
      reactionUI.execute = { ...ev.payload, targetName: tName }
      addLog('action', `☠️ 斩杀！${tName} 被处决`)
    } else if (ev.evt === 'reactivate') {
      const uName = unitNameById(ev.payload?.unitId) || attacker?.name || '单位'
      reactionUI.reactivate = { ...ev.payload, name: uName }
      addLog('action', `🔄 再动！${uName} 行动点已重置`)
    }
  }
  if (data.lucky_effect) reactionUI.lucky = data.lucky_effect
  if (data.pending_snatch) {
    const ps = data.pending_snatch
    reactionUI.snatch = { ...ps, attackerName: unitNameById(ps.attackerId), targetName: unitNameById(ps.targetId) }
  }
  if (data.pending_reaction) {
    const pr = data.pending_reaction
    reactionUI.cover = {
      ...pr,
      attackerName: unitNameById(pr.attackerId),
      victimName: unitNameById(pr.victimId),
      helperName: unitNameById(pr.helperId),
    }
  }
  // 实时胜利结算：后端 evaluateVictory 命中 → 弹出胜利遮罩
  if (data.victory && data.victory.victory) {
    battleResult.value = data.victory
    addLog('action', `🏆 战斗结束：${data.victory.winner} 获胜（${data.victory.condition}）`)
  }
  // Phase 31: 战斗结算弹窗（双方机体视图 + HP + 伤害公式）
  // 系统级兜底：优先用显式传入的单位，其次用后端回显的 id 从刷新后的战局解析，
  // 避免任何调用路径漏传参数导致弹窗单位错乱（攻击方/阵营/图片全部回退）。
  const aId = String(attacker?.id || attacker?.unitId || data.attacker_id || '')
  const dId = String(target?.id || target?.unitId || data.target_id || '')
  const aUnit = allUnits.value.find(u => String(u.id) === aId) || attacker || {}
  const dUnit = allUnits.value.find(u => String(u.id) === dId) || target || {}
  attackReport.value = {
    blocked: false,
    attacker: unitSnapshot(aUnit),
    target: unitSnapshot(dUnit),
    formula: data.combat_result?.formula || null,
    finalDamage: data.combat_result?.final_damage ?? 0,
    dodged: data.combat_result?.dodged ?? false,
    sizeBanner: data.combat_result?.sizeBanner || null,
    sizeTactic: data.combat_result?.sizeTactic || null,
  }
  showAttackReport.value = true
}

function unitNameById(id) {
  if (id === undefined || id === null) return ''
  const u = allUnits.value.find(x => String(x.id) === String(id))
  return u?.name || ''
}

// ===== 弹窗决策回调 =====
async function confirmDuel() {
  const d = reactionUI.duel
  reactionUI.duel = null
  try {
    const res = await combatAPI.resolveDuel(route.params.id, {
      casterUnitId: d.attackerId,
      targetUnitId: d.defenderId,
    })
    addLog('action', `⚔️ 决斗！${d.attackerName} vs ${d.defenderName} → ${res.data?.outcome || res.data?.duelLog || '结算完成'}`)
  } catch (e) {
    addLog('error', `决斗失败: ${e.response?.data?.error || e.message}`)
  }
  await refreshState()
}
async function cancelDuel() {
  const d = reactionUI.duel
  reactionUI.duel = null
  const attacker = allUnits.value.find(u => String(u.id) === d.attackerId)
  const target = allUnits.value.find(u => String(u.id) === d.defenderId)
  if (attacker && target) await performPlainAttack(attacker, target)
}
async function resolveSnatch(accept) {
  const s = reactionUI.snatch
  reactionUI.snatch = null
  try {
    await combatAPI.resolveSnatch(route.params.id, {
      casterUnitId: s.attackerId,
      targetUnitId: s.targetId,
      accept,
    })
  } catch (e) {
    addLog('error', `抢夺结算失败: ${e.response?.data?.error || e.message}`)
  }
  await refreshState()
}
async function resolveCover(choice) {
  const c = reactionUI.cover
  reactionUI.cover = null
  try {
    await combatAPI.resolveCover(route.params.id, { choice })
  } catch (e) {
    addLog('error', `援助结算失败: ${e.response?.data?.error || e.message}`)
  }
  await refreshState()
}
function closeExecute() { reactionUI.execute = null }
function closeReactivate() { reactionUI.reactivate = null }
function closeLucky() { reactionUI.lucky = null }


// ===== Phase8: 手动掷骰系统（掷骰逻辑统一走 diceUtil，与后端 diceService 语义一致）=====
function parseDiceType(diceStr) { return parseDiceTypeUtil(diceStr) }
function rollDice(diceStr) { return rollDiceUtil(diceStr) }

function maybeInterceptManualRoll(target, skill) {
  const cfg = glossarySkills.value || {}
  let skillCfg = null
  for (const [k, v] of Object.entries(cfg)) {
    if (v.label === skill.name || v.label === skill.label) { skillCfg = v; break }
  }
  if (!skillCfg || !skillCfg.is_manual_roll) return false
  
  diceRollState.active = true
  diceRollState.skillName = skillCfg.label || skill.name
  diceRollState.skillConfig = skillCfg
  diceRollState.unitId = selectedUnit.value?.id
  diceRollState.targetId = target.id
  diceRollState.diceType = skillCfg.dice_type || '1d6'
  diceRollState.successLine = skillCfg.success_line ?? 4
  diceRollState.bonusDamage = skillCfg.success_bonus_damage ?? 0
  diceRollState.animationPhase = 'idle'
  diceRollState.rollResult = 0
  diceRollState.isSuccess = false
  diceRollState.pendingAttackPayload = { target, skill }
  addLog('dice', `[掷骰拦截] ${skillCfg.label || skill.name} 需要手动摇骰！点击骰子或按空格`)
  hexGrid.value?.redraw()
  return true
}

function startDiceRoll() {
  if (diceRollState.animationPhase !== 'idle') return
  diceRollState.animationPhase = 'rolling'
  let tick = 0
  diceRollState.rollAnimTimer = setInterval(() => {
    diceRollState.rollResult = rollDice(diceRollState.diceType)
    tick++
    if (tick >= 10) {
      clearInterval(diceRollState.rollAnimTimer)
      diceRollState.rollResult = rollDice(diceRollState.diceType)
      diceRollState.isSuccess = diceRollState.rollResult >= diceRollState.successLine
      diceRollState.animationPhase = 'result'
      addLog('dice', `结果: ${diceRollState.rollResult} [${diceRollState.isSuccess ? 'SUCCESS' : 'FAIL'}] 成功线${diceRollState.successLine}`)
    }
  }, 50)
}

async function resolveDiceRoll() {
  if (diceRollState.animationPhase === 'idle') { startDiceRoll(); return }
  if (diceRollState.animationPhase === 'rolling') {
    clearInterval(diceRollState.rollAnimTimer)
    diceRollState.rollResult = rollDice(diceRollState.diceType)
    diceRollState.isSuccess = diceRollState.rollResult >= diceRollState.successLine
    diceRollState.animationPhase = 'result'
    return
  }
  const { pendingAttackPayload, isSuccess, bonusDamage } = diceRollState
  if (!pendingAttackPayload) return
  const payload = {
    attacker_id: String(selectedUnit.value?.id),
    target_id: String(pendingAttackPayload.target.id),
    attack_type: 'skill',
    _dice_result: {
      roll: diceRollState.rollResult,
      dice_type: diceRollState.diceType,
      success_line: diceRollState.successLine,
      is_success: isSuccess,
      bonus_damage: isSuccess ? bonusDamage : 0,
    }
  }
  // 系统级：始终下发全部身份标识（id/key/name），交由后端按任意一种解析，不再因非 UUID 而丢弃 skill_id
  payload.skill_id = pendingAttackPayload.skill.id ?? null
  payload.skill_key = pendingAttackPayload.skill.key ?? pendingAttackPayload.skill.skill_key ?? null
  payload.skill_name = pendingAttackPayload.skill.name ?? null
  try {
    const result = await combatAPI.attack(route.params.id, payload)
    handleAttackResponse(result, selectedUnit.value, pendingAttackPayload.target) // 掷骰技能攻击也弹结算画面（含未命中/伤害0），便于核对数值
    const dmg = result.data?.combat_result?.final_damage ?? result.data?.combat_result?.damage ?? result.data?.damage ?? '?'
    if (isSuccess) {
      addLog('attack', `${selectedUnit.value?.name} [${diceRollState.skillName}] SUCCESS! 掷${diceRollState.rollResult}>=${diceRollState.successLine}, +${bonusDamage}加成 -> 伤害${dmg}`)
    } else {
      addLog('attack', `${selectedUnit.value?.name} [${diceRollState.skillName}] 掷${diceRollState.rollResult}<${diceRollState.successLine} -> 伤害${dmg}`)
    }
  } catch (e) {
    addLog('error', `技能攻击失败: ${e.response?.data?.error || e.message}`)
  }
  diceRollState.active = false
  diceRollState.animationPhase = 'idle'
  diceRollState.pendingAttackPayload = null
  actionMode.value = null
  selectedAttackSkill.value = null
  await refreshState()
}

function cancelDiceRoll() {
  if (diceRollState.rollAnimTimer) clearInterval(diceRollState.rollAnimTimer)
  diceRollState.active = false
  diceRollState.animationPhase = 'idle'
  diceRollState.pendingAttackPayload = null
  hexGrid.value?.redraw()
}

async function loadGlossaryConfigForDice() {
  try {
    const res = await glossaryAPI.getConfig()
    if (res.data?.skills) glossarySkills.value = res.data.skills
  } catch (e) { /* silent */ }
}

async function executeSkillAttack(target, skill) {
  if (!selectedUnit.value) return
  const attacker = selectedUnit.value
  // Phase8: 手动掷骰拦截
  if (maybeInterceptManualRoll(target, skill)) return
  try {
    const attackPayload = {
      attacker_id: String(attacker.id),
      target_id: String(target.id),
      attack_type: 'skill',
    }
    // 系统级：始终下发全部身份标识（id/key/name），交由后端按任意一种解析，不再因非 UUID 而丢弃 skill_id
    attackPayload.skill_id = skill.id ?? null
    attackPayload.skill_key = skill.key ?? skill.skill_key ?? null
    attackPayload.skill_name = skill.name ?? null
    const result = await combatAPI.attack(route.params.id, attackPayload)
    handleAttackResponse(result, attacker, target) // 技能攻击也弹结算画面（含未命中/伤害0），便于核对数值
    const dmg = result.data?.combat_result?.final_damage ?? result.data?.combat_result?.damage ?? result.data?.damage ?? '?'
    addLog('attack', `${attacker.name} 使用 [${skill.name}] 攻击 ${target.name} → 伤害 ${dmg}`)
    actionMode.value = null
    selectedAttackSkill.value = null
    await refreshState()
  } catch (e) {
    addLog('error', `技能攻击失败: ${e.response?.data?.error || e.message}`)
    cancelAction()
  }
}

async function endTurn() {
  try {
    const res = await combatAPI.endTurn(route.params.id)
    if (res && res.data && res.data.victory && res.data.victory.victory) {
      battleResult.value = res.data.victory
      addLog('action', `🏆 战斗结束：${res.data.victory.winner} 获胜（${res.data.victory.condition}）`)
    }
    addLog('turn', '===== 回合结束 =====')
    await refreshState()
  } catch (e) {
    addLog('error', `结束回合失败: ${e.response?.data?.error || e.message}`)
  }
}

async function refreshState() {
  const { data } = await combatAPI.getBattleState(route.params.id)
  const rawState = data.battle || data
  const newState = normalizeBattleState(rawState)
  // 模块4：比对旧/新战局，受击推送特效；特效播放期间延迟提交硬数值(HP/AP)。
  const effects = diffBattleEffects(battleState.value, newState)
  if (effects.length && !stateFrozen.value) {
    effects.forEach(e => enqueueEffect(e.type, e.q, e.r, e.faction))
    // 仅保留最新一次拉取，避免快速连续刷新时旧快照后提交
    _pendingRaw = rawState
    if (!_commitTimer) _commitTimer = setTimeout(flushCommit, GATE_MS)
  } else {
    commitState(rawState)
  }
}
// 模块4：真正把战局落盘到 battleState（含派生状态同步、精灵/lerp 清理、配置加载）
function commitState(rawState) {
  const rawMap = rawState?.map
  console.log('[refreshState] map keys:', rawMap ? Object.keys(rawMap) : 'undefined', '| units count:', Object.keys(rawState?.units || {}).length)
  battleState.value = normalizeBattleState(rawState)
  // 同步后端角色映射（faction→role），保证前端门控与后端一致（含 unknow 等异常势力默认 attack）
  if (rawState?.factionRoles) factionRoles.value = rawState.factionRoles
  // Preserve selection if unit still exists
  if (selectedUnit.value) {
    const found = allUnits.value.find(u => u.id === selectedUnit.value.id)
    if (found) selectedUnit.value = found
    else selectedUnit.value = null
  }
  // Phase 28-D: 从后端数据同步 direction，全局刷新后恢复 idle
  // 优先使用后端 unit.direction，其次保留前端视觉状态
  const allUnitIds = allUnits.value.map(u => u.id)
  allUnits.value.forEach(u => {
    if (u.id !== undefined) {
      const existing = unitSpriteState.get(u.id) || {}
      const dir = (u.direction !== undefined) ? u.direction : existing.direction ?? 0
      unitSpriteState.set(u.id, { direction: dir, actionState: 'idle' })
    }
  })
  // 清除已不在场上单位的 lerp 状态
  unitLerpState.forEach((_, id) => {
    if (!allUnitIds.includes(id)) unitLerpState.delete(id)
  })
  // 刷新词条库配置（确保战场显示最新数值）
  loadGlossaryConfig().catch(() => {})
  loadViewConfig().catch(() => {})
  // 加载阵营冷却和胜利条件
  loadFactionRoles(); loadFactionCooldowns().catch(() => {})
  loadVictoryInfo().catch(() => {})
  hexGrid.value?.redraw()
  // Batch C-2: 同步派生状态到 Pinia stores（行动点 / 战报 / 移动交互模式）
  apStore.syncFromUnit(selectedUnit.value)
  if (battleState.value?.combatLog) logStore.setLogs(battleState.value.combatLog)
  moveStore.setMode(null)
}

// ===== Batch D-4.3: 反应奇袭 QTE 控制 =====
function openSurprise(s) {
  if (surpriseUI.value && surpriseUI.value.lockedReactorId === s.lockedReactorId && !surpriseUI.value.settled) return
  surpriseUI.value = s
  // 模块4：奇袭爆闪特效（QTE 开启时推入队列）
  const reactorUnit = allUnits.value.find(u => String(u.id) === String(s.lockedReactorId))
  if (reactorUnit) enqueueEffect('burst', reactorUnit.q, reactorUnit.r, reactorUnit.faction)
  const ms = s.deadline ? (s.deadline - Date.now()) : 10000
  surpriseSeconds.value = Math.max(1, Math.ceil(ms / 1000))
  if (surpriseTimer) clearInterval(surpriseTimer)
  surpriseTimer = setInterval(() => {
    surpriseSeconds.value -= 1
    if (surpriseSeconds.value <= 0) {
      clearInterval(surpriseTimer); surpriseTimer = null
      submitSurprise('giveup') // 超时自动放弃（服务端亦会强平）
    }
  }, 1000)
}
function closeSurprise() {
  if (surpriseTimer) { clearInterval(surpriseTimer); surpriseTimer = null }
  surpriseUI.value = null
  // screenToneOn 为 computed（pendingSurprise 清除后自动熄灭），无需手动复位
}
async function submitSurprise(choice, skillId) {
  const s = surpriseUI.value
  if (!s) return
  closeSurprise()
  try {
    await combatAPI.surpriseChoice(route.params.id, { unitId: s.lockedReactorId, choice, skill_id: skillId || null })
  } catch (e) {
    console.warn('[surprise] 提交失败', e?.message || e)
  }
  refreshState()
}
// 监听推送刷新后的 surprise 字段，自动弹出/关闭 QTE（仅当当前用户为锁定反应者）
watch(() => battleState.value?.surprise || battleState.value?.pendingSurprise, (s) => {
  if (s && !s.settled && s.phase !== 'done' && s.phase !== 'settled') {
    const myId = userStore.user?.userId
    const reactorUnit = battleState.value?.units?.find((u) => u.unitId === s.lockedReactorId)
    if (reactorUnit && reactorUnit.ownerId === myId) {
      openSurprise(s); return
    }
  }
  closeSurprise()
}, { deep: true })

async function loadFactionCooldowns() {
  try {
    const { data } = await combatAPI.get(route.params.id + '/faction-cooldowns')
    factionCooldowns.value = data || {}
  } catch (e) { /* offline */ }
}

async function loadVictoryInfo() {
  try {
    const { data } = await combatAPI.get(route.params.id + '/victory-conditions')
    victoryInfo.value = data || null
  } catch (e) { /* offline */ }
}

// ===== Deploy (Phase 30: FSM 状态机增强) =====
// FSM 状态: IDLE → UNIT_SELECTED → DEPLOYING → IDLE
const DEPLOY_FSM = { IDLE: 'idle', UNIT_SELECTED: 'unit_selected', DEPLOYING: 'deploying' }
const deployFsmState = ref(DEPLOY_FSM.IDLE)

function startDeployUnit(unit) {
  if (!isDeployPhase.value) return
  if (deployFsmState.value === DEPLOY_FSM.DEPLOYING) return
  // 已在战场上的单位（已部署）不可重复部署
  if (unit.q !== undefined || unit.position) {
    addLog('warn', `${unit.name || 'Unit-' + unit.id} 已在战场上，无需重复部署`)
    return
  }
  selectedDeployUnit.value = unit
  deployFsmState.value = DEPLOY_FSM.UNIT_SELECTED
  addLog('info', `选择部署: ${unit.name || 'Unit-' + unit.id}`)
}

function cancelDeploySelection() {
  selectedDeployUnit.value = null
  deployFsmState.value = DEPLOY_FSM.IDLE
}

async function deployToHex(q, r) {
  if (deployFsmState.value !== DEPLOY_FSM.UNIT_SELECTED || deploying.value) return
  deployFsmState.value = DEPLOY_FSM.DEPLOYING
  deploying.value = true
  const unit = selectedDeployUnit.value
  try {
    // Phase 14: 部署前清洗装备数据
    sanitizeUnitEquipment(unit)
    await combatAPI.deployUnit(route.params.id, { unitId: String(unit.id), q, r, unit_data: unit })
    addLog('deploy', `${unit.name} 部署到 ${formatCoord(q, r)}`)
    selectedDeployUnit.value = null
    deployFsmState.value = DEPLOY_FSM.IDLE
    await refreshState()
    hexGrid.value?.redraw() // 部署后状态已更新，必须重绘棋盘才能显示新棋子
    // Remove from pool
    const idx = deployPool.value.findIndex(u => u.id === unit.id)
    if (idx >= 0) deployPool.value.splice(idx, 1)
  } catch (e) {
    addLog('error', `部署失败: ${e.response?.data?.error || e.message}`)
    deployFsmState.value = DEPLOY_FSM.IDLE
  } finally {
    deploying.value = false
  }
}

async function finishDeployment() {
  try {
    await combatAPI.endDeployment(route.params.id)
    isDeployPhase.value = false
    addLog('turn', '===== 部署完成，战斗开始 =====')
    await refreshState()
    hexGrid.value?.redraw() // 部署完成后重绘，确保终局状态即时呈现
  } catch (e) {
    addLog('error', `开始战斗失败: ${e.response?.data?.error || e.message}`)
  }
}

// ===== Init =====

// Phase 13: 清洗战场端加载的地形数据
function sanitizeBattlefieldTerrain() {
  const state = battleState.value
  if (!state) return

  // 1. 清洗 cells 数组（如果存在）
  if (state.cells && Array.isArray(state.cells)) {
    let converted = 0
    state.cells = state.cells.map(cell => {
      if (!cell) return cell
      const origTerrain = cell.terrain
      if (typeof origTerrain === 'string') {
        const sanitized = sanitizeTerrainCell(origTerrain)
        converted++
        return { ...cell, terrain: sanitized }
      }
      // 如果已经是对象但没有 terrain_id, 补充
      if (typeof origTerrain === 'object' && origTerrain && !origTerrain.terrain_id && origTerrain.terrain_hp === undefined) {
        // 可能是其他结构, 不做修改
      }
      return cell
    })
    if (converted > 0) {
      addLog('system', `[兼容] 已清洗 ${converted} 个旧版地形格子数据`)
      console.log(`[TerrainSanitizer] 已清洗 battlefield cells: ${converted} 个`)
    }
  }

  // 2. 清洗 terrain 对象（如果存在）
  if (state.terrain && typeof state.terrain === 'object') {
    let rawTerrain = typeof state.terrain === 'string' ? JSON.parse(state.terrain) : state.terrain
    // 检查是否有旧版字符串值
    const hasOldFormat = Object.values(rawTerrain).some(v => typeof v === 'string')
    if (hasOldFormat) {
      let converted = 0
      Object.entries(rawTerrain).forEach(([key, val]) => {
        if (typeof val === 'string') {
          rawTerrain[key] = sanitizeTerrainCell(val)
          converted++
        }
      })
      state.terrain = rawTerrain
      addLog('system', `[兼容] 已清洗地形 map: ${converted} 个`)
      console.log(`[TerrainSanitizer] 已清洗 battlefield terrain: ${converted} 个`)
    }
  }

  // 3. 同步清洗后的数据到本地 terrainMap (供 drawBattleScene 使用)
  if (state.terrain && typeof state.terrain === 'object') {
    const t = typeof state.terrain === 'string' ? JSON.parse(state.terrain) : state.terrain
    Object.keys(terrainMap).forEach(k => delete terrainMap[k])
    Object.entries(t).forEach(([key, val]) => {
      terrainMap[key] = val
    })
  }
}

// Phase 26: 贴图异步加载完成回调 — 模块级定义，供 onMounted 注册 / onUnmounted 清理
function handleSpriteLoaded() {
  if (hexGrid.value) {
    hexGrid.value.redraw()
  }
}

onMounted(async () => {
  // Phase 14: 全局 Canvas 渲染错误边界 - 防止静默黑屏
  window.addEventListener('error', (event) => {
    if (event.filename && (event.filename.includes('NewBattleView') || event.filename.includes('HexGridCanvas'))) {
      console.error('[BattlefieldCRASH] 未捕获错误:', event.message)
      console.error('[BattlefieldCRASH] 文件:', event.filename, '行:', event.lineno, '列:', event.colno)
      console.error('[BattlefieldCRASH] 错误对象:', event.error)
      event.preventDefault()
    }
  })
  // 捕获 Promise rejection
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[BattlefieldCRASH] 未处理的 Promise 拒绝:', event.reason)
    event.preventDefault()
  })

    document.addEventListener('keydown', onDiceKeyDown)
    // Phase 26: 贴图异步加载完成后自动重绘 Canvas
    window.addEventListener('unit-sprite-loaded', handleSpriteLoaded)
    // Phase 28: 加载阵营 Logo（用于战场三层金字塔渲染）
    loadFactionLogos().catch(() => {})
    // 加载 3D 视角配置 (静默拉取，战场端不提供 UI 调节)
    loadViewConfig().catch(() => {})
  // Batch C/D: 连接 comm 实时推送（叠加在 refreshState 之上，失败自动回退轮询）
  try {
    const myFaction = myFaction.value || 'earth'
    connectBattleSocket({
      battleId: route.params.id,
      token: userStore.token,
      faction: myFaction,
      role: userStore.user?.role || 'Player',
      onState: () => enqueueState('battle', refreshState),
      onConnect: () => refreshState(), // 断线重连后强制拉取最新态（隐患三收尾）
    })
  } catch (e) {
    console.warn('[socket] 连接失败，回退轮询', e?.message || e)
  }
  // Phase 29-H: 合并到下方 loadGlossaryConfig() 统一拉取，消除重复请求
  try {
    // 韧性重试：初次进入战场时偶发模块初始化时序问题（如 TDZ）会导致请求失败，
    // 重试一次即可恢复，避免误走「兜底新建战局」导致画布空白。
    let res
    let lastErr
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await combatAPI.getBattleState(route.params.id)
        lastErr = null
        break
      } catch (e2) {
        lastErr = e2
        if (attempt === 0) {
          console.warn('[BattleInit] getBattleState 首次失败，重试中…', e2?.message || e2)
          await new Promise(r => setTimeout(r, 400))
        }
      }
    }
    if (lastErr) throw lastErr
    const { data } = res
    const rawState = data.battle || data
    battleState.value = normalizeBattleState(rawState)
    if (rawState?.factionRoles) factionRoles.value = rawState.factionRoles
        // Phase 14: 出击装备 DKM 防爆清洗
        sanitizeAllUnitsEquipment()

    const phase = battleState.value?.phase || '准备中'
    if (phase === 'deployment') {
      isDeployPhase.value = true
      phaseText.value = '部署阶段'
    } else if (phase === 'combat') {
      isDeployPhase.value = false
      phaseText.value = '战斗阶段'
    } else {
      // Check if we need to deploy
      const hasUnits = allUnits.value.length > 0
      if (!hasUnits) {
        isDeployPhase.value = true
        phaseText.value = '部署阶段'
      } else {
        isDeployPhase.value = false
        phaseText.value = phase === 'combat' ? '战斗阶段' : (phase || '准备中')
      }
    }

    // ===== Shared: Load deployPool whenever entering deploy phase =====
    if (isDeployPhase.value) {
      await loadDeployPool()
      // Phase 14: 清洗部署池装备
      if (deployPool.value && deployPool.value.length > 0) {
        deployPool.value.forEach(u => sanitizeUnitEquipment(u))
        console.log('[EquipmentSanitizer] 部署池已清洗 ' + deployPool.value.length + ' 个单位')
      }
    }

    addLog('system', `进入战场: ${battleMapName.value || '未知'} | ${battlefieldSize.value}`)
    // 加载词条库配置（动态技能参数同步）
    loadGlossaryConfig().catch(() => {})
    // 加载阵营冷却 & 胜利条件
    loadFactionRoles(); loadFactionCooldowns().catch(() => {})
    loadVictoryInfo().catch(() => {})
  } catch (e) {
    console.error('[BattleInit] getBattleState 失败:', e.message || e)
    // 自动创建战斗会话
    try {
      // 兜底：动态获取一个真实存在的地图 UUID（maps 表为 UUID，禁止硬编码 1）
      let fallbackMapId = null
      try {
        const { data: maps } = await mapAPI.getMapList()
        const list = Array.isArray(maps) ? maps : (maps?.maps || maps?.data || [])
        if (list.length > 0) fallbackMapId = list[0].id || list[0].mapId || list[0].battlefield_id
      } catch (_) { /* 地图列表拉取失败则降级 */ }
      if (!fallbackMapId) {
        console.warn('[BattleInit] 无可用地图，跳过自动创建战局')
      } else {
        console.warn('[BattleInit] getBattleState 失败，兜底 createBattle 使用动态地图 ' + fallbackMapId)
        const res = await combatAPI.createBattle({ battlefield_id: fallbackMapId })
        const newId = res.data?.id || res.data?.battle?.id || res.data?.battle_id || route.params.id
        if (newId !== route.params.id) {
          router.replace('/battle/' + newId)
          return
        }
        const { data: bd } = await combatAPI.getBattleState(newId)
        const rawState = bd.battle || bd
        battleState.value = normalizeBattleState(rawState)
        if (rawState?.factionRoles) factionRoles.value = rawState.factionRoles
      }
    } catch (createErr) {
      console.warn('[BattleInit] auto-create failed:', createErr.message || createErr)
    }
    phaseText.value = '部署阶段'
    isDeployPhase.value = true
    await loadDeployPool()
    addLog('system', battleState.value ? ('进入战场: ' + (battleMapName.value || '已创建')) : '进入离线部署模式')
  }

    // Phase 13: 旧地图地形向后兼容清洗
    // Phase 14: 地形双重清洗强化 - 确保 Canvas 渲染前 terrainMap 已标准化
    sanitizeBattlefieldTerrain()
    // 强制对 terrainMap 进行二次清洗（覆盖 battleState.terrain 未覆盖的局部变更）
    if (terrainMap && typeof terrainMap === "object") {
      let cleaned = 0
      Object.entries(terrainMap).forEach(function(kv) {
        const key = kv[0], val = kv[1]
        if (typeof val === "string") {
          terrainMap[key] = sanitizeTerrainCell(val)
          cleaned++
        } else if (val && typeof val === "object" && !val.terrain_id) {
          terrainMap[key] = sanitizeTerrainCell(val)
          cleaned++
        }
      })
      if (cleaned > 0) console.log("[TerrainSanitizer] terrainMap 二次清洗: " + cleaned + " 个")
    }
  initFloatingCardPositions()
  // Phase 29-CanvasTrueCenter: resize 防护 - 缩放浏览器时强制重算居中，防止左上角变平
  // 处理函数定义在顶层作用域（见文件下方 _resizeHandler），此处仅注册
  window.addEventListener('resize', _resizeHandler)

  // Phase 29-P0: 悬停坐标跟踪 — 监听引擎 Canvas 的 mousemove
  // 引擎不再 emit hex-hover，需要在父层手动接入
  await nextTick()
  const engineEl = hexGrid.value?.engineContainer || hexGrid.value?.engineWrapper
  if (engineEl) {
    const canvas = engineEl.querySelector('canvas')
    if (canvas) {
      canvas.addEventListener('mousemove', handleEngineHover)
    }
  }

  // ============================================================
  // Phase 29-CanvasTrueCenter: 双 Tick 绝杀 UI 塌陷时间差
  // 等待侧边指挥面板、部署池弹窗彻底在 DOM 树中稳定渲染、撑开物理尺寸
  // 然后强制重新居中相机 + 刷新地形缓存 + 全量重绘
  // ============================================================
  await nextTick()
  await nextTick()
  if (hexGrid.value) {
    console.log('[CanvasTrueCenter] 双Tick校准触发 - UI已稳定，重新计算居中')
    hexGrid.value.centerGrid()
    hexGrid.value.invalidateTerrain()
    hexGrid.value.redraw()
  }
})

// Phase 29-CanvasTrueCenter: resize 防护处理函数（顶层作用域定义，确保 onMounted 注册与 onUnmounted 注销引用同一函数，避免 _resizeHandler is not defined）
const _resizeHandler = () => {
  initFloatingCardPositions()
  // 延迟一帧等待 DOM 尺寸稳定后重新居中
  setTimeout(() => {
    if (hexGrid.value) {
      hexGrid.value.centerGrid()
      hexGrid.value.redraw()
    }
  }, 100)
}

// Phase 29-P0: 悬停处理器 — 通过引擎暴露的 getHexAtEvent 获取格子坐标
function handleEngineHover(event) {
  if (!hexGrid.value?.getHexAtEvent) return
  const hex = hexGrid.value.getHexAtEvent(event)
  if (hex) {
    hoverCoord.value = formatCoord(hex.q, hex.r)
  } else {
    hoverCoord.value = ''
  }
}

// Update faction turn display（阶段二：阵营轮转）
watch(() => battleState.value?.activeFaction, (val) => {
  if (val) phaseText.value = `行动中: ${currentFactionLabel.value}`
})

// 战局单位集合变化（部署/移动/攻击/结算等）时强制重绘棋盘，确保棋子即时显示。
// 此前部署后仅更新了 battleState.units，但缺少对单位列表的响应式重绘监听，导致棋子"已部署却不显示"。
watch(() => battleState.value?.units, () => {
  hexGrid.value?.redraw()
}, { deep: true })

onUnmounted(() => {
  disconnectBattleSocket()
  if (surpriseTimer) { clearInterval(surpriseTimer); surpriseTimer = null }
  document.removeEventListener('keydown', onDiceKeyDown)
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  window.removeEventListener('resize', _resizeHandler)
  // Phase 26: 清理贴图加载事件监听
  window.removeEventListener('unit-sprite-loaded', handleSpriteLoaded)
  // Phase 29-P0: 清理悬停监听
  const engineEl = hexGrid.value?.engineContainer || hexGrid.value?.engineWrapper
  if (engineEl) {
    const canvas = engineEl.querySelector('canvas')
    if (canvas) {
      canvas.removeEventListener('mousemove', handleEngineHover)
    }
  }
})

// Phase8: 空格掷骰 / ESC取消
function onDiceKeyDown(e) {
  if (!diceRollState.active) return
  if (e.code === 'Space') {
    e.preventDefault()
    if (diceRollState.animationPhase === 'idle') startDiceRoll()
    else if (diceRollState.animationPhase === 'result') resolveDiceRoll()
  }
  if (e.code === 'Escape') cancelDiceRoll()
}
</script>

<style scoped>
/* ===== DM Layout (Phase 25: 使用 absolute inset-0 占据父级 100%，不再硬编码 100vh) ===== */
.dm-battle-layout {
  display: flex;
  background: #0a1628;
  color: #f1f3fc;
  font-family: 'Space Grotesk', 'Fira Code', sans-serif;
  overflow: hidden;
}

/* ===== LEFT SIDEBAR ===== */

.log-entry.log-move 
.log-entry.log-attack 
.log-entry.log-action 
.log-entry.log-deploy 
.log-entry.log-turn 
.log-entry.log-error 

.log-entry.log-select 

/* ===== Action Log Panel ===== */

.log-entry.log-move 
.log-entry.log-attack 
.log-entry.log-action 
.log-entry.log-deploy 
.log-entry.log-turn 
.log-entry.log-error 

.log-entry.log-select 

/* ===== MAIN CONTENT ===== */
.dm-main { flex: 1; min-width: 0; min-height: 0; overflow: hidden; position: relative; display: flex; flex-direction: column; }

/* Header */
.battle-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
  pointer-events: auto;
}

.battle-header h1 {
  font-size: 20px;
  font-weight: 800;
  color: #f1f3fc;
  letter-spacing: 2px;
  margin: 0;
  border-left: 4px solid #ffb000;
  padding-left: 14px;
}

.header-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  color: #9f8e78;
}

.meta-item { display: flex; align-items: center; gap: 5px; }
.sep { color: rgba(255,176,0,0.3); }

.dot-live {
  width: 8px; height: 8px;
  border-radius: 50%;
  display: inline-block;
  animation: pulse 2s infinite;
}

.dot-live.danger {
  background: #ffb000;
  box-shadow: 0 0 8px rgba(255,176,0,0.4);
}

@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

.header-id {
  margin-left: auto;
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  color: rgba(241,243,252,0.15);
}

/* Toolbar */
.battle-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding: 6px 12px;
  background: rgba(8,51,68,0.8);
  border: 1px solid rgba(255,176,0,0.1);
  flex-shrink: 0;
  pointer-events: auto;
}

.toolbar-btn {
  padding: 4px 12px;
  font-size: 11px;
  font-family: 'Space Grotesk', sans-serif;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.12);
  color: #9f8e78;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.toolbar-btn:hover {
  background: rgba(255,176,0,0.08);
  border-color: rgba(255,176,0,0.25);
  color: #ffb000;
}

.toolbar-btn.primary {
  background: #ffb000;
  color: #0a1628;
  font-weight: 700;
  border-color: #ffb000;
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar-info {
  font-size: 10px;
  color: #9f8e78;
  font-family: 'Fira Code', monospace;
  margin-left: auto;
}

.dm-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 3px;
  font-family: 'Fira Code', monospace;
  font-weight: 700;
  background: rgba(255,176,0,0.15);
  color: #ffb000;
}

.dm-badge.selected {
  background: rgba(0,180,220,0.15);
  color: #00b4dc;
}

.dm-select {
  background: #083344;
  color: #ffb000;
  border: 1px solid rgba(255,176,0,0.3);
  padding: 3px 8px;
  font-size: 11px;
  font-family: 'Fira Code', monospace;
}

/* Phase 29-DOM_Purge: .game-canvas-sandbox 与 .canvas-container 已拆除，Canvas 由 HexGridCanvasEngine 自身 .hex-engine-sandbox 管理 */

.map-legend {
  position: absolute;
  bottom: 6px;
  left: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  background: rgba(0,0,0,0.78);
  padding: 5px 10px;
  font-size: 9px;
  color: rgba(255,255,255,0.5);
  font-family: 'Fira Code', monospace;
  z-index: 6;
  max-width: calc(100% - 12px);
  pointer-events: none;
  user-select: none;
}

.legend-item { display: flex; align-items: center; gap: 3px; white-space: nowrap; }
.legend-swatch { display: inline-block; width: 10px; height: 10px; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.2); }

/* ===== Faction Boxes (bottom) ===== */
.faction-boxes {
  display: flex;
  gap: 12px;
  padding: 6px 0;
  flex-shrink: 0;
  overflow-x: auto;
  min-height: 100px;
}

.faction-boxes::-webkit-scrollbar {
  height: 4px;
}

.faction-boxes::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.1);
  border-radius: 2px;
}

.faction-box {
  background: rgba(5,20,30,0.95);
  border: 1px solid rgba(255,255,255,0.15);
  flex: 1;
  min-width: 200px;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  border-radius: 4px;
}

.faction-box.faction-earth {
  border-top: 2px solid #13ff43;
}

.faction-box.faction-maxion {
  border-top: 2px solid #ff4d4d;
}

.faction-box.faction-neutral {
  border-top: 2px solid #ffb000;
}

.faction-box.faction-balon {
  border-top: 2px solid #9c27b0;
}

/* 方案A 战术化：按角色分组后的上边框配色 */
.faction-box.faction-attack {
  border-top: 2px solid #13ff43;
}

.faction-box.faction-defense {
  border-top: 2px solid #4da6ff;
}

.faction-box.faction-ambush {
  border-top: 2px solid #ff4d4d;
}

.faction-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.faction-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.faction-name {
  flex: 1;
}

.faction-count {
  color: rgba(241,243,252,0.3);
  font-family: 'Fira Code', monospace;
  font-size: 9px;
}

.faction-units {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-content: flex-start;
  min-height: 50px;
}

.faction-units:empty::after {
  content: '-- 无单位 --';
  color: rgba(241,243,252,0.15);
  font-size: 10px;
  margin: auto;
}

.faction-units::-webkit-scrollbar {
  width: 3px;
}

.faction-units::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.08);
  border-radius: 2px;
}

.faction-unit-card {
  background: rgba(8,51,68,0.6);
  padding: 5px 8px;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
  min-width: 80px;
  font-size: 10px;
}

.faction-unit-card:hover {
  border-color: rgba(255,255,255,0.2);
  background: rgba(8,60,80,0.7);
}

.faction-unit-card.selected {
  border-color: #ffffff;
  background: rgba(8,80,100,0.7);
  box-shadow: 0 0 12px rgba(0,180,220,0.3);
}

.fu-name {
  font-weight: 700;
  font-size: 11px;
  margin-bottom: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fu-bars {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-bottom: 3px;
}

.fu-bar {
  height: 3px;
  background: rgba(0,0,0,0.4);
}

.fu-fill {
  height: 100%;
  display: block;
}

.fu-fill.hp { background: #13ff43; transition: width 0.3s ease; }
.fu-fill.shield { background: #00b4dc; transition: width 0.3s ease; }

/* 死亡单位：灰度化 + 半透明 + 彻底禁用点击 */
.faction-unit-card.dead {
  filter: grayscale(1);
  opacity: 0.45;
  pointer-events: none;
  cursor: default;
}
.faction-unit-card.dead .fu-name {
  text-decoration: line-through;
}

.fu-pos {
  font-size: 8px;
  color: rgba(241,243,252,0.3);
  font-family: 'Fira Code', monospace;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.fu-moved {
  color: #ffb000;
  font-style: italic;
}

.fu-deploy-btn {
  background: rgba(255,176,0,0.12);
  color: #ffb000;
  border: 1px solid rgba(255,176,0,0.3);
  padding: 2px 6px;
  font-size: 8px;
  cursor: pointer;
  font-family: inherit;
  border-radius: 3px;
}

.fu-deploy-btn:hover {
  background: rgba(255,176,0,0.2);
}

.fu-empty {
  color: rgba(241,243,252,0.08);
  font-size: 10px;
  text-align: center;
  padding: 12px;
  width: 100%;
}

/* ===== Phase 13: FLOATING CARD OVERRIDE (replaces old dm-action-panel) ===== */
/* 老版 dm-action-panel 被悬浮卡片替代，保留样式仅作回退引用 */
.dm-action-panel {
  display: none !important; /* 已被 floating-card 替代 */
}

/* ===== Phase 13: Floating Card System ===== */
.floating-card {
  position: fixed;
  z-index: 100;
  background: rgba(8,51,68,0.96);
  border: 1px solid rgba(255,176,0,0.25);
  border-radius: 6px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.5), 0 0 60px rgba(255,176,0,0.05);
  transition: height 0.3s ease, border-color 0.2s;
  min-width: 200px;
  max-width: 420px;
  user-select: none;
  overflow: hidden;
}

.floating-card:hover {
  border-color: rgba(255,176,0,0.4);
}

.floating-card.collapsed {
  min-width: auto;
  width: auto !important;
}

.floating-card-dragbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: rgba(0,0,0,0.3);
  border-bottom: 1px solid rgba(255,176,0,0.12);
  cursor: grab;
  font-size: 10px;
  font-family: 'Fira Code', monospace;
  letter-spacing: 1px;
}

.floating-card-dragbar:active {
  cursor: grabbing;
}

.floating-card-title {
  color: #ffb000;
  font-weight: 700;
  text-transform: uppercase;
  font-size: 10px;
}

.floating-card-collapse-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.12);
  color: #9f8e78;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  transition: all 0.15s;
}

.floating-card-collapse-btn:hover {
  background: rgba(255,176,0,0.15);
  color: #ffb000;
  border-color: rgba(255,176,0,0.3);
}

.floating-card-body {
  overflow-y: auto;
  max-height: 70vh;
  transition: max-height 0.3s ease, opacity 0.2s;
  padding: 0;
}

/* 行动面板特定样式 */
.floating-action-panel {
  width: 220px;
}

.floating-action-panel .floating-card-body {
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  /* 纵向侧滑轮：内容溢出时可滚动 */
  max-height: calc(100vh - 70px);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,176,0,0.5) rgba(255,255,255,0.06);
}
.floating-action-panel .floating-card-body::-webkit-scrollbar {
  width: 8px;
}
.floating-action-panel .floating-card-body::-webkit-scrollbar-track {
  background: rgba(255,255,255,0.06);
  border-radius: 4px;
}
.floating-action-panel .floating-card-body::-webkit-scrollbar-thumb {
  background: rgba(255,176,0,0.5);
  border-radius: 4px;
}
.floating-action-panel .floating-card-body::-webkit-scrollbar-thumb:hover {
  background: rgba(255,176,0,0.75);
}

/* 机动拆解区块 */
.ap-mobility-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 0;
  border-top: 1px dashed rgba(255,255,255,0.1);
  border-bottom: 1px dashed rgba(255,255,255,0.1);
}
.ap-stat-sub {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: #9f8e78;
  padding-left: 8px;
}
.ap-stat-sub span:last-child {
  color: #ffd479;
  font-weight: 600;
}
/* 体型机动补偿 Buff 角标 */
.mob-buff-chip {
  display: inline-flex; align-items: center; justify-content: center;
  margin-left: 6px; padding: 0 6px; min-width: 18px; height: 16px;
  border-radius: 3px; font-size: 11px; font-weight: 700;
  background: rgba(79, 209, 255, 0.18); color: #9fe3ff;
  border: 1px solid rgba(79, 209, 255, 0.5);
}

/* 阵营面板特定样式 */
.floating-faction-panel {
  width: auto;
  max-width: 95vw;
}

.floating-faction-panel .floating-card-body {
  padding: 8px;
  max-height: 50vh;
}

/* ===== 行动记录浮动窗（战报栏）===== */
.floating-action-log {
  width: 252px;
}

.floating-action-log .log-count {
  background: rgba(255,176,0,0.12);
  color: #ffb000;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 9px;
  margin-left: 6px;
}

/* 滚动容器：direction:rtl 把垂直滚动条推到左侧；overflow:auto 让水平滚动条落在底部，
   形如普通网页框。entry 再设 ltr 保证文字从左到右。 */
.floating-action-log .floating-card-body {
  direction: rtl;
  padding: 6px;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,176,0,0.5) rgba(255,255,255,0.06);
}

.floating-action-log .floating-card-body::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.floating-action-log .floating-card-body::-webkit-scrollbar-track {
  background: rgba(255,255,255,0.06);
  border-radius: 4px;
}

.floating-action-log .floating-card-body::-webkit-scrollbar-thumb {
  background: rgba(255,176,0,0.5);
  border-radius: 4px;
}

.floating-action-log .floating-card-body::-webkit-scrollbar-thumb:hover {
  background: rgba(255,176,0,0.75);
}

.floating-action-log .floating-card-body .log-entry,
.floating-action-log .floating-card-body .log-empty {
  direction: ltr;
  text-align: left;
}

.log-entry {
  font-size: 9px;
  padding: 3px 6px;
  border-radius: 3px;
  font-family: 'Fira Code', monospace;
  line-height: 1.4;
  display: flex;
  gap: 6px;
}

.log-time { color: rgba(255,255,255,0.2); flex-shrink: 0; }
.log-msg { color: rgba(241,243,252,0.5); }

.log-entry.log-system { background: rgba(255,255,255,0.02); }
.log-entry.log-move .log-msg { color: #00b4dc; }
.log-entry.log-attack .log-msg { color: #ff4d4d; }
.log-entry.log-action .log-msg { color: #ffb000; }
.log-entry.log-deploy .log-msg { color: #ffb000; }
.log-entry.log-turn .log-msg { color: rgba(255,176,0,0.7); font-weight: 700; }
.log-entry.log-error .log-msg { color: #ff4d4d; background: rgba(255,77,77,0.1); }
.log-entry.log-info { font-style: italic; }
.log-entry.log-select .log-msg { color: #c1e8ff; }
.log-entry.log-warn .log-msg { color: #ffd479; }

.log-empty {
  color: rgba(241,243,252,0.1);
  font-size: 10px;
  text-align: center;
  padding: 20px 0;
}

.ap-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 10px;
}

.ap-empty-icon {
  font-size: 32px;
  color: rgba(255,176,0,0.1);
}

.ap-empty-text {
  font-size: 10px;
  color: rgba(241,243,252,0.15);
  text-align: center;
  line-height: 1.6;
}

.ap-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.ap-unit-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid #888;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 16px;
  background: rgba(0,0,0,0.3);
}

.ap-unit-info { flex: 1; min-width: 0; }

.ap-name {
  font-weight: 700;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ap-faction {
  font-size: 9px;
  color: rgba(241,243,252,0.3);
}

/* Stats */
.ap-stats {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

/* 状态效果（自动化技能 statusEffects） */
.ap-status-effects {
  padding: 8px 0 10px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.se-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 5px;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-family: 'Fira Code', monospace;
  background: rgba(255,255,255,0.04);
  border-left: 3px solid rgba(120,180,255,0.6);
}
.se-chip.se-defense { border-left-color: rgba(255,160,120,0.7); }
.se-chip.se-attack { border-left-color: rgba(120,220,140,0.7); }
.se-chip.se-attack_debuff_target { border-left-color: rgba(255,210,90,0.7); }
.se-label { color: rgba(241,243,252,0.85); font-weight: 600; }
.se-val { color: rgba(241,243,252,0.55); }
.se-count { color: rgba(150,200,255,0.85); }
.se-cond { color: rgba(255,210,90,0.9); background: rgba(255,210,90,0.12); padding: 1px 5px; border-radius: 4px; }

.ap-stat-row {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  font-family: 'Fira Code', monospace;
  color: rgba(241,243,252,0.35);
}

.ap-stat-val {
  color: #9f8e78;
}

/* Actions */
.ap-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ap-section-title {
  font-size: 9px;
  font-weight: 700;
  color: rgba(255,176,0,0.4);
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 2px;
}

.ap-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  color: #9aa0a6;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
  text-align: left;
}

.ap-action-btn:hover:not(:disabled) {
  background: rgba(255,176,0,0.08);
  border-color: rgba(255,176,0,0.25);
  color: #ffb000;
}

.ap-action-btn.active {
  background: rgba(0,180,220,0.1);
  border-color: #00b4dc;
  color: #00b4dc;
}

.ap-action-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  text-decoration: line-through;
}

.ap-standby-badge {
  margin-top: 4px;
  padding: 4px 6px;
  font-size: 10px;
  font-weight: 700;
  text-align: center;
  color: #ffd24a;
  background: rgba(255,176,0,0.1);
  border: 1px solid rgba(255,176,0,0.3);
  border-radius: 4px;
}

.ap-action-icon {
  font-size: 12px;
  width: 18px;
  text-align: center;
}

.ap-action-label {
  flex: 1;
}

.ap-action-hint {
  font-size: 8px;
  color: rgba(241,243,252,0.2);
  font-family: 'Fira Code', monospace;
}

/* ===== Tactical Action Panel ===== */
.ap-tactical {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 380px;
  overflow-y: auto;
  padding-right: 2px;
}

.ap-tactical::-webkit-scrollbar {
  width: 3px;
}

.ap-tactical::-webkit-scrollbar-thumb {
  background: rgba(255,176,0,0.15);
  border-radius: 2px;
}

.ap-skill-group-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px;
  margin-top: 6px;
  font-size: 9px;
  font-weight: 700;
  color: rgba(255,255,255,0.5);
  letter-spacing: 0.5px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.ap-skill-group-label:first-of-type {
  margin-top: 2px;
}

.sk-durability {
  font-size: 8px;
  color: rgba(255,176,0,0.6);
  font-family: 'Fira Code', monospace;
}

.sk-durability b {
  color: #ffb000;
}

/* Skill buttons */
.ap-skill-btn {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  background: rgba(255,176,0,0.06);
  border: 1px solid rgba(255,176,0,0.15);
  color: #ffb000;
  font-size: 10px;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: all 0.15s;
  width: 100%;
}

.ap-skill-btn:hover:not(:disabled) {
  background: rgba(255,176,0,0.12);
  border-color: rgba(255,176,0,0.35);
}

.ap-skill-btn.active {
  background: rgba(0,180,220,0.12);
  border-color: #00b4dc;
  color: #00b4dc;
}

.ap-skill-btn:disabled,
.ap-skill-btn.skill-disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.ap-skill-btn.ap-basic-attack {
  background: rgba(19,255,67,0.08);
  border-color: rgba(19,255,67,0.2);
  color: #13ff43;
}

.ap-skill-btn.ap-basic-attack:hover {
  background: rgba(19,255,67,0.15);
}

.ap-skill-btn.ap-basic-attack.active {
  background: rgba(19,255,67,0.18);
  border-color: #13ff43;
}

.ap-skill-btn.ap-royroy-deploy {
  background: rgba(156,39,176,0.08);
  border-color: rgba(156,39,176,0.25);
  color: #ce93d8;
}

.ap-skill-btn.ap-royroy-deploy:hover {
  background: rgba(156,39,176,0.15);
}

/* Skill card internals */
.sk-top {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sk-name {
  font-weight: 700;
  font-size: 10px;
  flex: 1;
}

.sk-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 8px;
  color: rgba(255,255,255,0.4);
  font-family: 'Fira Code', monospace;
}

.sk-range {
  color: rgba(0,180,220,0.7);
}

.sk-attr {
  color: rgba(255,176,0,0.5);
  text-transform: uppercase;
}

.sk-desc {
  font-size: 8px;
  color: rgba(255,255,255,0.28);
  line-height: 1.4;
}

.sk-tags {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
}

.sk-tag {
  font-size: 7px;
  padding: 1px 4px;
  border-radius: 2px;
  font-weight: 700;
  letter-spacing: 0.3px;
}

.tag-hit { background: rgba(255,77,77,0.2); color: #ff4d4d; }
.tag-crit { background: rgba(255,176,0,0.2); color: #ffb000; }
.tag-pierce { background: rgba(156,39,176,0.2); color: #ce93d8; }
.tag-leech { background: rgba(0,200,83,0.2); color: #00c853; }

/* Skill type badges */
.skill-type-badge {
  font-size: 7px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
  flex-shrink: 0;
}

.badge-basic { background: rgba(19,255,67,0.2); color: #13ff43; }
.badge-deploy { background: rgba(156,39,176,0.2); color: #ce93d8; }
.badge-melee { background: rgba(255,77,77,0.2); color: #ff6b6b; }
.badge-ranged { background: rgba(0,180,220,0.2); color: #4dd0e1; }
.badge-auto { background: rgba(255,176,0,0.2); color: #ffb000; }
.badge-special { background: rgba(156,39,176,0.2); color: #ce93d8; }

.skill-hint-name {
  color: #ffb000;
  font-weight: 700;
}

/* Passive Skills Panel */
.ap-passive {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px 8px;
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.04);
  border-radius: 4px;
  margin-bottom: 4px;
}

.ap-passive-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 2px 0;
  font-size: 9px;
}

.ps-name {
  color: rgba(100,180,255,0.8);
  font-weight: 700;
  flex-shrink: 0;
  min-width: 48px;
  font-size: 8px;
  letter-spacing: 0.3px;
}

.ps-desc {
  color: rgba(255,255,255,0.3);
  font-style: italic;
  font-size: 8px;
  line-height: 1.3;
}

/* Skill durability & info labels */
.sk-info {
  color: rgba(0,180,220,0.7);
  font-size: 8px;
}

.sk-attrinfo {
  color: rgba(255,255,255,0.7);
  font-size: 9px;
  font-weight: 600;
  flex: 1;
}

.sk-durability-label {
  color: rgba(255,176,0,0.7);
  font-size: 8px;
  margin-left: auto;
}

.sk-durability-label b {
  color: #ffb000;
}

/* Mode hint */
.ap-mode-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  background: rgba(255,176,0,0.08);
  border: 1px solid rgba(255,176,0,0.25);
  font-size: 10px;
  color: #ffb000;
  margin-top: auto;
}

.ap-cancel-btn {
  background: rgba(255,77,77,0.06);
  border: 1px solid rgba(255,77,77,0.3);
  color: #ff4d4d;
  cursor: pointer;
  padding: 3px 8px;
  font-size: 10px;
  border-radius: 3px;
  font-family: inherit;
  transition: all 0.15s;
}
.ap-cancel-btn:hover {
  background: rgba(255,77,77,0.15);
  border-color: #ff4d4d;
}

.jump-input {
  width: 50px;
  padding: 2px 4px;
  background: #083344;
  border: 1px solid rgba(255,176,0,0.3);
  color: #ffb000;
  font-size: 9px;
  font-family: 'Fira Code', monospace;
  text-align: center;
}
.jump-input:focus { outline: none; border-color: #ffb000; }
.jump-go-btn {
  padding: 2px 8px;
  background: rgba(255,176,0,0.1);
  border: 1px solid rgba(255,176,0,0.3);
  color: #ffb000;
  font-size: 9px;
  cursor: pointer;
  font-family: inherit;
}
.jump-go-btn:hover { background: rgba(255,176,0,0.2); }
.jump-cancel-btn {
  padding: 2px 4px;
  background: transparent;
  border: none;
  color: rgba(255,255,255,0.3);
  font-size: 10px;
  cursor: pointer;
}
.jump-cancel-btn:hover { color: #ff4d4d; }

.faction-jump-btn {
  margin-left: auto;
  padding: 1px 6px;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.4);
  font-size: 12px;
  cursor: pointer;
  border-radius: 3px;
  transition: all 0.15s;
  font-family: inherit;
}
.faction-jump-btn:hover { color: #ffb000; border-color: rgba(255,176,0,0.4); background: rgba(255,176,0,0.08); }

/* 阵营技能按钮行 */
.faction-skills-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px 8px;
  border-top: 1px solid rgba(255,255,255,0.06);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.faction-skill-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.1);
  color: rgba(193,232,255,0.7);
  font-size: 10px;
  cursor: pointer;
  transition: all 0.15s;
}
.faction-skill-btn:hover {
  background: rgba(255,176,0,0.08);
  border-color: rgba(255,176,0,0.3);
  color: #ffb000;
}
.faction-skill-btn.disabled {
  opacity: 0.35;
  cursor: not-allowed;
  color: rgba(193,232,255,0.25);
}
.faction-skill-btn.disabled:hover {
  background: rgba(255,255,255,0.03);
  border-color: rgba(255,255,255,0.1);
  color: rgba(193,232,255,0.25);
}
.skill-icon { font-size: 12px; }
.skill-label { font-weight: 500; }

.faction-ability-btn {
  padding: 0 4px;
  background: transparent;
  border: 1px solid rgba(255,176,0,0.2);
  color: #ffb000;
  font-size: 10px;
  cursor: pointer;
  border-radius: 2px;
  transition: all 0.15s;
}
.faction-ability-btn:hover:not(.disabled) { background: rgba(255,176,0,0.15); border-color: #ffb000; }
.faction-ability-btn.disabled { opacity: 0.3; cursor: not-allowed; }

.ap-skip-btn {
  background: rgba(180,180,180,0.03) !important;
  border-color: rgba(180,180,180,0.12) !important;
  color: rgba(241,243,252,0.5) !important;
}
.ap-skip-btn:hover:not(:disabled) {
  background: rgba(180,180,180,0.08) !important;
  border-color: rgba(0,180,220,0.3) !important;
  color: #00b4dc !important;
}

.ap-victory-info {
  padding: 8px 10px;
  background: rgba(0,180,220,0.05);
  border: 1px solid rgba(0,180,220,0.15);
  border-radius: 4px;
  margin-bottom: 6px;
  font-size: 9px;
  color: rgba(241,243,252,0.5);
}
.victory-type { font-weight: 700; color: #00b4dc; font-size: 10px; margin-top: 2px; }
.victory-detail { color: rgba(241,243,252,0.3); margin-top: 1px; }
.victory-cooldown { margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.05); }
.victory-cooldown div { color: rgba(241,243,252,0.4); line-height: 1.6; }

/* 实时胜利结算遮罩 */
.victory-overlay {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: center; justify-content: center;
  background: rgba(6, 10, 20, 0.72);
  backdrop-filter: blur(3px);
}
.victory-card {
  min-width: 280px; padding: 28px 32px; text-align: center;
  background: linear-gradient(160deg, #14203a, #0c1426);
  border: 1px solid rgba(0, 180, 220, 0.5);
  border-radius: 14px;
  box-shadow: 0 12px 48px rgba(0, 180, 220, 0.25);
}
.victory-title { font-size: 22px; font-weight: 800; color: #ffd24a; letter-spacing: 2px; }
.victory-winner { margin-top: 14px; font-size: 16px; color: #f1f3fc; font-weight: 600; }
.victory-cond { margin-top: 6px; font-size: 13px; color: #00b4dc; }
.victory-msg { margin-top: 8px; font-size: 12px; color: rgba(241,243,252,0.55); }
.victory-close {
  margin-top: 20px; padding: 8px 26px; cursor: pointer;
  background: rgba(0,180,220,0.15); border: 1px solid #00b4dc;
  border-radius: 8px; color: #00b4dc; font-size: 13px;
}
.victory-close:hover { background: rgba(0,180,220,0.28); }

/* ===== Concealment Indicator on Canvas ===== */
.conceal-indicator {
  font-size: 9px;
  color: rgba(0,180,220,0.6);
}

/* Phase8: Dice Roll Overlay */
.dice-overlay {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0,0,0,0.75); z-index: 9999;
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(4px);
}
.dice-panel {
  background: linear-gradient(135deg, #0a1628, #001620);
  border: 2px solid #ffb000; border-radius: 8px;
  padding: 32px 40px; min-width: 340px; text-align: center;
  box-shadow: 0 0 40px rgba(255,176,0,0.15);
}
.dice-title { font-size: 18px; font-weight: 700; color: #ffb000; letter-spacing: 2px; margin-bottom: 8px; }
.dice-info { font-size: 11px; color: rgba(193,232,255,0.5); margin-bottom: 24px; }
.dice-result-area { min-height: 80px; margin-bottom: 20px; }
.dice-prompt { font-size: 13px; color: rgba(193,232,255,0.4); }
.dice-prompt kbd { background: rgba(255,176,0,0.15); border: 1px solid rgba(255,176,0,0.3); padding: 2px 8px; border-radius: 3px; color: #ffb000; font-family: inherit; }
.dice-number { font-size: 48px; font-weight: 700; color: #ffd597; }
.dice-number.final { animation: dicePop 0.3s ease-out; }
@keyframes dicePop { 0% { transform: scale(1.5); opacity: 0.3; } 100% { transform: scale(1); opacity: 1; } }
.dice-rolling .dice-number { animation: diceShake 0.05s infinite; }
@keyframes diceShake { 0% { transform: translateX(-3px); } 50% { transform: translateX(3px); } 100% { transform: translateX(-3px); } }
.result-success { font-size: 24px; font-weight: 900; color: #13ff43; letter-spacing: 4px; animation: dicePop 0.3s ease-out; text-shadow: 0 0 10px rgba(19,255,67,0.5); }
.result-fail { font-size: 20px; font-weight: 700; color: #ff5252; }
.bonus-info { font-size: 12px; color: #ffb000; margin-top: 4px; }
.dice-actions { display: flex; gap: 10px; justify-content: center; }
.dice-btn {
  padding: 10px 24px; font-size: 12px; font-weight: 700; letter-spacing: 1px;
  border: 1px solid rgba(159,142,120,0.3); cursor: pointer; font-family: inherit;
  transition: all 0.2s;
}
.dice-btn.roll { background: rgba(255,176,0,0.15); border-color: #ffb000; color: #ffb000; }
.dice-btn.roll:hover { background: rgba(255,176,0,0.25); box-shadow: 0 0 10px rgba(255,176,0,0.3); }
.dice-btn.confirm { background: rgba(19,255,67,0.1); border-color: #13ff43; color: #13ff43; }
.dice-btn.confirm:hover { background: rgba(19,255,67,0.2); box-shadow: 0 0 10px rgba(19,255,67,0.3); }
.dice-btn.cancel { background: rgba(0,0,0,0.2); border-color: rgba(159,142,120,0.15); color: rgba(193,232,255,0.4); }
.dice-btn.cancel:hover { border-color: rgba(255,82,82,0.3); color: #ff5252; }


/* Phase 11: 万能语法标签 */
.sk-tags-group { display: inline-flex; gap: 2px; flex-wrap: wrap; }
.sk-tag.tag-dkind { background: rgba(255,176,0,0.15); color: #ffb000; }
.sk-tag.tag-atype { background: rgba(0,180,220,0.15); color: #00b4dc; }
.sk-tag.tag-dice { background: rgba(156,39,176,0.15); color: #ce93d8; }
.sk-tag.tag-height { background: rgba(76,175,80,0.15); color: #81c784; }
.sk-tag.tag-range { background: rgba(255,152,0,0.15); color: #ffb74d; }
.sk-tag.tag-acc { background: rgba(63,81,181,0.15); color: #7986cb; }

/* ===== Batch D-4.3 反应奇袭 QTE + Screen Tone ===== */
/* 模块3：全端暗绿赛博朋克滤镜 + 高对比度荧光线条网格闪烁，掩盖 10 秒挂起等待 */
.surprise-screen-tone {
  position: fixed; inset: 0; pointer-events: none; z-index: 900;
  background:
    repeating-linear-gradient(0deg, rgba(105,240,174,0.10) 0 1px, transparent 1px 38px),
    repeating-linear-gradient(90deg, rgba(105,240,174,0.10) 0 1px, transparent 1px 38px),
    rgba(0,70,28,0.30);
  animation: surpriseTone 1.1s ease-in-out infinite alternate, surpriseGridFlicker 2.2s steps(2,end) infinite;
}
@keyframes surpriseTone { from { background-color: rgba(0,60,20,0.16);} to { background-color: rgba(0,110,36,0.40);} }
@keyframes surpriseGridFlicker { 0% { opacity: 0.78; } 50% { opacity: 1; } 100% { opacity: 0.86; } }
.surprise-qte-overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 1000; }
.surprise-qte-card { background: rgba(10,20,15,0.96); border: 1px solid #2e7d32; border-radius: 12px; padding: 24px 28px; width: 360px; text-align: center; box-shadow: 0 8px 40px rgba(0,0,0,0.6); }
.surprise-qte-title { font-size: 20px; font-weight: 700; color: #69f0ae; margin-bottom: 8px; }
.surprise-qte-sub { color: #cfd8dc; font-size: 14px; margin-bottom: 12px; }
.surprise-qte-timer { color: #ffb74d; font-size: 16px; margin-bottom: 16px; font-weight: 600; }
.surprise-qte-actions { display: flex; gap: 10px; justify-content: center; }
.surprise-btn { padding: 10px 16px; border-radius: 8px; border: none; font-size: 14px; font-weight: 600; cursor: pointer; }
.surprise-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.surprise-btn.replace { background: #2e7d32; color: #fff; }
.surprise-btn.counter { background: #1565c0; color: #fff; }
.surprise-btn.giveup { background: #455a64; color: #fff; }

/* ===== Batch D-4.2 移动伏击红屏警报 ===== */
.ambush-alert-overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 950; pointer-events: none; background: rgba(180,0,0,0.22); animation: ambushFlash 0.6s ease-in-out infinite alternate; }
@keyframes ambushFlash { from { background: rgba(180,0,0,0.12);} to { background: rgba(220,0,0,0.34);} }
.ambush-alert-text { font-size: 28px; font-weight: 800; color: #fff; text-shadow: 0 2px 12px rgba(0,0,0,0.8); letter-spacing: 2px; }
</style>