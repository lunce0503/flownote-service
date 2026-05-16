export type MobileConfig = {
  core_api_url: string;
  ai_api_url: string;
  web_url: string;
  minimum_supported_version: string;
  enabled_features: string[];
};

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  nickname: string;
};

export type TaskStatus = 'TODO' | 'DOING' | 'DONE';

export type Task = {
  id: string;
  task_name: string;
  category: string | null;
  difficulty_level: number | null;
  status: TaskStatus | null;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  due_date: string | null;
  memo: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
};
