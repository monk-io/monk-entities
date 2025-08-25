import React, { useState, useEffect } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';

function Dashboard({ user, authTokens }) {
  const [sessionDetails, setSessionDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessionDetails();
  }, []);

  const loadSessionDetails = async () => {
    try {
      const session = await fetchAuthSession();
      setSessionDetails(session);
    } catch (error) {
      console.error('Error fetching session:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTokenClaims = (token) => {
    if (!token) return null;
    
    try {
      // Decode JWT payload (simple base64 decode - not for production verification)
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload;
    } catch (error) {
      return null;
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  if (loading) {
    return (
      <div className="card">
        <div className="loading">Loading dashboard...</div>
      </div>
    );
  }

  const idTokenClaims = authTokens?.idToken ? formatTokenClaims(authTokens.idToken.toString()) : null;
  const accessTokenClaims = authTokens?.accessToken ? formatTokenClaims(authTokens.accessToken.toString()) : null;

  return (
    <div>
      <div className="card">
        <h2>📊 Authentication Dashboard</h2>
        <p>Welcome to your secure dashboard! Here you can view your authentication details and session information.</p>
      </div>

      <div className="card">
        <h3>👤 User Information</h3>
        <div className="code-block">
{`Username: ${user.username || 'N/A'}
User ID: ${user.userId || 'N/A'}
Sign-in Details: ${JSON.stringify(user.signInDetails || {}, null, 2)}`}
        </div>
      </div>

      {idTokenClaims && (
        <div className="card">
          <h3>🎫 ID Token Claims</h3>
          <p>The ID token contains information about the authenticated user:</p>
          <div className="code-block">
{`Email: ${idTokenClaims.email || 'N/A'}
Email Verified: ${idTokenClaims.email_verified || 'N/A'}
Name: ${idTokenClaims.name || 'N/A'}
Given Name: ${idTokenClaims.given_name || 'N/A'}
Family Name: ${idTokenClaims.family_name || 'N/A'}
Issued At: ${idTokenClaims.iat ? formatTimestamp(idTokenClaims.iat) : 'N/A'}
Expires At: ${idTokenClaims.exp ? formatTimestamp(idTokenClaims.exp) : 'N/A'}
Audience: ${idTokenClaims.aud || 'N/A'}
Issuer: ${idTokenClaims.iss || 'N/A'}`}
          </div>
        </div>
      )}

      {accessTokenClaims && (
        <div className="card">
          <h3>🔑 Access Token Claims</h3>
          <p>The access token is used for API authorization:</p>
          <div className="code-block">
{`Client ID: ${accessTokenClaims.client_id || 'N/A'}
Username: ${accessTokenClaims.username || 'N/A'}
Scopes: ${accessTokenClaims.scope || 'N/A'}
Token Use: ${accessTokenClaims.token_use || 'N/A'}
Issued At: ${accessTokenClaims.iat ? formatTimestamp(accessTokenClaims.iat) : 'N/A'}
Expires At: ${accessTokenClaims.exp ? formatTimestamp(accessTokenClaims.exp) : 'N/A'}
Issuer: ${accessTokenClaims.iss || 'N/A'}`}
          </div>
        </div>
      )}

      {sessionDetails && (
        <div className="card">
          <h3>🔐 Session Details</h3>
          <div className="feature-grid">
            <div className="feature-card">
              <h4>Identity Pool ID</h4>
              <p>{sessionDetails.identityId || 'Not available'}</p>
            </div>
            <div className="feature-card">
              <h4>AWS Credentials</h4>
              <p>
                {sessionDetails.credentials ? (
                  <span className="status-indicator status-success"></span>
                ) : (
                  <span className="status-indicator status-error"></span>
                )}
                {sessionDetails.credentials ? 'Available' : 'Not available'}
              </p>
            </div>
            <div className="feature-card">
              <h4>Tokens</h4>
              <p>
                ID Token: {authTokens?.idToken ? '✅' : '❌'}<br/>
                Access Token: {authTokens?.accessToken ? '✅' : '❌'}<br/>
                Refresh Token: {authTokens?.refreshToken ? '✅' : '❌'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h3>🔍 Security Features</h3>
        <div className="feature-grid">
          <div className="feature-card">
            <h4>🛡️ JWT Validation</h4>
            <p>All tokens are cryptographically signed and verified by AWS Cognito</p>
          </div>
          <div className="feature-card">
            <h4>⏰ Token Expiration</h4>
            <p>Tokens automatically expire and can be refreshed for enhanced security</p>
          </div>
          <div className="feature-card">
            <h4>🔄 Federated Identity</h4>
            <p>Access AWS resources using temporary, scoped credentials</p>
          </div>
          <div className="feature-card">
            <h4>🏢 Enterprise Ready</h4>
            <p>Supports SAML, OIDC, and social identity providers</p>
          </div>
        </div>
      </div>

      <div className="info">
        <strong>🔒 Security Note:</strong> This dashboard shows decoded token information for demonstration purposes. 
        In production applications, tokens should only be verified server-side using AWS Cognito's public keys.
      </div>
    </div>
  );
}

export default Dashboard;
