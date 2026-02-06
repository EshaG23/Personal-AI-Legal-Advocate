const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        message: 'Access token required',
        code: 'TOKEN_REQUIRED'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await User.findById(decoded.userId).select('-password');
    if (!user || !user.isActive) {
      return res.status(401).json({ 
        message: 'Invalid token or user not found',
        code: 'INVALID_TOKEN'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        message: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }
    
    return res.status(500).json({ 
      message: 'Token verification failed',
      code: 'TOKEN_VERIFICATION_FAILED'
    });
  }
};

// Optional authentication - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      if (user && user.isActive) {
        req.user = user;
      }
    }
    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

// Check if user owns resource
const checkResourceOwnership = (resourceField = 'userId') => {
  return (req, res, next) => {
    const resource = req.resource || req.body;
    
    if (!resource) {
      return res.status(400).json({ 
        message: 'Resource not found',
        code: 'RESOURCE_NOT_FOUND'
      });
    }

    const resourceUserId = resource[resourceField];
    const currentUserId = req.user._id;

    if (resourceUserId.toString() !== currentUserId.toString()) {
      return res.status(403).json({ 
        message: 'Access denied. You can only access your own resources.',
        code: 'ACCESS_DENIED'
      });
    }

    next();
  };
};

// Check subscription level
const requireSubscription = (requiredLevel = 'free') => {
  const subscriptionLevels = { free: 1, premium: 2, enterprise: 3 };
  
  return (req, res, next) => {
    const userLevel = subscriptionLevels[req.user.subscription.plan] || 1;
    const requiredLevelValue = subscriptionLevels[requiredLevel] || 1;

    if (userLevel < requiredLevelValue) {
      return res.status(403).json({
        message: `This feature requires ${requiredLevel} subscription`,
        code: 'SUBSCRIPTION_REQUIRED',
        requiredLevel,
        currentLevel: req.user.subscription.plan
      });
    }

    next();
  };
};

// Rate limiting per user
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const userRequests = new Map();

  return (req, res, next) => {
    const userId = req.user._id.toString();
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get user's request history
    const userHistory = userRequests.get(userId) || [];
    
    // Filter out old requests
    const recentRequests = userHistory.filter(timestamp => timestamp > windowStart);
    
    if (recentRequests.length >= maxRequests) {
      return res.status(429).json({
        message: 'Too many requests. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((recentRequests[0] + windowMs - now) / 1000)
      });
    }

    // Add current request
    recentRequests.push(now);
    userRequests.set(userId, recentRequests);

    next();
  };
};

// Admin only access
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      message: 'Admin access required',
      code: 'ADMIN_REQUIRED'
    });
  }
  next();
};

module.exports = {
  authenticateToken,
  optionalAuth,
  checkResourceOwnership,
  requireSubscription,
  userRateLimit,
  requireAdmin
};