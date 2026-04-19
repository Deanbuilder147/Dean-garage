# 贡献指南

感谢你有意为机甲战棋项目做出贡献！以下是一些指导原则。

## 🚀 如何开始

1. **Fork 本仓库**
2. **克隆你的 Fork**
   ```bash
   git clone https://github.com/Deanbuilder147/Dean-garage.git
   cd Dean-garage
   ```
3. **创建特性分支**
   ```bash
   git checkout -b feature/your-feature-name
   ```

## 🐛 Bug 报告

提交 Bug 报告时，请包含：
- 清晰的标题和描述
- 重现步骤
- 预期行为 vs 实际行为
- 截图（如有）
- 环境信息（Node 版本、操作系统等）

## 💡 功能建议

欢迎提交新功能建议！请：
- 清晰描述功能需求
- 说明为什么需要这个功能
- 提供使用场景示例

## 🔧 代码规范

### JavaScript/Node.js
- 使用 2 空格缩进
- 使用 `const` 和 `let`，避免 `var`
- 使用 ES6+ 语法
- 添加 JSDoc 注释

### Vue 组件
- 组件名使用 PascalCase
- Props 使用 camelCase
- 事件使用 kebab-case

### 提交信息格式
```
<type>(<scope>): <subject>

<body>

<footer>
```

类型 (type)：
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具相关

## 🧪 测试

提交代码前，请确保：
- 运行相关测试
- 不破坏现有功能
- 添加新功能的测试用例

```bash
# 运行测试
npm test

# 运行特定服务的测试
cd services/combat-service
npm test
```

## 📜 许可证

通过提交代码，你同意你的贡献将在 MIT 许可证下发布。

---

再次感谢你的贡献！🎮
