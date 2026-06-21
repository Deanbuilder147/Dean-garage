#!/usr/bin/env python3
"""
Phase 13 Task 1-A: Map Service — 添加 GET /api/map/list 路由
扫描地图目录，返回所有已保存的地图 .json 列表
"""
import os
import sys

MAP_SERVICE_INDEX = "/root/original-project/services/map-service/src/index.js"

def patch():
    with open(MAP_SERVICE_INDEX, 'r') as f:
        content = f.read()

    # 在 app.use('/api/map/battlefields', ...) 之前插入 /api/map/list 路由
    insert_code = """
// Phase 13: 地图列表接口 — 扫描 data 目录返回所有 .json 地图文件
import fs from 'fs';
import path from 'path';

app.get('/api/map/list', (req, res) => {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      return res.json({ maps: [] });
    }
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
    const maps = files.map(f => {
      const filePath = path.join(dataDir, f);
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);
        return {
          filename: f,
          name: data.battlefield?.name || data.name || f.replace('.json', ''),
          width: data.battlefield?.width || data.width || 15,
          height: data.battlefield?.height || data.height || 10,
          terrainCount: data.battlefield?.terrainCount ||
            (data.battlefield?.terrainData ? Object.keys(data.battlefield.terrainData).length : 0),
          exportDate: data.exportDate || null,
        };
      } catch (parseErr) {
        return { filename: f, name: f.replace('.json', ''), error: 'parse_failed' };
      }
    });
    maps.sort((a, b) => {
      if (a.exportDate && b.exportDate) return b.exportDate.localeCompare(a.exportDate);
      return a.name.localeCompare(b.name);
    });
    res.json({ maps });
  } catch (error) {
    console.error('[Map List] Error:', error);
    res.status(500).json({ error: '获取地图列表失败' });
  }
});

"""

    # 在 import battlefieldRoutes 之前插入 import
    mark = "import battlefieldRoutes from './routes/battlefields.js';"
    if mark in content:
        content = content.replace(mark, insert_code + mark)
    else:
        print("[WARN] Could not find battlefieldRoutes import, inserting at top")
        # Find app.use express import
        mark2 = "app.use(express.urlencoded"
        if mark2 in content:
            idx = content.index(mark2)
            line_end = content.index('\n', idx)
            content = content[:line_end+1] + insert_code + content[line_end+1:]

    with open(MAP_SERVICE_INDEX, 'w') as f:
        f.write(content)

    print("[Phase13-Task1A] ✓ Map list endpoint added to map-service")

if __name__ == '__main__':
    patch()
