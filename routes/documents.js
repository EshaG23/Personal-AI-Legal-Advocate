const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Document = require('../models/Document');
const Case = require('../models/Case');
const { authenticateToken } = require('../middleware/auth');
const { 
  uploadDocument, 
  processUploadedFile, 
  handleUploadError,
  getFileType,
  createUploadUrl 
} = require('../middleware/upload');

const router = express.Router();

// Get all documents for user
router.get('/', authenticateToken, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('category').optional().isString(),
  query('fileType').optional().isString(),
  query('caseId').optional().isMongoId()
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
      limit = 20, 
      search, 
      category, 
      fileType, 
      caseId,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (page - 1) * limit;
    let query = { userId: req.user._id, isDeleted: false };

    // Apply filters
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { originalName: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    if (category) query.category = category;
    if (fileType) query.fileType = fileType;
    if (caseId) query.caseId = caseId;

    // Sort configuration
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const documents = await Document.find(query)
      .populate('caseId', 'title caseNumber')
      .select('-processing.extractedText') // Exclude large text content
      .skip(skip)
      .limit(parseInt(limit))
      .sort(sortConfig);

    const total = await Document.countDocuments(query);

    res.json({
      documents,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        count: documents.length,
        totalRecords: total
      }
    });

  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({
      message: 'Failed to fetch documents',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get document by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const document = await Document.findOne({ 
      _id: id, 
      userId: req.user._id, 
      isDeleted: false 
    }).populate('caseId', 'title caseNumber');

    if (!document) {
      return res.status(404).json({
        message: 'Document not found',
        code: 'DOCUMENT_NOT_FOUND'
      });
    }

    // Update last accessed
    document.lastAccessed = new Date();
    await document.save();

    res.json({ document });

  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({
      message: 'Failed to fetch document',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Upload document
router.post('/upload', 
  authenticateToken,
  uploadDocument.array('documents', 10),
  handleUploadError,
  processUploadedFile,
  [
    body('title').optional().trim().isLength({ min: 1, max: 200 }),
    body('description').optional().trim().isString(),
    body('category').optional().isIn([
      'contract', 'pleading', 'motion', 'brief', 'evidence', 'correspondence', 
      'discovery', 'settlement', 'court-order', 'statute', 'regulation', 
      'case-law', 'memo', 'research', 'client-file', 'other'
    ]),
    body('caseId').optional().isMongoId(),
    body('tags').optional().isArray()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      if (!req.filesInfo || req.filesInfo.length === 0) {
        return res.status(400).json({
          message: 'No files uploaded',
          code: 'NO_FILES'
        });
      }

      const { title, description, category = 'other', caseId, tags = [] } = req.body;
      const uploadedDocuments = [];

      // Validate case ownership if caseId provided
      if (caseId) {
        const caseDoc = await Case.findOne({ _id: caseId, userId: req.user._id });
        if (!caseDoc) {
          return res.status(400).json({
            message: 'Case not found or access denied',
            code: 'INVALID_CASE'
          });
        }
      }

      // Process each uploaded file
      for (const fileInfo of req.filesInfo) {
        const documentData = {
          userId: req.user._id,
          caseId: caseId || null,
          title: title || fileInfo.originalName,
          description: description || '',
          filename: fileInfo.filename,
          originalName: fileInfo.originalName,
          filePath: fileInfo.path,
          fileSize: fileInfo.size,
          mimeType: fileInfo.mimetype,
          fileType: getFileType(fileInfo.originalName),
          category,
          tags: Array.isArray(tags) ? tags : [],
          status: 'uploaded'
        };

        const document = new Document(documentData);
        await document.save();

        // Add document to case if specified
        if (caseId) {
          await Case.findByIdAndUpdate(caseId, {
            $push: { documents: document._id }
          });
        }

        uploadedDocuments.push(document);
      }

      res.status(201).json({
        message: `${uploadedDocuments.length} document(s) uploaded successfully`,
        documents: uploadedDocuments
      });

    } catch (error) {
      console.error('Document upload error:', error);
      res.status(500).json({
        message: 'Failed to upload documents',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// Update document
router.put('/:id', authenticateToken, [
  body('title').optional().trim().isLength({ min: 1, max: 200 }),
  body('description').optional().trim().isString(),
  body('category').optional().isIn([
    'contract', 'pleading', 'motion', 'brief', 'evidence', 'correspondence', 
    'discovery', 'settlement', 'court-order', 'statute', 'regulation', 
    'case-law', 'memo', 'research', 'client-file', 'other'
  ]),
  body('tags').optional().isArray()
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

    const document = await Document.findOneAndUpdate(
      { _id: id, userId: req.user._id, isDeleted: false },
      updates,
      { new: true, runValidators: true }
    ).populate('caseId', 'title caseNumber');

    if (!document) {
      return res.status(404).json({
        message: 'Document not found',
        code: 'DOCUMENT_NOT_FOUND'
      });
    }

    res.json({
      message: 'Document updated successfully',
      document
    });

  } catch (error) {
    console.error('Update document error:', error);
    res.status(500).json({
      message: 'Failed to update document',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Delete document (soft delete)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const document = await Document.findOne({ 
      _id: id, 
      userId: req.user._id, 
      isDeleted: false 
    });
    
    if (!document) {
      return res.status(404).json({
        message: 'Document not found',
        code: 'DOCUMENT_NOT_FOUND'
      });
    }

    await document.softDelete();

    res.json({
      message: 'Document deleted successfully'
    });

  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({
      message: 'Failed to delete document',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Download document
router.get('/:id/download', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const document = await Document.findOne({ 
      _id: id, 
      userId: req.user._id, 
      isDeleted: false 
    });

    if (!document) {
      return res.status(404).json({
        message: 'Document not found',
        code: 'DOCUMENT_NOT_FOUND'
      });
    }

    // Check if file exists
    const fs = require('fs');
    if (!fs.existsSync(document.filePath)) {
      return res.status(404).json({
        message: 'File not found on server',
        code: 'FILE_NOT_FOUND'
      });
    }

    // Update download count
    await document.incrementDownloadCount();

    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${document.originalName}"`);
    res.setHeader('Content-Type', document.mimeType);

    // Stream the file
    const fileStream = fs.createReadStream(document.filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({
      message: 'Failed to download document',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Add annotation to document
router.post('/:id/annotations', authenticateToken, [
  body('type').isIn(['highlight', 'note', 'bookmark']).withMessage('Invalid annotation type'),
  body('content').optional().trim().isString(),
  body('page').optional().isInt({ min: 1 }),
  body('position').optional().isObject(),
  body('color').optional().isString()
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
    const annotationData = req.body;

    const document = await Document.findOne({ 
      _id: id, 
      userId: req.user._id, 
      isDeleted: false 
    });

    if (!document) {
      return res.status(404).json({
        message: 'Document not found',
        code: 'DOCUMENT_NOT_FOUND'
      });
    }

    await document.addAnnotation(annotationData);

    res.status(201).json({
      message: 'Annotation added successfully',
      document
    });

  } catch (error) {
    console.error('Add annotation error:', error);
    res.status(500).json({
      message: 'Failed to add annotation',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Search documents
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

    const searchResults = await Document.find({
      userId: req.user._id,
      isDeleted: false,
      $text: { $search: q }
    }, {
      score: { $meta: 'textScore' }
    })
    .populate('caseId', 'title caseNumber')
    .select('-processing.extractedText')
    .sort({ score: { $meta: 'textScore' } })
    .skip(skip)
    .limit(parseInt(limit));

    const total = await Document.countDocuments({
      userId: req.user._id,
      isDeleted: false,
      $text: { $search: q }
    });

    res.json({
      documents: searchResults,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        count: searchResults.length,
        totalRecords: total
      },
      searchQuery: q
    });

  } catch (error) {
    console.error('Search documents error:', error);
    res.status(500).json({
      message: 'Failed to search documents',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get document categories
router.get('/meta/categories', authenticateToken, async (req, res) => {
  try {
    const categories = await Document.distinct('category', { 
      userId: req.user._id, 
      isDeleted: false 
    });

    res.json({ categories });

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      message: 'Failed to fetch categories',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get document statistics
router.get('/meta/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await Document.aggregate([
      { $match: { userId: req.user._id, isDeleted: false } },
      {
        $group: {
          _id: null,
          totalDocuments: { $sum: 1 },
          totalSize: { $sum: '$fileSize' },
          avgSize: { $avg: '$fileSize' },
          categoryCounts: {
            $push: '$category'
          },
          fileTypeCounts: {
            $push: '$fileType'
          }
        }
      }
    ]);

    const result = stats[0] || {
      totalDocuments: 0,
      totalSize: 0,
      avgSize: 0,
      categoryCounts: [],
      fileTypeCounts: []
    };

    // Count occurrences
    const categoryStats = result.categoryCounts.reduce((acc, cat) => {
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});

    const fileTypeStats = result.fileTypeCounts.reduce((acc, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    res.json({
      totalDocuments: result.totalDocuments,
      totalSize: result.totalSize,
      averageSize: Math.round(result.avgSize || 0),
      categoryBreakdown: categoryStats,
      fileTypeBreakdown: fileTypeStats,
      generatedAt: new Date()
    });

  } catch (error) {
    console.error('Get document stats error:', error);
    res.status(500).json({
      message: 'Failed to fetch document statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;