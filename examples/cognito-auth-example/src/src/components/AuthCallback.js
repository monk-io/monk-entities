import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';

function AuthCallback({ onAuthSuccess }) {
  const [status, setStatus] = useState('processing');
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [authDetails, setAuthDetails] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    processAuthCallback();
  }, []);

  const processAuthCallback = async () => {
    try {
      console.log('🔄 Processing OAuth callback...');
      console.log('Current URL:', window.location.href);
      console.log('URL params:', location.search);
      
      setStatus('processing');
      
      // Give Amplify some time to process the OAuth callback
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if user is now authenticated
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();
      
      console.log('✅ Authentication successful!');
      console.log('User:', currentUser);
      console.log('Session tokens available:', !!session.tokens);
      
      setUser(currentUser);
      setAuthDetails({
        username: currentUser.username,
        userId: currentUser.userId,
        signInDetails: currentUser.signInDetails || {},
        hasTokens: !!session.tokens,
        accessToken: session.tokens?.accessToken ? 'Present' : 'Missing',
        idToken: session.tokens?.idToken ? 'Present' : 'Missing'
      });
      
      setStatus('success');
      
      // Call the success callback
      if (onAuthSuccess) {
        onAuthSuccess();
      }
      
      // Redirect to dashboard after showing success for a moment
      setTimeout(() => {
        navigate('/dashboard');
      }, 3000);
      
    } catch (error) {
      console.error('❌ Authentication callback failed:', error);
      setError(error.message || 'Authentication failed');
      setStatus('error');
    }
  };

  const handleRetry = () => {
    setStatus('processing');
    setError(null);
    processAuthCallback();
  };

  const handleGoHome = () => {
    navigate('/');
  };

  if (status === 'processing') {
    return (
      <div className="card">
        <h2>🔄 Processing Authentication</h2>
        <p>Please wait while we complete your sign-in...</p>
        <div className="loading-spinner" style={{
          border: '4px solid #f3f3f3',
          borderTop: '4px solid #007bff',
          borderRadius: '50%',
          width: '40px',
          height: '40px',
          animation: 'spin 1s linear infinite',
          margin: '20px auto'
        }}></div>
        <style>
          {`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="card">
        <h2>✅ Authentication Successful!</h2>
        <p>Welcome! You have been successfully signed in.</p>
        
        {authDetails && (
          <div className="auth-details">
            <h4>🎯 Authentication Details:</h4>
            <ul>
              <li><strong>Username:</strong> {authDetails.username}</li>
              <li><strong>User ID:</strong> {authDetails.userId}</li>
              <li><strong>Access Token:</strong> {authDetails.accessToken}</li>
              <li><strong>ID Token:</strong> {authDetails.idToken}</li>
              {authDetails.signInDetails?.loginId && (
                <li><strong>Login Method:</strong> {authDetails.signInDetails.loginId}</li>
              )}
            </ul>
          </div>
        )}
        
        <div className="success-actions" style={{ marginTop: '20px' }}>
          <p>🚀 Redirecting to dashboard in 3 seconds...</p>
          <button 
            onClick={() => navigate('/dashboard')} 
            className="btn"
            style={{ marginRight: '10px' }}
          >
            Go to Dashboard Now
          </button>
          <button 
            onClick={handleGoHome} 
            className="btn"
            style={{ background: '#6c757d' }}
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="card">
        <h2>❌ Authentication Failed</h2>
        <p>There was an issue processing your authentication.</p>
        
        <div className="error-details">
          <strong>Error:</strong> {error}
        </div>
        
        <div className="error-actions">
          <button 
            onClick={handleRetry} 
            className="btn"
            style={{ marginRight: '10px' }}
          >
            🔄 Try Again
          </button>
          <button 
            onClick={handleGoHome} 
            className="btn"
            style={{ background: '#6c757d' }}
          >
            Return Home
          </button>
        </div>
        
        <div className="troubleshooting">
          <p><strong>💡 Troubleshooting Tips:</strong></p>
          <ul>
            <li>Check your internet connection</li>
            <li>Ensure cookies are enabled</li>
            <li>Try signing in again from the home page</li>
            <li>Clear browser cache if issues persist</li>
          </ul>
        </div>
      </div>
    );
  }

  return null;
}

export default AuthCallback;
