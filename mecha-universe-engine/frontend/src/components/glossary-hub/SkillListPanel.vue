<template>
  <div class="skill-list-panel">
    <div class="slp-toolbar">
      <div class="slp-cats">
        <button v-for="c in categories" :key="c.value"
                :class="['slp-cat', { active: activeCat === c.value }]"
                @click="$emit('update:activeCat', c.value)">
          {{ c.short }}
        </button>
      </div>
      <button class="slp-new" @click="$emit('create')" title="新建一条技能草稿（生成六段式骨架）">＋ 新建技能</button>
    </div>

    <div class="slp-search">
      <input v-model="search" placeholder="搜索词条名 / key…" />
    </div>

    <div class="slp-list">
      <div v-for="item in filtered" :key="item.key"
           :class="['slp-item', { selected: item.key === selectedKey }]"
           @click="$emit('select', item.key)">
        <span class="slp-name">{{ item.name || item.key }}</span>
        <span class="slp-key">{{ item.key }}</span>
        <span class="slp-badges">
          <span class="slp-lock" v-if="item.core" title="核心技能：受保护，不可删改">🔒</span>
          <span class="slp-dirty" v-if="item.dirty" title="本地草稿有未保存修改">⚡</span>
        </span>
      </div>
      <div v-if="filtered.length === 0" class="slp-empty">无匹配词条</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  skills: { type: Object, required: true },     // { key: skillObj }
  selectedKey: { type: String, default: '' },
  activeCat: { type: String, default: 'all' },
  coreKeys: { type: Array, default: () => [] },
  dirtyKeys: { type: Array, default: () => [] }
})
defineEmits(['select', 'update:activeCat', 'create'])

const categories = [
  { value: 'all', label: '全部 / All', short: '全部' },
  { value: 'skill', label: '技能 / Skill', short: '技能' },
  { value: 'special', label: '特殊 / Special', short: '特殊' },
  { value: 'faction', label: '阵营 / Faction', short: '阵营' }
]

const search = ref('')

function entryTypeOf(s) {
  if (s.entryType) return s.entryType
  if (s.type === 'passive' || s.type === 'active') return 'skill'
  return 'skill'
}

const filtered = computed(() => {
  const coreSet = new Set(props.coreKeys)
  const dirtySet = new Set(props.dirtyKeys)
  let arr = Object.entries(props.skills || {}).map(([key, s]) => ({
    key,
    name: s.name || s.label || key,
    entryType: entryTypeOf(s),
    core: coreSet.has(key),
    dirty: dirtySet.has(key)
  }))
  if (props.activeCat !== 'all') {
    arr = arr.filter(i => i.entryType === props.activeCat)
  }
  const q = search.value.trim().toLowerCase()
  if (q) arr = arr.filter(i => i.name.toLowerCase().includes(q) || i.key.toLowerCase().includes(q))
  return arr
})
</script>

<style scoped>
.skill-list-panel { display: flex; flex-direction: column; height: 100%; gap: 8px; }
.slp-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; }
.slp-title { font-size: 13px; font-weight: 600; color: #c1e8ff; letter-spacing: 0.5px; }
.slp-new { background: rgba(255,176,0,0.16); border: 1px solid rgba(255,176,0,0.55); color: #ffb000;
  border-radius: 6px; padding: 5px 10px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.slp-new:hover { background: rgba(255,176,0,0.28); }
.slp-cats { display: flex; gap: 4px; flex-wrap: wrap; }
.slp-cat { background: transparent; border: 1px solid rgba(159,142,120,0.25); border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px; color: #9fb0c4; }
.slp-cat.active { border-color: #ffb000; }
.slp-search input { width: 100%; box-sizing: border-box; background: #0f131c; border: 1px solid rgba(159,142,120,0.25);
  border-radius: 6px; color: #c1e8ff; padding: 6px 10px; font-size: 13px; }
.slp-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.slp-item { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 6px;
  background: rgba(255,255,255,0.02); border: 1px solid transparent; cursor: pointer; }
.slp-item:hover { background: rgba(255,176,0,0.08); }
.slp-item.selected { background: rgba(255,176,0,0.16); border-color: rgba(255,176,0,0.55); }
.slp-name { font-weight: 600; color: #c1e8ff; font-size: 11px; }
.slp-key { font-size: 11px; color: #6b7a8f; }
.slp-badges { margin-left: auto; display: flex; gap: 4px; }
.slp-lock { font-size: 13px; opacity: 0.7; }
.slp-dirty { color: #ffb000; font-size: 13px; }
.slp-empty { color: #6b7a8f; text-align: center; padding: 16px; }

/* 类型图例徽标（与编辑器一致） */
.vg-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.entry-skill { background: rgba(0,180,220,0.15); color: #00b4dc; }
.entry-special { background: rgba(255,176,0,0.15); color: #ffb000; }
.entry-faction { background: rgba(120,200,120,0.15); color: #78c878; }
</style>
