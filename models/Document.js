const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Case',
    required: false
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  filePath: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    enum: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'jpg', 'jpeg', 'png', 'gif', 'other'],
    required: true
  },
  category: {
    type: String,
    enum: [
      'contract', 'pleading', 'motion', 'brief', 'evidence', 'correspondence', 
      'discovery', 'settlement', 'court-order', 'statute', 'regulation', 
      'case-law', 'memo', 'research', 'client-file', 'other'
    ],
    default: 'other'
  },
  status: {
    type: String,
    enum: ['uploaded', 'processing', 'processed', 'error', 'archived'],
    default: 'uploaded'
  },
  processing: {
    extractedText: String,
    summary: String,
    keyPoints: [String],
    entities: [{
      type: String,
      value: String,
      confidence: Number
    }],
    sentiment: {
      score: Number,
      label: String
    },
    language: String,
    pageCount: Number,
    wordCount: Number,
    processedAt: Date,
    error: String
  },
  metadata: {
    author: String,
    createdDate: Date,
    modifiedDate: Date,
    subject: String,
    keywords: [String],
    version: String
  },
  permissions: {
    isPublic: { type: Boolean, default: false },
    sharedWith: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      permission: { type: String, enum: ['read', 'write', 'admin'], default: 'read' },
      sharedAt: { type: Date, default: Date.now }
    }]
  },
  tags: [String],
  annotations: [{
    id: String,
    type: { type: String, enum: ['highlight', 'note', 'bookmark'] },
    page: Number,
    position: {
      x: Number,
      y: Number,
      width: Number,
      height: Number
    },
    content: String,
    color: String,
    createdAt: { type: Date, default: Date.now }
  }],
  versions: [{
    version: Number,
    filename: String,
    filePath: String,
    uploadedAt: Date,
    changes: String
  }],
  downloadCount: {
    type: Number,
    default: 0
  },
  lastAccessed: {
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

// Update updatedAt field before saving
documentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Soft delete method
documentSchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

// Add annotation method
documentSchema.methods.addAnnotation = function(annotationData) {
  const annotation = {
    ...annotationData,
    id: annotationData.id || new mongoose.Types.ObjectId().toString()
  };
  this.annotations.push(annotation);
  return this.save();
};

// Update download count
documentSchema.methods.incrementDownloadCount = function() {
  this.downloadCount += 1;
  this.lastAccessed = new Date();
  return this.save();
};

// Get file extension
documentSchema.methods.getFileExtension = function() {
  return this.originalName.split('.').pop().toLowerCase();
};

// Check if user has permission
documentSchema.methods.hasPermission = function(userId, permission = 'read') {
  if (this.userId.toString() === userId.toString()) return true;
  
  const sharedPermission = this.permissions.sharedWith.find(
    share => share.userId.toString() === userId.toString()
  );
  
  if (!sharedPermission) return false;
  
  const permissionLevels = { read: 1, write: 2, admin: 3 };
  return permissionLevels[sharedPermission.permission] >= permissionLevels[permission];
};

// Index for search
documentSchema.index({ 
  title: 'text', 
  description: 'text', 
  'processing.extractedText': 'text',
  tags: 'text'
});

module.exports = mongoose.model('Document', documentSchema);