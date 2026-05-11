export type TaskStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface Task {
  id: string;
  title: string;
  payload: string;
  status: TaskStatus;
  result?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTaskRequest {
  title: string;
  payload: string;
}

export interface TaskMessage {
  taskId: string;
  title: string;
  payload: string;
}
