// Map Service 配置
const config = {
  port: process.env.PORT || 3003,
  jwtSecret: process.env.JWT_SECRET,
  dataDir: './data',
  dbName: 'map.db'
};

// 强制要求 JWT_SECRET
if (!config.jwtSecret) {
  throw new Error('[配置错误] JWT_SECRET 环境变量必须设置！');
}

export default config;
