import { createContext, use, useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { fetchTasks, type Task } from '@/lib/db';
import { AppError, toAppError } from '@/lib/errors';
import type { UnscheduledReason } from '@/lib/scheduler/plan-schedule';
import {
  completeTask,
  editTask,
  removeTask,
  reopenTask,
  rescheduleTask,
  type OperationEnv,
  type OperationResult,
  type TaskEdit,
} from '@/features/tasks/task-operations';
import { useAuth } from '@/providers/auth-provider';
import { useSettings } from '@/providers/settings-provider';

type TasksContextValue = {
  tasks: Task[];
  isLoading: boolean;
  error: AppError | null;
  refresh: () => Promise<void>;
  /** Merge freshly created tasks (capture result) into the list. */
  addTasks: (tasks: Task[]) => void;
  /** Drop tasks from the list (after undo). */
  forgetTasks: (ids: string[]) => void;
  complete: (task: Task) => Promise<AppError | null>;
  reopen: (task: Task) => Promise<AppError | null>;
  remove: (task: Task) => Promise<void>;
  edit: (task: Task, edit: TaskEdit) => Promise<OperationResult>;
  reschedule: (task: Task) => Promise<UnscheduledReason | null>;
};

const TasksContext = createContext<TasksContextValue | null>(null);

export function TasksProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const { settings, calendarReady, setAppCalendarId } = useSettings();
  const userId = session?.user.id ?? null;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const fresh = await fetchTasks();
      setTasks(fresh);
      setError(null);
    } catch (e) {
      setError(toAppError(e));
    } finally {
      setLoadedFor(userId);
    }
  }, [userId]);

  // Load once per user when the app is ready, and again whenever it comes to the foreground.
  useEffect(() => {
    if (!userId || !calendarReady) return;
    let cancelled = false;
    const load = () =>
      fetchTasks().then(
        (fresh) => {
          if (cancelled) return;
          setTasks(fresh);
          setError(null);
          setLoadedFor(userId);
        },
        (e) => {
          if (cancelled) return;
          setError(toAppError(e));
          setLoadedFor(userId);
        }
      );
    void load();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [userId, calendarReady]);

  const upsertLocal = useCallback((changed: Task[]) => {
    setTasks((previous) => {
      const byId = new Map(previous.map((t) => [t.id, t]));
      for (const task of changed) byId.set(task.id, task);
      return [...byId.values()];
    });
  }, []);

  const forgetTasks = useCallback((ids: string[]) => {
    const drop = new Set(ids);
    setTasks((previous) => previous.filter((t) => !drop.has(t.id)));
  }, []);

  const operationEnv = useCallback((): OperationEnv => {
    if (!settings) throw new AppError('calendar_disconnected', 'Connect Google Calendar first.');
    return { settings, onAppCalendarChanged: setAppCalendarId };
  }, [settings, setAppCalendarId]);

  const value: TasksContextValue = {
    tasks: userId && loadedFor === userId ? tasks : [],
    isLoading: !!userId && loadedFor !== userId,
    error,
    refresh,
    addTasks: upsertLocal,
    forgetTasks,
    complete: async (task) => {
      const result = await completeTask(task, operationEnv());
      upsertLocal([result.task]);
      return result.warning;
    },
    reopen: async (task) => {
      const result = await reopenTask(task, operationEnv());
      upsertLocal([result.task]);
      return result.warning;
    },
    remove: async (task) => {
      await removeTask(task, operationEnv());
      forgetTasks([task.id]);
    },
    edit: async (task, changes) => {
      const result = await editTask(task, changes, operationEnv());
      upsertLocal([result.task]);
      return result;
    },
    reschedule: async (task) => {
      const result = await rescheduleTask(task, operationEnv());
      upsertLocal([result.task]);
      return result.reason;
    },
  };

  return <TasksContext value={value}>{children}</TasksContext>;
}

export function useTasks(): TasksContextValue {
  const value = use(TasksContext);
  if (!value) throw new Error('useTasks must be used inside <TasksProvider>');
  return value;
}
