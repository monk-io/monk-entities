/**
 * API Configuration
 * 
 * This file centralizes API configuration and supports environment variables
 * for different deployment scenarios.
 */

// Get API base URL from environment variable or use default
const getApiBaseUrl = () => {
  // React apps can only access environment variables that start with REACT_APP_
  const envApiUrl = process.env.REACT_APP_API_BASE_URL;
  
  if (envApiUrl) {
    console.log(`Using API base URL from environment: ${envApiUrl}`);
    return envApiUrl;
  }
  
  // Default fallback for development
  const defaultUrl = 'http://localhost:3001';
  console.log(`Using default API base URL: ${defaultUrl}`);
  return defaultUrl;
};

// Export the configuration
export const API_CONFIG = {
  BASE_URL: getApiBaseUrl(),
  
  // API endpoints
  ENDPOINTS: {
    PUBLIC: {
      HEALTH: '/api/public/health',
      INFO: '/api/public/info'
    },
    PROTECTED: {
      PROFILE: '/api/protected/profile',
      USER_DATA: '/api/protected/user-data'
    }
  },
  
  // Request timeout (in milliseconds)
  TIMEOUT: 10000,
  
  // Default headers
  DEFAULT_HEADERS: {
    'Content-Type': 'application/json'
  }
};

/**
 * Build full API URL
 * @param {string} endpoint - The API endpoint (e.g., '/api/public/health')
 * @returns {string} - Full URL
 */
export const buildApiUrl = (endpoint) => {
  // Remove leading slash from endpoint if present to avoid double slashes
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return `${API_CONFIG.BASE_URL}/${cleanEndpoint}`;
};

/**
 * Get authorization headers for authenticated requests
 * @param {string} accessToken - JWT access token
 * @returns {object} - Headers object
 */
export const getAuthHeaders = (accessToken) => {
  return {
    ...API_CONFIG.DEFAULT_HEADERS,
    'Authorization': `Bearer ${accessToken}`
  };
};

/**
 * Get default headers for public requests
 * @returns {object} - Headers object
 */
export const getDefaultHeaders = () => {
  return { ...API_CONFIG.DEFAULT_HEADERS };
};

// Log configuration on module load (for debugging)
console.log('API Configuration loaded:', {
  baseUrl: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT
});
