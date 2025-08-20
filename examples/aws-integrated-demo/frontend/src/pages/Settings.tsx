import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Database, 
  Cloud, 
  Activity, 
  RefreshCw,
  Info,
  Server,
  Zap
} from 'lucide-react';
import toast from 'react-hot-toast';
import { healthCheck, runDemo } from '../services/api';
import type { HealthCheck } from '../types';

const Settings: React.FC = () => {
  const [healthStatus, setHealthStatus] = useState<HealthCheck | null>(null);
  const [isLoadingHealth, setIsLoadingHealth] = useState(false);
  const [isRunningDemo, setIsRunningDemo] = useState(false);

  useEffect(() => {
    loadHealthStatus();
  }, []);

  const loadHealthStatus = async () => {
    try {
      setIsLoadingHealth(true);
      const health = await healthCheck();
      setHealthStatus(health);
    } catch (error) {
      console.error('Health check failed:', error);
      setHealthStatus({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        checks: {
          rds: { status: 'failed', details: 'Connection failed' },
          dynamodb: { status: 'failed', details: 'Connection failed' }
        }
      });
    } finally {
      setIsLoadingHealth(false);
    }
  };

  const handleRunDemo = async () => {
    try {
      setIsRunningDemo(true);
      await runDemo();
      toast.success('Demo completed successfully! Check the dashboard for new data.');
    } catch (error) {
      console.error('Error running demo:', error);
      toast.error('Demo failed to run');
    } finally {
      setIsRunningDemo(false);
    }
  };

  const handleRefreshHealth = () => {
    loadHealthStatus();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          System configuration and health monitoring
        </p>
      </div>

      {/* System Health */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-900 flex items-center">
              <Activity className="w-5 h-5 mr-2" />
              System Health
            </h2>
            <button
              onClick={handleRefreshHealth}
              className="btn-secondary text-sm"
              disabled={isLoadingHealth}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingHealth ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
        <div className="card-body">
          {healthStatus ? (
            <div className="space-y-6">
              {/* Overall Status */}
              <div className="flex items-center space-x-4">
                <div className={`w-4 h-4 rounded-full ${
                  healthStatus.status === 'healthy' ? 'bg-success-500' : 'bg-danger-500'
                }`} />
                <div>
                  <h3 className="text-lg font-medium text-gray-900">
                    System Status: {healthStatus.status === 'healthy' ? 'Healthy' : 'Unhealthy'}
                  </h3>
                  <p className="text-sm text-gray-500">
                    Last checked: {new Date(healthStatus.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Database Status */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <Database className={`w-6 h-6 ${
                      healthStatus.checks.rds.status === 'fulfilled' ? 'text-success-500' : 'text-danger-500'
                    }`} />
                    <div>
                      <h4 className="font-medium text-gray-900">RDS PostgreSQL</h4>
                      <p className="text-sm text-gray-500">User data storage</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Status</span>
                      <span className={`text-sm font-medium ${
                        healthStatus.checks.rds.status === 'fulfilled' ? 'text-success-600' : 'text-danger-600'
                      }`}>
                        {healthStatus.checks.rds.status === 'fulfilled' ? 'Connected' : 'Failed'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {healthStatus.checks.rds.details}
                    </div>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center space-x-3 mb-3">
                    <Cloud className={`w-6 h-6 ${
                      healthStatus.checks.dynamodb.status === 'fulfilled' ? 'text-success-500' : 'text-danger-500'
                    }`} />
                    <div>
                      <h4 className="font-medium text-gray-900">DynamoDB</h4>
                      <p className="text-sm text-gray-500">Todo data storage</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Status</span>
                      <span className={`text-sm font-medium ${
                        healthStatus.checks.dynamodb.status === 'fulfilled' ? 'text-success-600' : 'text-danger-600'
                      }`}>
                        {healthStatus.checks.dynamodb.status === 'fulfilled' ? 'Connected' : 'Failed'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {healthStatus.checks.dynamodb.details}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-5 h-5 animate-spin text-gray-400 mr-2" />
              <span className="text-gray-500">Loading health status...</span>
            </div>
          )}
        </div>
      </div>

      {/* Demo Actions */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-medium text-gray-900 flex items-center">
            <Zap className="w-5 h-5 mr-2" />
            Demo Actions
          </h2>
        </div>
        <div className="card-body">
          <div className="space-y-4">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-warning-100 rounded-lg flex items-center justify-center">
                  <Activity className="w-5 h-5 text-warning-600" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-medium text-gray-900">Run Integration Demo</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Creates sample users and todos to demonstrate the full integration between 
                  Lambda, RDS, and DynamoDB. This will add demo data to your system.
                </p>
                <button
                  onClick={handleRunDemo}
                  className="btn-warning mt-3"
                  disabled={isRunningDemo}
                >
                  <Activity className={`w-4 h-4 mr-2 ${isRunningDemo ? 'animate-pulse' : ''}`} />
                  {isRunningDemo ? 'Running Demo...' : 'Run Demo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* System Information */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-medium text-gray-900 flex items-center">
            <Info className="w-5 h-5 mr-2" />
            System Information
          </h2>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Architecture</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• React 18 with TypeScript</li>
                  <li>• Tailwind CSS for styling</li>
                  <li>• Vite for build tooling</li>
                  <li>• React Router for navigation</li>
                  <li>• Recharts for data visualization</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Backend Services</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• AWS Lambda (Serverless API)</li>
                  <li>• RDS PostgreSQL (User data)</li>
                  <li>• DynamoDB (Todo data)</li>
                  <li>• AWS Secrets Manager</li>
                </ul>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Features</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Real-time health monitoring</li>
                  <li>• Cross-database operations</li>
                  <li>• Interactive dashboard</li>
                  <li>• CRUD operations for users & todos</li>
                  <li>• Data visualization</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium text-gray-900 mb-2">API Endpoints</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• GET /health - System health</li>
                  <li>• POST /users - Create user</li>
                  <li>• GET /users - List users</li>
                  <li>• POST /users/:id/todos - Create todo</li>
                  <li>• GET /dashboard/:id - User dashboard</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Environment Configuration */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-medium text-gray-900 flex items-center">
            <Server className="w-5 h-5 mr-2" />
            Environment Configuration
          </h2>
        </div>
        <div className="card-body">
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-600">API Base URL</span>
              <span className="text-sm text-gray-900 font-mono">
                {import.meta.env.VITE_API_URL || '/api'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-600">Environment</span>
              <span className="text-sm text-gray-900">
                {import.meta.env.MODE}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm font-medium text-gray-600">Build Version</span>
              <span className="text-sm text-gray-900">
                {import.meta.env.VITE_APP_VERSION || '1.0.0'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
