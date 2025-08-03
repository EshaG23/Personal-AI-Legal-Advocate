# Personal AI Legal Advocate - Backend API

A comprehensive backend API for the Personal AI Legal Advocate application, providing case management, document processing, AI chat functionality, and legal resource management.

## Features

- **User Authentication & Profile Management**
- **Case Management** with timelines and deadlines
- **Document Upload & Processing** with file management
- **Private Journaling** with mood tracking and favorites
- **AI Chat Conversations** with legal assistance
- **Resource Finder** with legal research tools
- **Risk Assessment** for case strategy
- **Communication Coach** for legal writing

## Tech Stack

- **Node.js** with Express.js framework
- **MongoDB** with Mongoose ODM
- **JWT** for authentication
- **Multer** for file uploads
- **bcryptjs** for password hashing
- **Express Validator** for input validation
- **Helmet** for security headers
- **CORS** for cross-origin resource sharing

## Quick Start

### Prerequisites

- Node.js (v16 or higher)
- MongoDB (local or cloud instance)
- npm or yarn package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd personal-ai-legal-advocate-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` file with your configuration:
   ```env
   PORT=5000
   NODE_ENV=development
   MONGODB_URI=mongodb://localhost:27017/legal-advocate
   JWT_SECRET=your-super-secure-jwt-secret-key-here
   OPENAI_API_KEY=your-openai-api-key-here
   ```

4. **Start the server**
   ```bash
   # Development mode with auto-restart
   npm run dev
   
   # Production mode
   npm start
   ```

5. **Verify installation**
   ```bash
   curl http://localhost:5000/api/health
   ```

## API Documentation

### Base URL
```
http://localhost:5000/api
```

### Authentication

Most endpoints require authentication using JWT tokens. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### API Endpoints

#### Authentication Routes (`/api/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/register` | Create new user profile |
| POST | `/login` | User login |
| GET | `/profile` | Get current user profile |
| PUT | `/profile` | Update user profile |
| PUT | `/password` | Change password |
| POST | `/logout` | User logout |
| GET | `/verify` | Verify JWT token |

#### User Management (`/api/users`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Get all users (admin only) |
| GET | `/:id` | Get user by ID |
| POST | `/avatar` | Upload user avatar |
| DELETE | `/avatar` | Delete user avatar |
| PATCH | `/preferences` | Update user preferences |
| GET | `/:id/stats` | Get user statistics |

#### Case Management (`/api/cases`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Get all cases for user |
| GET | `/:id` | Get case by ID |
| POST | `/` | Create new case |
| PUT | `/:id` | Update case |
| DELETE | `/:id` | Delete case |
| POST | `/:id/timeline` | Add timeline event |
| PUT | `/:id/timeline/:eventId` | Update timeline event |
| DELETE | `/:id/timeline/:eventId` | Delete timeline event |
| GET | `/:id/deadlines` | Get upcoming deadlines |
| POST | `/:id/notes` | Add note to case |

#### Document Management (`/api/documents`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Get all documents |
| GET | `/:id` | Get document by ID |
| POST | `/upload` | Upload documents |
| PUT | `/:id` | Update document |
| DELETE | `/:id` | Delete document (soft delete) |
| GET | `/:id/download` | Download document |
| POST | `/:id/annotations` | Add annotation to document |
| GET | `/search/text` | Search documents |
| GET | `/meta/categories` | Get document categories |
| GET | `/meta/stats` | Get document statistics |

#### Journal Management (`/api/journal`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Get all journal entries |
| GET | `/:id` | Get journal entry by ID |
| POST | `/` | Create new journal entry |
| PUT | `/:id` | Update journal entry |
| DELETE | `/:id` | Delete journal entry |
| PATCH | `/:id/favorite` | Toggle favorite status |
| POST | `/:id/reminders` | Add reminder |
| GET | `/reminders/upcoming` | Get upcoming reminders |
| GET | `/search/text` | Search journal entries |
| GET | `/meta/stats` | Get journal statistics |

#### Chat Management (`/api/chat`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Get all conversations |
| GET | `/:id` | Get conversation by ID |
| POST | `/` | Create new conversation |
| POST | `/:id/messages` | Send message to conversation |
| PUT | `/:id` | Update conversation |
| DELETE | `/:id` | Delete conversation |
| PATCH | `/:id/bookmark` | Toggle bookmark status |
| PATCH | `/:id/archive` | Archive conversation |
| PUT | `/:id/messages/:messageId` | Update message |
| GET | `/search/text` | Search conversations |
| GET | `/meta/stats` | Get chat statistics |

#### Resource Management (`/api/resources`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/search` | Search legal resources |
| GET | `/categories` | Get resource categories |
| GET | `/recommendations/:caseId` | Get case-specific recommendations |
| POST | `/risk-assessment` | Perform risk assessment |
| GET | `/risk-assessment/template` | Get risk assessment template |
| GET | `/research-tools` | Get legal research tools |

#### Communication Coach (`/api/communication`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/templates` | Get communication templates |
| GET | `/templates/:id` | Get specific template |
| POST | `/analyze` | Analyze communication text |
| GET | `/tips` | Get communication tips |
| GET | `/scenarios` | Get practice scenarios |
| POST | `/generate` | Generate communication |

### Request/Response Examples

#### Create User Profile
```bash
POST /api/auth/register
Content-Type: application/json

{
  "profileName": "John Doe",
  "email": "john@example.com",
  "password": "securepassword123"
}
```

Response:
```json
{
  "message": "Profile created successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "60f7b3b3b3b3b3b3b3b3b3b3",
    "profileName": "John Doe",
    "email": "john@example.com",
    "preferences": {
      "theme": "dark",
      "notifications": {
        "email": true,
        "push": true,
        "reminders": true
      }
    },
    "createdAt": "2024-01-15T10:00:00.000Z"
  }
}
```

#### Create New Case
```bash
POST /api/cases
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Contract Dispute - ABC Corp",
  "description": "Breach of contract case involving service agreement",
  "caseType": "civil",
  "priority": "high"
}
```

#### Upload Documents
```bash
POST /api/documents/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

documents: [file1.pdf, file2.docx]
title: "Contract Documents"
category: "contract"
caseId: "60f7b3b3b3b3b3b3b3b3b3b3"
```

## File Structure

```
├── server.js                 # Main server file
├── package.json              # Dependencies and scripts
├── .env.example              # Environment variables template
├── models/                   # Database models
│   ├── User.js
│   ├── Case.js
│   ├── Document.js
│   ├── JournalEntry.js
│   └── ChatConversation.js
├── routes/                   # API routes
│   ├── auth.js
│   ├── users.js
│   ├── cases.js
│   ├── documents.js
│   ├── journal.js
│   ├── chat.js
│   ├── resources.js
│   └── communication.js
├── middleware/               # Custom middleware
│   ├── auth.js
│   └── upload.js
└── uploads/                  # File upload directory
    ├── documents/
    └── avatars/
```

## Database Schema

### User Model
- Profile information and authentication
- Preferences and subscription details
- Activity tracking

### Case Model
- Case details and metadata
- Timeline events and deadlines
- Party information and notes
- Financial tracking

### Document Model
- File information and metadata
- Processing status and extracted content
- Annotations and version history
- Access permissions

### Journal Entry Model
- Personal journal entries
- Mood tracking and categorization
- Reminders and favorites
- Edit history

### Chat Conversation Model
- AI conversation management
- Message history and metadata
- Context and settings
- Statistics tracking

## Security Features

- **JWT Authentication** with secure token generation
- **Password Hashing** using bcryptjs
- **Input Validation** with express-validator
- **Rate Limiting** to prevent abuse
- **Security Headers** with Helmet
- **File Upload Validation** with type and size restrictions
- **CORS Configuration** for cross-origin requests

## Error Handling

The API uses consistent error response format:

```json
{
  "message": "Error description",
  "code": "ERROR_CODE",
  "errors": [
    {
      "field": "fieldName",
      "message": "Field-specific error"
    }
  ]
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `429` - Too Many Requests
- `500` - Internal Server Error

## Development

### Running Tests
```bash
npm test
```

### Code Style
The project follows JavaScript Standard Style. Run linting with:
```bash
npm run lint
```

### Database Seeding
To seed the database with sample data:
```bash
npm run seed
```

## Deployment

### Environment Variables
Set the following environment variables for production:

```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://your-production-db
JWT_SECRET=your-production-jwt-secret
OPENAI_API_KEY=your-openai-api-key
```

### Docker Deployment
```bash
# Build image
docker build -t legal-advocate-api .

# Run container
docker run -p 5000:5000 --env-file .env legal-advocate-api
```

## API Integration Examples

### Frontend Integration (JavaScript)
```javascript
// Authentication
const login = async (profileName, password) => {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ profileName, password }),
  });
  
  const data = await response.json();
  if (data.token) {
    localStorage.setItem('token', data.token);
  }
  return data;
};

// Authenticated requests
const getCases = async () => {
  const token = localStorage.getItem('token');
  const response = await fetch('/api/cases', {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  return response.json();
};
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License. See the LICENSE file for details.

## Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the API examples

## Changelog

### Version 1.0.0
- Initial release
- Complete API implementation
- Authentication and user management
- Case and document management
- AI chat functionality
- Resource finder and risk assessment
- Communication coach features