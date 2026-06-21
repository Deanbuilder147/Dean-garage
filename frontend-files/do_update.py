import re
path = '/root/original-project/frontend/src/main.js'
with open(path) as f: c = f.read()
if "import './styles/tailwind.css'" not in c:
    c = c.replace("import './styles/variables.css';", "import './styles/variables.css';\nimport './styles/tailwind.css';")
ni = """// 新版 stitch_ui 视图
import NewHomeView from './views/NewHomeView.vue';
import NewUnitEditorView from './views/NewUnitEditorView.vue';
import NewBattlefieldView from './views/NewBattlefieldView.vue';
import NewBattlefieldSelector from './views/NewBattlefieldSelector.vue';
import NewBattleView from './views/NewBattleView.vue';
import NewPreparationRoom from './views/NewPreparationRoom.vue';
import NewLoginView from './views/NewLoginView.vue';
import NewRegisterView from './views/NewRegisterView.vue';"""
if 'NewHomeView' not in c:
    c = c.rstrip() + '\n' + ni + '\n'
rn = """  { path: '/login', component: NewLoginView },
  { path: '/register', component: NewRegisterView },
  { path: '/home', component: NewHomeView, meta: { requiresAuth: true } },
  { path: '/units', component: NewUnitEditorView, meta: { requiresAuth: true } },
  { path: '/units/new', component: NewUnitEditorView, meta: { requiresAuth: true } },
  { path: '/units/:id', component: NewUnitEditorView, meta: { requiresAuth: true } },
  { path: '/battlefields', component: NewBattlefieldSelector, meta: { requiresAuth: true } },
  { path: '/battlefield-edit', component: NewBattlefieldView, meta: { requiresAuth: true } },
  { path: '/battle/:id', component: NewBattleView, meta: { requiresAuth: true } },
  { path: '/preparation/:roomId', component: NewPreparationRoom, meta: { requiresAuth: true } }"""
c = re.sub(r"  \{ path: '/home', component: HomeView.*?\{ path: '/preparation/:roomId', component: PreparationRoom, meta: \{ requiresAuth: true \} \}\n\];", rn + '\n];', c, flags=re.DOTALL)
with open(path, 'w') as f: f.write(c)
print('main.js OK')
idx = '/root/original-project/frontend/index.html'
with open(idx) as f: h = f.read()
if 'Space+Grotesk' not in h:
    fonts = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@300;400;500&family=Space+Grotesk:wght@300;400;500;600;700;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">\n<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght@20..48,100..700&display=swap" rel="stylesheet">\n'
    h = h.replace('<head>', '<head>\n' + fonts)
    with open(idx, 'w') as f: f.write(h)
    print('index.html OK')
print('ALL DONE')
