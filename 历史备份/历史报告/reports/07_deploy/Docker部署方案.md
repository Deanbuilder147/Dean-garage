# Docker 部署方案 - 机甲战棋 (Mecha Battle)

**日期:** 2026-04-18  
**状态:** Docker 已安装，但网络受限

---

## ✅ 已完成的工作

### 1. Docker 安装完成
```
Docker version 29.1.3
Docker Compose version 2.40.3
Status: active (running)
```

### 2. 用户权限配置
- `agentuser` 已添加到 `docker` 组
- Docker socket 权限已配置

### 3. 服务管理脚本
- 创建了安全的服务管理脚本：`scripts/manage-services-safe.sh`
- 该脚本不会杀死 Hermes Agent 进程

---

## ⚠️ 当前问题：Docker Hub 网络限制

Docker Hub (docker.io) 在中国大陆访问受限，多个镜像源测试超时。

**影响:**
- 无法直接 `docker pull` 官方镜像
- `docker-compose up` 会失败（需要下载镜像）

---

## 📋 推荐的解决方案

### 方案 A: 使用当前直接运行模式（推荐，立即可用）

**优点:**
- ✅ 无需 Docker 镜像
- ✅ 服务已经在运行
- ✅ 无网络依赖

**当前状态:**
```
✅ auth (port 3001): RUNNING
✅ hangar (port 3002): RUNNING  
✅ map (port 3003): RUNNING
✅ combat (port 3004): RUNNING
✅ comm (port 3005): RUNNING
✅ online-battle (port 3006): RUNNING
❌ frontend (port 8081): STOPPED
```

**操作:**
```bash
# 启动前端
cd /home/agentuser/Dean-garage/frontend
npm run dev &

# 或使用安全脚本
./scripts/manage-services-safe.sh start frontend
```

---

### 方案 B: 手动导入 Docker 镜像（需要外部下载）

如果你有办法从其他机器下载镜像：

```bash
# 在可访问 Docker Hub 的机器上
docker save node:20-alpine postgres:14-alpine -o mecha-images.tar

# 传输到当前服务器
scp mecha-images.tar agentuser@server:/tmp/

# 导入镜像
docker load -i /tmp/mecha-images.tar
```

---

### 方案 C: 使用国内镜像源（需要测试）

配置已写入 `/etc/docker/daemon.json`，但需要找到可用的镜像源。

可以定期测试这些镜像：
```bash
# 测试命令
docker pull alpine:latest
```

如果未来某个镜像可用，Docker 就可以正常工作。

---

## 🔧 当前的安全操作方式

### 重启特定服务（安全）
```bash
cd /home/agentuser/Dean-garage
./scripts/manage-services-safe.sh restart combat
./scripts/manage-services-safe.sh restart auth
```

### 查看所有服务状态
```bash
./scripts/manage-services-safe.sh status
```

### 修复 JWT 密钥问题（不重启服务）
```bash
# 编辑 .env 文件
nano /home/agentuser/Dean-garage/.env

# 确保 JWT_SECRET 是强随机值
# 生成新密钥：openssl rand -base64 32
```

---

## 📊 部署对比

| 特性 | 直接运行 (当前) | Docker 部署 |
|------|----------------|-----------|
| 启动速度 | ✅ 即时 | ⚠️ 需要拉取镜像 |
| 隔离性 | ❌ 无 | ✅ 完全隔离 |
| 网络依赖 | ❌ 无 | ⚠️ 需要 Docker Hub |
| 当前可用性 | ✅ 100% | ⚠️ 0% (网络问题) |
| 推荐度 | ⭐⭐⭐⭐ | ⭐⭐⭐ |

---

## ✅ 建议

**短期内：** 继续使用直接运行模式，使用安全脚本管理服务。

**长期：** 
1. 寻找稳定的 Docker 镜像源
2. 或手动导入镜像
3. 配置 PostgreSQL 持久化（替代 sql.js 内存库）

---

## 🛡️ 安全提醒

**绝对不要运行:**
```bash
pkill node      # ❌ 会杀死 Hermes Agent
killall node    # ❌ 同上
```

**安全替代:**
```bash
./scripts/manage-services-safe.sh restart <service>  # ✅
lsof -ti:3004 | xargs kill -9                        # ✅
```

---

**生成时间:** 2026-04-18  
**Hermes Agent 会话:** 活跃
