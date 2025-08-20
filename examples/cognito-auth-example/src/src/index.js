import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { BrowserRouter } from 'react-router-dom';
import { Amplify } from 'aws-amplify';

// Configure Amplify with environment variables
const awsconfig = {
  Auth: {
    Cognito: {
      region: process.env.REACT_APP_REGION,
      userPoolId: process.env.REACT_APP_USER_POOL_ID,
      userPoolClientId: process.env.REACT_APP_CLIENT_ID,
      identityPoolId: process.env.REACT_APP_IDENTITY_POOL_ID,
      loginWith: {
        oauth: {
          domain: `${process.env.REACT_APP_DOMAIN}.auth.${process.env.REACT_APP_REGION}.amazoncognito.com`,
          scopes: ['openid', 'email', 'profile'],
          redirectSignIn: ['http://localhost:3000/callback'],
          redirectSignOut: ['http://localhost:3000/logout'],
          responseType: 'code',
        },
        username: true,
        email: true,
      },
    },
  },
};

Amplify.configure(awsconfig);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
