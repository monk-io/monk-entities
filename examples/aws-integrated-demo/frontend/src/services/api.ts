import axios, { AxiosResponse } from 'axios';
import toast from 'react-hot-toast';
import type { 
  User, 
  Todo, 
  Dashboard, 
  HealthCheck, 
  CreateUserData, 
  CreateTodoData, 
  UpdateTodoData,
  ApiResponse 
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('❌ API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response: AxiosResponse) => {
    console.log(`✅ API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('❌ API Response Error:', error);
    
    const message = error.response?.data?.error || error.message || 'An error occurred';
    
    // Don't show toast for health check failures (they're expected during startup)
    if (!error.config?.url?.includes('/health')) {
      toast.error(message);
    }
    
    return Promise.reject(error);
  }
);

// Health Check
export const healthCheck = async (): Promise<HealthCheck> => {
  const response = await api.get<HealthCheck>('/health');
  return response.data;
};

// User Management
export const createUser = async (userData: CreateUserData): Promise<User> => {
  const response = await api.post<ApiResponse<{ user: User }>>('/users', userData);
  return response.data.user;
};

export const getUser = async (userId: string): Promise<User> => {
  const response = await api.get<ApiResponse<{ user: User }>>(`/users/${userId}`);
  return response.data.user;
};

export const listUsers = async (limit = 10, offset = 0): Promise<{ users: User[]; pagination: any }> => {
  const response = await api.get<ApiResponse<{ users: User[]; pagination: any }>>(
    `/users?limit=${limit}&offset=${offset}`
  );
  return {
    users: response.data.users,
    pagination: response.data.pagination
  };
};

// Todo Management
export const createTodo = async (userId: string, todoData: CreateTodoData): Promise<Todo> => {
  const response = await api.post<ApiResponse<{ todo: Todo }>>(`/users/${userId}/todos`, todoData);
  return response.data.todo;
};

export const getUserTodos = async (userId: string, status?: string): Promise<Todo[]> => {
  const url = status ? `/users/${userId}/todos?status=${status}` : `/users/${userId}/todos`;
  const response = await api.get<ApiResponse<{ todos: Todo[] }>>(url);
  return response.data.todos;
};

export const getTodo = async (todoId: string): Promise<Todo> => {
  const response = await api.get<ApiResponse<{ todo: Todo }>>(`/todos/${todoId}`);
  return response.data.todo;
};

export const updateTodo = async (todoId: string, updateData: UpdateTodoData): Promise<Todo> => {
  const response = await api.put<ApiResponse<{ todo: Todo }>>(`/todos/${todoId}`, updateData);
  return response.data.todo;
};

export const deleteTodo = async (todoId: string): Promise<Todo> => {
  const response = await api.delete<ApiResponse<{ deletedTodo: Todo }>>(`/todos/${todoId}`);
  return response.data.deletedTodo;
};

// Dashboard
export const getDashboard = async (userId: string): Promise<Dashboard> => {
  const response = await api.get<Dashboard>(`/dashboard/${userId}`);
  return response.data;
};

// Demo
export const runDemo = async (): Promise<any> => {
  const response = await api.get<ApiResponse>('/demo');
  return response.data;
};

// Utility function to handle API errors
export const handleApiError = (error: any): string => {
  if (error.response?.data?.error) {
    return error.response.data.error;
  }
  if (error.response?.data?.message) {
    return error.response.data.message;
  }
  if (error.message) {
    return error.message;
  }
  return 'An unexpected error occurred';
};

export default api;
