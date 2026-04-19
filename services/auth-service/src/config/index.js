const config = {
  port: process.env.PORT || 3001,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: '7d',
  bcryptRounds: 10
};

// 强制要求 JWT_SECRET
if (!config.jwtSecret) {
  throw new Error('[配置错误] JWT_SECRET 环境变量必须设置！');
}

export default config;
