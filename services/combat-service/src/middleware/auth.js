import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'mecha-battle-auth-secret-key';

/**
 * 认证中间件
 * 验证JWT令牌并附加用户信息到请求对象
 */
export const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: '未授权',
        message: '缺少或无效的授权头'
      });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // 附加用户信息到请求对象
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role || 'player'
    };
    
    next();
  } catch (error) {
    console.error('认证失败:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Token无效',
        message: '提供的Token格式错误'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token过期',
        message: '请重新登录'
      });
    }
    
    return res.status(401).json({ 
      error: '认证失败',
      message: error.message
    });
  }
};

/**
 * 角色检查中间件
 * @param {Array} allowedRoles - 允许的角色列表
 */
export const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: '未授权',
        message: '请先登录'
      });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: '权限不足',
        message: `需要角色: ${allowedRoles.join(', ')}`
      });
    }
    
    next();
  };
};

/**
 * 战斗参与者检查中间件
 * 确保用户是特定战斗的参与者
 */
export const checkBattleParticipant = async (req, res, next) => {
  try {
    const battleId = req.params.id;
    const userId = req.user.userId;
    
    // 从数据库检查用户是否是战斗参与者
    const battle = db.getBattleById(battleId);
    
    if (!battle) {
      return res.status(404).json({ 
        error: '战斗不存在',
        message: `战斗ID ${battleId} 不存在`
      });
    }
    
    // 解析战斗状态中的玩家列表
    let participants = [];
    try {
      const state = JSON.parse(battle.units_state || '{}');
      participants = state.spawn_order || [];
    } catch (error) {
      // 如果无法解析状态，可能战斗刚刚创建
      console.warn('无法解析战斗状态:', error);
    }
    
    // 检查用户是否在参与者列表中
    const isParticipant = participants.some(p => p.player_id === userId);
    
    if (!isParticipant && req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: '无权访问',
        message: '你未参与此战斗'
      });
    }
    
    next();
  } catch (error) {
    console.error('战斗参与者检查失败:', error);
    return res.status(500).json({ 
      error: '内部服务器错误',
      message: '无法验证战斗访问权限'
    });
  }
};

/**
 * 战斗所有者检查中间件
 * 确保用户是战斗的创建者（适用于房间创建的战斗）
 */
export const checkBattleOwner = async (req, res, next) => {
  try {
    const battleId = req.params.id;
    const userId = req.user.userId;
    
    // 从数据库获取战斗信息
    const battle = db.getBattleById(battleId);
    
    if (!battle) {
      return res.status(404).json({ 
        error: '战斗不存在',
        message: `战斗ID ${battleId} 不存在`
      });
    }
    
    // TODO: 需要从房间服务获取房间创建者信息
    // 暂时简化处理：检查是否是第一个选择出生点的玩家
    if (!battle.room_id) {
      // 如果不是从房间创建的，所有参与者都有完全权限
      return next();
    }
    
    // 解析出生点选择顺序
    let spawnOrder = [];
    try {
      spawnOrder = JSON.parse(battle.spawn_order || '[]');
    } catch (error) {
      console.warn('无法解析出生点顺序:', error);
    }
    
    // 如果用户是第一个选择的玩家，视为房间创建者
    const isOwner = spawnOrder.length > 0 && spawnOrder[0].player_id === userId;
    
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: '无权操作',
        message: '只有战斗创建者可以执行此操作'
      });
    }
    
    next();
  } catch (error) {
    console.error('战斗所有者检查失败:', error);
    return res.status(500).json({ 
      error: '内部服务器错误',
      message: '无法验证战斗所有权'
    });
  }
};

/**
 * 当前阵营检查中间间
 * 确保用户当前处于行动状态（对应阵营）
 */
export const checkCurrentFaction = (req, res, next) => {
  try {
    const battleId = req.params.id;
    const userId = req.user.userId;
    
    // 从数据库获取战斗状态
    const battle = db.getBattleById(battleId);
    
    if (!battle) {
      return res.status(404).json({ 
        error: '战斗不存在',
        message: `战斗ID ${battleId} 不存在`
      });
    }
    
    // 解析战斗状态
    let state = {};
    try {
      state = JSON.parse(battle.units_state || '{}');
    } catch (error) {
      console.warn('无法解析战斗状态:', error);
    }
    
    // 找到用户所属阵营
    let userFaction = null;
    if (state.spawn_order) {
      const userSpawn = state.spawn_order.find(p => p.player_id === userId);
      if (userSpawn) {
        userFaction = userSpawn.faction;
      }
    }
    
    // 如果不是当前阵营回合且不是管理员
    if (userFaction !== state.current_faction && req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: '不是你的回合',
        message: `当前是 ${state.current_faction} 阵营的回合`
      });
    }
    
    next();
  } catch (error) {
    console.error('当前阵营检查失败:', error);
    return res.status(500).json({ 
      error: '内部服务器错误',
      message: '无法验证回合状态'
    });
  }
};

/**
 * 单位所有者检查中间件
 * 确保用户拥有要操作的单位
 */
export const checkUnitOwner = (req, res, next) => {
  try {
    const battleId = req.params.id;
    const userId = req.user.userId;
    const unitId = req.body.unit_id || req.params.unitId;
    
    // 从数据库获取战斗状态
    const battle = db.getBattleById(battleId);
    
    if (!battle) {
      return res.status(404).json({ 
        error: '战斗不存在',
        message: `战斗ID ${battleId} 不存在`
      });
    }
    
    // 解析战斗状态
    let state = {};
    try {
      state = JSON.parse(battle.units_state || '{}');
    } catch (error) {
      console.warn('无法解析战斗状态:', error);
    }
    
    // 查找单位
    const unit = state.units?.find(u => u.id === unitId);
    
    if (!unit) {
      return res.status(404).json({ 
        error: '单位不存在',
        message: `单位ID ${unitId} 不存在`
      });
    }
    
    // 检查单位所有者（通过玩家ID或单位所有者ID）
    const isOwner = unit.player_id === userId || unit.owner_id === userId;
    
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: '无权操作',
        message: '你未拥有此单位'
      });
    }
    
    next();
  } catch (error) {
    console.error('单位所有者检查失败:', error);
    return res.status(500).json({ 
      error: '内部服务器错误',
      message: '无法验证单位所有权'
    });
  }
};

/**
 * 组合中间件：战斗参与者+当前阵营
 * 确保用户可以执行回合内的行动
 */
export const canActInBattle = [
  authenticate,
  checkBattleParticipant,
  checkCurrentFaction
];

/**
 * 组合中间件：战斗所有者+当前阵营
 * 确保用户可以执行特殊操作
 */
export const canManageBattle = [
  authenticate,
  checkBattleOwner,
  checkCurrentFaction
];

export default {
  authenticate,
  checkRole,
  checkBattleParticipant,
  checkBattleOwner,
  checkCurrentFaction,
  checkUnitOwner,
  canActInBattle,
  canManageBattle
};