const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Mock legal resources database
const mockLegalResources = [
  {
    id: '1',
    title: 'Contract Law Fundamentals',
    type: 'guide',
    category: 'contract',
    description: 'Comprehensive guide to understanding contract law basics',
    url: 'https://example.com/contract-law-guide',
    jurisdiction: 'federal',
    relevanceScore: 0.95,
    lastUpdated: '2024-01-15'
  },
  {
    id: '2',
    title: 'Employment Rights Handbook',
    type: 'handbook',
    category: 'employment',
    description: 'Complete handbook on employee rights and employer obligations',
    url: 'https://example.com/employment-handbook',
    jurisdiction: 'federal',
    relevanceScore: 0.88,
    lastUpdated: '2024-02-01'
  },
  {
    id: '3',
    title: 'Family Court Procedures',
    type: 'procedure',
    category: 'family',
    description: 'Step-by-step guide to family court procedures and requirements',
    url: 'https://example.com/family-court-procedures',
    jurisdiction: 'state',
    relevanceScore: 0.92,
    lastUpdated: '2024-01-20'
  },
  {
    id: '4',
    title: 'Criminal Defense Strategies',
    type: 'strategy',
    category: 'criminal',
    description: 'Advanced strategies for criminal defense cases',
    url: 'https://example.com/criminal-defense',
    jurisdiction: 'federal',
    relevanceScore: 0.87,
    lastUpdated: '2024-01-10'
  },
  {
    id: '5',
    title: 'Real Estate Transaction Guide',
    type: 'guide',
    category: 'real-estate',
    description: 'Complete guide to real estate transactions and documentation',
    url: 'https://example.com/real-estate-guide',
    jurisdiction: 'state',
    relevanceScore: 0.90,
    lastUpdated: '2024-02-05'
  }
];

// Mock risk assessment factors
const riskFactors = {
  case_complexity: {
    low: { score: 0.2, description: 'Straightforward case with clear precedents' },
    medium: { score: 0.5, description: 'Moderate complexity with some challenging aspects' },
    high: { score: 0.8, description: 'Complex case with multiple legal issues' }
  },
  evidence_strength: {
    strong: { score: 0.1, description: 'Strong evidence supporting your position' },
    moderate: { score: 0.4, description: 'Adequate evidence with some gaps' },
    weak: { score: 0.7, description: 'Limited or weak evidence' }
  },
  opponent_resources: {
    limited: { score: 0.2, description: 'Opponent has limited legal resources' },
    moderate: { score: 0.4, description: 'Opponent has adequate legal representation' },
    extensive: { score: 0.7, description: 'Opponent has extensive legal resources' }
  },
  time_constraints: {
    adequate: { score: 0.1, description: 'Sufficient time to prepare case' },
    tight: { score: 0.4, description: 'Limited time for case preparation' },
    urgent: { score: 0.8, description: 'Very tight deadlines and time pressure' }
  },
  financial_impact: {
    low: { score: 0.2, description: 'Low financial stakes' },
    medium: { score: 0.5, description: 'Moderate financial implications' },
    high: { score: 0.8, description: 'High financial stakes involved' }
  }
};

// Search legal resources
router.get('/search', authenticateToken, [
  query('q').optional().isString(),
  query('category').optional().isString(),
  query('type').optional().isIn(['guide', 'handbook', 'procedure', 'strategy', 'template', 'statute', 'case-law']),
  query('jurisdiction').optional().isIn(['federal', 'state', 'local']),
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

    const { 
      q, 
      category, 
      type, 
      jurisdiction, 
      page = 1, 
      limit = 10,
      sortBy = 'relevanceScore',
      sortOrder = 'desc'
    } = req.query;

    let filteredResources = [...mockLegalResources];

    // Apply filters
    if (q) {
      const searchTerm = q.toLowerCase();
      filteredResources = filteredResources.filter(resource =>
        resource.title.toLowerCase().includes(searchTerm) ||
        resource.description.toLowerCase().includes(searchTerm) ||
        resource.category.toLowerCase().includes(searchTerm)
      );
    }

    if (category) {
      filteredResources = filteredResources.filter(resource => 
        resource.category === category
      );
    }

    if (type) {
      filteredResources = filteredResources.filter(resource => 
        resource.type === type
      );
    }

    if (jurisdiction) {
      filteredResources = filteredResources.filter(resource => 
        resource.jurisdiction === jurisdiction
      );
    }

    // Sort resources
    filteredResources.sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];
      
      if (sortOrder === 'desc') {
        return bValue > aValue ? 1 : -1;
      } else {
        return aValue > bValue ? 1 : -1;
      }
    });

    // Pagination
    const skip = (page - 1) * limit;
    const paginatedResources = filteredResources.slice(skip, skip + parseInt(limit));
    const total = filteredResources.length;

    res.json({
      resources: paginatedResources,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        count: paginatedResources.length,
        totalRecords: total
      },
      filters: {
        searchQuery: q,
        category,
        type,
        jurisdiction
      }
    });

  } catch (error) {
    console.error('Resource search error:', error);
    res.status(500).json({
      message: 'Failed to search resources',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get resource categories
router.get('/categories', authenticateToken, async (req, res) => {
  try {
    const categories = [...new Set(mockLegalResources.map(r => r.category))];
    const types = [...new Set(mockLegalResources.map(r => r.type))];
    const jurisdictions = [...new Set(mockLegalResources.map(r => r.jurisdiction))];

    res.json({
      categories,
      types,
      jurisdictions
    });

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      message: 'Failed to fetch categories',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get recommended resources based on case
router.get('/recommendations/:caseId', authenticateToken, async (req, res) => {
  try {
    const { caseId } = req.params;
    
    const Case = require('../models/Case');
    const caseDoc = await Case.findOne({ _id: caseId, userId: req.user._id });
    
    if (!caseDoc) {
      return res.status(404).json({
        message: 'Case not found',
        code: 'CASE_NOT_FOUND'
      });
    }

    // Filter resources based on case type
    const recommendedResources = mockLegalResources
      .filter(resource => {
        // Map case types to resource categories
        const categoryMapping = {
          'civil': ['contract', 'civil'],
          'criminal': ['criminal'],
          'family': ['family'],
          'employment': ['employment'],
          'real-estate': ['real-estate'],
          'corporate': ['contract', 'corporate'],
          'personal-injury': ['civil', 'personal-injury']
        };
        
        const relevantCategories = categoryMapping[caseDoc.caseType] || ['general'];
        return relevantCategories.includes(resource.category);
      })
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 10);

    res.json({
      resources: recommendedResources,
      caseInfo: {
        id: caseDoc._id,
        title: caseDoc.title,
        type: caseDoc.caseType,
        priority: caseDoc.priority
      },
      count: recommendedResources.length
    });

  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({
      message: 'Failed to get recommendations',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Perform risk assessment
router.post('/risk-assessment', authenticateToken, [
  body('caseId').optional().isMongoId(),
  body('factors').isObject().withMessage('Risk factors are required'),
  body('factors.case_complexity').isIn(['low', 'medium', 'high']),
  body('factors.evidence_strength').isIn(['strong', 'moderate', 'weak']),
  body('factors.opponent_resources').isIn(['limited', 'moderate', 'extensive']),
  body('factors.time_constraints').isIn(['adequate', 'tight', 'urgent']),
  body('factors.financial_impact').isIn(['low', 'medium', 'high']),
  body('additionalFactors').optional().isArray(),
  body('description').optional().trim().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { caseId, factors, additionalFactors = [], description } = req.body;

    // Validate case if provided
    let caseInfo = null;
    if (caseId) {
      const Case = require('../models/Case');
      const caseDoc = await Case.findOne({ _id: caseId, userId: req.user._id });
      if (!caseDoc) {
        return res.status(404).json({
          message: 'Case not found',
          code: 'CASE_NOT_FOUND'
        });
      }
      caseInfo = {
        id: caseDoc._id,
        title: caseDoc.title,
        type: caseDoc.caseType,
        status: caseDoc.status
      };
    }

    // Calculate risk score
    let totalRiskScore = 0;
    let factorCount = 0;
    const assessmentDetails = {};

    Object.keys(factors).forEach(factorKey => {
      if (riskFactors[factorKey] && riskFactors[factorKey][factors[factorKey]]) {
        const factor = riskFactors[factorKey][factors[factorKey]];
        totalRiskScore += factor.score;
        factorCount++;
        
        assessmentDetails[factorKey] = {
          value: factors[factorKey],
          score: factor.score,
          description: factor.description
        };
      }
    });

    const averageRiskScore = factorCount > 0 ? totalRiskScore / factorCount : 0;

    // Determine risk level
    let riskLevel = 'low';
    let riskColor = 'green';
    if (averageRiskScore >= 0.7) {
      riskLevel = 'high';
      riskColor = 'red';
    } else if (averageRiskScore >= 0.4) {
      riskLevel = 'medium';
      riskColor = 'yellow';
    }

    // Generate recommendations
    const recommendations = [];
    
    if (averageRiskScore >= 0.6) {
      recommendations.push('Consider seeking experienced legal counsel');
      recommendations.push('Develop a comprehensive case strategy');
      recommendations.push('Allocate additional resources for case preparation');
    }
    
    if (factors.evidence_strength === 'weak') {
      recommendations.push('Focus on gathering additional evidence');
      recommendations.push('Consider expert witnesses or testimony');
    }
    
    if (factors.time_constraints === 'urgent') {
      recommendations.push('Prioritize critical deadlines');
      recommendations.push('Consider requesting extensions where possible');
    }
    
    if (factors.opponent_resources === 'extensive') {
      recommendations.push('Prepare for well-funded opposition');
      recommendations.push('Focus on strong legal arguments and precedents');
    }

    const assessment = {
      id: new Date().getTime().toString(),
      userId: req.user._id,
      caseId: caseId || null,
      caseInfo,
      riskScore: Math.round(averageRiskScore * 100) / 100,
      riskLevel,
      riskColor,
      factors: assessmentDetails,
      additionalFactors,
      description,
      recommendations,
      createdAt: new Date()
    };

    res.json({
      message: 'Risk assessment completed',
      assessment
    });

  } catch (error) {
    console.error('Risk assessment error:', error);
    res.status(500).json({
      message: 'Failed to perform risk assessment',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get risk assessment template
router.get('/risk-assessment/template', authenticateToken, async (req, res) => {
  try {
    const template = {
      factors: Object.keys(riskFactors).map(key => ({
        id: key,
        name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        options: Object.keys(riskFactors[key]).map(optionKey => ({
          value: optionKey,
          label: optionKey.charAt(0).toUpperCase() + optionKey.slice(1),
          description: riskFactors[key][optionKey].description,
          score: riskFactors[key][optionKey].score
        }))
      })),
      additionalFactorOptions: [
        'Statute of limitations concerns',
        'Jurisdictional issues',
        'Precedent availability',
        'Public interest impact',
        'Media attention potential',
        'Settlement likelihood',
        'Appeal probability',
        'Enforcement challenges'
      ]
    };

    res.json({ template });

  } catch (error) {
    console.error('Get risk template error:', error);
    res.status(500).json({
      message: 'Failed to fetch risk assessment template',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get legal research tools
router.get('/research-tools', authenticateToken, async (req, res) => {
  try {
    const tools = [
      {
        id: 'case-law-search',
        name: 'Case Law Search',
        description: 'Search through extensive case law databases',
        category: 'research',
        url: '/tools/case-law-search',
        features: ['Advanced search filters', 'Citation analysis', 'Related cases']
      },
      {
        id: 'statute-finder',
        name: 'Statute Finder',
        description: 'Find relevant statutes and regulations',
        category: 'research',
        url: '/tools/statute-finder',
        features: ['Multi-jurisdiction search', 'Recent updates', 'Cross-references']
      },
      {
        id: 'legal-forms',
        name: 'Legal Forms Library',
        description: 'Access templates and legal forms',
        category: 'documents',
        url: '/tools/legal-forms',
        features: ['Customizable templates', 'State-specific forms', 'Auto-fill options']
      },
      {
        id: 'citation-checker',
        name: 'Citation Checker',
        description: 'Verify and format legal citations',
        category: 'tools',
        url: '/tools/citation-checker',
        features: ['Multiple citation formats', 'Accuracy verification', 'Batch processing']
      }
    ];

    res.json({ tools });

  } catch (error) {
    console.error('Get research tools error:', error);
    res.status(500).json({
      message: 'Failed to fetch research tools',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;