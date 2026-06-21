#!/usr/bin/env python3
"""Fix 5 files missing import { useUserStore } from '@/stores/user'"""

import os

base = '/root/original-project/frontend/src/views'

fixes = [
    ('NewHomeView.vue',
     "import { ref, computed } from 'vue'\nimport { useRouter } from 'vue-router'",
     "import { ref, computed } from 'vue'\nimport { useRouter } from 'vue-router'\nimport { useUserStore } from '@/stores/user'"),

    ('GlossaryView.vue',
     "import { ref, computed, onMounted } from 'vue'",
     "import { ref, computed, onMounted } from 'vue'\nimport { useUserStore } from '@/stores/user'"),

    ('NewUnitEditorView.vue',
     "import { ref, computed, onMounted } from 'vue'\nimport { useRouter } from 'vue-router'\nimport { hangarAPI } from '@/api/client'",
     "import { ref, computed, onMounted } from 'vue'\nimport { useRouter } from 'vue-router'\nimport { useUserStore } from '@/stores/user'\nimport { hangarAPI } from '@/api/client'"),

    ('NewBattlefieldSelector.vue',
     "import { ref, computed, onMounted } from \"vue\"\nimport { useRouter } from 'vue-router'\nimport { mapAPI, commAPI } from '@/api/client'",
     "import { ref, computed, onMounted } from \"vue\"\nimport { useRouter } from 'vue-router'\nimport { useUserStore } from '@/stores/user'\nimport { mapAPI, commAPI } from '@/api/client'"),

    ('NewPreparationRoom.vue',
     "import { ref, reactive, computed, onMounted } from 'vue'\nimport { useRoute, useRouter } from 'vue-router'\nimport { combatAPI, commAPI, hangarAPI } from '@/api/client'",
     "import { ref, reactive, computed, onMounted } from 'vue'\nimport { useRoute, useRouter } from 'vue-router'\nimport { useUserStore } from '@/stores/user'\nimport { combatAPI, commAPI, hangarAPI } from '@/api/client'"),
]

for filename, old, new in fixes:
    fpath = os.path.join(base, filename)
    with open(fpath, 'r') as f:
        content = f.read()
    if old in content:
        content = content.replace(old, new, 1)
        with open(fpath, 'w') as f:
            f.write(content)
        print(f'✅ {filename} — import added')
    else:
        print(f'❌ {filename} — pattern NOT FOUND')
        print(f'   Looking for: {old[:80]!r}...')
        print(f'   File starts: {content[:80]!r}...')
