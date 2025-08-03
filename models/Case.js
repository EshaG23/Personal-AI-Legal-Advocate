const mongoose = require('mongoose');

const timelineEventSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['filing', 'hearing', 'deadline', 'meeting', 'document', 'communication', 'other'],
    default: 'other'
  },
  status: {
    type: String,
    enum: ['upcoming', 'completed', 'missed', 'cancelled'],
    default: 'upcoming'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  documents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const caseSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  caseNumber: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  caseType: {
    type: String,
    enum: [
      'civil', 'criminal', 'family', 'corporate', 'immigration', 
      'employment', 'personal-injury', 'real-estate', 'intellectual-property', 
      'bankruptcy', 'tax', 'other'
    ],
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'pending', 'closed', 'on-hold', 'appealed'],
    default: 'active'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  court: {
    name: String,
    address: String,
    judge: String,
    caseNumber: String
  },
  parties: {
    plaintiff: [{
      name: { type: String, required: true },
      role: String,
      contact: {
        email: String,
        phone: String,
        address: String
      }
    }],
    defendant: [{
      name: { type: String, required: true },
      role: String,
      contact: {
        email: String,
        phone: String,
        address: String
      }
    }],
    attorneys: [{
      name: { type: String, required: true },
      firm: String,
      barNumber: String,
      contact: {
        email: String,
        phone: String,
        address: String
      },
      representing: String
    }]
  },
  timeline: [timelineEventSchema],
  documents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document'
  }],
  notes: [{
    id: String,
    title: String,
    content: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  }],
  tags: [String],
  financials: {
    estimatedCost: Number,
    actualCost: Number,
    hourlyRate: Number,
    expenses: [{
      description: String,
      amount: Number,
      date: Date,
      category: String
    }]
  },
  deadlines: [{
    title: String,
    date: Date,
    description: String,
    completed: { type: Boolean, default: false },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    }
  }],
  outcome: {
    result: String,
    settlement: Number,
    verdict: String,
    appealStatus: String,
    notes: String
  },
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
caseSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Generate case number if not provided
caseSchema.pre('save', async function(next) {
  if (!this.caseNumber && this.isNew) {
    const year = new Date().getFullYear();
    const count = await this.constructor.countDocuments({ userId: this.userId });
    this.caseNumber = `CASE-${year}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

// Add timeline event method
caseSchema.methods.addTimelineEvent = function(eventData) {
  const event = {
    ...eventData,
    id: eventData.id || new mongoose.Types.ObjectId().toString()
  };
  this.timeline.push(event);
  return this.save();
};

// Get upcoming deadlines method
caseSchema.methods.getUpcomingDeadlines = function(days = 30) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  
  return this.deadlines.filter(deadline => 
    !deadline.completed && 
    deadline.date >= new Date() && 
    deadline.date <= futureDate
  );
};

module.exports = mongoose.model('Case', caseSchema);