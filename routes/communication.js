const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Mock communication templates and scenarios
const communicationTemplates = {
  email: [
    {
      id: 'client-update',
      title: 'Client Case Update',
      category: 'client-communication',
      tone: 'professional',
      template: `Dear [Client Name],

I hope this email finds you well. I wanted to provide you with an update on your case regarding [Case Matter].

[Update Content]

Next Steps:
- [Action Item 1]
- [Action Item 2]

Please don't hesitate to contact me if you have any questions or concerns.

Best regards,
[Your Name]`
    },
    {
      id: 'opposing-counsel',
      title: 'Letter to Opposing Counsel',
      category: 'professional-correspondence',
      tone: 'formal',
      template: `Dear [Attorney Name],

I am writing regarding [Case/Matter Reference].

[Main Content]

I look forward to your prompt response.

Sincerely,
[Your Name]
[Title]
[Law Firm]`
    }
  ],
  letter: [
    {
      id: 'demand-letter',
      title: 'Demand Letter Template',
      category: 'legal-demand',
      tone: 'assertive',
      template: `[Date]

[Recipient Name]
[Address]

Re: [Subject Matter]

Dear [Recipient Name],

This letter serves as formal notice that [Demand Statement].

[Supporting Facts and Legal Basis]

DEMAND: [Specific Demand]

You have [Time Period] from the date of this letter to [Required Action]. Failure to comply will result in [Consequences].

Sincerely,
[Your Name]`
    }
  ],
  court: [
    {
      id: 'motion-brief',
      title: 'Motion Brief Template',
      category: 'court-filing',
      tone: 'formal',
      template: `[Court Header]

MOTION FOR [Relief Sought]

TO THE HONORABLE COURT:

[Party] respectfully moves this Court for [Relief] and states as follows:

I. INTRODUCTION
[Brief overview]

II. STATEMENT OF FACTS
[Relevant facts]

III. LEGAL ARGUMENT
[Legal basis]

IV. CONCLUSION
For the foregoing reasons, [Party] respectfully requests that this Court [Specific Relief].

Respectfully submitted,
[Attorney Name]`
    }
  ]
};

const communicationTips = {
  tone: {
    professional: [
      'Use clear, concise language',
      'Maintain formal structure',
      'Be respectful and courteous',
      'Avoid emotional language'
    ],
    assertive: [
      'State your position clearly',
      'Use active voice',
      'Be direct but not aggressive',
      'Support claims with facts'
    ],
    empathetic: [
      'Acknowledge the recipient\'s concerns',
      'Use understanding language',
      'Show genuine care',
      'Offer support and solutions'
    ]
  },
  structure: [
    'Start with a clear subject line',
    'Open with appropriate greeting',
    'State purpose in first paragraph',
    'Organize content logically',
    'Close with clear next steps',
    'Use professional signature'
  ],
  language: [
    'Use plain English when possible',
    'Define legal terms if necessary',
    'Be specific and concrete',
    'Avoid redundancy',
    'Proofread carefully'
  ]
};

// Get communication templates
router.get('/templates', authenticateToken, [
  query('type').optional().isIn(['email', 'letter', 'court', 'all']),
  query('category').optional().isString(),
  query('tone').optional().isIn(['professional', 'formal', 'assertive', 'empathetic'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { type = 'all', category, tone } = req.query;
    let templates = [];

    // Collect templates based on type
    if (type === 'all') {
      Object.values(communicationTemplates).forEach(typeTemplates => {
        templates = templates.concat(typeTemplates);
      });
    } else if (communicationTemplates[type]) {
      templates = communicationTemplates[type];
    }

    // Apply filters
    if (category) {
      templates = templates.filter(t => t.category === category);
    }

    if (tone) {
      templates = templates.filter(t => t.tone === tone);
    }

    res.json({
      templates,
      count: templates.length,
      filters: { type, category, tone }
    });

  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({
      message: 'Failed to fetch templates',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get specific template by ID
router.get('/templates/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    let template = null;

    // Search through all template types
    for (const typeTemplates of Object.values(communicationTemplates)) {
      template = typeTemplates.find(t => t.id === id);
      if (template) break;
    }

    if (!template) {
      return res.status(404).json({
        message: 'Template not found',
        code: 'TEMPLATE_NOT_FOUND'
      });
    }

    res.json({ template });

  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({
      message: 'Failed to fetch template',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Analyze communication text
router.post('/analyze', authenticateToken, [
  body('text').trim().isLength({ min: 10 }).withMessage('Text must be at least 10 characters long'),
  body('type').optional().isIn(['email', 'letter', 'court', 'general']),
  body('audience').optional().isIn(['client', 'opposing-counsel', 'court', 'colleague', 'general'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { text, type = 'general', audience = 'general' } = req.body;

    // Simple analysis (in production, use NLP libraries or AI services)
    const analysis = {
      wordCount: text.split(/\s+/).length,
      characterCount: text.length,
      sentenceCount: text.split(/[.!?]+/).filter(s => s.trim().length > 0).length,
      paragraphCount: text.split(/\n\s*\n/).length,
      readabilityScore: calculateReadabilityScore(text),
      toneAnalysis: analyzeTone(text),
      suggestions: generateSuggestions(text, type, audience),
      strengths: identifyStrengths(text),
      improvements: identifyImprovements(text)
    };

    res.json({
      message: 'Communication analysis completed',
      analysis,
      originalText: text,
      metadata: {
        type,
        audience,
        analyzedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Communication analysis error:', error);
    res.status(500).json({
      message: 'Failed to analyze communication',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get communication tips
router.get('/tips', authenticateToken, [
  query('category').optional().isIn(['tone', 'structure', 'language', 'all'])
], async (req, res) => {
  try {
    const { category = 'all' } = req.query;
    let tips = {};

    if (category === 'all') {
      tips = communicationTips;
    } else if (communicationTips[category]) {
      tips = { [category]: communicationTips[category] };
    }

    res.json({
      tips,
      category
    });

  } catch (error) {
    console.error('Get tips error:', error);
    res.status(500).json({
      message: 'Failed to fetch communication tips',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Practice scenarios
router.get('/scenarios', authenticateToken, [
  query('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']),
  query('type').optional().isIn(['negotiation', 'client-meeting', 'court-appearance', 'mediation'])
], async (req, res) => {
  try {
    const { difficulty = 'intermediate', type } = req.query;

    const scenarios = [
      {
        id: 'client-difficult-news',
        title: 'Delivering Difficult News to Client',
        type: 'client-meeting',
        difficulty: 'intermediate',
        description: 'Practice delivering unfavorable case developments to a client',
        situation: 'Your client\'s case has taken an unexpected turn. Key evidence has been ruled inadmissible.',
        objectives: [
          'Deliver the news clearly and professionally',
          'Maintain client confidence',
          'Explain next steps',
          'Address client concerns'
        ],
        tips: [
          'Be direct but empathetic',
          'Focus on solutions, not just problems',
          'Allow time for questions',
          'Reassure about your commitment'
        ]
      },
      {
        id: 'opposing-counsel-negotiation',
        title: 'Settlement Negotiation',
        type: 'negotiation',
        difficulty: 'advanced',
        description: 'Navigate a complex settlement negotiation with opposing counsel',
        situation: 'You\'re negotiating a settlement in a personal injury case. The opposing party has made an initial offer.',
        objectives: [
          'Present your client\'s position effectively',
          'Counter offer strategically',
          'Identify areas of compromise',
          'Maintain professional relationships'
        ],
        tips: [
          'Prepare your BATNA (Best Alternative to Negotiated Agreement)',
          'Listen actively to understand interests',
          'Use objective criteria',
          'Separate people from positions'
        ]
      },
      {
        id: 'court-oral-argument',
        title: 'Oral Argument Preparation',
        type: 'court-appearance',
        difficulty: 'advanced',
        description: 'Prepare for and practice oral arguments before the court',
        situation: 'You\'re arguing a motion for summary judgment. The judge has specific concerns about your case.',
        objectives: [
          'Present legal arguments clearly',
          'Address judge\'s questions directly',
          'Distinguish unfavorable precedents',
          'Maintain composure under pressure'
        ],
        tips: [
          'Know your case inside and out',
          'Anticipate difficult questions',
          'Practice with colleagues',
          'Prepare concise answers'
        ]
      }
    ];

    let filteredScenarios = scenarios;

    if (difficulty) {
      filteredScenarios = filteredScenarios.filter(s => s.difficulty === difficulty);
    }

    if (type) {
      filteredScenarios = filteredScenarios.filter(s => s.type === type);
    }

    res.json({
      scenarios: filteredScenarios,
      count: filteredScenarios.length,
      filters: { difficulty, type }
    });

  } catch (error) {
    console.error('Get scenarios error:', error);
    res.status(500).json({
      message: 'Failed to fetch practice scenarios',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Generate communication based on parameters
router.post('/generate', authenticateToken, [
  body('type').isIn(['email', 'letter', 'memo', 'brief']).withMessage('Invalid communication type'),
  body('audience').isIn(['client', 'opposing-counsel', 'court', 'colleague']).withMessage('Invalid audience'),
  body('purpose').trim().isLength({ min: 5 }).withMessage('Purpose must be at least 5 characters'),
  body('tone').optional().isIn(['professional', 'formal', 'assertive', 'empathetic']),
  body('keyPoints').optional().isArray(),
  body('context').optional().trim().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { type, audience, purpose, tone = 'professional', keyPoints = [], context = '' } = req.body;

    // Generate communication based on parameters
    const generatedCommunication = generateCommunication({
      type,
      audience,
      purpose,
      tone,
      keyPoints,
      context
    });

    res.json({
      message: 'Communication generated successfully',
      communication: generatedCommunication,
      parameters: {
        type,
        audience,
        purpose,
        tone,
        keyPoints,
        context
      },
      generatedAt: new Date()
    });

  } catch (error) {
    console.error('Generate communication error:', error);
    res.status(500).json({
      message: 'Failed to generate communication',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Helper functions for analysis
function calculateReadabilityScore(text) {
  // Simple Flesch Reading Ease approximation
  const words = text.split(/\s+/).length;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  const syllables = text.split(/[aeiouy]+/i).length - 1;
  
  if (sentences === 0 || words === 0) return 0;
  
  const score = 206.835 - (1.015 * (words / sentences)) - (84.6 * (syllables / words));
  return Math.max(0, Math.min(100, Math.round(score)));
}

function analyzeTone(text) {
  const positiveWords = ['pleased', 'happy', 'excellent', 'great', 'wonderful', 'appreciate', 'thank'];
  const negativeWords = ['unfortunately', 'regret', 'sorry', 'disappointed', 'concerned', 'issue', 'problem'];
  const formalWords = ['pursuant', 'therefore', 'hereby', 'whereas', 'aforementioned', 'heretofore'];
  
  const words = text.toLowerCase().split(/\s+/);
  
  const positiveCount = words.filter(word => positiveWords.includes(word)).length;
  const negativeCount = words.filter(word => negativeWords.includes(word)).length;
  const formalCount = words.filter(word => formalWords.includes(word)).length;
  
  let tone = 'neutral';
  if (positiveCount > negativeCount) tone = 'positive';
  else if (negativeCount > positiveCount) tone = 'negative';
  
  const formality = formalCount > 2 ? 'formal' : 'informal';
  
  return { tone, formality, positiveCount, negativeCount, formalCount };
}

function generateSuggestions(text, type, audience) {
  const suggestions = [];
  
  if (text.length < 50) {
    suggestions.push('Consider expanding your message for better clarity');
  }
  
  if (text.includes('!!!') || text.includes('???')) {
    suggestions.push('Use single punctuation marks for professional communication');
  }
  
  if (audience === 'client' && text.split(' ').some(word => word.length > 12)) {
    suggestions.push('Consider using simpler language when communicating with clients');
  }
  
  if (type === 'court' && !text.includes('Respectfully')) {
    suggestions.push('Court communications should include respectful language');
  }
  
  return suggestions;
}

function identifyStrengths(text) {
  const strengths = [];
  
  if (text.includes('Thank you') || text.includes('Please')) {
    strengths.push('Polite and courteous tone');
  }
  
  if (text.match(/\d+/)) {
    strengths.push('Includes specific details and numbers');
  }
  
  if (text.includes('Next steps') || text.includes('Action')) {
    strengths.push('Provides clear action items');
  }
  
  return strengths;
}

function identifyImprovements(text) {
  const improvements = [];
  
  if (!text.includes('?')) {
    improvements.push('Consider asking questions to encourage engagement');
  }
  
  if (text.split('\n').length < 3) {
    improvements.push('Break content into paragraphs for better readability');
  }
  
  if (!text.match(/Best regards|Sincerely|Thank you/i)) {
    improvements.push('Add a professional closing');
  }
  
  return improvements;
}

function generateCommunication({ type, audience, purpose, tone, keyPoints, context }) {
  let template = '';
  
  // Basic template generation based on type and audience
  if (type === 'email') {
    template = `Subject: ${purpose}

Dear [Recipient Name],

I hope this email finds you well. I am writing to ${purpose.toLowerCase()}.

${context ? `Background: ${context}\n\n` : ''}${keyPoints.length > 0 ? `Key Points:\n${keyPoints.map(point => `• ${point}`).join('\n')}\n\n` : ''}Please let me know if you have any questions or need additional information.

Best regards,
[Your Name]`;
  } else if (type === 'letter') {
    template = `[Date]

[Recipient Name]
[Address]

Re: ${purpose}

Dear [Recipient Name],

${context ? `${context}\n\n` : ''}${keyPoints.length > 0 ? keyPoints.map(point => `${point}`).join('\n\n') + '\n\n' : ''}I look forward to your response.

Sincerely,
[Your Name]`;
  }
  
  return {
    template,
    wordCount: template.split(/\s+/).length,
    estimatedReadTime: Math.ceil(template.split(/\s+/).length / 200),
    suggestions: [
      'Customize the recipient information',
      'Review for tone consistency',
      'Add specific dates and deadlines',
      'Proofread before sending'
    ]
  };
}

module.exports = router;