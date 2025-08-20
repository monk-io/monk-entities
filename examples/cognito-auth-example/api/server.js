const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3001;

// Configuration from environment variables
const USER_POOL_ID = process.env.USER_POOL_ID;
const REGION = process.env.REGION || 'us-east-1';

if (!USER_POOL_ID) {
  console.error('❌ USER_POOL_ID environment variable is required');
  process.exit(1);
}

// JWKS client for token verification
const client = jwksClient({
  jwksUri: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`,
  requestHeaders: {}, // Optional
  timeout: 30000, // Defaults to 30s
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:3000'], // React app URL
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json());

// JWT verification middleware
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Missing or invalid authorization header',
        message: 'Please provide a valid Bearer token'
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Decode token to get key ID
    const decoded = jwt.decode(token, { complete: true });
    
    if (!decoded || !decoded.header || !decoded.header.kid) {
      return res.status(401).json({ 
        error: 'Invalid token format',
        message: 'Token must be a valid JWT with key ID'
      });
    }

    // Get the signing key
    const key = await client.getSigningKey(decoded.header.kid);
    const signingKey = key.getPublicKey();

    // Verify the token
    const verified = jwt.verify(token, signingKey, {
      issuer: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`,
      algorithms: ['RS256']
    });

    // Check token use
    if (verified.token_use !== 'access') {
      return res.status(401).json({ 
        error: 'Invalid token type',
        message: 'Only access tokens are allowed for API access'
      });
    }

    // Attach user info to request
    req.user = verified;
    req.token = token;
    next();

  } catch (error) {
    console.error('Token verification error:', error.message);
    
    let message = 'Token verification failed';
    if (error.name === 'TokenExpiredError') {
      message = 'Token has expired';
    } else if (error.name === 'JsonWebTokenError') {
      message = 'Invalid token signature';
    }

    res.status(401).json({ 
      error: 'Authentication failed',
      message: message,
      details: error.message
    });
  }
};

// Public Routes
app.get('/api/public/health', (req, res) => {
  res.json({
    status: 'healthy',
    message: 'Cognito Auth Example API is running!',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    endpoints: {
      public: ['/api/public/health', '/api/public/info'],
      protected: ['/api/protected/profile', '/api/protected/user-data']
    }
  });
});

app.get('/api/public/info', (req, res) => {
  res.json({
    service: 'Cognito Auth Example API',
    description: 'Demonstrates JWT token validation with AWS Cognito',
    features: [
      'JWT token verification using Cognito JWKS',
      'Public and protected endpoints',
      'User profile and data access',
      'Token expiration and refresh handling'
    ],
    cognito: {
      region: REGION,
      userPoolId: USER_POOL_ID,
      jwksUri: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`
    },
    timestamp: new Date().toISOString()
  });
});

// Protected Routes
app.get('/api/protected/profile', verifyToken, (req, res) => {
  res.json({
    message: '🎉 Access granted to protected profile endpoint!',
    user: {
      username: req.user.username,
      sub: req.user.sub,
      clientId: req.user.client_id,
      scopes: req.user.scope ? req.user.scope.split(' ') : [],
      tokenUse: req.user.token_use,
      authTime: new Date(req.user.auth_time * 1000).toISOString(),
      issuedAt: new Date(req.user.iat * 1000).toISOString(),
      expiresAt: new Date(req.user.exp * 1000).toISOString()
    },
    request: {
      timestamp: new Date().toISOString(),
      endpoint: '/api/protected/profile',
      method: req.method,
      userAgent: req.headers['user-agent']
    }
  });
});

app.get('/api/protected/user-data', verifyToken, (req, res) => {
  // Simulate some user-specific data
  const userData = {
    dashboardStats: {
      loginCount: Math.floor(Math.random() * 100) + 10,
      lastLogin: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      accountAge: Math.floor(Math.random() * 365) + 30,
      preferences: {
        theme: 'light',
        notifications: true,
        language: 'en'
      }
    },
    permissions: req.user.scope ? req.user.scope.split(' ') : [],
    security: {
      twoFactorEnabled: false,
      lastPasswordChange: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
      activeSessions: Math.floor(Math.random() * 3) + 1
    }
  };

  res.json({
    message: '🔒 Secure user data retrieved successfully!',
    userId: req.user.sub,
    username: req.user.username,
    data: userData,
    metadata: {
      timestamp: new Date().toISOString(),
      endpoint: '/api/protected/user-data',
      tokenIssuedAt: new Date(req.user.iat * 1000).toISOString(),
      tokenExpiresAt: new Date(req.user.exp * 1000).toISOString()
    }
  });
});

// Token info endpoint (protected)
app.get('/api/protected/token-info', verifyToken, (req, res) => {
  res.json({
    message: 'Token information',
    token: {
      sub: req.user.sub,
      username: req.user.username,
      clientId: req.user.client_id,
      scope: req.user.scope,
      tokenUse: req.user.token_use,
      issuer: req.user.iss,
      audience: req.user.aud,
      issuedAt: new Date(req.user.iat * 1000).toISOString(),
      expiresAt: new Date(req.user.exp * 1000).toISOString(),
      authTime: new Date(req.user.auth_time * 1000).toISOString()
    },
    timeToExpiry: req.user.exp - Math.floor(Date.now() / 1000)
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: 'Something went wrong on the server'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Endpoint ${req.originalUrl} not found`,
    availableEndpoints: {
      public: [
        'GET /api/public/health',
        'GET /api/public/info'
      ],
      protected: [
        'GET /api/protected/profile',
        'GET /api/protected/user-data',
        'GET /api/protected/token-info'
      ]
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Cognito Auth Example API running on port ${PORT}`);
  console.log(`🔐 User Pool ID: ${USER_POOL_ID}`);
  console.log(`🌍 Region: ${REGION}`);
  console.log(`📡 JWKS URI: https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`);
  console.log(`\n🔗 Available endpoints:`);
  console.log(`   Public:    http://localhost:${PORT}/api/public/health`);
  console.log(`   Public:    http://localhost:${PORT}/api/public/info`);
  console.log(`   Protected: http://localhost:${PORT}/api/protected/profile`);
  console.log(`   Protected: http://localhost:${PORT}/api/protected/user-data`);
  console.log(`\n✅ Ready to accept requests!`);
});
