import React from 'react';
import { Link } from 'react-router-dom';
import { User, Calendar, Mail, Building } from 'lucide-react';
import { format } from 'date-fns';
import type { User as UserType } from '../types';

interface UserCardProps {
  user: UserType;
  showActions?: boolean;
}

const UserCard: React.FC<UserCardProps> = ({ user, showActions = true }) => {
  return (
    <div className="card hover:shadow-md transition-shadow">
      <div className="card-body">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-primary-600" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-medium text-gray-900 truncate">
                {user.name}
              </h3>
              <div className="flex items-center space-x-4 mt-1 text-sm text-gray-500">
                <div className="flex items-center space-x-1">
                  <Mail className="w-4 h-4" />
                  <span className="truncate">{user.email}</span>
                </div>
                {user.department && (
                  <div className="flex items-center space-x-1">
                    <Building className="w-4 h-4" />
                    <span>{user.department}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {showActions && (
            <Link
              to={`/users/${user.id}`}
              className="btn-primary text-sm"
            >
              View Details
            </Link>
          )}
        </div>
        
        <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center space-x-1">
            <Calendar className="w-3 h-3" />
            <span>Created {format(new Date(user.created_at), 'MMM d, yyyy')}</span>
          </div>
          <div className="text-right">
            <span>ID: {user.id.slice(0, 8)}...</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserCard;
