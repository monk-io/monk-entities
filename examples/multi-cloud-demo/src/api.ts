import express, { Request, Response } from 'express';
import { createTask, getTask, listTasks, checkConnection as checkDb } from './db';
import { Queue } from './queue';
import { Storage } from './storage';
import { CreateTaskRequest } from './types';

export function createApp(queue: Queue, storage: Storage): express.Application {
  const app = express();
  app.use(express.json());

  app.get('/health', async (_req: Request, res: Response) => {
    const [db, q, s] = await Promise.all([
      checkDb(),
      queue.checkConnection(),
      storage.checkConnection(),
    ]);
    const ok = db && q && s;
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', db, queue: q, storage: s });
  });

  app.post('/tasks', async (req: Request, res: Response) => {
    const { title, payload } = req.body as CreateTaskRequest;
    if (!title || !payload) {
      res.status(400).json({ error: 'title and payload are required' });
      return;
    }
    try {
      const task = await createTask(title, payload);
      // For db queue type, the task is already in DB as 'pending'; no queue send needed
      try {
        await queue.send({ taskId: task.id, title: task.title, payload: task.payload });
      } catch (err) {
        console.warn('Queue send failed (db-queue mode skips this):', (err as Error).message);
      }
      res.status(201).json(task);
    } catch (err) {
      console.error('Create task error:', err);
      res.status(500).json({ error: 'internal server error' });
    }
  });

  app.get('/tasks', async (_req: Request, res: Response) => {
    try {
      const tasks = await listTasks();
      res.json(tasks);
    } catch (err) {
      console.error('List tasks error:', err);
      res.status(500).json({ error: 'internal server error' });
    }
  });

  app.get('/tasks/:id', async (req: Request, res: Response) => {
    try {
      const task = await getTask(req.params.id);
      if (!task) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      res.json(task);
    } catch (err) {
      console.error('Get task error:', err);
      res.status(500).json({ error: 'internal server error' });
    }
  });

  return app;
}
