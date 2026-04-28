// HTTP-triggered Cloud Function for gcp-fullstack-demo.
//
// Receives a `text` query param (or body field) and returns a transformed
// version, demonstrating that the backend Cloud Run service can call out
// to a serverless Cloud Function over plain HTTP.
//
// Deployed via blob_name from gcp/cloud-function. Entry point: `transform`.

const functions = require('@google-cloud/functions-framework');

functions.http('transform', (req, res) => {
  const text =
    (req.query && req.query.text) ||
    (req.body && req.body.text) ||
    'hello from cloud function';

  res.set('Content-Type', 'application/json');
  res.json({
    received: text,
    upper: text.toUpperCase(),
    reversed: text.split('').reverse().join(''),
    length: text.length,
    invoked_at: new Date().toISOString(),
  });
});
