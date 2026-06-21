<template>
<div class="dm-battle-layout">
    <!-- ===== CENTER: Battlefield ===== -->
    <main class="dm-main">
      <!-- Header -->
      <div class="battle-header">
        <h1>{{ battleState?.map_name || '战场' }}</h1>
        <div class="header-meta">
          <span class="meta-item"><span class="dot-live danger"></span> {{ phaseText }}</span>
          <span class="sep">|</span>
          <span class="meta-item">{{ battlefieldSize }}</span>
          <span class="sep">|</span>
          <span class="meta-item">{{ battleState?.faction_turn || '准备中' }}</span>
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

      <!-- Canvas Area: HexGridCanvas 通用战棋渲染组件 -->
      <HexGridCanvas
        ref="hexGrid"
        mode="battle"
        :grid-width="gridWidth"
        :grid-height="gridHeight"
        :draw-fn="safeDrawBattleScene"
        :show-coords="showCoords"
        @hex-click="onHexClick"
        @hex-hover="onHexHover"
        @hex-contextmenu="onHexContextMenu"
      >
        <template #overlay>
          <!-- Legend -->
        <div class="map-legend">
          <span v-for="(info, key) in usedTerrains" :key="key" class="legend-item">
            <i class="legend-swatch" :style="{ background: info.color }"></i>{{ info.name }}
          </span>
        </div>
        </template>
      </HexGridCanvas>
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
          <div class="faction-skills-row" v-if="getFactionSkills(faction.key).length > 0">
            <button
              v-for="skill in getFactionSkills(faction.key)"
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
              :class="['faction-unit-card', { 'selected': (isDeployPhase ? selectedDeployUnit?.id : selectedUnit?.id) === unit.id }]"
              @click="isDeployPhase ? startDeployUnit(unit) : selectUnitById(unit)"
            >
              <div class="fu-name">{{ unit.name || ('Unit-' + unit.id) }}</div>
              <div class="fu-bars">
                <div class="fu-bar" title="HP"><span class="fu-fill hp" :style="{width: (unit.hp || 100) + '%'}"></span></div>
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
    </main>

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
          <div class="ap-stat-row"><span>机动</span><span class="ap-stat-val">{{ selectedDeployUnit.mobility || '?' }}</span></div>
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
          <div class="ap-stat-row"><span>HP</span><span class="ap-stat-val">{{ selectedUnit.hp || '?' }}/100</span></div>
          <div class="ap-stat-row"><span>护盾</span><span class="ap-stat-val">{{ selectedUnit.shield || 0 }}</span></div>
          <div class="ap-stat-row"><span>攻击</span><span class="ap-stat-val">{{ selectedUnit.attack || '?' }}</span></div>
          <div class="ap-stat-row"><span>防御</span><span class="ap-stat-val">{{ selectedUnit.defense || '?' }}</span></div>
          <div class="ap-stat-row"><span>机动</span><span class="ap-stat-val">{{ selectedUnit.mobility || selectedUnit['机动'] || '?' }}</span></div>
          <div class="ap-stat-row"><span>射程</span><span class="ap-stat-val">{{ selectedUnit.range || 1 }}</span></div>
          <div class="ap-stat-row" v-if="selectedUnit.q !== undefined"><span>位置</span><span class="ap-stat-val">{{ formatCoord(selectedUnit.q, selectedUnit.r) }}</span></div>
        </div>

        <!-- 被动/防御技能 -->
        <div class="ap-passive" v-if="passiveSkills.length">
          <div class="ap-section-title">被动技能</div>
          <div class="ap-passive-item" v-for="ps in passiveSkills" :key="ps.id">
            <span class="ps-name">{{ ps.name }}</span>
            <span class="ps-desc" v-if="ps.description">{{ getPassiveSkillDesc(ps) }}</span>
          </div>
        </div>

        <div class="ap-actions">
          <div class="ap-section-title">可用行动</div>

          <button
            class="ap-action-btn"
            :class="{ active: actionMode === 'move' }"
            @click="startAction('move')"
            :disabled="selectedUnit.has_moved"
          >
            <span class="ap-action-icon">➤</span>
            <span class="ap-action-label">移动</span>
            <span class="ap-action-hint">机动 {{ selectedUnit.mobility || selectedUnit['机动'] || 3 }}</span>
          </button>

          <button
            class="ap-action-btn"
            :class="{ active: actionMode === 'tactical' }"
            @click="startAction('tactical')"
            :disabled="selectedUnit.has_acted"
          >
            <span class="ap-action-icon">⚔</span>
            <span class="ap-action-label">战术行动</span>
            <span class="ap-action-hint">{{ activeSkillCount + 1 }}种方式</span>
          </button>

          <button class="ap-action-btn" @click="startAction('defend')" :disabled="selectedUnit.has_acted">
            <span class="ap-action-icon">🛡</span>
            <span class="ap-action-label">防御</span>
            <span class="ap-action-hint">+护盾</span>
          </button>

          <button class="ap-action-btn" @click="startAction('wait')" :disabled="selectedUnit.has_acted">
            <span class="ap-action-icon">⏸</span>
            <span class="ap-action-label">待机</span>
          </button>
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
              <span class="sk-attrinfo">{{ weaponAttrLabel }} 范围{{ selectedUnit.range || 1 }}</span>
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
              @click="selectTacticalSkill(skill)"
              :disabled="group.durability !== undefined && group.durability <= 0"
            >
              <div class="sk-top">
                <span class="sk-name">{{ skill.name }}</span>
              </div>
              <div class="sk-meta">
                <span class="sk-attrinfo">{{ skill.attributeLabel || '实体' }} 范围{{ skill.rangeLabel || skill.range || (skill.range_min !== undefined ? skill.range_min + (skill.range_max ? '-' + skill.range_max : '') : '1') }}</span>
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
  </div>
</template>

<script setup>
import { ref, inject, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { HEX_WIDTH, HEX_HEIGHT, HEX_APOTHEM, HEX_RADIUS, DEFAULT_SPACING_H, DEFAULT_SPACING_V, DEFAULT_OFFSET_FACTOR, drawHexPath, getHexNeighbors, TERRAIN_COLORS, UNIVERSAL_TERRAIN_MAP, convertMapFormat, ISO_DEFAULTS, pointyTopCenter, pointyTopToHex, computeDirection } from '../utils/hexUtils.js'
import HexGridCanvas from '../components/HexGridCanvas.vue'
import { unitSpriteResolver } from '../resolvers/unitSpriteResolver.js'
import { useUserStore } from '../stores/user'
import { useRoute, useRouter } from 'vue-router'
import { combatAPI, hangarAPI, glossaryAPI } from '@/api/client'

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
      const tid = cellValue.terrain_id || cellValue.type || cellValue.terrain || 'moon'
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

// === Phase 6: 词条库配置动态同步（前端UI全量动态绑定）===
const glossaryConfig = ref(null)

async function loadGlossaryConfig() {
  try {
    const res = await glossaryAPI.getConfig()
    glossaryConfig.value = res.data
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
      baseDesc = `主动：1~${gs.max_range}格，目标周围${gs.aoe_range}格所有目标下次伤害+${gs.value}`
      break
    case 'sweep':
      baseDesc = `主动：扇形${gs.max_range}格范围攻击，不进行机动值判定。精准命中单体造成伤害${gs.damage_modifier_precise}，范围攻击伤害由所有目标均摊`
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
    default:
      base = skill.description || skill.name || ''
      break
  }
  if (phase10Info) base += '\n' + phase10Info
  return base
}


const battleState = ref(null)
const hexGrid = ref(null)
const showCoords = ref(true)
const terminalLogs = ref([])
const phaseText = ref('加载中...')
const unitImageCache = {} // 缓存单位图片

// === Phase 2: 单位视觉状态（朝向 + 动画状态机）===
// 客户端侧维护，不依赖后端数据，跨 refreshState() 持久化
const unitSpriteState = reactive(new Map())

/** 获取单位的视觉状态 */
function getUnitVisual(unit) {
  const state = unitSpriteState.get(unit.id)
  return {
    direction: state?.direction ?? 0,
    actionState: state?.actionState ?? 'idle',
  }
}

/** 设置单位的视觉状态 */
function setUnitVisual(unitId, direction, actionState) {
  const existing = unitSpriteState.get(unitId) || {}
  unitSpriteState.set(unitId, {
    direction: direction ?? existing.direction ?? 0,
    actionState: actionState ?? existing.actionState ?? 'idle',
  })
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
  // fallback: 静态六角中心坐标
  const { flatX, flatY } = pointyTopCenter(unit.q, unit.r, HEX_RADIUS, spacingH, spacingV)
  return { flatX, flatY }
}
const hoverCoord = ref('')
// Deploy phase
const isDeployPhase = ref(false)
const deployPool = ref([])
const deployedCount = computed(() => {
  return allUnits.value.filter(u => deployPool.value.some(dp => dp.id === u.id)).length
})
const selectedDeployUnit = ref(null)
const deploying = ref(false)

// Unit selection & action system
const selectedUnit = ref(null)
const actionMode = ref(null)  // 'move' | 'tactical' | 'defend' | 'wait'
const selectedAttackSkill = ref(null)
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
const spacingH = DEFAULT_SPACING_H
const spacingV = DEFAULT_SPACING_V
// ISO 等距参数 — 从后端视角配置动态加载，fallback 到 ISO_DEFAULTS
const ISO = reactive({ ...ISO_DEFAULTS })

async function loadViewConfig() {
  try {
    const res = await glossaryAPI.getConfig()
    const vc = res.data?._view
    if (vc && typeof vc.shearX === 'number') {
      ISO.shearX = vc.shearX
      ISO.shearY = vc.shearY ?? ISO_DEFAULTS.shearY
      ISO.scaleX = vc.scaleX ?? ISO_DEFAULTS.scaleX
      ISO.scaleY = vc.scaleY ?? ISO_DEFAULTS.scaleY
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
  unknown:{ label: '未知阵营', color: '#888888', order: 99 },
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
function getFactionRole(factionKey) {
  return factionRoles.value[factionKey] || DEFAULT_ROLES[factionKey] || 'attack'
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
          unit_id: String(selectedUnit.value.id)
        }
      })
      addLog('action', `🔥 火力覆盖发动！中心: ${formatCoord(selectedUnit.value.q, selectedUnit.value.r)}`)
    } else if (skillKey === 'fog_system') {
      if (!confirm('使用迷雾系统？每3轮只能使用一次。')) return
      await combatAPI.fogSystem(route.params.id, {
        unit_id: String(selectedUnit.value.id)
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
        unit_id: String(selectedUnit.value.id)
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

// ===== Data =====
const battlefieldState = computed(() => battleState.value?.battlefield_state || {})
const cells = computed(() => battlefieldState.value.cells || [])
const allUnits = computed(() => battlefieldState.value.units || [])
const gridWidth = computed(() => battlefieldState.value.width || 10)
const gridHeight = computed(() => battlefieldState.value.height || 10)
const battlefieldSize = computed(() => `${gridWidth.value}×${gridHeight.value}`)

async function loadDeployPool() {
  try {
      // 优先尝试后端部署池 API
  try {
    const token = localStorage.getItem('token')
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {}
    const poolRes = await fetch(`/api/combat/${route.params.id}/deploy-pool`, { headers })
    if (poolRes.ok) {
      const poolData = await poolRes.json()
      if (poolData.units && poolData.units.length > 0) {
        deployPool.value = poolData.units
        console.log('[loadDeployPool] 后端部署池返回棋子数:', deployPool.value.length)
        return
      }
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
        deployPool.value = allUnits.filter(u => selectedIds.includes(u.id))
      } else {
        deployPool.value = allUnits
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
  const groups = {}
  // Add deployed units from battlefield state
  allUnits.value.forEach(u => {
    const f = u.faction || 'unknown'
    if (!groups[f]) groups[f] = []
    groups[f].push(u)
  })
  // During deployment, also include undeployed units from deployPool
  // so faction boxes show all available units
  if (isDeployPhase.value) {
    deployPool.value.forEach(u => {
      const f = u.faction || 'unknown'
      if (!groups[f]) groups[f] = []
      const exists = groups[f].some(existing => existing.id === u.id)
      if (!exists) groups[f].push(u)
    })
  }
  return Object.entries(groups)
    .map(([key, units]) => ({
      key,
      label: getFactionLabel(key),
      color: getFactionColor(key),
      units,
      order: getFactionConfig(key).order,
    }))
    .sort((a, b) => a.order - b.order)
})

const usedTerrains = computed(() => {
  const found = {}
  cells.value.forEach(c => {
    const t = c.terrain || 'moon'
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

// getHexNeighbors 和 drawHexPath 直接从 hexUtils 导入

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
  // Auto-scroll handled by TheSidebar.vue
}

function drawBattleScene(ctx, { hlQ = -1, hlR = -1 }) {
  // ctx 已由 HexGridCanvas 应用完整 CTM (translate→scale→ISO shear)，直接绘制即可

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
    const rawMob = su.mobility || su['机动'] || 3
    // mobility > 20 means raw stat (0-99), divide by 10 to get hex range
    const movePoints = Math.floor(rawMob / 2) || 1
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
        const terrain = getTerrainDef(cell?.terrain || 'moon')
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
        const terrain = getTerrainDef(cell?.terrain || 'moon')
        if (terrain.cost < 99 && !unitMap[nKey]) {
          royroyHexes.add(nKey)
        }
      }
    })
  }

  // Skill/Tactical range preview
  const skillRangeHexes = new Set()
  if (actionMode.value === 'tactical' && selectedUnit.value && !royroyDeployMode.value) {
    const su = selectedUnit.value
    const range = getSkillRange(selectedAttackSkill.value)
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
        const terrain = getTerrainDef(cell?.terrain || 'moon')
        // For range display, use raw hex distance (don't count terrain cost)
        if (cur.dist + 1 <= range) {
          skillRangeHexes.add(nKey)
        }
      }
    }
    // Highlight valid targets (enemy units in range)
    const validTargets = new Set()
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

  for (let r = 0; r < gridHeight.value; r++) {
    for (let q = 0; q < gridWidth.value; q++) {
      const { flatX, flatY } = pointyTopCenter(q, r, HEX_RADIUS, spacingH, spacingV)
      const cx = flatX
      const cy = flatY

      // Terrain fill
      const cell = cellMap[`${q},${r}`]
      const tid = cell?.terrain || 'moon'
      const terrain = getTerrainDef(tid)
      ctx.fillStyle = hexToRGBA(terrain.color, 0.3)
      drawHexPath(ctx, cx, cy)
      ctx.fill()

      // Border
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'
      ctx.lineWidth = 1
      drawHexPath(ctx, cx, cy)
      ctx.stroke()

      // Coord label
      if (showCoords.value) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)'
        ctx.font = 'bold 14px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(formatCoord(q, r), cx, cy - 2)
      }

      // Move range highlight
      if (moveRangeHexes.has(`${q},${r}`)) {
        ctx.fillStyle = 'rgba(0,180,220,0.15)'
        drawHexPath(ctx, cx, cy)
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,180,220,0.4)'
        ctx.lineWidth = 2
        drawHexPath(ctx, cx, cy)
        ctx.stroke()
      }

      // Attack range highlight
      if (attackRangeHexes.has(`${q},${r}`)) {
        ctx.fillStyle = 'rgba(255,77,77,0.1)'
        drawHexPath(ctx, cx, cy)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,77,77,0.3)'
        ctx.lineWidth = 2
        drawHexPath(ctx, cx, cy)
        ctx.stroke()
      }

      // Skill range highlight
      if (skillRangeHexes.has(`${q},${r}`)) {
        ctx.fillStyle = 'rgba(255,176,0,0.12)'
        drawHexPath(ctx, cx, cy)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,176,0,0.35)'
        ctx.lineWidth = 2
        drawHexPath(ctx, cx, cy)
        ctx.stroke()
      }

      // RoyRoy deploy highlight
      const hexKey = `${q},${r}`
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
        // Diamond icon
        ctx.fillStyle = 'rgba(206,147,216,0.9)'
        ctx.font = '14px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('◇', cx, cy)
      }

      // Skill range highlight
      if (skillRangeHexes && skillRangeHexes.has(hexKey)) {
        const isTarget = typeof validTargets !== 'undefined' && validTargets && validTargets.has(hexKey)
        if (isTarget) {
          // Valid target cell → red highlight
          ctx.fillStyle = 'rgba(255,77,77,0.2)'
          drawHexPath(ctx, cx, cy)
          ctx.fill()
          ctx.strokeStyle = 'rgba(255,77,77,0.6)'
          ctx.lineWidth = 2.5
          drawHexPath(ctx, cx, cy)
          ctx.stroke()
          // Crosshair icon
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

      // Highlight hovered
      if (hlQ === q && hlR === r) {
        ctx.strokeStyle = isDeployPhase.value && selectedDeployUnit.value ? '#ffb000'
          : actionMode.value ? '#00b4dc' : '#ff9800'
        ctx.lineWidth = 3
        drawHexPath(ctx, cx, cy)
        ctx.stroke()
        if (actionMode.value && selectedUnit.value) {
          ctx.fillStyle = 'rgba(0,180,220,0.15)'
          drawHexPath(ctx, cx, cy)
          ctx.fill()
        }
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

  unitsWithScreenY.forEach(({ unit, flatX, flatY }) => {
    if (unit.q === undefined) return

    const isSelected = selectedUnit.value?.id === unit.id
    const fc = getFactionColor(unit.faction)
    const isConcealed = unit.concealed === true

    // === Step A: 计算屏幕空间锚点 (unit 脚底中心) ===
    const screenX = ox + s * (iso.scaleX * flatX + iso.shearX * flatY)
    const screenY = oy + s * (iso.shearY * flatX + iso.scaleY * flatY)

    // === Step B: 逃逸 ISO 矩阵 ===
    ctx.save()

    // === Step C: 重置为单位矩阵，定位到屏幕像素 ===
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.translate(screenX, screenY)
    ctx.scale(s, s)  // 只缩放，不倾斜

    // === Step D: 查询切图纹理 ===
    const visual = getUnitVisual(unit)
    const unitCode = unit.unitCode || unit.type || String(unit.id)
    const fallbackCode = 'DEFAULT'
    const sprite = !isConcealed
      ? unitSpriteResolver.getTexture(unitCode, visual.direction, visual.actionState, fallbackCode)
      : null

    const hasSprite = sprite && sprite.image.complete && sprite.image.naturalWidth > 0

    if (hasSprite && !isConcealed) {
      // ---- 2D 棋子以 1:1 正常比例绘制 (不受 ISO 压扁) ----
      ctx.drawImage(
        sprite.image,
        sprite.sx, sprite.sy, sprite.sw, sprite.sh,
        -sprite.anchorX, -sprite.anchorY,
        sprite.renderW, sprite.renderH
      )
    } else {
      // ---- Fallback: 圆形底色 + 首字母 ----
      const r = HEX_RADIUS * 0.4
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fillStyle = isConcealed ? hexToRGBA(fc, 0.15) : hexToRGBA(fc, 0.45)
      ctx.fill()
      ctx.strokeStyle = isConcealed && !isSelected ? hexToRGBA(fc, 0.3) : (isSelected ? '#ffffff' : fc)
      ctx.lineWidth = isSelected ? 3.5 : 2.5
      if (isConcealed && !isSelected) ctx.setLineDash([3, 4])
      ctx.stroke()
      ctx.setLineDash([])

      const letter = (unit.name || 'U')[0]
      ctx.fillStyle = fc
      ctx.font = 'bold 16px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(letter, 0, 0)
    }

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

    // HP bar (在 billboard 空间内绘制，保证不变形)
    const hpPct = Math.max(0, (unit.hp || 100) / 100)
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
    const terrain = getTerrainDef(cell?.terrain || 'moon')
    if (isAdjacent && !isOccupied && terrain.cost < 99) {
      deployRoyroyAt(q, r)
    } else {
      addLog('error', isOccupied ? '该格已有单位' : '只能部署在相邻空格')
    }
    return
  }

  // Action mode: move
  if (actionMode.value === 'move' && selectedUnit.value) { executeMove(q, r); return }

  // Check if clicked on a unit
  const clickedUnit = findUnitAt(q, r)
  if (clickedUnit) {
    if (actionMode.value === 'tactical' && selectedUnit.value) {
      if (clickedUnit.id !== selectedUnit.value.id) {
        if (selectedAttackSkill.value) { executeSkillAttack(clickedUnit, selectedAttackSkill.value) }
        else { executeAttack(clickedUnit) }
        return
      }
    }
    selectUnit(clickedUnit)
    return
  }

  // Clicked empty hex - show info
  if (!actionMode.value) {
    const cell = cells.value.find(c => c.q === q && c.r === r)
    const t = cell?.terrain || 'moon'
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
    // Center view on unit (via HexGridCanvas)
    const hg = hexGrid.value
    if (hg?.mapCanvas) {
      const { x, y } = hexToPixel(unit.q, unit.r)
      const canvas = hg.mapCanvas
      const rect = canvas.getBoundingClientRect()
      hg.offsetX.value = rect.width / 2 - (x + HEX_APOTHEM) * hg.scale.value
      hg.offsetY.value = rect.height / 2 - (y + HEX_RADIUS) * hg.scale.value
    }
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
      addLog('action', `${unit.name} 进入防御姿态 (+15 护盾)`)
      // Phase 2: 防御姿态视觉
      setUnitVisual(unit.id, null, 'defend')
      // Attempt backend call
      try {
        await combatAPI.action(route.params.id, { actionType: 'defend', params: { unit_id: String(unit.id) } })
      } catch (e) { /* offline fallback */ }
    } else if (type === 'wait') {
      addLog('action', `${unit.name} 原地待机`)
      // Phase 2: 待命视觉
      setUnitVisual(unit.id, null, 'wait')
      try {
        await combatAPI.action(route.params.id, { actionType: 'wait', params: { unit_id: String(unit.id) } })
      } catch (e) { /* offline fallback */ }
    } else if (type === 'skill') {
      addLog('action', `${unit.name} 使用技能: ${params.skill_id}`)
      try {
        await combatAPI.action(route.params.id, { actionType: 'skill', params: { unit_id: String(unit.id), skill_id: String(params.skill_id) } })
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

// 选择战术行动的技能（null = 普通攻击）
function selectTacticalSkill(skill) {
  royroyDeployMode.value = false
  selectedAttackSkill.value = skill
  addLog('info', `选择: ${skill ? skill.name : '普通攻击'}`)
  hexGrid.value?.redraw()
}

// 获取技能的施放范围（hex距离）
function getSkillRange(skill) {
  if (!skill) {
    // 普通攻击：使用单位的 range 属性
    return selectedUnit.value?.range || 1
  }
  // 有 range 字符串 "1-3" → 取 max
  if (skill.range) {
    const parts = String(skill.range).split(/[-~]/)
    const nums = parts.map(Number).filter(n => !isNaN(n))
    return nums.length > 1 ? Math.max(...nums) : (nums[0] || 1)
  }
  if (skill.range_min !== undefined) {
    return Math.max(skill.range_min, skill.range_max || skill.range_min)
  }
  // 默认：近战=1, 远程=单位射程
  if (skill.category === 'melee') return 1
  if (skill.category === 'ranged' || skill.category === 'auto') return selectedUnit.value?.range || 2
  return selectedUnit.value?.range || 1
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
    params: { unit_id: String(unit.id), q, r, unit_data: unit }
  }).then(() => {
    addLog('deploy', `${unit.name} 部署 RoyRoy → ${formatCoord(q, r)}`)
    cancelAction()
    refreshState()
  }).catch(e => {
    addLog('error', `RoyRoy 部署失败: ${e.response?.data?.error || e.message}`)
  })
}

async function executeMove(tq, tr) {
  if (!selectedUnit.value) return
  const unit = selectedUnit.value
  const fromQ = unit.q, fromR = unit.r

  // Phase 2+3: 计算移动方向并设置朝向 + 移动状态
  const dir = computeDirection(fromQ, fromR, tq, tr)
  if (dir !== null) {
    setUnitVisual(unit.id, dir, 'move')
  } else {
    setUnitVisual(unit.id, null, 'move')
  }

  // Phase 3: 平滑位移 — 先发起 API，成功后启动 lerp 动画
  try {
    const fromCoord = formatCoord(fromQ, fromR)
    const { flatX: fromX, flatY: fromY } = pointyTopCenter(fromQ, fromR, HEX_RADIUS, spacingH, spacingV)
    const { flatX: toX, flatY: toY } = pointyTopCenter(tq, tr, HEX_RADIUS, spacingH, spacingV)

    await combatAPI.move(route.params.id, { unit_id: String(unit.id), target_q: tq, target_r: tr })
    const toCoord = formatCoord(tq, tr)
    addLog('move', `${unit.name} 从 ${fromCoord} 移动到 ${toCoord}`)

    // 启动 lerp 动画 (每格约 300ms)
    const distance = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2)
    const duration = Math.max(200, Math.min(600, distance * 2.5))
    actionMode.value = null

    startLerpAnimation(unit.id, { flatX: fromX, flatY: fromY }, { flatX: toX, flatY: toY }, duration, async () => {
      // lerp 完成后：刷新服务器状态 + 恢复 idle
      stopLerpAnimation(unit.id)
      await refreshState()
      setUnitVisual(unit.id, dir ?? 0, 'idle')
    })
  } catch (e) {
    addLog('error', `移动失败: ${e.response?.data?.error || e.message}`)
    // Phase 2+3: 移动失败恢复默认状态
    stopLerpAnimation(unit.id)
    setUnitVisual(unit.id, 0, 'idle')
    cancelAction()
  }
}

// ===== 跳过战术环节 =====
async function executeSkipTactical() {
  if (!selectedUnit.value) return
  try {
    await combatAPI.action(route.params.id, {
      actionType: 'skip_tactical',
      params: { unit_id: String(selectedUnit.value.id) }
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
      params: { unit_id: String(selectedUnit.value.id) }
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
      unit_id: String(selectedUnit.value.id),
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
  try {
    const attackType = (attacker.range || 1) > 1 ? 'ranged' : 'melee'
    const result = await combatAPI.attack(route.params.id, {
      attacker_id: String(attacker.id),
      target_id: String(target.id),
      attack_type: attackType,
    })
    if (result.data?.surprise_triggered) {
      addLog('action', `⚡ 奇袭触发！${attacker.name} vs ${target.name}`)
    } else {
      addLog('attack', `${attacker.name} 攻击 ${target.name} → 伤害 ${result.data?.combat_result?.final_damage ?? result.data?.combat_result?.damage ?? '?'}`)
    }
    actionMode.value = null
    await refreshState()
  } catch (e) {
    addLog('error', `攻击失败: ${e.response?.data?.error || e.message}`)
    cancelAction()
  }
}


// ===== Phase8: 手动掷骰系统 =====
function parseDiceType(diceStr) {
  const m = String(diceStr || '1d6').match(/^(\d+)d(\d+)$/i)
  return m ? { count: parseInt(m[1]), sides: parseInt(m[2]) } : { count: 1, sides: 6 }
}

function rollDice(diceStr) {
  const { count, sides } = parseDiceType(diceStr)
  let t = 0
  for (let i = 0; i < count; i++) t += Math.floor(Math.random() * sides) + 1
  return t
}

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
  if (pendingAttackPayload.skill.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pendingAttackPayload.skill.id)) {
    payload.skill_id = pendingAttackPayload.skill.id
  }
  try {
    const result = await combatAPI.attack(route.params.id, payload)
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
    if (skill.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(skill.id)) {
      attackPayload.skill_id = skill.id
    }
    const result = await combatAPI.attack(route.params.id, attackPayload)
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
    await combatAPI.endTurn(route.params.id)
    addLog('turn', '===== 回合结束 =====')
    await refreshState()
  } catch (e) {
    addLog('error', `结束回合失败: ${e.response?.data?.error || e.message}`)
  }
}

async function refreshState() {
  const { data } = await combatAPI.getBattleState(route.params.id)
  battleState.value = data.battle || data
  // Preserve selection if unit still exists
  if (selectedUnit.value) {
    const found = allUnits.value.find(u => u.id === selectedUnit.value.id)
    if (found) selectedUnit.value = found
    else selectedUnit.value = null
  }
  // Phase 2+3: 全局刷新后将所有 unit actionState 恢复 idle（保持 direction）
  // Phase 3: 清除过期的 lerp 动画状态
  const allUnitIds = allUnits.value.map(u => u.id)
  unitSpriteState.forEach((state, id) => {
    unitSpriteState.set(id, { direction: state.direction, actionState: 'idle' })
  })
  // 清除已不在场上单位的 lerp 状态
  unitLerpState.forEach((_, id) => {
    if (!allUnitIds.includes(id)) unitLerpState.delete(id)
  })
  // 刷新词条库配置（确保战场显示最新数值）
  loadGlossaryConfig().catch(() => {})
  loadViewConfig().catch(() => {})
  loadViewConfig().catch(() => {})
  // 加载阵营冷却和胜利条件
  loadFactionRoles(); loadFactionCooldowns().catch(() => {})
  loadVictoryInfo().catch(() => {})
  hexGrid.value?.redraw()
}

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

// ===== Deploy =====
function startDeployUnit(unit) {
  if (!isDeployPhase.value) return
  selectedDeployUnit.value = unit
  addLog('info', `选择部署: ${unit.name || 'Unit-'+unit.id}`)
}

async function deployToHex(q, r) {
  if (!selectedDeployUnit.value || deploying.value) return
  deploying.value = true
  const unit = selectedDeployUnit.value
  try {
    // Phase 14: 部署前清洗装备数据
    sanitizeUnitEquipment(unit)
    await combatAPI.deployUnit(route.params.id, { unit_id: String(unit.id), q, r, unit_data: unit })
    addLog('deploy', `${unit.name} 部署到 ${formatCoord(q, r)}`)
    selectedDeployUnit.value = null
    await refreshState()
    // Remove from pool
    const idx = deployPool.value.findIndex(u => u.id === unit.id)
    if (idx >= 0) deployPool.value.splice(idx, 1)
  } catch (e) {
    addLog('error', `部署失败: ${e.response?.data?.error || e.message}`)
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
    // 加载 3D 视角配置 (静默拉取，战场端不提供 UI 调节)
    loadViewConfig().catch(() => {})
  loadGlossaryConfigForDice().catch(() => {})
  try {
    const { data } = await combatAPI.getBattleState(route.params.id)
    battleState.value = data.battle || data
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

    addLog('system', `进入战场: ${battleState.value?.map_name || '未知'} | ${battlefieldSize.value}`)
    // 加载词条库配置（动态技能参数同步）
    loadGlossaryConfig().catch(() => {})
    // 加载阵营冷却 & 胜利条件
    loadFactionRoles(); loadFactionCooldowns().catch(() => {})
    loadVictoryInfo().catch(() => {})
  } catch (e) {
    console.error('[BattleInit] getBattleState 失败:', e.message || e)
    // 自动创建战斗会话
    try {
      const res = await combatAPI.createBattle({ battlefield_id: 1 })
      const newId = res.data?.id || res.data?.battle?.id || res.data?.battle_id || route.params.id
      if (newId !== route.params.id) {
        router.replace('/battle/' + newId)
        return
      }
      const { data: bd } = await combatAPI.getBattleState(newId)
      battleState.value = bd.battle || bd
    } catch (createErr) {
      console.warn('[BattleInit] auto-create failed:', createErr.message || createErr)
    }
    phaseText.value = '部署阶段'
    isDeployPhase.value = true
    await loadDeployPool()
    addLog('system', battleState.value ? ('进入战场: ' + (battleState.value.map_name || '已创建')) : '进入离线部署模式')
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
  window.addEventListener('resize', initFloatingCardPositions)

  // Canvas 初始化已迁移至 HexGridCanvas 组件内部
  // initCanvas()
  // 事件处理已迁移至 HexGridCanvas 组件 (hex-click/hex-hover emit)
})

// Update faction_turn display
watch(() => battleState.value?.faction_turn, (val) => {
  if (val) phaseText.value = `行动中: ${getFactionLabel(val)}`
})

onUnmounted(() => {
  document.removeEventListener('keydown', onDiceKeyDown)
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  window.removeEventListener('resize', initFloatingCardPositions)
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
/* ===== DM Layout ===== */
.dm-battle-layout {
  display: flex;
  height: 100vh;
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

/* Canvas — 沙盒隔离容器（脱离流式布局，独立滚动）*/
.game-canvas-sandbox {
  position: relative;
  overflow: hidden;
  flex: 1;
  min-height: 0;
  background: #061218;
  border: 1px solid rgba(255,176,0,0.08);
  contain: layout;
}

.canvas-container {
  position: relative;
}

.canvas-container canvas {
  display: block;
}

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

.fu-fill.hp { background: #13ff43; }
.fu-fill.shield { background: #00b4dc; }

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
</style>