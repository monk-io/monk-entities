import React, { useState, useEffect } from 'react';
import { X, CheckSquare, Calendar, Flag, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { createTodo, listUsers } from '../services/api';
import type { CreateTodoData, User, Todo } from '../types';

interface CreateTodoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTodoCreated: () => void;
  preselectedUserId?: string;
}

const CreateTodoModal: React.FC<CreateTodoModalProps> = ({ 
  isOpen, 
  onClose, 
  onTodoCreated,
  preselectedUserId 
}) => {
  const [formData, setFormData] = useState<CreateTodoData & { user_id: string }>({
    user_id: preselectedUserId || '',
    title: '',
    description: '',
    status: 'pending',
    priority: 'medium',
    due_date: ''
  });
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  useEffect(() => {
    if (isOpen && !preselectedUserId) {
      loadUsers();
    }
  }, [isOpen, preselectedUserId]);

  useEffect(() => {
    if (preselectedUserId) {
      setFormData(prev => ({ ...prev, user_id: preselectedUserId }));
    }
  }, [preselectedUserId]);

  const loadUsers = async () => {
    try {
      setIsLoadingUsers(true);
      const response = await listUsers(50, 0); // Get more users for selection
      setUsers(response.users);
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('Failed to load users');
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim() || !formData.user_id) {
      toast.error('Title and user are required');
      return;
    }

    setIsLoading(true);
    
    try {
      const todoData: CreateTodoData = {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        status: formData.status,
        priority: formData.priority,
        due_date: formData.due_date || undefined
      };
      
      await createTodo(formData.user_id, todoData);
      
      toast.success('Todo created successfully!');
      resetForm();
      onTodoCreated();
      onClose();
    } catch (error) {
      console.error('Error creating todo:', error);
      // Error toast is handled by the API interceptor
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      user_id: preselectedUserId || '',
      title: '',
      description: '',
      status: 'pending',
      priority: 'medium',
      due_date: ''
    });
  };

  const handleClose = () => {
    if (!isLoading) {
      resetForm();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={handleClose} />
        
        <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Create New Todo</h3>
            <button
              type="button"
              className="text-gray-400 hover:text-gray-600"
              onClick={handleClose}
              disabled={isLoading}
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {!preselectedUserId && (
              <div>
                <label htmlFor="user_id" className="block text-sm font-medium text-gray-700 mb-1">
                  Assign to User *
                </label>
                <select
                  id="user_id"
                  className="input"
                  value={formData.user_id}
                  onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                  disabled={isLoading || isLoadingUsers}
                  required
                >
                  <option value="">Select a user</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </option>
                  ))}
                </select>
                {isLoadingUsers && (
                  <p className="text-xs text-gray-500 mt-1">Loading users...</p>
                )}
              </div>
            )}
            
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                <div className="flex items-center space-x-2">
                  <CheckSquare className="w-4 h-4" />
                  <span>Title *</span>
                </div>
              </label>
              <input
                type="text"
                id="title"
                className="input"
                placeholder="Enter todo title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                disabled={isLoading}
                required
              />
            </div>
            
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4" />
                  <span>Description</span>
                </div>
              </label>
              <textarea
                id="description"
                rows={3}
                className="input"
                placeholder="Enter todo description (optional)"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                disabled={isLoading}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  id="status"
                  className="input"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as Todo['status'] })}
                  disabled={isLoading}
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              
              <div>
                <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1">
                  <div className="flex items-center space-x-2">
                    <Flag className="w-4 h-4" />
                    <span>Priority</span>
                  </div>
                </label>
                <select
                  id="priority"
                  className="input"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as Todo['priority'] })}
                  disabled={isLoading}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
            
            <div>
              <label htmlFor="due_date" className="block text-sm font-medium text-gray-700 mb-1">
                <div className="flex items-center space-x-2">
                  <Calendar className="w-4 h-4" />
                  <span>Due Date</span>
                </div>
              </label>
              <input
                type="date"
                id="due_date"
                className="input"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                disabled={isLoading}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                className="btn-secondary"
                onClick={handleClose}
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={isLoading || (!preselectedUserId && !formData.user_id)}
              >
                {isLoading ? 'Creating...' : 'Create Todo'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateTodoModal;
