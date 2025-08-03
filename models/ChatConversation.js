const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  metadata: {
    tokens: Number,
    model: String,
    temperature: Number,
    processingTime: Number,
    confidence: Number
  },
  attachments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document'
  }],
  reactions: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reaction: { type: String, enum: ['like', 'dislike', 'helpful', 'not-helpful'] },
    timestamp: { type: Date, default: Date.now }
  }],
  isEdited: {
    type: Boolean,
    default: false
  },
  editHistory: [{
    content: String,
    editedAt: Date
  }]
});

const chatConversationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    enum: ['general', 'legal-advice', 'case-analysis', 'document-review', 'research', 'strategy', 'other'],
    default: 'general'
  },
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Case',
    required: false
  },
  messages: [messageSchema],
  context: {
    legalArea: String,
    jurisdiction: String,
    caseType: String,
    urgency: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    },
    relatedDocuments: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document'
    }]
  },
  settings: {
    aiModel: {
      type: String,
      default: 'gpt-4'
    },
    temperature: {
      type: Number,
      default: 0.7,
      min: 0,
      max: 2
    },
    maxTokens: {
      type: Number,
      default: 1000
    },
    systemPrompt: String
  },
  statistics: {
    messageCount: {
      type: Number,
      default: 0
    },
    totalTokens: {
      type: Number,
      default: 0
    },
    averageResponseTime: Number,
    userSatisfactionRating: Number
  },
  status: {
    type: String,
    enum: ['active', 'archived', 'deleted'],
    default: 'active'
  },
  tags: [String],
  isBookmarked: {
    type: Boolean,
    default: false
  },
  bookmarkedAt: Date,
  sharedWith: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    permission: { type: String, enum: ['read', 'comment'], default: 'read' },
    sharedAt: { type: Date, default: Date.now }
  }],
  lastActivity: {
    type: Date,
    default: Date.now
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update updatedAt and lastActivity before saving
chatConversationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  this.lastActivity = Date.now();
  
  // Update message count
  this.statistics.messageCount = this.messages.length;
  
  // Calculate total tokens
  this.statistics.totalTokens = this.messages.reduce((total, message) => {
    return total + (message.metadata?.tokens || 0);
  }, 0);
  
  next();
});

// Add message method
chatConversationSchema.methods.addMessage = function(messageData) {
  const message = {
    ...messageData,
    id: messageData.id || new mongoose.Types.ObjectId().toString(),
    timestamp: new Date()
  };
  this.messages.push(message);
  return this.save();
};

// Get conversation summary
chatConversationSchema.methods.getSummary = function() {
  const recentMessages = this.messages.slice(-10);
  const summary = recentMessages
    .filter(msg => msg.role === 'user')
    .map(msg => msg.content.substring(0, 100))
    .join(' ');
  return summary.length > 200 ? summary.substring(0, 200) + '...' : summary;
};

// Toggle bookmark
chatConversationSchema.methods.toggleBookmark = function() {
  this.isBookmarked = !this.isBookmarked;
  this.bookmarkedAt = this.isBookmarked ? new Date() : null;
  return this.save();
};

// Archive conversation
chatConversationSchema.methods.archive = function() {
  this.status = 'archived';
  return this.save();
};

// Soft delete
chatConversationSchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.status = 'deleted';
  return this.save();
};

// Get message by ID
chatConversationSchema.methods.getMessageById = function(messageId) {
  return this.messages.find(msg => msg.id === messageId);
};

// Update message
chatConversationSchema.methods.updateMessage = function(messageId, newContent) {
  const message = this.getMessageById(messageId);
  if (message) {
    if (!message.editHistory) message.editHistory = [];
    message.editHistory.push({
      content: message.content,
      editedAt: new Date()
    });
    message.content = newContent;
    message.isEdited = true;
    return this.save();
  }
  return Promise.reject(new Error('Message not found'));
};

// Index for efficient queries
chatConversationSchema.index({ userId: 1, lastActivity: -1 });
chatConversationSchema.index({ userId: 1, status: 1 });
chatConversationSchema.index({ userId: 1, isBookmarked: 1 });
chatConversationSchema.index({ 'messages.content': 'text', title: 'text' });

module.exports = mongoose.model('ChatConversation', chatConversationSchema);