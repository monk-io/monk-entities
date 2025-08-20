import React, { useState, useEffect } from 'react';
import { Plus, Search, RefreshCw, CheckSquare, Filter } from 'lucide-react';
import toast from 'react-hot-toast';
import TodoCard from '../components/TodoCard';
import CreateTodoModal from '../components/CreateTodoModal';
import { listUsers, getUserTodos, updateTodo, deleteTodo } from '../services/api';
import type { User, Todo } from '../types';

const Todos: React.FC = () => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      
      // First load users
      const usersResponse = await listUsers(50, 0);
      setUsers(usersResponse.users);
      
      // Then load todos for all users
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
      console.error('Error loading data:', error);
      toast.error('Failed to load todos');
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
    loadData();
  };

  const handleRefresh = () => {
    loadData();
  };

  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user ? user.name : 'Unknown User';
  };

  const filteredTodos = todos.filter(todo => {
    const matchesSearch = 
      todo.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      todo.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getUserName(todo.user_id).toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || todo.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || todo.priority === priorityFilter;
    
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const todoStats = {
    total: todos.length,
    pending: todos.filter(t => t.status === 'pending').length,
    in_progress: todos.filter(t => t.status === 'in_progress').length,
    completed: todos.filter(t => t.status === 'completed').length,
    overdue: todos.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed').length
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Todos</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage todos stored in DynamoDB across all users
          </p>
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
            onClick={() => setIsCreateModalOpen(true)}
            className="btn-primary"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Todo
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="card">
          <div className="card-body text-center">
            <CheckSquare className="mx-auto h-8 w-8 text-primary-600 mb-2" />
            <p className="text-2xl font-semibold text-gray-900">
              {isLoading ? '...' : todoStats.total}
            </p>
            <p className="text-sm text-gray-500">Total</p>
          </div>
        </div>
        
        <div className="card">
          <div className="card-body text-center">
            <div className="mx-auto h-8 w-8 bg-gray-100 rounded-full flex items-center justify-center mb-2">
              <span className="text-gray-600 font-semibold text-sm">⏳</span>
            </div>
            <p className="text-2xl font-semibold text-gray-900">
              {isLoading ? '...' : todoStats.pending}
            </p>
            <p className="text-sm text-gray-500">Pending</p>
          </div>
        </div>
        
        <div className="card">
          <div className="card-body text-center">
            <div className="mx-auto h-8 w-8 bg-primary-100 rounded-full flex items-center justify-center mb-2">
              <span className="text-primary-600 font-semibold">→</span>
            </div>
            <p className="text-2xl font-semibold text-gray-900">
              {isLoading ? '...' : todoStats.in_progress}
            </p>
            <p className="text-sm text-gray-500">In Progress</p>
          </div>
        </div>
        
        <div className="card">
          <div className="card-body text-center">
            <div className="mx-auto h-8 w-8 bg-success-100 rounded-full flex items-center justify-center mb-2">
              <span className="text-success-600 font-semibold">✓</span>
            </div>
            <p className="text-2xl font-semibold text-gray-900">
              {isLoading ? '...' : todoStats.completed}
            </p>
            <p className="text-sm text-gray-500">Completed</p>
          </div>
        </div>
        
        <div className="card">
          <div className="card-body text-center">
            <div className="mx-auto h-8 w-8 bg-danger-100 rounded-full flex items-center justify-center mb-2">
              <span className="text-danger-600 font-semibold">⚠</span>
            </div>
            <p className="text-2xl font-semibold text-gray-900">
              {isLoading ? '...' : todoStats.overdue}
            </p>
            <p className="text-sm text-gray-500">Overdue</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                className="input pl-10"
                placeholder="Search todos, descriptions, or users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input"
              >
                <option value="all">All Status ({todoStats.total})</option>
                <option value="pending">Pending ({todoStats.pending})</option>
                <option value="in_progress">In Progress ({todoStats.in_progress})</option>
                <option value="completed">Completed ({todoStats.completed})</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            
            <div>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="input"
              >
                <option value="all">All Priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
          
          {(searchTerm || statusFilter !== 'all' || priorityFilter !== 'all') && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing {filteredTodos.length} of {todos.length} todos
              </p>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                  setPriorityFilter('all');
                }}
                className="text-sm text-primary-600 hover:text-primary-800"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Todos List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center space-x-2 text-gray-500">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Loading todos...</span>
          </div>
        </div>
      ) : filteredTodos.length === 0 ? (
        <div className="text-center py-12">
          <CheckSquare className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            {searchTerm || statusFilter !== 'all' || priorityFilter !== 'all' 
              ? 'No todos match your filters' 
              : 'No todos yet'
            }
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm || statusFilter !== 'all' || priorityFilter !== 'all'
              ? 'Try adjusting your search terms or filters.'
              : 'Get started by creating your first todo.'
            }
          </p>
          {!(searchTerm || statusFilter !== 'all' || priorityFilter !== 'all') && (
            <div className="mt-6">
              <button
                onClick={() => setIsCreateModalOpen(true)}
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
            <div key={todo.id} className="relative">
              <TodoCard
                todo={todo}
                onStatusChange={handleStatusChange}
                onDelete={handleDeleteTodo}
                showUser={true}
              />
              <div className="absolute top-4 right-4 text-xs text-gray-500 bg-white px-2 py-1 rounded border">
                {getUserName(todo.user_id)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Todo Modal */}
      <CreateTodoModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onTodoCreated={handleTodoCreated}
      />
    </div>
  );
};

export default Todos;
