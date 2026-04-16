// Map Service 配置
export default {
  port: process.env.PORT || 3003,
  jwtSecret: process.env.JWT_SECRET || 'mecha-battle-secret',
  dataDir: './data',
  dbName: 'map.db'
};
