<template>
  <div class="gc-page">
    <header class="gc-header">
      <h1>词条库 · 立体展示<span class="en-sub">Glossary 3D Showcase</span></h1>
      <div class="gc-meta">词条数：<span class="en-sub">Count</span> {{ items.length }}</div>
    </header>

    <HexCarousel :items="items" v-model="active" />

    <section class="gc-detail" v-if="current">
      <h2>{{ current.title }}</h2>
      <div class="gc-grid">
        <div><span>标识<span class="en-sub">Key</span></span><b>{{ current.key }}</b></div>
        <div><span>分类<span class="en-sub">Category</span></span><b>{{ current.loc }}</b></div>
        <div><span>动作类型<span class="en-sub">Action Type</span></span><b>{{ current.entry.action_type || '—' }}</b></div>
        <div><span>基础伤害<span class="en-sub">Base Damage</span></span><b>{{ current.entry.base_damage ?? '—' }}</b></div>
      </div>
      <div class="gc-effects" v-if="current.entry.effects && current.entry.effects.length">
        <h3>效果<span class="en-sub">Effects</span>（{{ current.entry.effects.length }}）</h3>
        <pre>{{ JSON.stringify(current.entry.effects, null, 2) }}</pre>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import apiClient from '../api/client.js'
import { CATEGORY_LABELS } from '../contracts/skillContract.js'
import HexCarousel from '../components/HexCarousel.vue'

const raw = ref({})
const active = ref(0)

const items = computed(() =>
  Object.entries(raw.value || {}).map(([key, e]) => ({
    key,
    title: e.name || e.label || key,
    loc: CATEGORY_LABELS[e.category] || e.category || '未分类',
    entry: e,
  }))
)
const current = computed(() => items.value[active.value])

async function load() {
  try {
    const { data } = await apiClient.get('/combat-glossary/hub-config')
    if (data?.success) raw.value = data.glossary?.skills || {}
    else raw.value = data?.skills || {}
  } catch (e) {
    console.error('加载词条库失败', e)
  }
}

onMounted(load)
</script>

<style scoped>
.gc-page { max-width: 960px; margin: 0 auto; padding: 24px 16px; color: #e9eef7; }
.gc-header { display: flex; align-items: baseline; gap: 16px; margin-bottom: 8px; }
.gc-header h1 { font-size: 22px; letter-spacing: 3px; color: #cdd8ec; }
.gc-meta { font-size: 12px; color: #7e93b5; }
.gc-detail {
  margin-top: 26px; background: rgba(18,26,43,0.6);
  border: 1px solid rgba(120,140,180,0.18); border-radius: 12px; padding: 18px 22px;
}
.gc-detail h2 { font-size: 18px; color: #fff; margin-bottom: 14px; }
.gc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px 24px; }
.gc-grid div { display: flex; flex-direction: column; gap: 4px; }
.gc-grid span { font-size: 11px; color: #7e93b5; letter-spacing: 1px; }
.gc-grid b { font-size: 14px; color: #cfe0f5; font-weight: 600; }
.gc-effects { margin-top: 18px; }
.gc-effects h3 { font-size: 13px; color: #9fb2cc; margin-bottom: 8px; }
.gc-effects pre {
  background: #0c1322; border: 1px solid rgba(120,140,180,0.15);
  border-radius: 8px; padding: 12px; font-size: 12px; color: #9fd6ee;
  max-height: 280px; overflow: auto; white-space: pre-wrap;
}
</style>
