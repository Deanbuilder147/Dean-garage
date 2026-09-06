#!/usr/bin/env python3
"""
Phase 13: API Client 更新 + Map List 文件服务增强
"""
import re

CLIENT_JS = "/root/original-project/frontend/src/api/client.js"
MAP_SERVICE_INDEX = "/root/original-project/services/map-service/src/index.js"

def patch_client():
    """为 api/client.js 添加 mapAPI.getMapList 和 mapAPI.getMapFile 方法"""
    with open(CLIENT_JS, 'r') as f:
        content = f.read()

    # 在 mapAPI 对象中添加新方法
    old_map_api = """export const mapAPI = {
  getBattlefields: () => apiClient.get('/map/battlefields'),
  getBattlefield: (id) => apiClient.get(`/map/battlefields/${id}`),
  createBattlefield: (data) => apiClient.post('/map/battlefields', data),
  updateBattlefield: (id, data) => apiClient.put(`/map/battlefields/${id}`, data),
  deleteBattlefield: (id) => apiClient.delete(`/map/battlefields/${id}`)
};"""

    new_map_api = """export const mapAPI = {
  getBattlefields: () => apiClient.get('/map/battlefields'),
  getBattlefield: (id) => apiClient.get(`/map/battlefields/${id}`),
  createBattlefield: (data) => apiClient.post('/map/battlefields', data),
  updateBattlefield: (id, data) => apiClient.put(`/map/battlefields/${id}`, data),
  deleteBattlefield: (id) => apiClient.delete(`/map/battlefields/${id}`),
  // Phase 13: 地图文件列表
  getMapList: () => apiClient.get('/map/list'),
  getMapFile: (filename) => apiClient.get(`/map/list?file=${encodeURIComponent(filename)}`)
};"""

    if old_map_api in content:
        content = content.replace(old_map_api, new_map_api)
        print("[Phase13-API] ✓ mapAPI.getMapList/getMapFile added to client.js")
    else:
        print("[Phase13-API] ⚠ Could not find mapAPI in client.js")

    with open(CLIENT_JS, 'w') as f:
        f.write(content)

def patch_map_service_file_endpoint():
    """为 /api/map/list 添加 ?file= 参数支持，返回具体文件内容"""
    with open(MAP_SERVICE_INDEX, 'r') as f:
        content = f.read()

    # 在 /api/map/list 路由处理函数中找到 try block，添加 file 参数处理
    old_try = """app.get('/api/map/list', (req, res) => {
  try {"""

    new_try = """app.get('/api/map/list', (req, res) => {
  try {
    // Phase 13: 支持 ?file=filename.json 加载具体地图文件
    const requestedFile = req.query.file;
    if (requestedFile) {
      const safeName = path.basename(requestedFile); // 防止路径遍历
      const filePath = path.join(dataDir, safeName);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: '地图文件不存在', filename: safeName });
      }
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      return res.json({
        filename: safeName,
        battlefield: data.battlefield || data,
        map: data.battlefield || data,
        name: data.battlefield?.name || data.name || safeName.replace('.json', ''),
      });
    }"""

    if old_try in content:
        content = content.replace(old_try, new_try)
        print("[Phase13-API] ✓ /api/map/list ?file= support added")
    else:
        print("[Phase13-API] ⚠ Could not find /api/map/list route for file param")

    with open(MAP_SERVICE_INDEX, 'w') as f:
        f.write(content)

if __name__ == '__main__':
    patch_client()
    patch_map_service_file_endpoint()
