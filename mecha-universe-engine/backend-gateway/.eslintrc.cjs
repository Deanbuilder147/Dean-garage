/* eslint-env node */
/**
 * ESLint 配置（阶段三收官 · 生产日志门禁）
 * ------------------------------------------------------------
 * 红线：杜绝 console.log/info/debug 污染生产环境（已统一收束到 Pino logger）。
 * no-console 设为 error 级，仅放行 warn/error（与 Pino logger.warn/error 对齐）。
 * 引擎侧 .cjs（combat-service）与 node_modules/dist 不在扫描范围。
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
  ],
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: [
    'dist',
    'dist-dev',
    'node_modules',
    'scripts/**', // 一次性迁移/运维脚本，免审
    'services/combat-service/**', // 引擎侧独立审计
  ],
  rules: {
    // ★ 生产日志门禁：禁止 console.log/info/debug，仅放行 warn/error
    'no-console': ['error', { allow: ['warn', 'error'] }],
    // 类型安全已由 tsc strict 把关，eslint 不重复拦截风格类规则，
    // 避免误伤历史代码（prefer-const / no-namespace / no-case-declarations 等）
    'no-empty': 'off',
    'no-unused-vars': 'off', // tsc strict 已把关，且历史代码有大量未用变量
    'no-case-declarations': 'off', // 历史 switch/case 风格，非 console 范畴
    'no-undef': 'off', // 类型/全局由 tsc + @types 把关
  },
};
