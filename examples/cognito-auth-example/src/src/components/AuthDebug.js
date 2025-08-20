import React, { useState, useEffect } from 'react';
import { getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';

function AuthDebug() {
  const [debugInfo, setDebugInfo] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    const info = {
      timestamp: new Date().toISOString(),
      environment: {},
      amplifyConfig: {},
      authState: {},
      localStorage: {},
      errors: []
    };

    try {
      // Check environment variables
      info.environment = {
        REACT_APP_REGION: process.env.REACT_APP_REGION,
        REACT_APP_USER_POOL_ID: process.env.REACT_APP_USER_POOL_ID,
        REACT_APP_CLIENT_ID: process.env.REACT_APP_CLIENT_ID,
        REACT_APP_DOMAIN: process.env.REACT_APP_DOMAIN,
        REACT_APP_IDENTITY_POOL_ID: process.env.REACT_APP_IDENTITY_POOL_ID,
      };

      // Check current user
      try {
        const currentUser = await getCurrentUser();
        info.authState.currentUser = {
          username: currentUser.username,
          userId: currentUser.userId,
          signInDetails: currentUser.signInDetails
        };
      } catch (error) {
        info.authState.currentUserError = error.message;
      }

      // Check session
      try {
        const session = await fetchAuthSession();
        info.authState.session = {
          hasTokens: !!session.tokens,
          hasCredentials: !!session.credentials,
          identityId: session.identityId
        };
        
        if (session.tokens) {
          info.authState.tokens = {
            hasIdToken: !!session.tokens.idToken,
            hasAccessToken: !!session.tokens.accessToken,
            hasRefreshToken: !!session.tokens.refreshToken
          };
        }
      } catch (error) {
        info.authState.sessionError = error.message;
      }

      // Check localStorage
      try {
        const amplifyKeys = Object.keys(localStorage).filter(key => 
          key.includes('amplify') || key.includes('cognito') || key.includes('aws')
        );
        info.localStorage.amplifyKeys = amplifyKeys;
        info.localStorage.hasAmplifyData = amplifyKeys.length > 0;
      } catch (error) {
        info.localStorage.error = error.message;
      }

    } catch (error) {
      info.errors.push(`General error: ${error.message}`);
    }

    setDebugInfo(info);
    setLoading(false);
  };

  const clearAuthData = () => {
    try {
      // Clear Amplify data from localStorage
      Object.keys(localStorage).forEach(key => {
        if (key.includes('amplify') || key.includes('cognito') || key.includes('aws')) {
          localStorage.removeItem(key);
        }
      });
      alert('Auth data cleared. Please refresh the page.');
    } catch (error) {
      alert(`Error clearing data: ${error.message}`);
    }
  };

  if (loading) {
    return <div className="loading">Loading debug info...</div>;
  }

  return (
    <div className="card">
      <h2>🔍 Authentication Debug Information</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <button onClick={checkAuthState} className="btn" style={{ marginRight: '10px' }}>
          🔄 Refresh Debug Info
        </button>
        <button onClick={clearAuthData} className="btn btn-secondary">
          🗑️ Clear Auth Data
        </button>
      </div>

      <div className="code-block">
        <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
      </div>

      <div className="info">
        <strong>🔧 Troubleshooting Tips:</strong>
        <ul>
          <li>Check that all environment variables are set correctly</li>
          <li>Verify currentUser is not null after authentication</li>
          <li>Ensure session tokens are present</li>
          <li>Try clearing auth data if you see stale information</li>
        </ul>
      </div>
    </div>
  );
}

export default AuthDebug;
