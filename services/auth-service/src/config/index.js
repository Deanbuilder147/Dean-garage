export default {
  port: process.env.PORT || 3001,
  jwtSecret: process.env.JWT_SECRET || 'mecha-battle-auth-secret-key',
  jwtExpiresIn: '7d',
  bcryptRounds: 10
};
