/**
 * HTTP Cloud Function (Gen 2)
 * Returns a greeting message with optional name parameter
 */
const functions = require('@google-cloud/functions-framework');

functions.http('helloWorld', (req, res) => {
  // Get name from query param, body, or default to 'World'
  const name = req.query.name || req.body?.name || 'World';

  // Log request details
  console.log(`Request received: method=${req.method}, name=${name}`);

  // Set CORS headers for browser access
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  // Return greeting
  const response = {
    message: `Hello, ${name}!`,
    timestamp: new Date().toISOString(),
    runtime: 'Cloud Functions Gen 2',
    method: req.method,
    headers: {
      'user-agent': req.get('user-agent'),
      'content-type': req.get('content-type')
    }
  };

  res.status(200).json(response);
});
