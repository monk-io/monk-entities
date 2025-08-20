import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Plus, 
  RefreshCw, 
  User as UserIcon, 
  Mail, 
  Building, 
  Calendar,
  CheckSquare,
  Clock,
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import TodoCard from '../components/TodoCard';
import CreateTodoModal from '../components/CreateTodoModal';
import { getUser, getUserTodos, updateTodo, deleteTodo } from '../services/api';
import type { User, Todo } from '../types';

const UserDetail: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateTodoModalOpen, setIsCreateTodoModalOpen] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    if (userId) {
      loadUserData();
    }
  }, [userId]);

  const loadUserData = async () => {
    if (!userId) return;
    
    try {
      setIsLoading(true);
      const [userData, todosData] = await Promise.all([
        getUser(userId),
        getUserTodos(userId)
      ]);
      
      setUser(userData);
      setTodos(todosData);
    } catch (error) {
      console.error('Error loading user data:', error);
      toast.error('Failed to load user data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (todoId: string, status: Todo['status']) => {
    try {
      const updatedTodo = await updateTodo(todoId, { status });
      setTodos(prev => prev.map(todo => 
        todo.id === todoId ? updatedTodo : todo
      ));
      toast.success('Todo status updated');
    } catch (error) {
      console.error('Error updating todo:', error);
      toast.error('Failed to update todo');
    }
  };

  const handleDeleteTodo = async (todoId: string) => {
    if (!confirm('Are you sure you want to delete this todo?')) {
      return;
    }

    try {
      await deleteTodo(todoId);
      setTodos(prev => prev.filter(todo => todo.id !== todoId));
      toast.success('Todo deleted successfully');
    } catch (error) {
      console.error('Error deleting todo:', error);
      toast.error('Failed to delete todo');
    }
  };

  const handleTodoCreated = () => {
    loadUserData();
  };

  const handleRefresh = () => {
    loadUserData();
  };

  const filteredTodos = todos.filter(todo => {
    if (filter === 'all') return true;
    return todo.status === filter;
  });

  const todoStats = {
    total: todos.length,
    pending: todos.filter(t => t.status === 'pending').length,
    in_progress: todos.filter(t => t.status === 'in_progress').length,
    completed: todos.filter(t => t.status === 'completed').length,
    overdue: todos.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed').length
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center space-x-2 text-gray-500">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading user details...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">User not found</h3>
        <p className="mt-1 text-sm text-gray-500">
          The user you're looking for doesn't exist or has been deleted.
        </p>
        <div className="mt-6">
          <Link to="/users" className="btn-primary">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Users
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center space-x-4">
          <Link to="/users" className="btn-secondary">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{user.name}</h1>
            <p className="mt-1 text-sm text-gray-500">User Details & Todos</p>
          </div>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-3">
          <button
            onClick={handleRefresh}
            className="btn-secondary"
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setIsCreateTodoModalOpen(true)}
            className="btn-primary"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Todo
          </button>
        </div>
      </div>

      {/* User Info Card */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-medium text-gray-900">User Information</h2>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <UserIcon className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-500">Full Name</p>
                  <p className="text-base text-gray-900">{user.name}</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <Mail className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-500">Email</p>
                  <p className="text-base text-gray-900">{user.email}</p>
                </div>
              </div>
              
              {user.department && (
                <div className="flex items-center space-x-3">
                  <Building className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-500">Department</p>
                    <p className="text-base text-gray-900">{user.department}</p>
                  </div>
                </div>
              )}
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <Calendar className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-500">Created</p>
                  <p className="text-base text-gray-900">
                    {format(new Date(user.created_at), 'MMM d, yyyy')}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <Clock className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-500">Last Updated</p>
                  <p className="text-base text-gray-900">
                    {format(new Date(user.updated_at), 'MMM d, yyyy')}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <div className="w-5 h-5 flex items-center justify-center">
                  <span className="text-xs font-mono text-gray-400">#</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">User ID</p>
                  <p className="text-sm font-mono text-gray-900">{user.id}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Todo Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="card">
          <div className="card-body text-center">
            <CheckSquare className="mx-auto h-8 w-8 text-primary-600 mb-2" />
            <p className="text-2xl font-semibold text-gray-900">{todoStats.total}</p>
            <p className="text-sm text-gray-500">Total</p>
          </div>
        </div>
        
        <div className="card">
          <div className="card-body text-center">
            <Clock className="mx-auto h-8 w-8 text-gray-600 mb-2" />
            <p className="text-2xl font-semibold text-gray-900">{todoStats.pending}</p>
            <p className="text-sm text-gray-500">Pending</p>
          </div>
        </div>
        
        <div className="card">
          <div className="card-body text-center">
            <div className="mx-auto h-8 w-8 bg-primary-100 rounded-full flex items-center justify-center mb-2">
              <span className="text-primary-600 font-semibold">→</span>
            </div>
            <p className="text-2xl font-semibold text-gray-900">{todoStats.in_progress}</p>
            <p className="text-sm text-gray-500">In Progress</p>
          </div>
        </div>
        
        <div className="card">
          <div className="card-body text-center">
            <div className="mx-auto h-8 w-8 bg-success-100 rounded-full flex items-center justify-center mb-2">
              <span className="text-success-600 font-semibold">✓</span>
            </div>
            <p className="text-2xl font-semibold text-gray-900">{todoStats.completed}</p>
            <p className="text-sm text-gray-500">Completed</p>
          </div>
        </div>
        
        <div className="card">
          <div className="card-body text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-danger-600 mb-2" />
            <p className="text-2xl font-semibold text-gray-900">{todoStats.overdue}</p>
            <p className="text-sm text-gray-500">Overdue</p>
          </div>
        </div>
      </div>

      {/* Todos Section */}
      <div className="card">
        <div className="card-header">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-medium text-gray-900">Todos</h2>
            <div className="mt-2 sm:mt-0">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="text-sm border border-gray-300 rounded px-3 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="all">All Todos ({todoStats.total})</option>
                <option value="pending">Pending ({todoStats.pending})</option>
                <option value="in_progress">In Progress ({todoStats.in_progress})</option>
                <option value="completed">Completed ({todoStats.completed})</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </div>
        
        <div className="card-body">
          {filteredTodos.length === 0 ? (
            <div className="text-center py-8">
              <CheckSquare className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                {filter === 'all' ? 'No todos yet' : `No ${filter.replace('_', ' ')} todos`}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {filter === 'all' 
                  ? 'Get started by creating the first todo for this user.' 
                  : `This user has no ${filter.replace('_', ' ')} todos.`
                }
              </p>
              {filter === 'all' && (
                <div className="mt-6">
                  <button
                    onClick={() => setIsCreateTodoModalOpen(true)}
                    className="btn-primary"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Todo
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTodos.map((todo) => (
                <TodoCard
                  key={todo.id}
                  todo={todo}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDeleteTodo}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Todo Modal */}
      <CreateTodoModal
        isOpen={isCreateTodoModalOpen}
        onClose={() => setIsCreateTodoModalOpen(false)}
        onTodoCreated={handleTodoCreated}
        preselectedUserId={userId}
      />
    </div>
  );
};

export default UserDetail;
