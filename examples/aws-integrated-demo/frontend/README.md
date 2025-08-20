# AWS Integrated Demo - Frontend

Modern React frontend for the AWS Integrated Demo showcasing Lambda + DynamoDB + RDS integration.

## Features

- **Modern React 18** with TypeScript and Vite
- **Responsive Design** with Tailwind CSS
- **Real-time Health Monitoring** of AWS services
- **Interactive Dashboard** with charts and analytics
- **User Management** (RDS PostgreSQL integration)
- **Todo Management** (DynamoDB integration)
- **Cross-database Operations** via Lambda API

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React App     │───▶│  Lambda API     │───▶│  RDS (Users)    │
│   (Frontend)    │    │  (Handler)      │    │  PostgreSQL     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │ DynamoDB (Todos)│
                       │   NoSQL Store   │
                       └─────────────────┘
```

## Quick Start

### Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp env.example .env
   # Edit .env with your API endpoint
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

4. **Open browser:**
   ```
   http://localhost:3000
   ```

### Production Build

1. **Build the application:**
   ```bash
   npm run build
   ```

2. **Preview production build:**
   ```bash
   npm run preview
   ```

### Docker Deployment

1. **Build Docker image:**
   ```bash
   docker build -t aws-demo-frontend .
   ```

2. **Run container:**
   ```bash
   docker run -p 80:80 -e API_URL=your-lambda-url aws-demo-frontend
   ```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Lambda API endpoint | `/api` |
| `VITE_APP_VERSION` | Application version | `1.0.0` |
| `VITE_APP_NAME` | Application name | `AWS Integrated Demo` |

## Project Structure

```
frontend/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── Layout.tsx      # Main layout with navigation
│   │   ├── UserCard.tsx    # User display component
│   │   ├── TodoCard.tsx    # Todo display component
│   │   └── ...
│   ├── pages/              # Page components
│   │   ├── Dashboard.tsx   # Analytics dashboard
│   │   ├── Users.tsx       # User management
│   │   ├── UserDetail.tsx  # Individual user view
│   │   ├── Todos.tsx       # Todo management
│   │   └── Settings.tsx    # System settings
│   ├── services/           # API integration
│   │   └── api.ts         # HTTP client and API calls
│   ├── types/             # TypeScript type definitions
│   │   └── index.ts       # Shared interfaces
│   ├── App.tsx            # Main application component
│   ├── main.tsx           # Application entry point
│   └── index.css          # Global styles
├── public/                # Static assets
├── Dockerfile            # Container configuration
├── nginx.conf           # Nginx configuration
└── package.json         # Dependencies and scripts
```

## API Integration

The frontend integrates with the Lambda API through the following endpoints:

- `GET /health` - System health check
- `POST /users` - Create new user
- `GET /users` - List all users
- `GET /users/{id}` - Get user details
- `POST /users/{id}/todos` - Create todo for user
- `GET /users/{id}/todos` - Get user's todos
- `PUT /todos/{id}` - Update todo
- `DELETE /todos/{id}` - Delete todo
- `GET /dashboard/{id}` - Get user dashboard
- `GET /demo` - Run integration demo

## Key Components

### Dashboard
- Real-time system health monitoring
- Interactive charts and analytics
- Cross-database statistics
- Recent activity feed

### User Management
- Create, view, and list users
- Department-based organization
- Integration with RDS PostgreSQL

### Todo Management
- Full CRUD operations
- Status and priority management
- Due date tracking
- Integration with DynamoDB

### Health Monitoring
- Real-time AWS service status
- RDS and DynamoDB connectivity
- System performance metrics

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript checks

### Code Style

- **TypeScript** for type safety
- **ESLint** for code quality
- **Tailwind CSS** for styling
- **React Hooks** for state management

## Deployment

### Docker

The application includes a multi-stage Dockerfile for optimized production builds:

```dockerfile
# Build stage
FROM node:18-alpine as builder
# ... build process

# Production stage  
FROM nginx:alpine
# ... nginx setup
```

### Environment Configuration

Configure the API endpoint through environment variables:

```bash
# Development
VITE_API_URL=http://localhost:3001

# Production
VITE_API_URL=https://your-lambda-url.amazonaws.com
```

## Monitoring

The application includes built-in monitoring features:

- **Health Checks** - Continuous monitoring of backend services
- **Error Handling** - Comprehensive error boundaries and logging
- **Performance** - Optimized builds and lazy loading
- **Analytics** - Real-time dashboard with system metrics

## Contributing

1. Follow TypeScript best practices
2. Use Tailwind CSS for styling
3. Implement proper error handling
4. Add loading states for async operations
5. Ensure responsive design
6. Write meaningful commit messages

## License

This project is part of the AWS Integrated Demo and is intended for educational purposes.
