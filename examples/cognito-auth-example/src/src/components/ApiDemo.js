import React, { useState } from 'react';
import axios from 'axios';
import { buildApiUrl, getAuthHeaders, getDefaultHeaders, API_CONFIG } from '../config/api';

function ApiDemo({ user, authTokens }) {
  const [apiResponses, setApiResponses] = useState({});
  const [loading, setLoading] = useState(false);

  const makeApiCall = async (endpoint, requiresAuth = false) => {
    setLoading(true);
    
    try {
      // Build full API URL using configuration
      const fullUrl = buildApiUrl(`api${endpoint}`);
      
      // Get appropriate headers
      const headers = requiresAuth && authTokens?.accessToken
        ? getAuthHeaders(authTokens.accessToken.toString())
        : getDefaultHeaders();

      console.log(`Making API call to: ${fullUrl}`);
      const response = await axios.get(fullUrl, { 
        headers,
        timeout: API_CONFIG.TIMEOUT 
      });
      
      setApiResponses(prev => ({
        ...prev,
        [endpoint]: {
          status: 'success',
          data: response.data,
          statusCode: response.status,
          timestamp: new Date().toISOString()
        }
      }));
    } catch (error) {
      setApiResponses(prev => ({
        ...prev,
        [endpoint]: {
          status: 'error',
          error: error.response?.data || error.message,
          statusCode: error.response?.status || 'Network Error',
          timestamp: new Date().toISOString()
        }
      }));
    } finally {
      setLoading(false);
    }
  };

  const clearResponses = () => {
    setApiResponses({});
  };

  return (
    <div>
      <div className="card">
        <h2>🔌 API Demo</h2>
        <p>
          Test authenticated and public API endpoints to see how JWT tokens work with backend services.
          This demonstrates secure API communication using Cognito authentication.
        </p>
        
        <div className="info" style={{ marginTop: '15px' }}>
          <strong>🔧 API Configuration:</strong><br/>
          <code>Base URL: {API_CONFIG.BASE_URL}</code><br/>
          <small>Configure with REACT_APP_API_BASE_URL environment variable</small>
        </div>
      </div>

      <div className="card">
        <h3>🎯 API Endpoints</h3>
        <p>Click the buttons below to test different API endpoints:</p>
        
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <button 
            onClick={() => makeApiCall('/public/health')} 
            className="btn"
            disabled={loading}
          >
            🌐 Public Health Check
          </button>
          
          <button 
            onClick={() => makeApiCall('/public/info')} 
            className="btn"
            disabled={loading}
          >
            ℹ️ Public Info
          </button>
          
          <button 
            onClick={() => makeApiCall('/protected/profile', true)} 
            className="btn"
            disabled={loading || !authTokens?.accessToken}
          >
            👤 Protected Profile
          </button>
          
          <button 
            onClick={() => makeApiCall('/protected/user-data', true)} 
            className="btn"
            disabled={loading || !authTokens?.accessToken}
          >
            📊 Protected User Data
          </button>
        </div>

        {loading && (
          <div className="loading">Making API call...</div>
        )}

        {Object.keys(apiResponses).length > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h4>📡 API Responses:</h4>
              <button onClick={clearResponses} className="btn btn-secondary">
                Clear Responses
              </button>
            </div>
            
            {Object.entries(apiResponses).map(([endpoint, response]) => (
              <div key={endpoint} className="card" style={{ marginBottom: '15px', background: '#f8f9fa' }}>
                <h5>
                  {endpoint} 
                  <span style={{ 
                    color: response.status === 'success' ? '#28a745' : '#dc3545',
                    marginLeft: '10px'
                  }}>
                    ({response.statusCode})
                  </span>
                </h5>
                
                <div className="code-block">
{`Timestamp: ${response.timestamp}
Status: ${response.status}
Status Code: ${response.statusCode}

${response.status === 'success' ? 
  `Response Data:\n${JSON.stringify(response.data, null, 2)}` :
  `Error:\n${JSON.stringify(response.error, null, 2)}`}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>🔐 Authentication Details</h3>
        <div className="feature-grid">
          <div className="feature-card">
            <h4>🎫 JWT Token Status</h4>
            <p>
              Access Token: {authTokens?.accessToken ? (
                <span style={{ color: '#28a745' }}>Available ✓</span>
              ) : (
                <span style={{ color: '#dc3545' }}>Not Available ✗</span>
              )}
            </p>
          </div>
          
          <div className="feature-card">
            <h4>🔄 Token Refresh</h4>
            <p>
              Refresh Token: {authTokens?.refreshToken ? (
                <span style={{ color: '#28a745' }}>Available ✓</span>
              ) : (
                <span style={{ color: '#dc3545' }}>Not Available ✗</span>
              )}
            </p>
          </div>
          
          <div className="feature-card">
            <h4>⏰ Token Expiry</h4>
            <p>
              Tokens automatically refresh when needed for seamless API access
            </p>
          </div>
          
          <div className="feature-card">
            <h4>🛡️ Secure Headers</h4>
            <p>
              Bearer tokens are sent in Authorization headers for API authentication
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>📋 Backend Implementation</h3>
        <p>The backend API demonstrates JWT token validation:</p>
        
        <div className="code-block">
{`// Express.js middleware for JWT validation
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const client = jwksClient({
  jwksUri: 'https://cognito-idp.${process.env.REACT_APP_REGION}.amazonaws.com/' +
           '${process.env.REACT_APP_USER_POOL_ID}/.well-known/jwks.json'
});

const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    // Decode token header to get key ID
    const decoded = jwt.decode(token, { complete: true });
    const key = await client.getSigningKey(decoded.header.kid);
    
    // Verify token signature and claims
    const verified = jwt.verify(token, key.getPublicKey(), {
      issuer: 'https://cognito-idp.${process.env.REACT_APP_REGION}.amazonaws.com/${process.env.REACT_APP_USER_POOL_ID}',
      audience: process.env.CLIENT_ID
    });
    
    req.user = verified;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Protected routes
app.get('/api/protected/profile', verifyToken, (req, res) => {
  res.json({
    message: 'Access granted!',
    user: req.user,
    timestamp: new Date().toISOString()
  });
});`}
        </div>
      </div>

      <div className="card">
        <h3>🚀 API Security Features</h3>
        <div className="feature-grid">
          <div className="feature-card">
            <h4>🔐 JWT Verification</h4>
            <p>All tokens are cryptographically verified using Cognito's public keys</p>
          </div>
          
          <div className="feature-card">
            <h4>⏰ Expiration Handling</h4>
            <p>Expired tokens are automatically rejected and can be refreshed</p>
          </div>
          
          <div className="feature-card">
            <h4>🎯 Scope Validation</h4>
            <p>API endpoints can validate specific OAuth scopes and permissions</p>
          </div>
          
          <div className="feature-card">
            <h4>🏢 Enterprise Ready</h4>
            <p>Supports role-based access control and fine-grained permissions</p>
          </div>
        </div>
      </div>

      {!authTokens?.accessToken && (
        <div className="error">
          <strong>⚠️ Authentication Required:</strong> Some API endpoints require authentication. 
          Please ensure you're signed in to test protected endpoints.
        </div>
      )}
    </div>
  );
}

export default ApiDemo;
