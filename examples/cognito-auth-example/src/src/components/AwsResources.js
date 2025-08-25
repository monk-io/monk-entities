import React, { useState, useEffect } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';

function AwsResources({ user, authTokens }) {
  const [credentials, setCredentials] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testResults, setTestResults] = useState({});
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadAwsCredentials();
  }, []);

  const loadAwsCredentials = async () => {
    try {
      const session = await fetchAuthSession();
      setCredentials(session.credentials);
    } catch (error) {
      console.error('Error fetching AWS credentials:', error);
    } finally {
      setLoading(false);
    }
  };

  const testS3Access = async () => {
    setTesting(true);
    try {
      // Note: This is a demonstration of how you would use AWS credentials
      // In a real app, you'd import AWS SDK and make actual calls
      
      const result = {
        service: 'S3',
        status: 'simulated',
        message: 'Would list S3 buckets using federated credentials',
        credentials: credentials ? 'Available' : 'Not available',
        region: process.env.REACT_APP_REGION
      };
      
      setTestResults(prev => ({ ...prev, s3: result }));
    } catch (error) {
      setTestResults(prev => ({ 
        ...prev, 
        s3: { 
          service: 'S3', 
          status: 'error', 
          message: error.message 
        } 
      }));
    } finally {
      setTesting(false);
    }
  };

  const testDynamoDbAccess = async () => {
    setTesting(true);
    try {
      const result = {
        service: 'DynamoDB',
        status: 'simulated',
        message: 'Would scan DynamoDB tables using federated credentials',
        credentials: credentials ? 'Available' : 'Not available',
        region: process.env.REACT_APP_REGION
      };
      
      setTestResults(prev => ({ ...prev, dynamodb: result }));
    } catch (error) {
      setTestResults(prev => ({ 
        ...prev, 
        dynamodb: { 
          service: 'DynamoDB', 
          status: 'error', 
          message: error.message 
        } 
      }));
    } finally {
      setTesting(false);
    }
  };

  const testLambdaAccess = async () => {
    setTesting(true);
    try {
      const result = {
        service: 'Lambda',
        status: 'simulated',
        message: 'Would invoke Lambda functions using federated credentials',
        credentials: credentials ? 'Available' : 'Not available',
        region: process.env.REACT_APP_REGION
      };
      
      setTestResults(prev => ({ ...prev, lambda: result }));
    } catch (error) {
      setTestResults(prev => ({ 
        ...prev, 
        lambda: { 
          service: 'Lambda', 
          status: 'error', 
          message: error.message 
        } 
      }));
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <div className="loading">Loading AWS credentials...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <h2>☁️ AWS Resources Access</h2>
        <p>
          This page demonstrates how authenticated users can access AWS resources using 
          temporary credentials provided by the Cognito Identity Pool.
        </p>
      </div>

      <div className="card">
        <h3>🔑 Federated AWS Credentials</h3>
        {credentials ? (
          <div>
            <div className="success">
              <strong>✅ AWS Credentials Available</strong><br/>
              Your Identity Pool has provided temporary AWS credentials for secure resource access.
            </div>
            
            <div className="code-block">
{`Access Key ID: ${credentials.accessKeyId ? credentials.accessKeyId.substring(0, 8) + '...' : 'Not available'}
Secret Access Key: ${credentials.secretAccessKey ? '***' + credentials.secretAccessKey.substring(-4) : 'Not available'}
Session Token: ${credentials.sessionToken ? 'Available (JWT)' : 'Not available'}
Expiration: ${credentials.expiration ? credentials.expiration.toLocaleString() : 'Not available'}
Identity ID: ${credentials.identityId || 'Not available'}`}
            </div>
          </div>
        ) : (
          <div className="error">
            <strong>❌ AWS Credentials Not Available</strong><br/>
            Identity Pool may not be configured or you may not have the necessary permissions.
          </div>
        )}
      </div>

      <div className="card">
        <h3>🧪 Test AWS Service Access</h3>
        <p>
          Click the buttons below to simulate AWS service calls using your federated credentials.
          In a real application, these would make actual AWS API calls.
        </p>
        
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <button 
            onClick={testS3Access} 
            className="btn"
            disabled={testing || !credentials}
          >
            🪣 Test S3 Access
          </button>
          
          <button 
            onClick={testDynamoDbAccess} 
            className="btn"
            disabled={testing || !credentials}
          >
            🗄️ Test DynamoDB Access
          </button>
          
          <button 
            onClick={testLambdaAccess} 
            className="btn"
            disabled={testing || !credentials}
          >
            ⚡ Test Lambda Access
          </button>
        </div>

        {Object.keys(testResults).length > 0 && (
          <div>
            <h4>📊 Test Results:</h4>
            {Object.values(testResults).map((result, index) => (
              <div key={index} className="code-block" style={{ marginBottom: '10px' }}>
{`Service: ${result.service}
Status: ${result.status}
Message: ${result.message}
Credentials: ${result.credentials}
Region: ${result.region || 'N/A'}`}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>🛡️ Security Features</h3>
        <div className="feature-grid">
          <div className="feature-card">
            <h4>⏰ Temporary Credentials</h4>
            <p>AWS credentials are temporary and automatically expire for enhanced security</p>
          </div>
          
          <div className="feature-card">
            <h4>🎯 Scoped Permissions</h4>
            <p>Access is limited to specific AWS resources based on your Identity Pool role</p>
          </div>
          
          <div className="feature-card">
            <h4>🔄 Automatic Renewal</h4>
            <p>Credentials are automatically refreshed when needed without user intervention</p>
          </div>
          
          <div className="feature-card">
            <h4>🏢 Enterprise Ready</h4>
            <p>Supports fine-grained IAM policies and cross-account resource access</p>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>📋 Real-World Use Cases</h3>
        <div className="code-block">
{`// Example: Upload file to S3
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: "${process.env.REACT_APP_REGION}",
  credentials: credentials
});

const uploadFile = async (file) => {
  const command = new PutObjectCommand({
    Bucket: "my-user-uploads",
    Key: \`\${user.userId}/\${file.name}\`,
    Body: file
  });
  
  return await s3Client.send(command);
};

// Example: Query DynamoDB
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";

const dynamoClient = new DynamoDBClient({
  region: "${process.env.REACT_APP_REGION}",
  credentials: credentials
});

// Example: Invoke Lambda function
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const lambdaClient = new LambdaClient({
  region: "${process.env.REACT_APP_REGION}",
  credentials: credentials
});`}
        </div>
      </div>

      <div className="info">
        <strong>🔧 Implementation Note:</strong> This demo simulates AWS service calls. To enable real AWS API calls, 
        install the AWS SDK for JavaScript v3 and configure appropriate IAM roles in your Identity Pool.
      </div>
    </div>
  );
}

export default AwsResources;
