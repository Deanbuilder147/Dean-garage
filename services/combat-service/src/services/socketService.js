import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'mecha-battle-auth-secret-key';

class CombatSocketService {
  constructor() {
    this.clients = new Map(); // clientId -> WebSocket
    this.battleClients = new Map(); // battleId -> Set(clientId)
    this.clientBattles = new Map(); // clientId -> Set(battleId)
  }

  setupWebSocket(wss) {
    wss.on('connection', (ws, req) => {
      console.log('新的WebSocket连接建立');
      
      // 解析URL参数
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      const battleId = url.searchParams.get('battleId');
      
      let clientId = null;
      let userId = null;
      
      try {
        if (token) {
          const decoded = jwt.verify(token, JWT_SECRET);
          userId = decoded.userId;
          clientId = `user_${userId}_${Date.now()}`;
        } else {
          clientId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
      } catch (error) {
        console.error('Token验证失败:', error);
        ws.close(1008, 'Token无效');
        return;
      }
      
      // 注册客户端
      this.clients.set(clientId, ws);
      console.log(`客户端 ${clientId} 已连接 (用户: ${userId || '匿名'})`);
      
      // 如果指定了战斗ID，加入战斗房间
      if (battleId) {
        this.joinBattle(clientId, battleId);
      }
      
      // 发送欢迎消息
      this.sendToClient(clientId, {
        type: 'welcome',
        clientId,
        userId,
        timestamp: new Date().toISOString()
      });
      
      // 消息处理
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(clientId, message);
        } catch (error) {
          console.error('消息解析失败:', error);
          this.sendToClient(clientId, {
            type: 'error',
            error: '消息格式错误',
            timestamp: new Date().toISOString()
          });
        }
      });
      
      // 连接关闭
      ws.on('close', () => {
        console.log(`客户端 ${clientId} 断开连接`);
        this.leaveAllBattles(clientId);
        this.clients.delete(clientId);
      });
      
      // 错误处理
      ws.on('error', (error) => {
        console.error(`客户端 ${clientId} WebSocket错误:`, error);
      });
    });
  }

  handleMessage(clientId, message) {
    const { type, battleId, ...data } = message;
    
    switch (type) {
      case 'join_battle':
        this.joinBattle(clientId, battleId);
        break;
        
      case 'leave_battle':
        this.leaveBattle(clientId, battleId);
        break;
        
      case 'battle_update':
        this.broadcastToBattle(battleId, {
          type: 'battle_update',
          clientId,
          ...data,
          timestamp: new Date().toISOString()
        });
        break;
        
      case 'unit_moved':
        this.broadcastToBattle(battleId, {
          type: 'unit_moved',
          clientId,
          ...data,
          timestamp: new Date().toISOString()
        });
        break;
        
      case 'unit_attacked':
        this.broadcastToBattle(battleId, {
          type: 'unit_attacked',
          clientId,
          ...data,
          timestamp: new Date().toISOString()
        });
        break;
        
      case 'turn_ended':
        this.broadcastToBattle(battleId, {
          type: 'turn_ended',
          clientId,
          ...data,
          timestamp: new Date().toISOString()
        });
        break;
        
      case 'chat_message':
        this.broadcastToBattle(battleId, {
          type: 'chat_message',
          clientId,
          ...data,
          timestamp: new Date().toISOString()
        });
        break;
        
      case 'ping':
        this.sendToClient(clientId, {
          type: 'pong',
          timestamp: new Date().toISOString()
        });
        break;
        
      default:
        console.warn(`未知消息类型: ${type}`);
        this.sendToClient(clientId, {
          type: 'error',
          error: `未知消息类型: ${type}`,
          timestamp: new Date().toISOString()
        });
    }
  }

  joinBattle(clientId, battleId) {
    // 加入战斗房间
    if (!this.battleClients.has(battleId)) {
      this.battleClients.set(battleId, new Set());
    }
    this.battleClients.get(battleId).add(clientId);
    
    // 记录客户端加入的战斗
    if (!this.clientBattles.has(clientId)) {
      this.clientBattles.set(clientId, new Set());
    }
    this.clientBattles.get(clientId).add(battleId);
    
    console.log(`客户端 ${clientId} 加入战斗 ${battleId}`);
    
    // 通知房间内其他用户
    this.broadcastToBattle(battleId, {
      type: 'player_joined',
      clientId,
      battleId,
      timestamp: new Date().toISOString()
    }, clientId); // 排除自己
    
    // 发送加入确认
    this.sendToClient(clientId, {
      type: 'joined_battle',
      battleId,
      clientCount: this.battleClients.get(battleId).size,
      timestamp: new Date().toISOString()
    });
  }

  leaveBattle(clientId, battleId) {
    // 从战斗房间移除
    if (this.battleClients.has(battleId)) {
      this.battleClients.get(battleId).delete(clientId);
      
      // 如果房间空了，删除房间
      if (this.battleClients.get(battleId).size === 0) {
        this.battleClients.delete(battleId);
      }
    }
    
    // 从客户端战斗记录中移除
    if (this.clientBattles.has(clientId)) {
      this.clientBattles.get(clientId).delete(battleId);
      
      // 如果客户端没有加入任何战斗，删除记录
      if (this.clientBattles.get(clientId).size === 0) {
        this.clientBattles.delete(clientId);
      }
    }
    
    console.log(`客户端 ${clientId} 离开战斗 ${battleId}`);
    
    // 通知房间内其他用户
    this.broadcastToBattle(battleId, {
      type: 'player_left',
      clientId,
      battleId,
      timestamp: new Date().toISOString()
    });
  }

  leaveAllBattles(clientId) {
    const battles = this.clientBattles.get(clientId);
    if (battles) {
      battles.forEach(battleId => {
        this.leaveBattle(clientId, battleId);
      });
    }
  }

  sendToClient(clientId, message) {
    const ws = this.clients.get(clientId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`发送消息到客户端 ${clientId} 失败:`, error);
      }
    }
  }

  broadcastToBattle(battleId, message, excludeClientId = null) {
    const clients = this.battleClients.get(battleId);
    if (!clients) return;
    
    clients.forEach(clientId => {
      if (clientId !== excludeClientId) {
        this.sendToClient(clientId, message);
      }
    });
  }

  broadcastToAll(message, excludeClientId = null) {
    this.clients.forEach((ws, clientId) => {
      if (clientId !== excludeClientId && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(message));
        } catch (error) {
          console.error(`广播消息到客户端 ${clientId} 失败:`, error);
        }
      }
    });
  }

  getBattleClients(battleId) {
    return this.battleClients.get(battleId) || new Set();
  }

  getBattleClientCount(battleId) {
    return this.getBattleClients(battleId).size;
  }

  getClientBattles(clientId) {
    return this.clientBattles.get(clientId) || new Set();
  }
}

const socketService = new CombatSocketService();

export const setupWebSocket = (wss) => {
  socketService.setupWebSocket(wss);
};

export default socketService;