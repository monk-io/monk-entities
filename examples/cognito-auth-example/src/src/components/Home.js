import React, { useState } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import { signInWithRedirect } from 'aws-amplify/auth';

function Home({ user, onAuthSuccess }) {
  const [showAuthenticator, setShowAuthenticator] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      await signInWithRedirect({ provider: 'Google' });
    } catch (error) {
      console.error('Error signing in with Google:', error);
    }
  };

  const handleHostedUISignIn = async () => {
    try {
      // Redirect to Cognito Hosted UI with COGNITO provider (email/password)
      await signInWithRedirect({ provider: 'COGNITO' });
    } catch (error) {
      console.error('Error signing in with Hosted UI:', error);
    }
  };

  if (user) {
    return (
      <div className="card">
        <h2>🎉 Welcome back, {user.username}!</h2>
        <p>You are successfully authenticated with AWS Cognito.</p>
        
        <div className="info">
          <strong>Authentication Status:</strong>
          <br />
          <span className="status-indicator status-success"></span>
          Signed in and ready to explore!
        </div>

        <div className="feature-grid">
          <div className="feature-card">
            <h3>🏠 Dashboard</h3>
            <p>View your authentication details and session information</p>
          </div>
          <div className="feature-card">
            <h3>👤 Profile</h3>
            <p>Manage your user profile and preferences</p>
          </div>
          <div className="feature-card">
            <h3>☁️ AWS Resources</h3>
            <p>Access AWS resources using your federated identity</p>
          </div>
          <div className="feature-card">
            <h3>🔌 API Demo</h3>
            <p>Test authenticated API calls to the backend</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <h2>🚀 AWS Cognito Authentication Demo</h2>
        <p>
          This example demonstrates a complete authentication system built using 
          <strong> Monk's AWS Cognito entities</strong>. Experience modern authentication 
          flows including social login, hosted UI, and federated AWS access.
        </p>

        <div className="feature-grid">
          <div className="feature-card">
            <h3>🔐 User Pool</h3>
            <p>Secure user registration and authentication with email verification</p>
          </div>
          <div className="feature-card">
            <h3>🌐 Hosted UI Domain</h3>
            <p>Beautiful, customizable login and signup pages hosted by AWS</p>
          </div>
          <div className="feature-card">
            <h3>📱 OAuth Clients</h3>
            <p>Support for web applications, mobile apps, and server-to-server auth</p>
          </div>
          <div className="feature-card">
            <h3>🔗 Social Login</h3>
            <p>Sign in with Google, Facebook, and other identity providers</p>
          </div>
          <div className="feature-card">
            <h3>☁️ Identity Pool</h3>
            <p>Federated access to AWS resources with temporary credentials</p>
          </div>
          <div className="feature-card">
            <h3>🛡️ JWT Tokens</h3>
            <p>Secure API authentication using industry-standard JWT tokens</p>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>🔑 Sign In Options</h3>
        <p>Choose your preferred authentication method:</p>
        
        <div className="info" style={{ marginBottom: '15px', fontSize: '14px', background: '#f0f8ff', padding: '10px', borderRadius: '5px' }}>
          <strong>🎯 Authentication Options:</strong><br/>
          • <strong>Embedded</strong>: Login form directly in this page<br/>
          • <strong>Hosted UI</strong>: Redirects to AWS Cognito's login page<br/>
          • <strong>Google</strong>: Social login via Google OAuth
        </div>
        
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginTop: '20px' }}>
          <button 
            onClick={() => setShowAuthenticator(true)} 
            className="btn"
          >
            📧 Email & Password (Embedded)
          </button>

          <button 
            onClick={handleHostedUISignIn} 
            className="btn"
            style={{ background: '#ff9900' }}
          >
            🌐 Cognito Hosted UI
          </button>
          
          <button 
            onClick={handleGoogleSignIn} 
            className="btn"
            style={{ background: '#4285f4' }}
          >
            🔍 Sign in with Google
          </button>
        </div>

        {showAuthenticator && (
          <div style={{ marginTop: '30px' }}>
            <Authenticator
              hideSignUp={false}
              components={{
                Header() {
                  return (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                      <h2>🔐 Secure Sign In</h2>
                      <p>Powered by AWS Cognito</p>
                    </div>
                  );
                },
              }}
            >
              {({ signOut, user }) => {
                // Call onAuthSuccess immediately when user is authenticated
                if (user) {
                  console.log('Authenticator detected user:', user);
                  // Use setTimeout to avoid calling onAuthSuccess during render
                  setTimeout(() => onAuthSuccess(), 100);
                  
                  return (
                    <div style={{ textAlign: 'center', padding: '20px' }}>
                      <h3>✅ Authentication Successful!</h3>
                      <p>Redirecting to dashboard...</p>
                    </div>
                  );
                }
                
                // Return null if no user (Authenticator will show login form)
                return null;
              }}
            </Authenticator>
          </div>
        )}
      </div>

      <div className="card">
        <h3>🏗️ Infrastructure Components</h3>
        <p>This demo showcases all AWS Cognito entities managed by Monk:</p>
        
        <div className="code-block">
{`# AWS Cognito Infrastructure (deployed via Monk)
✅ User Pool          - User management & authentication
✅ User Pool Domain   - Hosted UI (auth.example.com)  
✅ User Pool Client   - OAuth/OIDC application config
✅ Identity Provider  - Google social login integration
✅ Identity Pool      - Federated AWS resource access`}
        </div>

        <div className="info">
          <strong>🚀 Quick Start:</strong> Try different sign-in methods above to compare embedded vs hosted authentication flows and explore JWT token validation!
        </div>
      </div>
    </div>
  );
}

export default Home;
