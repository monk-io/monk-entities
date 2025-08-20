import React from 'react';
import { Calendar, Clock, Flag, User } from 'lucide-react';
import { format, isAfter, parseISO } from 'date-fns';
import clsx from 'clsx';
import type { Todo } from '../types';

interface TodoCardProps {
  todo: Todo;
  onStatusChange?: (todoId: string, status: Todo['status']) => void;
  onEdit?: (todo: Todo) => void;
  onDelete?: (todoId: string) => void;
  showUser?: boolean;
}

const TodoCard: React.FC<TodoCardProps> = ({ 
  todo, 
  onStatusChange, 
  onEdit, 
  onDelete,
  showUser = false 
}) => {
  const isOverdue = todo.due_date && isAfter(new Date(), parseISO(todo.due_date));

  const statusColors = {
    pending: 'bg-gray-100 text-gray-800',
    in_progress: 'bg-primary-100 text-primary-800',
    completed: 'bg-success-100 text-success-800',
    cancelled: 'bg-danger-100 text-danger-800'
  };

  const priorityColors = {
    low: 'text-gray-500',
    medium: 'text-warning-600',
    high: 'text-warning-700',
    urgent: 'text-danger-600'
  };

  const priorityIcons = {
    low: '↓',
    medium: '→',
    high: '↑',
    urgent: '⚠'
  };

  const handleStatusChange = (newStatus: Todo['status']) => {
    if (onStatusChange) {
      onStatusChange(todo.id, newStatus);
    }
  };

  return (
    <div className={clsx(
      'card hover:shadow-md transition-shadow',
      isOverdue && todo.status !== 'completed' && 'border-l-4 border-l-danger-500'
    )}>
      <div className="card-body">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {todo.title}
            </h3>
            
            {todo.description && (
              <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                {todo.description}
              </p>
            )}
            
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className={clsx('badge', statusColors[todo.status])}>
                {todo.status.replace('_', ' ')}
              </span>
              
              <div className={clsx('flex items-center space-x-1 text-sm', priorityColors[todo.priority])}>
                <Flag className="w-3 h-3" />
                <span>{priorityIcons[todo.priority]} {todo.priority}</span>
              </div>
              
              {isOverdue && todo.status !== 'completed' && (
                <span className="badge badge-danger">
                  Overdue
                </span>
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
              {todo.due_date && (
                <div className="flex items-center space-x-1">
                  <Calendar className="w-3 h-3" />
                  <span>Due {format(parseISO(todo.due_date), 'MMM d, yyyy')}</span>
                </div>
              )}
              
              <div className="flex items-center space-x-1">
                <Clock className="w-3 h-3" />
                <span>Updated {format(parseISO(todo.updated_at), 'MMM d, yyyy')}</span>
              </div>
              
              {showUser && (
                <div className="flex items-center space-x-1">
                  <User className="w-3 h-3" />
                  <span>User: {todo.user_id.slice(0, 8)}...</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex flex-col space-y-2 ml-4">
            {onStatusChange && (
              <select
                value={todo.status}
                onChange={(e) => handleStatusChange(e.target.value as Todo['status'])}
                className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            )}
            
            {(onEdit || onDelete) && (
              <div className="flex space-x-1">
                {onEdit && (
                  <button
                    onClick={() => onEdit(todo)}
                    className="text-xs text-primary-600 hover:text-primary-800 px-2 py-1 rounded hover:bg-primary-50"
                  >
                    Edit
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => onDelete(todo.id)}
                    className="text-xs text-danger-600 hover:text-danger-800 px-2 py-1 rounded hover:bg-danger-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TodoCard;
