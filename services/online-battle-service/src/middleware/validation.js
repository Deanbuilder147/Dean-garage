/**
 * Validation middleware for request bodies
 */

/**
 * Validate required fields in request body
 * @param {Array} requiredFields - List of required field names
 */
export const validateRequired = (requiredFields) => {
  return (req, res, next) => {
    const missing = requiredFields.filter(field => !req.body[field]);
    
    if (missing.length > 0) {
      return res.status(400).json({
        error: 'Validation error',
        message: `Missing required fields: ${missing.join(', ')}`
      });
    }
    
    next();
  };
};

/**
 * Validate room creation data
 */
export const validateRoomCreation = (req, res, next) => {
  const { name, maxPlayers, teamSize } = req.body;
  
  if (!name || name.length < 1 || name.length > 50) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Room name must be between 1 and 50 characters'
    });
  }
  
  if (maxPlayers && (maxPlayers < 2 || maxPlayers > 8)) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Max players must be between 2 and 8'
    });
  }
  
  if (teamSize && (teamSize < 1 || teamSize > 4)) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Team size must be between 1 and 4'
    });
  }
  
  next();
};

/**
 * Validate queue join data
 */
export const validateQueueJoin = (req, res, next) => {
  const { queueType } = req.body;
  
  if (!queueType || !['ranked', 'casual'].includes(queueType)) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Queue type must be "ranked" or "casual"'
    });
  }
  
  next();
};

/**
 * Validate battle action data
 */
export const validateBattleAction = (req, res, next) => {
  const { action } = req.body;
  
  if (!action || !['move', 'attack', 'wait', 'ability'].includes(action)) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Action must be one of: move, attack, wait, ability'
    });
  }
  
  next();
};

/**
 * Validate pagination parameters
 */
export const validatePagination = (req, res, next) => {
  const { limit, offset } = req.query;
  
  if (limit && (isNaN(limit) || limit < 1 || limit > 100)) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Limit must be between 1 and 100'
    });
  }
  
  if (offset && (isNaN(offset) || offset < 0)) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Offset must be 0 or greater'
    });
  }
  
  // Set defaults
  req.pagination = {
    limit: parseInt(limit) || 50,
    offset: parseInt(offset) || 0
  };
  
  next();
};

export default {
  validateRequired,
  validateRoomCreation,
  validateQueueJoin,
  validateBattleAction,
  validatePagination
};
