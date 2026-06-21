#!/bin/bash
# Phase 9 Master Runner
set -e
echo "=== Phase 9: 关卡效能大跃进 ==="
cd /root/phase9-patches
python3 patch1_batch_terrain.py
python3 patch2_terrain_crud.py
python3 patch3_horizon_lock.py
python3 patch4_destructible_terrain.py
echo "=== All 4 patches applied ==="
