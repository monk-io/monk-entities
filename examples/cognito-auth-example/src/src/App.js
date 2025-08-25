import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { getCurrentUser, signOut, fetchAuthSession } from 'aws-amplify/auth';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';

// Components
import Home from './components/Home';
import Dashboard from './components/Dashboard';
import Profile from './components/Profile';
import AwsResources from './components/AwsResources';
import ApiDemo from './components/ApiDemo';
import AuthDebug from './components/AuthDebug';
import AuthCallback from './components/AuthCallback';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authTokens, setAuthTokens] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    checkUser();
    
    // Listen for authentication state changes
    const handleAuthStateChange = () => {
      console.log('Auth state changed, rechecking user...');
      checkUser();
    };
    
    // Check for URL changes that might indicate auth callback
    if (location.pathname === '/callback' || location.search.includes('code=') || location.hash.includes('access_token')) {
      console.log('Detected auth callback, checking user state...');
      setTimeout(() => checkUser(), 2000); // Give Amplify more time to process
    }
    
    return () => {
      // Cleanup if needed
    };
  }, [location.pathname, location.search]);

  const checkUser = async () => {
    try {
      console.log('Checking user authentication state...');
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();
      
      console.log('User found:', currentUser);
      console.log('Session tokens:', session.tokens ? 'Present' : 'Missing');
      
      setUser(currentUser);
      setAuthTokens(session.tokens);
    } catch (error) {
      console.log('No authenticated user:', error.message);
      setUser(null);
      setAuthTokens(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setUser(null);
      setAuthTokens(null);
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleAuthSuccess = () => {
    checkUser();
    navigate('/dashboard');
  };

  if (loading) {
    return (
      <div className="loading">
        <h2>Loading AWS Cognito Authentication...</h2>
      </div>
    );
  }

  return (
    <div className="container">
      <header className="header">
        <h1>🔐 AWS Cognito Auth Example</h1>
        <p>Complete authentication demonstration using Monk's AWS Cognito entities</p>
      </header>

      <nav className="nav">
        <div className="nav-links">
          <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
            Home
          </Link>
          {user && (
            <>
              <Link to="/dashboard" className={location.pathname === '/dashboard' ? 'active' : ''}>
                Dashboard
              </Link>
              <Link to="/profile" className={location.pathname === '/profile' ? 'active' : ''}>
                Profile
              </Link>
              <Link to="/aws-resources" className={location.pathname === '/aws-resources' ? 'active' : ''}>
                AWS Resources
              </Link>
              <Link to="/api-demo" className={location.pathname === '/api-demo' ? 'active' : ''}>
                API Demo
              </Link>
              <Link to="/debug" className={location.pathname === '/debug' ? 'active' : ''}>
                🔍 Debug
              </Link>
            </>
          )}
        </div>
        <div className="user-info">
          {user ? (
            <span>
              👋 {user.username} | 
              <button onClick={handleSignOut} className="btn btn-danger" style={{marginLeft: '10px', padding: '5px 10px'}}>
                Sign Out
              </button>
            </span>
          ) : (
            <span>Not authenticated</span>
          )}
        </div>
      </nav>

      <main>
        <Routes>
          <Route 
            path="/" 
            element={
              <Home 
                user={user} 
                onAuthSuccess={handleAuthSuccess}
              />
            } 
          />
          {user ? (
            <>
              <Route 
                path="/dashboard" 
                element={<Dashboard user={user} authTokens={authTokens} />} 
              />
              <Route 
                path="/profile" 
                element={<Profile user={user} authTokens={authTokens} />} 
              />
              <Route 
                path="/aws-resources" 
                element={<AwsResources user={user} authTokens={authTokens} />} 
              />
              <Route 
                path="/api-demo" 
                element={<ApiDemo user={user} authTokens={authTokens} />} 
              />
              <Route 
                path="/debug" 
                element={<AuthDebug />} 
              />
            </>
          ) : (
            <Route 
              path="/*" 
              element={
                <div className="card">
                  <h2>Authentication Required</h2>
                  <p>Please sign in to access this page.</p>
                  <Link to="/" className="btn">Go to Home</Link>
                </div>
              } 
            />
          )}
          <Route 
            path="/callback" 
            element={
              <AuthCallback onAuthSuccess={handleAuthSuccess} />
            } 
          />
          <Route 
            path="/logout" 
            element={
              <div className="card">
                <h2>Signed Out</h2>
                <p>You have been successfully signed out.</p>
                <Link to="/" className="btn">Return Home</Link>
              </div>
            } 
          />
        </Routes>
      </main>

      <footer style={{textAlign: 'center', marginTop: '50px', color: 'white', opacity: 0.8}}>
        <p>
          Built with AWS Cognito entities from Monk • 
          <a href="https://github.com/monk-io/monk-entities" style={{color: 'white', marginLeft: '10px'}}>
            View on GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}

export default App;
