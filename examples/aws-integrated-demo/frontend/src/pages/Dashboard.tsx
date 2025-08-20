import React, { useState, useEffect } from 'react';
import { 
  Users, 
  CheckSquare, 
  TrendingUp, 
  AlertCircle, 
  RefreshCw,
  Database,
  Cloud,
  Activity,
  Clock,
  Calendar
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import toast from 'react-hot-toast';
import { listUsers, getUserTodos, healthCheck, runDemo } from '../services/api';
import type { User, Todo, HealthCheck } from '../types';

const Dashboard: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [healthStatus, setHealthStatus] = useState<HealthCheck | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunningDemo, setIsRunningDemo] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      
      // Load health status
      try {
        const health = await healthCheck();
        setHealthStatus(health);
      } catch (error) {
        console.error('Health check failed:', error);
      }
      
      // Load users
      const usersResponse = await listUsers(50, 0);
      setUsers(usersResponse.users);
      
      // Load all todos
      const allTodos: Todo[] = [];
      for (const user of usersResponse.users) {
        try {
          const userTodos = await getUserTodos(user.id);
          allTodos.push(...userTodos);
        } catch (error) {
          console.error(`Error loading todos for user ${user.id}:`, error);
        }
      }
      
      setTodos(allTodos);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunDemo = async () => {
    try {
      setIsRunningDemo(true);
      await runDemo();
      toast.success('Demo completed successfully!');
      // Reload data to show demo results
      setTimeout(() => {
        loadDashboardData();
      }, 1000);
    } catch (error) {
      console.error('Error running demo:', error);
      toast.error('Demo failed to run');
    } finally {
      setIsRunningDemo(false);
    }
  };

  const handleRefresh = () => {
    loadDashboardData();
  };

  // Calculate statistics
  const stats = {
    totalUsers: users.length,
    totalTodos: todos.length,
    completedTodos: todos.filter(t => t.status === 'completed').length,
    overdueTodos: todos.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed').length,
    pendingTodos: todos.filter(t => t.status === 'pending').length,
    inProgressTodos: todos.filter(t => t.status === 'in_progress').length
  };

  // Data for charts
  const statusData = [
    { name: 'Pending', value: stats.pendingTodos, color: '#6b7280' },
    { name: 'In Progress', value: stats.inProgressTodos, color: '#3b82f6' },
    { name: 'Completed', value: stats.completedTodos, color: '#22c55e' },
    { name: 'Cancelled', value: todos.filter(t => t.status === 'cancelled').length, color: '#ef4444' }
  ];

  const priorityData = [
    { name: 'Low', count: todos.filter(t => t.priority === 'low').length },
    { name: 'Medium', count: todos.filter(t => t.priority === 'medium').length },
    { name: 'High', count: todos.filter(t => t.priority === 'high').length },
    { name: 'Urgent', count: todos.filter(t => t.priority === 'urgent').length }
  ];

  const departmentData = users.reduce((acc, user) => {
    const dept = user.department || 'No Department';
    const existing = acc.find(item => item.name === dept);
    if (existing) {
      existing.users += 1;
      existing.todos += todos.filter(t => t.user_id === user.id).length;
    } else {
      acc.push({
        name: dept,
        users: 1,
        todos: todos.filter(t => t.user_id === user.id).length
      });
    }
    return acc;
  }, [] as Array<{ name: string; users: number; todos: number }>);

  const completionRate = stats.totalTodos > 0 ? (stats.completedTodos / stats.totalTodos * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            AWS Integrated Demo - Lambda + DynamoDB + RDS Analytics
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-3">
          <button
            onClick={handleRunDemo}
            className="btn-warning"
            disabled={isRunningDemo}
          >
            <Activity className={`w-4 h-4 mr-2 ${isRunningDemo ? 'animate-pulse' : ''}`} />
            {isRunningDemo ? 'Running Demo...' : 'Run Demo'}
          </button>
          <button
            onClick={handleRefresh}
            className="btn-secondary"
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* System Health */}
      {healthStatus && (
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-medium text-gray-900 flex items-center">
              <Activity className="w-5 h-5 mr-2" />
              System Health
            </h2>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center space-x-3">
                <div className={`w-3 h-3 rounded-full ${
                  healthStatus.status === 'healthy' ? 'bg-success-500' : 'bg-danger-500'
                }`} />
                <div>
                  <p className="text-sm font-medium text-gray-900">Overall Status</p>
                  <p className={`text-sm ${
                    healthStatus.status === 'healthy' ? 'text-success-600' : 'text-danger-600'
                  }`}>
                    {healthStatus.status === 'healthy' ? 'All systems operational' : 'Issues detected'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <Database className={`w-5 h-5 ${
                  healthStatus.checks.rds.status === 'fulfilled' ? 'text-success-500' : 'text-danger-500'
                }`} />
                <div>
                  <p className="text-sm font-medium text-gray-900">RDS PostgreSQL</p>
                  <p className={`text-sm ${
                    healthStatus.checks.rds.status === 'fulfilled' ? 'text-success-600' : 'text-danger-600'
                  }`}>
                    {healthStatus.checks.rds.status === 'fulfilled' ? 'Connected' : 'Connection failed'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <Cloud className={`w-5 h-5 ${
                  healthStatus.checks.dynamodb.status === 'fulfilled' ? 'text-success-500' : 'text-danger-500'
                }`} />
                <div>
                  <p className="text-sm font-medium text-gray-900">DynamoDB</p>
                  <p className={`text-sm ${
                    healthStatus.checks.dynamodb.status === 'fulfilled' ? 'text-success-600' : 'text-danger-600'
                  }`}>
                    {healthStatus.checks.dynamodb.status === 'fulfilled' ? 'Connected' : 'Connection failed'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card">
          <div className="card-body">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Users className="h-8 w-8 text-primary-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Users</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {isLoading ? '...' : stats.totalUsers}
                </p>
                <p className="text-xs text-gray-500 mt-1">Stored in RDS</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="card">
          <div className="card-body">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckSquare className="h-8 w-8 text-success-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Todos</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {isLoading ? '...' : stats.totalTodos}
                </p>
                <p className="text-xs text-gray-500 mt-1">Stored in DynamoDB</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="card">
          <div className="card-body">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <TrendingUp className="h-8 w-8 text-warning-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Completion Rate</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {isLoading ? '...' : `${completionRate}%`}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {stats.completedTodos} of {stats.totalTodos} completed
                </p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="card">
          <div className="card-body">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <AlertCircle className="h-8 w-8 text-danger-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Overdue Todos</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {isLoading ? '...' : stats.overdueTodos}
                </p>
                <p className="text-xs text-gray-500 mt-1">Need attention</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Todo Status Distribution */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-gray-900">Todo Status Distribution</h3>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              {statusData.map((item, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span>{item.name}: {item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Priority Distribution */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-gray-900">Priority Distribution</h3>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={priorityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Department Overview */}
      {departmentData.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-gray-900">Department Overview</h3>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={departmentData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="users" fill="#22c55e" name="Users" />
                <Bar dataKey="todos" fill="#3b82f6" name="Todos" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <Clock className="w-5 h-5 mr-2" />
            Recent Activity
          </h3>
        </div>
        <div className="card-body">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : todos.length === 0 ? (
            <div className="text-center py-8">
              <CheckSquare className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No activity yet</h3>
              <p className="mt-1 text-sm text-gray-500">
                Create some users and todos to see activity here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {todos
                .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
                .slice(0, 5)
                .map((todo) => {
                  const user = users.find(u => u.id === todo.user_id);
                  return (
                    <div key={todo.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                      <div className={`w-2 h-2 rounded-full ${
                        todo.status === 'completed' ? 'bg-success-500' :
                        todo.status === 'in_progress' ? 'bg-primary-500' :
                        'bg-gray-400'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {todo.title}
                        </p>
                        <p className="text-xs text-gray-500">
                          {user?.name || 'Unknown User'} • {todo.status.replace('_', ' ')} • {todo.priority} priority
                        </p>
                      </div>
                      <div className="text-xs text-gray-400">
                        {new Date(todo.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
