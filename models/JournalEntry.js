const mongoose = require('mongoose');

const journalEntrySchema = new mongoose.Schema({
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
  content: {
    type: String,
    required: true
  },
  mood: {
    type: String,
    enum: ['very-sad', 'sad', 'neutral', 'happy', 'very-happy'],
    default: 'neutral'
  },
  category: {
    type: String,
    enum: ['personal', 'case-related', 'reflection', 'goal', 'milestone', 'other'],
    default: 'personal'
  },
  tags: [String],
  isPrivate: {
    type: Boolean,
    default: true
  },
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Case',
    required: false
  },
  attachments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document'
  }],
  metadata: {
    wordCount: Number,
    readingTime: Number, // in minutes
    sentiment: {
      score: Number,
      label: String
    },
    keyTopics: [String],
    emotions: [{
      emotion: String,
      confidence: Number
    }]
  },
  reminders: [{
    date: Date,
    message: String,
    completed: { type: Boolean, default: false }
  }],
  favorites: {
    isFavorite: { type: Boolean, default: false },
    favoritedAt: Date
  },
  version: {
    type: Number,
    default: 1
  },
  editHistory: [{
    version: Number,
    content: String,
    editedAt: Date,
    changes: String
  }],
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
journalEntrySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Calculate word count and reading time
  if (this.isModified('content')) {
    const words = this.content.split(/\s+/).filter(word => word.length > 0);
    this.metadata.wordCount = words.length;
    this.metadata.readingTime = Math.ceil(words.length / 200); // Average reading speed
  }
  
  next();
});

// Soft delete method
journalEntrySchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

// Toggle favorite method
journalEntrySchema.methods.toggleFavorite = function() {
  this.favorites.isFavorite = !this.favorites.isFavorite;
  this.favorites.favoritedAt = this.favorites.isFavorite ? new Date() : null;
  return this.save();
};

// Add to edit history
journalEntrySchema.methods.addToEditHistory = function(oldContent, changes) {
  this.editHistory.push({
    version: this.version,
    content: oldContent,
    editedAt: new Date(),
    changes: changes
  });
  this.version += 1;
  return this.save();
};

// Get entry summary
journalEntrySchema.methods.getSummary = function(maxLength = 150) {
  const summary = this.content.replace(/<[^>]*>/g, '').substring(0, maxLength);
  return summary.length < this.content.length ? summary + '...' : summary;
};

// Search index
journalEntrySchema.index({ 
  title: 'text', 
  content: 'text', 
  tags: 'text' 
});

// Index for efficient queries
journalEntrySchema.index({ userId: 1, createdAt: -1 });
journalEntrySchema.index({ userId: 1, 'favorites.isFavorite': 1 });
journalEntrySchema.index({ userId: 1, category: 1 });

module.exports = mongoose.model('JournalEntry', journalEntrySchema);