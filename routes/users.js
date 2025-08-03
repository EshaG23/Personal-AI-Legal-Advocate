const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { uploadAvatar, processUploadedFile, handleUploadError } = require('../middleware/upload');

const router = express.Router();

// Get all users (admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    
    if (search) {
      query.$or = [
        { profileName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (status) {
      query.isActive = status === 'active';
    }

    const users = await User.find(query)
      .select('-password')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(query);

    res.json({
      users,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        count: users.length,
        totalRecords: total
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      message: 'Failed to fetch users',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get user by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Users can only view their own profile unless they're admin
    if (req.user._id.toString() !== id && req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    const user = await User.findById(id).select('-password');
    if (!user) {
      return res.status(404).json({
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({ user: user.getPublicProfile() });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      message: 'Failed to fetch user',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Upload avatar
router.post('/avatar', 
  authenticateToken,
  uploadAvatar.single('avatar'),
  handleUploadError,
  processUploadedFile,
  async (req, res) => {
    try {
      if (!req.fileInfo) {
        return res.status(400).json({
          message: 'No avatar file uploaded',
          code: 'NO_FILE'
        });
      }

      const user = req.user;
      const avatarUrl = `/uploads/avatars/${req.fileInfo.filename}`;
      
      user.avatar = avatarUrl;
      await user.save();

      res.json({
        message: 'Avatar uploaded successfully',
        avatarUrl,
        user: user.getPublicProfile()
      });

    } catch (error) {
      console.error('Avatar upload error:', error);
      res.status(500).json({
        message: 'Failed to upload avatar',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// Delete avatar
router.delete('/avatar', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    user.avatar = null;
    await user.save();

    res.json({
      message: 'Avatar deleted successfully',
      user: user.getPublicProfile()
    });

  } catch (error) {
    console.error('Avatar delete error:', error);
    res.status(500).json({
      message: 'Failed to delete avatar',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update user preferences
router.patch('/preferences', authenticateToken, [
  body('theme').optional().isIn(['light', 'dark']),
  body('notifications.email').optional().isBoolean(),
  body('notifications.push').optional().isBoolean(),
  body('notifications.reminders').optional().isBoolean(),
  body('privacy.shareData').optional().isBoolean(),
  body('privacy.analytics').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const user = req.user;
    const updates = req.body;

    // Deep merge preferences
    if (updates.theme) user.preferences.theme = updates.theme;
    if (updates.notifications) {
      user.preferences.notifications = { ...user.preferences.notifications, ...updates.notifications };
    }
    if (updates.privacy) {
      user.preferences.privacy = { ...user.preferences.privacy, ...updates.privacy };
    }

    await user.save();

    res.json({
      message: 'Preferences updated successfully',
      preferences: user.preferences
    });

  } catch (error) {
    console.error('Preferences update error:', error);
    res.status(500).json({
      message: 'Failed to update preferences',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Deactivate user account
router.patch('/deactivate', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    user.isActive = false;
    await user.save();

    res.json({
      message: 'Account deactivated successfully'
    });

  } catch (error) {
    console.error('Account deactivation error:', error);
    res.status(500).json({
      message: 'Failed to deactivate account',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Reactivate user account (admin only)
router.patch('/:id/reactivate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    user.isActive = true;
    await user.save();

    res.json({
      message: 'Account reactivated successfully',
      user: user.getPublicProfile()
    });

  } catch (error) {
    console.error('Account reactivation error:', error);
    res.status(500).json({
      message: 'Failed to reactivate account',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get user statistics
router.get('/:id/stats', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Users can only view their own stats unless they're admin
    if (req.user._id.toString() !== id && req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    const Case = require('../models/Case');
    const Document = require('../models/Document');
    const JournalEntry = require('../models/JournalEntry');
    const ChatConversation = require('../models/ChatConversation');

    const [casesCount, documentsCount, journalCount, chatsCount] = await Promise.all([
      Case.countDocuments({ userId: id }),
      Document.countDocuments({ userId: id, isDeleted: false }),
      JournalEntry.countDocuments({ userId: id, isDeleted: false }),
      ChatConversation.countDocuments({ userId: id, isDeleted: false })
    ]);

    const stats = {
      cases: casesCount,
      documents: documentsCount,
      journalEntries: journalCount,
      chatConversations: chatsCount,
      generatedAt: new Date()
    };

    res.json({ stats });

  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      message: 'Failed to fetch user statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;