import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Users, 
  CheckSquare, 
  BarChart3, 
  Settings, 
  Menu, 
  X,
  Activity,
  Database,
  Cloud
} from 'lucide-react';
import { healthCheck } from '../services/api';
import type { HealthCheck } from '../types';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [healthStatus, setHealthStatus] = useState<HealthCheck | null>(null);
  const location = useLocation();

  useEffect(() => {
    const checkHealth = async () => {
      try {
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
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const navigation = [
    { name: 'Dashboard', href: '/', icon: BarChart3 },
    { name: 'Users', href: '/users', icon: Users },
    { name: 'Todos', href: '/todos', icon: CheckSquare },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-40 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
        <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl">
          <div className="flex h-16 items-center justify-between px-4">
            <h1 className="text-xl font-bold text-gray-900">AWS Demo</h1>
            <button
              type="button"
              className="text-gray-400 hover:text-gray-600"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <nav className="flex-1 space-y-1 px-2 py-4">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md ${
                    isActive(item.href)
                      ? 'bg-primary-100 text-primary-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="mr-3 h-5 w-5 flex-shrink-0" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
          
          {/* Health Status in Mobile Sidebar */}
          {healthStatus && (
            <div className="border-t border-gray-200 p-4">
              <div className="flex items-center space-x-3">
                <div className={`flex-shrink-0 w-3 h-3 rounded-full ${
                  healthStatus.status === 'healthy' ? 'bg-success-500' : 'bg-danger-500'
                }`} />
                <div className="text-sm">
                  <p className="font-medium text-gray-900">System Status</p>
                  <p className={`${
                    healthStatus.status === 'healthy' ? 'text-success-600' : 'text-danger-600'
                  }`}>
                    {healthStatus.status === 'healthy' ? 'All systems operational' : 'Issues detected'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-white border-r border-gray-200 shadow-sm">
          <div className="flex items-center h-16 px-4 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="flex items-center justify-center w-8 h-8 bg-primary-600 rounded-lg">
                <Cloud className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">AWS Demo</h1>
                <p className="text-xs text-gray-500">Task Management</p>
              </div>
            </div>
          </div>
          
          <nav className="flex-1 space-y-1 px-2 py-4">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                    isActive(item.href)
                      ? 'bg-primary-100 text-primary-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon className="mr-3 h-5 w-5 flex-shrink-0" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Health Status */}
          {healthStatus && (
            <div className="border-t border-gray-200 p-4">
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <Activity className={`w-4 h-4 ${
                    healthStatus.status === 'healthy' ? 'text-success-500' : 'text-danger-500'
                  }`} />
                  <span className="text-sm font-medium text-gray-900">System Health</span>
                </div>
                
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">RDS</span>
                    <div className={`w-2 h-2 rounded-full ${
                      healthStatus.checks.rds.status === 'fulfilled' ? 'bg-success-500' : 'bg-danger-500'
                    }`} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">DynamoDB</span>
                    <div className={`w-2 h-2 rounded-full ${
                      healthStatus.checks.dynamodb.status === 'fulfilled' ? 'bg-success-500' : 'bg-danger-500'
                    }`} />
                  </div>
                </div>
                
                <div className="text-xs text-gray-500">
                  Last check: {new Date(healthStatus.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 lg:hidden">
          <div className="flex items-center justify-between h-16 px-4">
            <button
              type="button"
              className="text-gray-400 hover:text-gray-600"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">AWS Demo</h1>
            <div className="w-6" /> {/* Spacer */}
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
