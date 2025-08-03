const express = require('express');
const { body, validationResult, query } = require('express-validator');
const JournalEntry = require('../models/JournalEntry');
const Case = require('../models/Case');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all journal entries for user
router.get('/', authenticateToken, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('category').optional().isString(),
  query('mood').optional().isIn(['very-sad', 'sad', 'neutral', 'happy', 'very-happy']),
  query('caseId').optional().isMongoId(),
  query('favorites').optional().isBoolean()
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
      category, 
      mood, 
      caseId,
      favorites,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (page - 1) * limit;
    let query = { userId: req.user._id, isDeleted: false };

    // Apply filters
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    if (category) query.category = category;
    if (mood) query.mood = mood;
    if (caseId) query.caseId = caseId;
    if (favorites === 'true') query['favorites.isFavorite'] = true;

    // Sort configuration
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const entries = await JournalEntry.find(query)
      .populate('caseId', 'title caseNumber')
      .populate('attachments', 'title filename fileSize')
      .select('-content') // Exclude full content for list view
      .skip(skip)
      .limit(parseInt(limit))
      .sort(sortConfig);

    // Add summary for each entry
    const entriesWithSummary = entries.map(entry => ({
      ...entry.toObject(),
      summary: entry.getSummary()
    }));

    const total = await JournalEntry.countDocuments(query);

    res.json({
      entries: entriesWithSummary,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        count: entries.length,
        totalRecords: total
      }
    });

  } catch (error) {
    console.error('Get journal entries error:', error);
    res.status(500).json({
      message: 'Failed to fetch journal entries',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get journal entry by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const entry = await JournalEntry.findOne({ 
      _id: id, 
      userId: req.user._id, 
      isDeleted: false 
    })
    .populate('caseId', 'title caseNumber')
    .populate('attachments', 'title filename fileSize mimeType');

    if (!entry) {
      return res.status(404).json({
        message: 'Journal entry not found',
        code: 'ENTRY_NOT_FOUND'
      });
    }

    res.json({ entry });

  } catch (error) {
    console.error('Get journal entry error:', error);
    res.status(500).json({
      message: 'Failed to fetch journal entry',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Create new journal entry
router.post('/', authenticateToken, [
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title is required and must be less than 200 characters'),
  body('content').trim().isLength({ min: 1 }).withMessage('Content is required'),
  body('mood').optional().isIn(['very-sad', 'sad', 'neutral', 'happy', 'very-happy']),
  body('category').optional().isIn(['personal', 'case-related', 'reflection', 'goal', 'milestone', 'other']),
  body('tags').optional().isArray(),
  body('caseId').optional().isMongoId(),
  body('isPrivate').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const entryData = {
      ...req.body,
      userId: req.user._id
    };

    // Validate case ownership if caseId provided
    if (entryData.caseId) {
      const caseDoc = await Case.findOne({ _id: entryData.caseId, userId: req.user._id });
      if (!caseDoc) {
        return res.status(400).json({
          message: 'Case not found or access denied',
          code: 'INVALID_CASE'
        });
      }
    }

    const entry = new JournalEntry(entryData);
    await entry.save();

    // Populate references before sending response
    await entry.populate('caseId', 'title caseNumber');

    res.status(201).json({
      message: 'Journal entry created successfully',
      entry
    });

  } catch (error) {
    console.error('Create journal entry error:', error);
    res.status(500).json({
      message: 'Failed to create journal entry',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update journal entry
router.put('/:id', authenticateToken, [
  body('title').optional().trim().isLength({ min: 1, max: 200 }),
  body('content').optional().trim().isLength({ min: 1 }),
  body('mood').optional().isIn(['very-sad', 'sad', 'neutral', 'happy', 'very-happy']),
  body('category').optional().isIn(['personal', 'case-related', 'reflection', 'goal', 'milestone', 'other']),
  body('tags').optional().isArray(),
  body('isPrivate').optional().isBoolean()
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

    const entry = await JournalEntry.findOne({ 
      _id: id, 
      userId: req.user._id, 
      isDeleted: false 
    });

    if (!entry) {
      return res.status(404).json({
        message: 'Journal entry not found',
        code: 'ENTRY_NOT_FOUND'
      });
    }

    // Store old content for edit history if content is being updated
    if (updates.content && updates.content !== entry.content) {
      await entry.addToEditHistory(entry.content, 'Content updated');
    }

    // Apply updates
    Object.assign(entry, updates);
    await entry.save();

    // Populate references
    await entry.populate('caseId', 'title caseNumber');

    res.json({
      message: 'Journal entry updated successfully',
      entry
    });

  } catch (error) {
    console.error('Update journal entry error:', error);
    res.status(500).json({
      message: 'Failed to update journal entry',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Delete journal entry (soft delete)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const entry = await JournalEntry.findOne({ 
      _id: id, 
      userId: req.user._id, 
      isDeleted: false 
    });
    
    if (!entry) {
      return res.status(404).json({
        message: 'Journal entry not found',
        code: 'ENTRY_NOT_FOUND'
      });
    }

    await entry.softDelete();

    res.json({
      message: 'Journal entry deleted successfully'
    });

  } catch (error) {
    console.error('Delete journal entry error:', error);
    res.status(500).json({
      message: 'Failed to delete journal entry',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Toggle favorite status
router.patch('/:id/favorite', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const entry = await JournalEntry.findOne({ 
      _id: id, 
      userId: req.user._id, 
      isDeleted: false 
    });

    if (!entry) {
      return res.status(404).json({
        message: 'Journal entry not found',
        code: 'ENTRY_NOT_FOUND'
      });
    }

    await entry.toggleFavorite();

    res.json({
      message: `Journal entry ${entry.favorites.isFavorite ? 'added to' : 'removed from'} favorites`,
      isFavorite: entry.favorites.isFavorite
    });

  } catch (error) {
    console.error('Toggle favorite error:', error);
    res.status(500).json({
      message: 'Failed to toggle favorite status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Add reminder to journal entry
router.post('/:id/reminders', authenticateToken, [
  body('date').isISO8601().withMessage('Valid date is required'),
  body('message').trim().isLength({ min: 1 }).withMessage('Reminder message is required')
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
    const { date, message } = req.body;

    const entry = await JournalEntry.findOne({ 
      _id: id, 
      userId: req.user._id, 
      isDeleted: false 
    });

    if (!entry) {
      return res.status(404).json({
        message: 'Journal entry not found',
        code: 'ENTRY_NOT_FOUND'
      });
    }

    entry.reminders.push({ date, message });
    await entry.save();

    res.status(201).json({
      message: 'Reminder added successfully',
      reminder: entry.reminders[entry.reminders.length - 1]
    });

  } catch (error) {
    console.error('Add reminder error:', error);
    res.status(500).json({
      message: 'Failed to add reminder',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get upcoming reminders
router.get('/reminders/upcoming', authenticateToken, [
  query('days').optional().isInt({ min: 1, max: 365 })
], async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + parseInt(days));

    const entries = await JournalEntry.find({
      userId: req.user._id,
      isDeleted: false,
      'reminders.date': {
        $gte: new Date(),
        $lte: futureDate
      },
      'reminders.completed': false
    })
    .populate('caseId', 'title caseNumber')
    .select('title reminders');

    const upcomingReminders = [];
    entries.forEach(entry => {
      entry.reminders.forEach(reminder => {
        if (reminder.date >= new Date() && 
            reminder.date <= futureDate && 
            !reminder.completed) {
          upcomingReminders.push({
            entryId: entry._id,
            entryTitle: entry.title,
            caseId: entry.caseId?._id,
            caseTitle: entry.caseId?.title,
            reminderId: reminder._id,
            date: reminder.date,
            message: reminder.message
          });
        }
      });
    });

    // Sort by date
    upcomingReminders.sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({
      reminders: upcomingReminders,
      count: upcomingReminders.length
    });

  } catch (error) {
    console.error('Get upcoming reminders error:', error);
    res.status(500).json({
      message: 'Failed to fetch upcoming reminders',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Search journal entries
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

    const searchResults = await JournalEntry.find({
      userId: req.user._id,
      isDeleted: false,
      $text: { $search: q }
    }, {
      score: { $meta: 'textScore' }
    })
    .populate('caseId', 'title caseNumber')
    .select('-content')
    .sort({ score: { $meta: 'textScore' } })
    .skip(skip)
    .limit(parseInt(limit));

    // Add summary for each entry
    const entriesWithSummary = searchResults.map(entry => ({
      ...entry.toObject(),
      summary: entry.getSummary()
    }));

    const total = await JournalEntry.countDocuments({
      userId: req.user._id,
      isDeleted: false,
      $text: { $search: q }
    });

    res.json({
      entries: entriesWithSummary,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        count: searchResults.length,
        totalRecords: total
      },
      searchQuery: q
    });

  } catch (error) {
    console.error('Search journal entries error:', error);
    res.status(500).json({
      message: 'Failed to search journal entries',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get journal statistics
router.get('/meta/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await JournalEntry.aggregate([
      { $match: { userId: req.user._id, isDeleted: false } },
      {
        $group: {
          _id: null,
          totalEntries: { $sum: 1 },
          totalWords: { $sum: '$metadata.wordCount' },
          avgWords: { $avg: '$metadata.wordCount' },
          totalReadingTime: { $sum: '$metadata.readingTime' },
          categoryCounts: { $push: '$category' },
          moodCounts: { $push: '$mood' },
          favoritesCount: {
            $sum: { $cond: ['$favorites.isFavorite', 1, 0] }
          }
        }
      }
    ]);

    const result = stats[0] || {
      totalEntries: 0,
      totalWords: 0,
      avgWords: 0,
      totalReadingTime: 0,
      categoryCounts: [],
      moodCounts: [],
      favoritesCount: 0
    };

    // Count occurrences
    const categoryStats = result.categoryCounts.reduce((acc, cat) => {
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});

    const moodStats = result.moodCounts.reduce((acc, mood) => {
      acc[mood] = (acc[mood] || 0) + 1;
      return acc;
    }, {});

    res.json({
      totalEntries: result.totalEntries,
      totalWords: result.totalWords,
      averageWords: Math.round(result.avgWords || 0),
      totalReadingTime: result.totalReadingTime,
      favoritesCount: result.favoritesCount,
      categoryBreakdown: categoryStats,
      moodBreakdown: moodStats,
      generatedAt: new Date()
    });

  } catch (error) {
    console.error('Get journal stats error:', error);
    res.status(500).json({
      message: 'Failed to fetch journal statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;