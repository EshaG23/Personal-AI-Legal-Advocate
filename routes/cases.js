const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Case = require('../models/Case');
const Document = require('../models/Document');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all cases for user
router.get('/', authenticateToken, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['active', 'pending', 'closed', 'on-hold', 'appealed']),
  query('caseType').optional().isString(),
  query('priority').optional().isIn(['low', 'medium', 'high', 'urgent'])
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
      status, 
      caseType, 
      priority,
      sortBy = 'updatedAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (page - 1) * limit;
    let query = { userId: req.user._id };

    // Apply filters
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { caseNumber: { $regex: search, $options: 'i' } }
      ];
    }

    if (status) query.status = status;
    if (caseType) query.caseType = caseType;
    if (priority) query.priority = priority;

    // Sort configuration
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const cases = await Case.find(query)
      .populate('documents', 'title filename fileSize createdAt')
      .skip(skip)
      .limit(parseInt(limit))
      .sort(sortConfig);

    const total = await Case.countDocuments(query);

    res.json({
      cases,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        count: cases.length,
        totalRecords: total
      }
    });

  } catch (error) {
    console.error('Get cases error:', error);
    res.status(500).json({
      message: 'Failed to fetch cases',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get case by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const caseDoc = await Case.findOne({ _id: id, userId: req.user._id })
      .populate('documents', 'title filename fileSize mimeType createdAt category')
      .populate('timeline.documents', 'title filename');

    if (!caseDoc) {
      return res.status(404).json({
        message: 'Case not found',
        code: 'CASE_NOT_FOUND'
      });
    }

    res.json({ case: caseDoc });

  } catch (error) {
    console.error('Get case error:', error);
    res.status(500).json({
      message: 'Failed to fetch case',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Create new case
router.post('/', authenticateToken, [
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title is required and must be less than 200 characters'),
  body('description').trim().isLength({ min: 1 }).withMessage('Description is required'),
  body('caseType').isIn([
    'civil', 'criminal', 'family', 'corporate', 'immigration', 
    'employment', 'personal-injury', 'real-estate', 'intellectual-property', 
    'bankruptcy', 'tax', 'other'
  ]).withMessage('Invalid case type'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('caseNumber').optional().trim().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const caseData = {
      ...req.body,
      userId: req.user._id
    };

    const newCase = new Case(caseData);
    await newCase.save();

    res.status(201).json({
      message: 'Case created successfully',
      case: newCase
    });

  } catch (error) {
    console.error('Create case error:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        message: 'Case number already exists',
        code: 'DUPLICATE_CASE_NUMBER'
      });
    }
    res.status(500).json({
      message: 'Failed to create case',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update case
router.put('/:id', authenticateToken, [
  body('title').optional().trim().isLength({ min: 1, max: 200 }),
  body('description').optional().trim().isLength({ min: 1 }),
  body('status').optional().isIn(['active', 'pending', 'closed', 'on-hold', 'appealed']),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent'])
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

    const caseDoc = await Case.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      updates,
      { new: true, runValidators: true }
    ).populate('documents', 'title filename fileSize createdAt');

    if (!caseDoc) {
      return res.status(404).json({
        message: 'Case not found',
        code: 'CASE_NOT_FOUND'
      });
    }

    res.json({
      message: 'Case updated successfully',
      case: caseDoc
    });

  } catch (error) {
    console.error('Update case error:', error);
    res.status(500).json({
      message: 'Failed to update case',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Delete case
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const caseDoc = await Case.findOneAndDelete({ _id: id, userId: req.user._id });
    
    if (!caseDoc) {
      return res.status(404).json({
        message: 'Case not found',
        code: 'CASE_NOT_FOUND'
      });
    }

    res.json({
      message: 'Case deleted successfully'
    });

  } catch (error) {
    console.error('Delete case error:', error);
    res.status(500).json({
      message: 'Failed to delete case',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Add timeline event
router.post('/:id/timeline', authenticateToken, [
  body('title').trim().isLength({ min: 1 }).withMessage('Title is required'),
  body('description').trim().isLength({ min: 1 }).withMessage('Description is required'),
  body('date').isISO8601().withMessage('Valid date is required'),
  body('type').optional().isIn(['filing', 'hearing', 'deadline', 'meeting', 'document', 'communication', 'other']),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent'])
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
    const eventData = req.body;

    const caseDoc = await Case.findOne({ _id: id, userId: req.user._id });
    if (!caseDoc) {
      return res.status(404).json({
        message: 'Case not found',
        code: 'CASE_NOT_FOUND'
      });
    }

    await caseDoc.addTimelineEvent(eventData);

    res.status(201).json({
      message: 'Timeline event added successfully',
      case: caseDoc
    });

  } catch (error) {
    console.error('Add timeline event error:', error);
    res.status(500).json({
      message: 'Failed to add timeline event',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update timeline event
router.put('/:id/timeline/:eventId', authenticateToken, [
  body('title').optional().trim().isLength({ min: 1 }),
  body('description').optional().trim().isLength({ min: 1 }),
  body('date').optional().isISO8601(),
  body('status').optional().isIn(['upcoming', 'completed', 'missed', 'cancelled'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id, eventId } = req.params;
    const updates = req.body;

    const caseDoc = await Case.findOne({ _id: id, userId: req.user._id });
    if (!caseDoc) {
      return res.status(404).json({
        message: 'Case not found',
        code: 'CASE_NOT_FOUND'
      });
    }

    const timelineEvent = caseDoc.timeline.id(eventId);
    if (!timelineEvent) {
      return res.status(404).json({
        message: 'Timeline event not found',
        code: 'EVENT_NOT_FOUND'
      });
    }

    Object.assign(timelineEvent, updates);
    await caseDoc.save();

    res.json({
      message: 'Timeline event updated successfully',
      event: timelineEvent
    });

  } catch (error) {
    console.error('Update timeline event error:', error);
    res.status(500).json({
      message: 'Failed to update timeline event',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Delete timeline event
router.delete('/:id/timeline/:eventId', authenticateToken, async (req, res) => {
  try {
    const { id, eventId } = req.params;

    const caseDoc = await Case.findOne({ _id: id, userId: req.user._id });
    if (!caseDoc) {
      return res.status(404).json({
        message: 'Case not found',
        code: 'CASE_NOT_FOUND'
      });
    }

    const timelineEvent = caseDoc.timeline.id(eventId);
    if (!timelineEvent) {
      return res.status(404).json({
        message: 'Timeline event not found',
        code: 'EVENT_NOT_FOUND'
      });
    }

    timelineEvent.remove();
    await caseDoc.save();

    res.json({
      message: 'Timeline event deleted successfully'
    });

  } catch (error) {
    console.error('Delete timeline event error:', error);
    res.status(500).json({
      message: 'Failed to delete timeline event',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get upcoming deadlines
router.get('/:id/deadlines', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { days = 30 } = req.query;

    const caseDoc = await Case.findOne({ _id: id, userId: req.user._id });
    if (!caseDoc) {
      return res.status(404).json({
        message: 'Case not found',
        code: 'CASE_NOT_FOUND'
      });
    }

    const upcomingDeadlines = caseDoc.getUpcomingDeadlines(parseInt(days));

    res.json({
      deadlines: upcomingDeadlines,
      count: upcomingDeadlines.length
    });

  } catch (error) {
    console.error('Get deadlines error:', error);
    res.status(500).json({
      message: 'Failed to fetch deadlines',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Add note to case
router.post('/:id/notes', authenticateToken, [
  body('title').optional().trim().isString(),
  body('content').trim().isLength({ min: 1 }).withMessage('Note content is required')
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
    const { title, content } = req.body;

    const caseDoc = await Case.findOne({ _id: id, userId: req.user._id });
    if (!caseDoc) {
      return res.status(404).json({
        message: 'Case not found',
        code: 'CASE_NOT_FOUND'
      });
    }

    const note = {
      id: new require('mongoose').Types.ObjectId().toString(),
      title: title || 'Untitled Note',
      content,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    caseDoc.notes.push(note);
    await caseDoc.save();

    res.status(201).json({
      message: 'Note added successfully',
      note
    });

  } catch (error) {
    console.error('Add note error:', error);
    res.status(500).json({
      message: 'Failed to add note',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;