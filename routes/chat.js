const express = require('express');
const { body, validationResult, query } = require('express-validator');
const ChatConversation = require('../models/ChatConversation');
const Case = require('../models/Case');
const Document = require('../models/Document');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Mock AI response function (replace with actual OpenAI integration)
const generateAIResponse = async (messages, settings = {}) => {
  // This is a mock implementation
  // In production, integrate with OpenAI API or your preferred AI service
  const userMessage = messages[messages.length - 1];
  
  // Simple mock responses based on content
  let response = "I understand your question. As an AI legal advocate, I'm here to help you with your legal matters. ";
  
  if (userMessage.content.toLowerCase().includes('contract')) {
    response += "Regarding contracts, it's important to carefully review all terms and conditions. Consider having a legal professional review any significant agreements.";
  } else if (userMessage.content.toLowerCase().includes('case')) {
    response += "For case-related matters, I recommend organizing all relevant documents and maintaining detailed records of all communications and deadlines.";
  } else if (userMessage.content.toLowerCase().includes('legal')) {
    response += "Legal matters can be complex. I suggest consulting with a qualified attorney for specific legal advice tailored to your situation.";
  } else {
    response += "Could you provide more specific details about your legal question so I can better assist you?";
  }

  return {
    content: response,
    metadata: {
      tokens: Math.floor(Math.random() * 100) + 50,
      model: settings.aiModel || 'gpt-4',
      temperature: settings.temperature || 0.7,
      processingTime: Math.floor(Math.random() * 2000) + 500,
      confidence: 0.85
    }
  };
};

// Get all conversations for user
router.get('/', authenticateToken, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['active', 'archived', 'deleted']),
  query('category').optional().isString(),
  query('bookmarked').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { 
      page = 1, 
      limit = 10, 
      search, 
      status = 'active', 
      category, 
      bookmarked,
      sortBy = 'lastActivity',
      sortOrder = 'desc'
    } = req.query;

    const skip = (page - 1) * limit;
    let query = { userId: req.user._id, isDeleted: false };

    // Apply filters
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'messages.content': { $regex: search, $options: 'i' } }
      ];
    }

    if (status) query.status = status;
    if (category) query.category = category;
    if (bookmarked === 'true') query.isBookmarked = true;

    // Sort configuration
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const conversations = await ChatConversation.find(query)
      .populate('caseId', 'title caseNumber')
      .select('-messages') // Exclude messages for list view
      .skip(skip)
      .limit(parseInt(limit))
      .sort(sortConfig);

    const total = await ChatConversation.countDocuments(query);

    res.json({
      conversations,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        count: conversations.length,
        totalRecords: total
      }
    });

  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({
      message: 'Failed to fetch conversations',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get conversation by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const conversation = await ChatConversation.findOne({ 
      _id: id, 
      userId: req.user._id, 
      isDeleted: false 
    })
    .populate('caseId', 'title caseNumber')
    .populate('context.relatedDocuments', 'title filename');

    if (!conversation) {
      return res.status(404).json({
        message: 'Conversation not found',
        code: 'CONVERSATION_NOT_FOUND'
      });
    }

    res.json({ conversation });

  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({
      message: 'Failed to fetch conversation',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Create new conversation
router.post('/', authenticateToken, [
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title is required and must be less than 200 characters'),
  body('description').optional().trim().isString(),
  body('category').optional().isIn(['general', 'legal-advice', 'case-analysis', 'document-review', 'research', 'strategy', 'other']),
  body('caseId').optional().isMongoId(),
  body('context.legalArea').optional().trim().isString(),
  body('context.jurisdiction').optional().trim().isString(),
  body('context.urgency').optional().isIn(['low', 'medium', 'high', 'urgent'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const conversationData = {
      ...req.body,
      userId: req.user._id
    };

    // Validate case ownership if caseId provided
    if (conversationData.caseId) {
      const caseDoc = await Case.findOne({ _id: conversationData.caseId, userId: req.user._id });
      if (!caseDoc) {
        return res.status(400).json({
          message: 'Case not found or access denied',
          code: 'INVALID_CASE'
        });
      }
    }

    const conversation = new ChatConversation(conversationData);
    await conversation.save();

    // Populate references before sending response
    await conversation.populate('caseId', 'title caseNumber');

    res.status(201).json({
      message: 'Conversation created successfully',
      conversation
    });

  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({
      message: 'Failed to create conversation',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Send message to conversation
router.post('/:id/messages', authenticateToken, [
  body('content').trim().isLength({ min: 1 }).withMessage('Message content is required'),
  body('attachments').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { content, attachments = [] } = req.body;

    const conversation = await ChatConversation.findOne({ 
      _id: id, 
      userId: req.user._id, 
      isDeleted: false 
    });

    if (!conversation) {
      return res.status(404).json({
        message: 'Conversation not found',
        code: 'CONVERSATION_NOT_FOUND'
      });
    }

    // Validate attachments if provided
    if (attachments.length > 0) {
      const validAttachments = await Document.find({
        _id: { $in: attachments },
        userId: req.user._id,
        isDeleted: false
      });

      if (validAttachments.length !== attachments.length) {
        return res.status(400).json({
          message: 'Some attachments are invalid or not accessible',
          code: 'INVALID_ATTACHMENTS'
        });
      }
    }

    // Add user message
    const userMessage = {
      role: 'user',
      content,
      attachments: attachments || [],
      timestamp: new Date()
    };

    await conversation.addMessage(userMessage);

    // Generate AI response
    try {
      const aiResponse = await generateAIResponse(
        [...conversation.messages, userMessage],
        conversation.settings
      );

      const assistantMessage = {
        role: 'assistant',
        content: aiResponse.content,
        metadata: aiResponse.metadata,
        timestamp: new Date()
      };

      await conversation.addMessage(assistantMessage);

      // Return the updated conversation with new messages
      const updatedConversation = await ChatConversation.findById(id)
        .populate('caseId', 'title caseNumber')
        .populate('context.relatedDocuments', 'title filename');

      res.status(201).json({
        message: 'Message sent successfully',
        conversation: updatedConversation,
        newMessages: [userMessage, assistantMessage]
      });

    } catch (aiError) {
      console.error('AI response error:', aiError);
      
      // Still save the user message even if AI fails
      res.status(201).json({
        message: 'Message sent, but AI response failed',
        conversation,
        newMessages: [userMessage],
        aiError: 'AI service temporarily unavailable'
      });
    }

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      message: 'Failed to send message',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update conversation
router.put('/:id', authenticateToken, [
  body('title').optional().trim().isLength({ min: 1, max: 200 }),
  body('description').optional().trim().isString(),
  body('category').optional().isIn(['general', 'legal-advice', 'case-analysis', 'document-review', 'research', 'strategy', 'other']),
  body('settings.temperature').optional().isFloat({ min: 0, max: 2 }),
  body('settings.maxTokens').optional().isInt({ min: 1, max: 4000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const updates = req.body;

    const conversation = await ChatConversation.findOneAndUpdate(
      { _id: id, userId: req.user._id, isDeleted: false },
      updates,
      { new: true, runValidators: true }
    ).populate('caseId', 'title caseNumber');

    if (!conversation) {
      return res.status(404).json({
        message: 'Conversation not found',
        code: 'CONVERSATION_NOT_FOUND'
      });
    }

    res.json({
      message: 'Conversation updated successfully',
      conversation
    });

  } catch (error) {
    console.error('Update conversation error:', error);
    res.status(500).json({
      message: 'Failed to update conversation',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Delete conversation (soft delete)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const conversation = await ChatConversation.findOne({ 
      _id: id, 
      userId: req.user._id, 
      isDeleted: false 
    });
    
    if (!conversation) {
      return res.status(404).json({
        message: 'Conversation not found',
        code: 'CONVERSATION_NOT_FOUND'
      });
    }

    await conversation.softDelete();

    res.json({
      message: 'Conversation deleted successfully'
    });

  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({
      message: 'Failed to delete conversation',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Toggle bookmark status
router.patch('/:id/bookmark', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const conversation = await ChatConversation.findOne({ 
      _id: id, 
      userId: req.user._id, 
      isDeleted: false 
    });

    if (!conversation) {
      return res.status(404).json({
        message: 'Conversation not found',
        code: 'CONVERSATION_NOT_FOUND'
      });
    }

    await conversation.toggleBookmark();

    res.json({
      message: `Conversation ${conversation.isBookmarked ? 'bookmarked' : 'unbookmarked'} successfully`,
      isBookmarked: conversation.isBookmarked
    });

  } catch (error) {
    console.error('Toggle bookmark error:', error);
    res.status(500).json({
      message: 'Failed to toggle bookmark',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Archive conversation
router.patch('/:id/archive', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const conversation = await ChatConversation.findOne({ 
      _id: id, 
      userId: req.user._id, 
      isDeleted: false 
    });

    if (!conversation) {
      return res.status(404).json({
        message: 'Conversation not found',
        code: 'CONVERSATION_NOT_FOUND'
      });
    }

    await conversation.archive();

    res.json({
      message: 'Conversation archived successfully'
    });

  } catch (error) {
    console.error('Archive conversation error:', error);
    res.status(500).json({
      message: 'Failed to archive conversation',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update message
router.put('/:id/messages/:messageId', authenticateToken, [
  body('content').trim().isLength({ min: 1 }).withMessage('Message content is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id, messageId } = req.params;
    const { content } = req.body;

    const conversation = await ChatConversation.findOne({ 
      _id: id, 
      userId: req.user._id, 
      isDeleted: false 
    });

    if (!conversation) {
      return res.status(404).json({
        message: 'Conversation not found',
        code: 'CONVERSATION_NOT_FOUND'
      });
    }

    const message = conversation.getMessageById(messageId);
    if (!message) {
      return res.status(404).json({
        message: 'Message not found',
        code: 'MESSAGE_NOT_FOUND'
      });
    }

    // Only allow editing user messages
    if (message.role !== 'user') {
      return res.status(400).json({
        message: 'Only user messages can be edited',
        code: 'INVALID_MESSAGE_TYPE'
      });
    }

    await conversation.updateMessage(messageId, content);

    res.json({
      message: 'Message updated successfully',
      updatedMessage: conversation.getMessageById(messageId)
    });

  } catch (error) {
    console.error('Update message error:', error);
    res.status(500).json({
      message: 'Failed to update message',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Search conversations
router.get('/search/text', authenticateToken, [
  query('q').notEmpty().withMessage('Search query is required'),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { q, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const searchResults = await ChatConversation.find({
      userId: req.user._id,
      isDeleted: false,
      $text: { $search: q }
    }, {
      score: { $meta: 'textScore' }
    })
    .populate('caseId', 'title caseNumber')
    .select('-messages')
    .sort({ score: { $meta: 'textScore' } })
    .skip(skip)
    .limit(parseInt(limit));

    const total = await ChatConversation.countDocuments({
      userId: req.user._id,
      isDeleted: false,
      $text: { $search: q }
    });

    res.json({
      conversations: searchResults,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        count: searchResults.length,
        totalRecords: total
      },
      searchQuery: q
    });

  } catch (error) {
    console.error('Search conversations error:', error);
    res.status(500).json({
      message: 'Failed to search conversations',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get conversation statistics
router.get('/meta/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await ChatConversation.aggregate([
      { $match: { userId: req.user._id, isDeleted: false } },
      {
        $group: {
          _id: null,
          totalConversations: { $sum: 1 },
          totalMessages: { $sum: '$statistics.messageCount' },
          totalTokens: { $sum: '$statistics.totalTokens' },
          avgMessages: { $avg: '$statistics.messageCount' },
          categoryCounts: { $push: '$category' },
          statusCounts: { $push: '$status' },
          bookmarkedCount: {
            $sum: { $cond: ['$isBookmarked', 1, 0] }
          }
        }
      }
    ]);

    const result = stats[0] || {
      totalConversations: 0,
      totalMessages: 0,
      totalTokens: 0,
      avgMessages: 0,
      categoryCounts: [],
      statusCounts: [],
      bookmarkedCount: 0
    };

    // Count occurrences
    const categoryStats = result.categoryCounts.reduce((acc, cat) => {
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});

    const statusStats = result.statusCounts.reduce((acc, status) => {
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    res.json({
      totalConversations: result.totalConversations,
      totalMessages: result.totalMessages,
      totalTokens: result.totalTokens,
      averageMessagesPerConversation: Math.round(result.avgMessages || 0),
      bookmarkedCount: result.bookmarkedCount,
      categoryBreakdown: categoryStats,
      statusBreakdown: statusStats,
      generatedAt: new Date()
    });

  } catch (error) {
    console.error('Get chat stats error:', error);
    res.status(500).json({
      message: 'Failed to fetch chat statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;