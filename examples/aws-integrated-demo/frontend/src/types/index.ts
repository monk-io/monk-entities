export interface User {
  id: string;
  name: string;
  email: string;
  department?: string;
  created_at: string;
  updated_at: string;
}

export interface Todo {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string;
  created_at: string;
  updated_at: string;
}

export interface TodoStats {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  overdue: number;
}

export interface Dashboard {
  user: User;
  todoStats: TodoStats;
  recentTodos: Todo[];
  generatedAt: string;
}

export interface ApiResponse<T = any> {
  message?: string;
  error?: string;
  data?: T;
  [key: string]: any;
}

export interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  checks: {
    rds: {
      status: string;
      details: string;
    };
    dynamodb: {
      status: string;
      details: string;
    };
  };
}

export interface CreateUserData {
  name: string;
  email: string;
  department?: string;
}

export interface CreateTodoData {
  title: string;
  description?: string;
  status?: Todo['status'];
  priority?: Todo['priority'];
  due_date?: string;
}

export interface UpdateTodoData {
  title?: string;
  description?: string;
  status?: Todo['status'];
  priority?: Todo['priority'];
  due_date?: string;
}
