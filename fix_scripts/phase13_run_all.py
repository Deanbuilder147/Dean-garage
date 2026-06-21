#!/usr/bin/env python3
"""
Phase 13 Master Runner — 顺序执行所有补丁
用法: python3 phase13_run_all.py [--apply] [--dry-run]
"""
import os
import sys
import subprocess
import shutil
from datetime import datetime

SERVER_BASE = "/root/original-project"
PATCH_DIR = os.path.dirname(os.path.abspath(__file__))

PATCHES = [
    {
        "name": "Task 1-A: Map List Endpoint",
        "script": "phase13_01_map_list_endpoint.py",
        "files": [f"{SERVER_BASE}/services/map-service/src/index.js"],
    },
    {
        "name": "Task 1-B: Battlefield Map List Dropdown",
        "script": "phase13_02_battlefield_map_list.py",
        "files": [f"{SERVER_BASE}/frontend/src/views/NewBattlefieldView.vue"],
    },
    {
        "name": "Task 2-A: Terrain Sanitizer",
        "script": "phase13_03_terrain_sanitizer.py",
        "files": [f"{SERVER_BASE}/frontend/src/views/NewBattleView.vue"],
    },
    {
        "name": "Task 2-B: Draw Adapter",
        "script": "phase13_05_draw_adapter.py",
        "files": [f"{SERVER_BASE}/frontend/src/views/NewBattlefieldView.vue"],
    },
    {
        "name": "Task 3: Floating Draggable Cards",
        "script": "phase13_04_floating_cards.py",
        "files": [f"{SERVER_BASE}/frontend/src/views/NewBattleView.vue"],
    },
    {
        "name": "API Client + Map Service Enhance",
        "script": "phase13_06_api_client.py",
        "files": [
            f"{SERVER_BASE}/frontend/src/api/client.js",
            f"{SERVER_BASE}/services/map-service/src/index.js",
        ],
    },
]

def backup():
    """备份所有将被修改的文件"""
    backup_dir = f"/tmp/phase13_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    os.makedirs(backup_dir, exist_ok=True)
    files_backed = 0
    for patch in PATCHES:
        for f in patch["files"]:
            if os.path.exists(f):
                dest = os.path.join(backup_dir, os.path.basename(f))
                shutil.copy2(f, dest)
                files_backed += 1
            else:
                print(f"  [WARN] File not found: {f}")
    print(f"[Backup] {files_backed} files backed up to {backup_dir}")
    return backup_dir

def apply_patches(dry_run=False):
    """顺序执行所有补丁脚本"""
    os.chdir(PATCH_DIR)
    
    for i, patch in enumerate(PATCHES):
        print(f"\n{'='*60}")
        print(f"[{i+1}/{len(PATCHES)}] {patch['name']}")
        print(f"  Script: {patch['script']}")
        for f in patch["files"]:
            exists = os.path.exists(f)
            print(f"  Target: {f} {'✓' if exists else '✗ NOT FOUND'}" if not dry_run else f"  Target: {f}")
        
        if dry_run:
            print(f"  [DRY-RUN] Would execute: python3 {patch['script']}")
            continue
        
        try:
            result = subprocess.run(
                ['python3', patch['script']],
                capture_output=True, text=True, timeout=30
            )
            print(result.stdout.strip())
            if result.stderr:
                print(f"  [STDERR] {result.stderr.strip()}")
            if result.returncode != 0:
                print(f"  [ERROR] Script returned non-zero: {result.returncode}")
        except Exception as e:
            print(f"  [ERROR] Failed to run {patch['script']}: {e}")
    
    print(f"\n{'='*60}")
    print("[Phase13] All patches applied.")

def verify():
    """验证关键文件的修改"""
    print("\n[Verify] Checking key modifications...")
    
    checks = [
        ("Map List Endpoint", f"{SERVER_BASE}/services/map-service/src/index.js", "/api/map/list"),
        ("Floating Card", f"{SERVER_BASE}/frontend/src/views/NewBattleView.vue", "floating-card"),
        ("Terrain Sanitizer", f"{SERVER_BASE}/frontend/src/views/NewBattleView.vue", "sanitizeTerrainCell"),
        ("Map Dropdown", f"{SERVER_BASE}/frontend/src/views/NewBattlefieldView.vue", "map-load-select"),
        ("Draw Adapter", f"{SERVER_BASE}/frontend/src/views/NewBattlefieldView.vue", "extractTerrainId"),
        ("API Client", f"{SERVER_BASE}/frontend/src/api/client.js", "getMapList"),
    ]
    
    all_ok = True
    for name, filepath, keyword in checks:
        if not os.path.exists(filepath):
            print(f"  ✗ [{name}] File not found: {filepath}")
            all_ok = False
            continue
        with open(filepath, 'r') as f:
            content = f.read()
        if keyword in content:
            print(f"  ✓ [{name}] Found: {keyword}")
        else:
            print(f"  ✗ [{name}] NOT found: {keyword}")
            all_ok = False
    
    return all_ok

if __name__ == '__main__':
    dry_run = '--dry-run' in sys.argv
    skip_apply = '--verify-only' in sys.argv
    
    if dry_run:
        print("[Phase13] DRY RUN MODE — 不会实际修改文件\n")
    
    if not skip_apply:
        backup_dir = backup() if not dry_run else None
        
        print(f"\n{'='*60}")
        print("[Phase13] 正在应用补丁...")
        print(f"{'='*60}")
        apply_patches(dry_run=dry_run)
    
    if verify():
        print("\n[Verify] ✓ 所有修改验证通过")
    else:
        print("\n[Verify] ⚠ 部分修改验证失败，请检查上述输出")
