#!/bin/bash
echo "=== 查询用户房间 6398ef48 的结构 (含 mapId) ==="
curl -s http://localhost:8081/api/rooms/6398ef48-0b21-44f6-bd74-f4795abf22df | head -c 1200
echo ""
echo "=== 该房间 mapId 对应的是否存在于 maps 表 ==="
docker exec mecha-gateway sh -c "node -e \"const db=require('better-sqlite3')('/data/mecha-universe.db'); const r=db.prepare('SELECT id,map_id,battle_id FROM rooms WHERE id=?').get('6398ef48-0b21-44f6-bd74-f4795abf22df'); console.log('room.map_id =', r&&r.map_id); const m=db.prepare('SELECT id,name FROM maps WHERE id=?').get(r&&r.map_id); console.log('maps 命中:', m);\"" 2>&1 | head
