const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Ensure upload directories exist
const ensureUploadDirs = () => {
  const dirs = ['uploads', 'uploads/documents', 'uploads/avatars', 'uploads/temp'];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

ensureUploadDirs();

// File filter function
const fileFilter = (allowedTypes = []) => {
  return (req, file, cb) => {
    if (allowedTypes.length === 0) {
      return cb(null, true);
    }

    const isAllowed = allowedTypes.some(type => {
      if (type.startsWith('.')) {
        // Extension check
        return file.originalname.toLowerCase().endsWith(type);
      } else {
        // MIME type check
        return file.mimetype.includes(type);
      }
    });

    if (isAllowed) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed. Allowed types: ${allowedTypes.join(', ')}`), false);
    }
  };
};

// Storage configuration for documents
const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/documents/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = uuidv4();
    const extension = path.extname(file.originalname);
    const filename = `doc_${uniqueSuffix}${extension}`;
    cb(null, filename);
  }
});

// Storage configuration for avatars
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/avatars/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = uuidv4();
    const extension = path.extname(file.originalname);
    const filename = `avatar_${uniqueSuffix}${extension}`;
    cb(null, filename);
  }
});

// Memory storage for temporary processing
const memoryStorage = multer.memoryStorage();

// Document upload configuration
const uploadDocument = multer({
  storage: documentStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 10
  },
  fileFilter: fileFilter([
    '.pdf', '.doc', '.docx', '.txt', '.rtf',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/rtf'
  ])
});

// Avatar upload configuration
const uploadAvatar = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1
  },
  fileFilter: fileFilter([
    '.jpg', '.jpeg', '.png', '.gif',
    'image/jpeg',
    'image/png',
    'image/gif'
  ])
});

// Memory upload for processing
const uploadToMemory = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 1
  }
});

// Validation middleware
const validateFileUpload = (req, res, next) => {
  if (!req.files && !req.file) {
    return res.status(400).json({
      message: 'No files uploaded',
      code: 'NO_FILES'
    });
  }
  next();
};

// File processing middleware
const processUploadedFile = async (req, res, next) => {
  try {
    if (req.file) {
      // Single file
      req.fileInfo = {
        originalName: req.file.originalname,
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size,
        mimetype: req.file.mimetype,
        uploadedAt: new Date()
      };
    } else if (req.files) {
      // Multiple files
      req.filesInfo = req.files.map(file => ({
        originalName: file.originalname,
        filename: file.filename,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype,
        uploadedAt: new Date()
      }));
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Clean up temporary files
const cleanupTempFiles = (files) => {
  if (!files) return;
  
  const fileList = Array.isArray(files) ? files : [files];
  fileList.forEach(file => {
    if (file.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  });
};

// Error handling middleware for multer
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          message: 'File too large',
          code: 'FILE_TOO_LARGE',
          maxSize: '50MB'
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          message: 'Too many files',
          code: 'TOO_MANY_FILES',
          maxFiles: 10
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          message: 'Unexpected file field',
          code: 'UNEXPECTED_FILE'
        });
      default:
        return res.status(400).json({
          message: 'Upload error',
          code: 'UPLOAD_ERROR',
          details: error.message
        });
    }
  } else if (error.message.includes('File type not allowed')) {
    return res.status(400).json({
      message: error.message,
      code: 'INVALID_FILE_TYPE'
    });
  }
  
  next(error);
};

// Get file type from extension
const getFileType = (filename) => {
  const extension = path.extname(filename).toLowerCase();
  const typeMap = {
    '.pdf': 'pdf',
    '.doc': 'doc',
    '.docx': 'docx',
    '.txt': 'txt',
    '.rtf': 'rtf',
    '.jpg': 'jpg',
    '.jpeg': 'jpeg',
    '.png': 'png',
    '.gif': 'gif'
  };
  return typeMap[extension] || 'other';
};

// Create upload URL
const createUploadUrl = (filename, type = 'documents') => {
  return `/uploads/${type}/${filename}`;
};

module.exports = {
  uploadDocument,
  uploadAvatar,
  uploadToMemory,
  validateFileUpload,
  processUploadedFile,
  handleUploadError,
  cleanupTempFiles,
  getFileType,
  createUploadUrl,
  fileFilter
};