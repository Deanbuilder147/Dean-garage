#!/usr/bin/env python3
"""Phase 2 部署脚本：hexUtils 扩展 + Sprite Resolver 创建 + NewBattleView 重构 + 构建发布"""
import subprocess, os, sys

REMOTE = "root@106.54.197.69"
KEY = "/Users/dingxuyang/Desktop/watson.pem"
PROJECT = "/root/original-project/frontend"
LOCAL = "/Users/dingxuyang/CodeBuddy/20260604120036/fix_scripts"

def ssh(cmd):
    full = f"ssh -i {KEY} {REMOTE} '{cmd}'"
    result = subprocess.run(full, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"SSH FAILED [{result.returncode}]: {result.stderr[:300]}")
    return result.stdout

def scp(local, remote):
    full = f"scp -i {KEY} {local} {REMOTE}:{remote}"
    result = subprocess.run(full, shell=True, capture_output=True, text=True)
    return result.returncode == 0

steps = [
    ("上传 hexUtils 补丁", f"scp {LOCAL}/phase2_patch_hexutils.py {REMOTE}:/tmp/"),
    ("上传 SpriteResolver", f"scp {LOCAL}/unitSpriteResolver.js {REMOTE}:/tmp/"),
    ("上传 BattleView 补丁", f"scp {LOCAL}/phase2_patch_battleview.py {REMOTE}:/tmp/"),
]

for label, cmd in steps:
    print(f"  {label}...")
    ok = subprocess.run(cmd, shell=True, capture_output=True).returncode == 0
    print(f"    {'OK' if ok else 'FAILED'}")
    if not ok:
        sys.exit(1)

print()

# Step 1: 执行 hexUtils 补丁
print("=== Step 1: hexUtils.js 扩展 ===")
print(ssh("python3 /tmp/phase2_patch_hexutils.py"))

# Step 2: 部署 Sprite Resolver
print("\n=== Step 2: unitSpriteResolver.js 部署 ===")
ssh("mkdir -p /root/original-project/frontend/src/resolvers")
print(ssh("cp /tmp/unitSpriteResolver.js /root/original-project/frontend/src/resolvers/unitSpriteResolver.js && echo 'OK'"))

# Step 3: 执行 NewBattleView 补丁
print("\n=== Step 3: NewBattleView.vue 补丁 ===")
print(ssh("python3 /tmp/phase2_patch_battleview.py"))

# Step 4: vite build
print("\n=== Step 4: Vite Build ===")
build_out = ssh(f"cd {PROJECT} && npx vite build 2>&1")
# show only last 15 lines
lines = build_out.split('\n')
for line in lines[-15:]:
    print(f"  {line}")
if 'error' in build_out.lower() and 'Build' not in build_out:
    print("  WARNING: potential build errors detected")

# Step 5: Docker rebuild + deploy
print("\n=== Step 5: Docker Rebuild & Deploy ===")
ssh(f"cd {PROJECT} && docker build -t mecha-frontend . 2>&1 | tail -3")
ssh("docker stop mecha-frontend 2>&1 || true")
ssh("docker rm mecha-frontend 2>&1 || true")
deploy_out = ssh("docker run -d --name mecha-frontend --network mecha-network -p 8081:8081 --restart unless-stopped mecha-frontend 2>&1")
print(f"  Container: {deploy_out.strip()}")

# Step 6: Health check
print("\n=== Step 6: Health Check ===")
import time
time.sleep(2)
health = ssh("docker ps --filter name=mecha-frontend --format '{{.Status}}'")
http_code = ssh("curl -s -o /dev/null -w '%{http_code}' http://localhost:8081/")
print(f"  Status: {health.strip()}")
print(f"  HTTP:   {http_code.strip()}")

# Step 7: Cleanup
print("\n=== Step 7: Cleanup ===")
ssh("rm -f /tmp/phase2_patch_hexutils.py /tmp/unitSpriteResolver.js /tmp/phase2_patch_battleview.py")
print("  Temp files cleaned")

print("\n=== Phase 2 部署完成 ===")
