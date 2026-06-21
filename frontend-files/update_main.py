#!/usr/bin/env python3
import re

# Update main.js
path = '/root/original-project/frontend/src/main.js'
with open(path) as f: content = f.read()

# 1. Add tailwind CSS import
if "import './styles/tailwind.css'" not in content:
    content = content.replace(
        "import './styles/variables.css';",
        "import './styles/variables.css';\nimport './styles/tailwind.css';"
    )

# 2. Replace imports
old_imports = '''// 导入视图
import LoginView from './views/LoginView.vue';
import RegisterView from './views/RegisterView.vue';
import HomeView from './views/HomeView.vue';
import TerminalView from './views/TerminalView.vue';
import UnitEditorView from './views/UnitEditorView.vue';
import BattlefieldView from './views/BattlefieldView.vue';
import BattleView from './views/BattleView.vue';
import PreparationRoom from './views/PreparationRoom.vue';'''

new_imports = '''// 导入视图
import LoginView from './views/LoginView.vue';
import RegisterView from './views/RegisterView.vue';
import HomeView from './views/HomeView.vue';
import TerminalView from './views/TerminalView.vue';
import UnitEditorView from './views/UnitEditorView.vue';
import BattlefieldView from './views/BattlefieldView.vue';
import BattleView from './views/BattleView.vue';
import PreparationRoom from './views/PreparationRoom.vue';
// 新版 stitch_ui 视图
import NewHomeView from './views/NewHomeView.vue';
import NewUnitEditorView from './views/NewUnitEditorView.vue';
import NewBattlefieldView from './views/NewBattlefieldView.vue';
import NewBattlefieldSelector from './views/NewBattlefieldSelector.vue';
import NewBattleView from './views/NewBattleView.vue';
import NewPreparationRoom from './views/NewPreparationRoom.vue';
import NewLoginView from './views/NewLoginView.vue';
import NewRegisterView from './views/NewRegisterView.vue';'''

content = content.replace(old_imports, new_imports)

# 3. Replace routes
old_routes = '''// 路由配置
const routes = [
  { path: '/', component: TerminalView },
  { path: '/login', redirect: '/' },
  { path: '/register', redirect: '/' },
  { path: '/home', component: HomeView, meta: { requiresAuth: true } },
  { path: '/units', component: UnitEditorView, meta: { requiresAuth: true } },
  { path: '/units/new', component: UnitEditorView, meta: { requiresAuth: true } },
  { path: '/units/:id', component: UnitEditorView, meta: { requiresAuth: true } },
  { path: '/battlefields', component: BattlefieldView, meta: { requiresAuth: true } },
  { path: '/battle/:id', component: BattleView, meta: { requiresAuth: true } },
  { path: '/preparation/:roomId', component: PreparationRoom, meta: { requiresAuth: true } }
];'''

new_routes = '''// 路由配置
const routes = [
  { path: '/', component: TerminalView },
  { path: '/login', component: NewLoginView },
  { path: '/register', component: NewRegisterView },
  { path: '/home', component: NewHomeView, meta: { requiresAuth: true } },
  { path: '/units', component: NewUnitEditorView, meta: { requiresAuth: true } },
  { path: '/units/new', component: NewUnitEditorView, meta: { requiresAuth: true } },
  { path: '/units/:id', component: NewUnitEditorView, meta: { requiresAuth: true } },
  { path: '/battlefields', component: NewBattlefieldSelector, meta: { requiresAuth: true } },
  { path: '/battlefield-edit', component: NewBattlefieldView, meta: { requiresAuth: true } },
  { path: '/battle/:id', component: NewBattleView, meta: { requiresAuth: true } },
  { path: '/preparation/:roomId', component: NewPreparationRoom, meta: { requiresAuth: true } }
];'''

content = content.replace(old_routes, new_routes)
with open(path, 'w') as f: f.write(content)
print('main.js updated')

# Update index.html to add Google Fonts
idx_path = '/root/original-project/frontend/index.html'
with open(idx_path) as f: html = f.read()

fonts = '''<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@300;400;500&family=Space+Grotesk:wght@300;400;500;600;700;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght@20..48,100..700;20..48,100..1&display=swap" rel="stylesheet">
'''

if 'Space+Grotesk' not in html:
    html = html.replace('<head>', '<head>\n' + fonts)
    with open(idx_path, 'w') as f: f.write(html)
    print('index.html updated')

# Also update App.vue to remove old styles
app_path = '/root/original-project/frontend/src/App.vue'
with open(app_path) as f: app = f.read()
if 'tailwind' not in app.lower():
    # App.vue probably just has <router-view/>
    print(f'App.vue: {len(app)} chars, router-view found: {\"<router-view/>\" in app}')
print('Done')
