"""Fix /api/map/list to query SQLite database instead of scanning JSON files."""

index_path = '/root/original-project/services/map-service/src/index.js'
with open(index_path, 'r') as f:
    content = f.read()

# Step 1: Replace fs/path imports with db import
content = content.replace(
    "import fs from 'fs';\nimport path from 'path';",
    "import db from './database/db.js';"
)

# Step 2: Replace the old route body
old_marker = "// Phase 13: 地图列表接口 — 扫描 data 目录返回所有 .json 地图文件"
end_marker = "import battlefieldRoutes from './routes/battlefields.js';"

start_idx = content.find(old_marker)
end_idx = content.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print(f"ERROR: start={start_idx}, end={end_idx}")
    exit(1)

new_route = """// Phase 13: 地图列表接口 — 查询 SQLite 数据库返回所有战场地图
app.get('/api/map/list', (req, res) => {
  try {
    const requestedId = req.query.id;
    if (requestedId) {
      const stmt = db.prepare('SELECT * FROM battlefields WHERE id = ?');
      const map = stmt.get(parseInt(requestedId));
      if (!map) {
        return res.status(404).json({ error: '地图不存在', id: requestedId });
      }
      let terrainData = {};
      try { terrainData = JSON.parse(map.terrain || '{}'); } catch(e) {}
      return res.json({
        id: map.id, name: map.name,
        width: map.width, height: map.height,
        terrain: terrainData,
        type: map.type, createdAt: map.created_at
      });
    }
    const stmt2 = db.prepare('SELECT * FROM battlefields ORDER BY created_at DESC');
    const maps = stmt2.all();
    const mapList = maps.map(m => {
      let terrainCount = 0;
      try {
        const terrain = JSON.parse(m.terrain || '{}');
        terrainCount = Object.keys(terrain).length;
      } catch(e) {}
      return {
        id: m.id, name: m.name,
        width: m.width, height: m.height,
        terrainCount, type: m.type, createdAt: m.created_at
      };
    });
    res.json({ maps: mapList });
  } catch (error) {
    console.error('[Map List] Error:', error);
    res.status(500).json({ error: '获取地图列表失败' });
  }
});

"""

content = content[:start_idx] + new_route + content[end_idx:]

with open(index_path, 'w') as f:
    f.write(content)

print("✓ Backend: /api/map/list now queries SQLite database")

# Verify
with open(index_path, 'r') as f:
    lines = f.readlines()
found_db = any('import db from' in l for l in lines)
found_sql = any('SELECT * FROM battlefields' in l for l in lines)
found_id = any('req.query.id' in l for l in lines)
print(f"  Verify: db_import={found_db}, sql_query={found_sql}, id_param={found_id}")
