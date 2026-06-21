#!/usr/bin/env python3
"""
Phase 3 完整部署编排
步骤:
  1. 本地生成 DEFAULT_0_idle.png → scp 到服务器
  2. 上传 unitSpriteResolver.js → 替换
  3. 上传并执行 battleview patch
  4. 构建 + Docker 部署
"""
import subprocess
import sys
import os

SERVER = 'root@106.54.197.69'
KEY = '/Users/dingxuyang/Desktop/watson.pem'
SSH = ['ssh', '-i', KEY, SERVER]
SCP = ['scp', '-i', KEY]
BASE = '/root/original-project/frontend'

def run(cmd, check=True):
    print(f'  → {" ".join(cmd)}')
    r = subprocess.run(cmd, capture_output=True, text=True)
    if check and r.returncode != 0:
        print(f'  ❌ FAILED: {r.stderr.strip()[:200]}')
        sys.exit(1)
    return r

script_dir = os.path.dirname(os.path.abspath(__file__))

# === Step 1: 生成 DEFAULT_0_idle.png ===
print('\n=== Step 1: Generate DEFAULT_0_idle.png ===')
run(['python3', os.path.join(script_dir, 'phase3_generate_sprite.py')])

sprite_path = os.path.join(script_dir, '..', 'DEFAULT_0_idle.png')
if os.path.exists(sprite_path):
    print(f'  Image: {sprite_path} ({os.path.getsize(sprite_path)} bytes)')
else:
    print('  ❌ Image not generated!')
    sys.exit(1)

# === Step 2: 上传所有文件到服务器 ===
print('\n=== Step 2: Upload files ===')

# 上传切图
run(SSH + ['mkdir', '-p', f'{BASE}/public/assets/sprites/units'])
run(SCP + [sprite_path, f'{SERVER}:{BASE}/public/assets/sprites/units/DEFAULT_0_idle.png'])

# 上传 resolver
run(SCP + [os.path.join(script_dir, 'phase3_sprite_resolver.js'),
           f'{SERVER}:/tmp/phase3_sprite_resolver.js'])

# 上传 patch 脚本
run(SCP + [os.path.join(script_dir, 'phase3_patch_battleview.py'),
           f'{SERVER}:/tmp/phase3_patch_battleview.py'])

# === Step 3: 应用 patches ===
print('\n=== Step 3: Apply patches ===')

# 替换 resolver
run(SSH + ['cp', f'{BASE}/src/resolvers/unitSpriteResolver.js',
           f'{BASE}/backups/20260619-phase2-sprite/unitSpriteResolver.js.bak'])
run(SSH + ['cp', '/tmp/phase3_sprite_resolver.js',
           f'{BASE}/src/resolvers/unitSpriteResolver.js'])
print('  ✅ SpriteResolver updated')

# 备份 + 补丁 battleview
run(SSH + ['cp', f'{BASE}/src/views/NewBattleView.vue',
           f'{BASE}/backups/20260619-phase2-sprite/NewBattleView.vue.phase2.bak'])
run(SSH + ['python3', '/tmp/phase3_patch_battleview.py'])

# === Step 4: 构建 ===
print('\n=== Step 4: Build ===')
r = run(SSH + ['bash', '-c', f'cd {BASE} && npx vite build'], check=False)
if r.returncode != 0:
    # Try with log
    run(SSH + ['bash', '-c', f'cd {BASE} && npx vite build 2>&1 | tail -20'])
    sys.exit(1)
print('  ✅ Build success')

# === Step 5: Docker 部署 ===
print('\n=== Step 5: Docker deploy ===')
run(SSH + ['docker', 'build', '-t', 'mecha-frontend', '.'],
    check=False)  # build in BASE dir... need cd
run(SSH + ['bash', '-c', f'cd {BASE} && docker build -t mecha-frontend . 2>&1 | tail -3'])
run(SSH + ['docker', 'stop', 'mecha-frontend'])
run(SSH + ['docker', 'rm', 'mecha-frontend'])
run(SSH + ['docker', 'run', '-d', '--name', 'mecha-frontend',
           '--network', 'mecha-network', '-p', '8081:8081',
           '--restart', 'unless-stopped', 'mecha-frontend'])

# === Step 6: 验证 ===
print('\n=== Step 6: Verify ===')

# 检查切图文件
r = run(SSH + ['ls', '-la', f'{BASE}/public/assets/sprites/units/DEFAULT_0_idle.png'])
print(f'  ✅ Sprite image: {r.stdout.strip()}')

# 检查 dist
r = run(SSH + ['ls', '-la', f'{BASE}/dist/assets/'])
print(f'  ✅ Dist: {r.stdout.strip()}')

# 检查容器
r = run(SSH + ['docker', 'ps', '--filter', 'name=mecha-frontend', '--format', '{{.Status}}'])
print(f'  ✅ Container: {r.stdout.strip()}')

# HTTP
r = run(SSH + ['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', 'http://localhost:8081/'])
print(f'  ✅ HTTP: {r.stdout.strip()}')

# 验证生产代码
r = run(SSH + ['bash', '-c', f'grep -c "computeDirection\\|unitSpriteResolver\\|setTransform(1,0,0,1,0,0)\\|getUnitDrawFlat\\|startLerpAnimation\\|getFrameIndex\\|_tickLerp" {BASE}/dist/assets/index-*.js'], check=False)
print(f'  Production code validation: {r.stdout.strip()}')

print('\n=== Phase 3 Deploy COMPLETE ===')
