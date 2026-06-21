#!/usr/bin/env python3
"""Convert stitch_ui HTML files to Vue 3 SFC components."""
import re, os

STITCH = '/root/stitch_ui_20260609161126'
VIEWS = '/root/original-project/frontend/src/views'

def extract_body(html):
    """Extract body content, stripping CDN links and tailwind-config."""
    # Remove doctype and head
    body = re.sub(r'<!DOCTYPE.*?<head>', '', html, flags=re.DOTALL)
    body = re.sub(r'</head>', '', body)
    # Remove tailwind CDN scripts and config
    body = re.sub(r'<script src="https://cdn.tailwindcss.com[^>]*></script>', '', body)
    body = re.sub(r'<script id="tailwind-config">.*?</script>', '', body, flags=re.DOTALL)
    # Remove google font links (we handle in index.html)
    body = re.sub(r'<link href="https://fonts.googleapis.com[^>]*>', '', body)
    body = re.sub(r'<link href="https://fonts.googleapis.com[^>]*>', '', body)
    body = re.sub(r'<link href="https://fonts.googleapis.com[^>]*>', '', body)
    # Remove title
    body = re.sub(r'<title>.*?</title>', '', body)
    # Remove <style> blocks inside head
    body = re.sub(r'<style>.*?</style>', '', body, flags=re.DOTALL)
    # Remove html, body opening/closing tags
    body = re.sub(r'<html[^>]*>', '', body)
    body = re.sub(r'</html>', '', body)
    body = re.sub(r'<body[^>]*>', '', body)
    body = re.sub(r'</body>', '', body)
    # Fix self-closing tags for Vue compatibility
    body = body.replace('<br/>', '<br/>')
    # Convert <a href="#"> to <router-link to="...">
    # Leave as-is - we'll handle in template
    return body.strip()

def get_script(component_name):
    """Return appropriate script setup for each component."""
    scripts = {
        'LoginView': '''<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { authAPI } from '../api/client'

const router = useRouter()
const username = ref('')
const password = ref('')
const error = ref('')

async function handleLogin() {
  if (!username.value || !password.value) {
    error.value = '请输入 PILOT_ID 和 Cipher Key'
    return
  }
  try {
    const res = await authAPI.login({ username: username.value, password: password.value })
    localStorage.setItem('token', res.data.token)
    router.push('/home')
  } catch (err) {
    error.value = err.response?.data?.error || '认证失败'
  }
}
</script>''',
        'RegisterView': '''<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { authAPI } from '../api/client'

const router = useRouter()
const username = ref('')
const email = ref('')
const password = ref('')
const verifyPassword = ref('')
const error = ref('')

async function handleRegister() {
  if (!username.value || !password.value) {
    error.value = '请输入必填字段'
    return
  }
  if (password.value !== verifyPassword.value) {
    error.value = 'VERIFY_KEY 不匹配'
    return
  }
  try {
    await authAPI.register({ username: username.value, password: password.value })
    router.push('/')
  } catch (err) {
    error.value = err.response?.data?.error || '注册失败'
  }
}
</script>''',
        'HomeView': '''<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'

const router = useRouter()
const userStore = useUserStore()
const user = computed(() => userStore.user)

function handleLogout() {
  localStorage.removeItem('token')
  userStore.clearUser()
  router.push('/')
}

function navigateTo(path) { router.push(path) }
</script>''',
        'BattlefieldSelector': '''<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { mapAPI, commAPI } from '../api/client'

const router = useRouter()
const battlefields = ref([])
const currentIndex = ref(0)
const loading = ref(false)

const battlefieldNames = ['Ignis Sanctum', 'FROST_GATE', 'NEON_WILDS', 'DUNE_RAIL', 'SKY_BASTION']

onMounted(async () => {
  try { const res = await mapAPI.getBattlefields(); battlefields.value = res.data.battlefields || []; } catch(e) {}
})

async function initiateMission() {
  loading.value = true
  try {
    const bf = battlefields.value[currentIndex.value] || { id: 'default' }
    const res = await commAPI.createRoom({ battlefield_id: bf.id })
    router.push('/preparation/' + res.data.room_id)
  } catch(e) {
    router.push('/preparation/default')
  }
  loading.value = false
}

function prevMap() { currentIndex.value = (currentIndex.value - 1 + 5) % 5 }
function nextMap() { currentIndex.value = (currentIndex.value + 1) % 5 }

function handleLogout() {
  localStorage.removeItem('token')
  router.push('/')
}
</script>''',
        'BattlefieldView': '''<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { mapAPI } from '../api/client'

const router = useRouter()
const battlefield = ref({ name: 'NEO_TOKYO_RUINS', terrain: 'empty' })

function navigateTo(path) { router.push(path) }
function handleLogout() { localStorage.removeItem('token'); router.push('/') }

onMounted(async () => {
  try { const res = await mapAPI.getBattlefields(); } catch(e) {}
})
</script>''',
        'PreparationRoom': '''<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { commAPI, hangarAPI } from '../api/client'

const router = useRouter()
const route = useRoute()
const roomId = computed(() => route.params.roomId)
const roomState = ref({ players: [], status: 'waiting' })
const myUnits = ref([])
const selectedUnits = ref([])
const myFaction = ref(null)
const loading = ref(true)

const MAX_UNITS = 3

onMounted(async () => {
  await loadRoomInfo()
  await loadMyUnits()
})

async function loadRoomInfo() {
  try {
    const res = await commAPI.getRoom(roomId.value)
    if (res.data) roomState.value = res.data
  } catch(e) { console.error(e) }
  loading.value = false
}

async function loadMyUnits() {
  try {
    const res = await hangarAPI.getUnits()
    myUnits.value = res.data.units || []
  } catch(e) {}
}

function navigateTo(path) { router.push(path) }
function handleLogout() { localStorage.removeItem('token'); router.push('/') }

async function startBattle() {
  try {
    const res = await commAPI.sendMessage(roomId.value, { action: 'start' })
    if (res.data?.battle_id) router.push('/battle/' + res.data.battle_id)
  } catch(e) {}
}
</script>''',
        'BattleView': '''<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { combatAPI } from '../api/client'

const router = useRouter()
const route = useRoute()
const battleId = ref(route.params.id)
const battleState = ref({ turn: 1, units: [], phase: 'action' })
const terminalLogs = ref([])

onMounted(async () => {
  try {
    const res = await combatAPI.getBattleState(battleId.value)
    if (res.data) battleState.value = res.data
  } catch(e) {}
})

function navigateTo(path) { router.push(path) }
function handleLogout() { localStorage.removeItem('token'); router.push('/') }
</script>''',
        'UnitEditorView': '''<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { hangarAPI } from '../api/client'

const router = useRouter()
const units = ref([])
const selectedUnit = ref(null)
const editing = ref(false)

onMounted(async () => {
  try {
    const res = await hangarAPI.getUnits()
    units.value = res.data.units || []
    if (units.value.length) selectUnit(units.value[0])
  } catch(e) {}
})

function selectUnit(unit) {
  selectedUnit.value = { ...unit }
  editing.value = true
}

async function saveUnit() {
  try {
    await hangarAPI.updateUnit(selectedUnit.value.id, selectedUnit.value)
    await loadUnits()
  } catch(e) {}
}

async function loadUnits() {
  const res = await hangarAPI.getUnits()
  units.value = res.data.units || []
}

async function discardChanges() {
  if (units.value.length) selectUnit(units.value[0])
}

function navigateTo(path) { router.push(path) }
function handleLogout() { localStorage.removeItem('token'); router.push('/') }
</script>''',
    }
    return scripts.get(component_name, '<script setup>\nimport { useRouter } from \'vue-router\'\nconst router = useRouter()\nfunction handleLogout() { localStorage.removeItem(\'token\'); router.push(\'/\') }\nfunction navigateTo(path) { router.push(path) }\n</script>')

def get_footer():
    return '''<footer class="fixed bottom-0 w-full bg-slate-950/90 flex justify-between items-center px-4 py-1 z-50 border-t border-green-500/30 font-mono text-[10px] uppercase tracking-widest">
<div class="flex items-center gap-4">
<span class="text-green-400 font-bold">[ SYSTEM_STABLE // 12:04:99 ]</span>
<span class="text-green-900 opacity-60">SYNC_RATE: 98.4%</span>
</div>
<div class="flex items-center gap-6">
<span class="text-green-300">STATUS: OPTIMAL</span>
<span class="animate-pulse-slow text-green-400">[ OPERATIONAL ]</span>
</div>
</footer>'''

def convert_file(html_path, component_name):
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    body = extract_body(html)
    script = get_script(component_name)
    
    # Wrap in Vue SFC
    vue_content = f'''<template>
{body}
</template>

{script}

<style scoped>
/* Scoped styles - global animations in tailwind.css */
</style>'''
    
    output_path = os.path.join(VIEWS, f'{component_name}.vue')
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(vue_content)
    print(f'Created {output_path} ({len(vue_content)} chars)')

def main():
    mappings = [
        ('login_screen/code.html', 'NewLoginView'),
        ('register_screen/code.html', 'NewRegisterView'),
        ('home_screen/code.html', 'NewHomeView'),
        ('battlefield_selector/code.html', 'NewBattlefieldSelector'),
        ('battlefieldview/code.html', 'NewBattlefieldView'),
        ('preparation_room/code.html', 'NewPreparationRoom'),
        ('battle_scene/code.html', 'NewBattleView'),
        ('unit_editor/code.html', 'NewUnitEditorView'),
    ]
    
    for rel_path, comp_name in mappings:
        full_path = os.path.join(STITCH, rel_path)
        if os.path.exists(full_path):
            convert_file(full_path, comp_name)
        else:
            print(f'NOT FOUND: {full_path}')

if __name__ == '__main__':
    main()
