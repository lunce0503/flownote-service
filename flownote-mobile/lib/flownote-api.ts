const defaultApiBaseUrl = 'http://localhost:8080';

const apiBaseUrl = () =>
  (process.env.EXPO_PUBLIC_WAS_URL || defaultApiBaseUrl).replace(/\/$/, '');

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  token?: string | null;
  body?: unknown;
  baseUrl?: string;
};

export type FlownoteUser = {
  id: string;
  username: string;
  email: string;
  nickname: string;
};

export type LoginResponse = {
  token: string;
  user: FlownoteUser;
};

export type MobileConfig = {
  coreApiUrl: string;
  aiApiUrl: string;
  webUrl: string;
  minimumSupportedVersion: string;
  enabledFeatures: string[];
};

type MobileConfigResponse = MobileConfig & {
  core_api_url?: string;
  ai_api_url?: string;
  web_url?: string;
  minimum_supported_version?: string;
  enabled_features?: string[];
};

export type Task = {
  id: string;
  taskName: string;
  category: string | null;
  difficultyLevel: number | null;
  status: string | null;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  dueDate: string | null;
  memo: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

type TaskResponse = Task & {
  task_name?: string;
  difficulty_level?: number | null;
  estimated_minutes?: number | null;
  actual_minutes?: number | null;
  due_date?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type Note = {
  id: string;
  title: string;
  content: unknown;
  createdAt: string;
  updatedAt: string;
};

type NoteResponse = Note & {
  created_at?: string;
  updated_at?: string;
};

export type CreateTaskInput = {
  taskName: string;
  category?: string;
  difficultyLevel?: number;
  status?: string;
  estimatedMinutes?: number;
  dueDate?: string;
  memo?: string;
  tags?: string[];
};

export type CreateNoteInput = {
  id?: string;
  title: string;
  content: unknown;
  createdAt?: string;
};

export type ChatMessage = {
  id: string;
  sender: 'user' | 'ai' | string;
  message: string;
  timestamp: string;
};

type ChatMessageResponse = ChatMessage & {
  created_at?: string;
};

export type CanvasTextBox = {
  id: string;
  x: number;
  y: number;
  text: string;
  width?: number;
  height?: number;
};

export type CanvasPoint = {
  x: number;
  y: number;
};

export type CanvasLine = {
  id: string;
  points: CanvasPoint[];
  color?: string;
  strokeWidth?: number;
};

export type CanvasData = {
  lines: CanvasLine[];
  images: unknown[];
  textBoxes: CanvasTextBox[];
};

type CanvasResponse = CanvasData & {
  text_boxes?: CanvasTextBox[];
};

class FlownoteApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  let body: string | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${(options.baseUrl ?? apiBaseUrl()).replace(/\/$/, '')}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
  });
  const text = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  const data = text && contentType.includes('application/json') ? JSON.parse(text) : text || null;

  if (!response.ok) {
    const message =
      typeof data?.message === 'string'
        ? data.message
        : typeof data?.error === 'string'
          ? data.error
          : `요청에 실패했습니다. (${response.status})`;
    throw new FlownoteApiError(response.status, message);
  }

  return data as T;
};

const makeUuid = () => {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (randomUUID) {
    return randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

const normalizeTask = (task: TaskResponse): Task => ({
  id: task.id,
  taskName: task.taskName ?? task.task_name ?? '',
  category: task.category ?? null,
  difficultyLevel: task.difficultyLevel ?? task.difficulty_level ?? null,
  status: task.status ?? null,
  estimatedMinutes: task.estimatedMinutes ?? task.estimated_minutes ?? null,
  actualMinutes: task.actualMinutes ?? task.actual_minutes ?? null,
  dueDate: task.dueDate ?? task.due_date ?? null,
  memo: task.memo ?? null,
  tags: task.tags ?? [],
  createdAt: task.createdAt ?? task.created_at ?? '',
  updatedAt: task.updatedAt ?? task.updated_at ?? '',
});

const normalizeNote = (note: NoteResponse): Note => ({
  id: note.id,
  title: note.title ?? '',
  content: note.content,
  createdAt: note.createdAt ?? note.created_at ?? '',
  updatedAt: note.updatedAt ?? note.updated_at ?? '',
});

type TaskMutationResponse = {
  message: string;
  updatedTask?: TaskResponse;
  updated_task?: TaskResponse;
  deletedTask?: TaskResponse;
  deleted_task?: TaskResponse;
};

const toTaskUpdateRequest = (body: Partial<Task>) => ({
  ...(body.taskName !== undefined ? { task_name: body.taskName } : {}),
  ...(body.category !== undefined ? { category: body.category } : {}),
  ...(body.difficultyLevel !== undefined ? { difficulty_level: body.difficultyLevel } : {}),
  ...(body.status !== undefined ? { status: body.status } : {}),
  ...(body.estimatedMinutes !== undefined ? { estimated_minutes: body.estimatedMinutes } : {}),
  ...(body.actualMinutes !== undefined ? { actual_minutes: body.actualMinutes } : {}),
  ...(body.dueDate !== undefined ? { due_date: body.dueDate } : {}),
  ...(body.memo !== undefined ? { memo: body.memo } : {}),
  ...(body.tags !== undefined ? { tags: body.tags } : {}),
});

const normalizeChatMessage = (message: ChatMessageResponse): ChatMessage => ({
  id: message.id,
  sender: message.sender,
  message: message.message,
  timestamp: message.timestamp ?? message.created_at ?? '',
});

const normalizeCanvas = (canvas: CanvasResponse): CanvasData => ({
  lines: Array.isArray(canvas.lines) ? (canvas.lines as CanvasLine[]) : [],
  images: Array.isArray(canvas.images) ? canvas.images : [],
  textBoxes: Array.isArray(canvas.textBoxes)
    ? canvas.textBoxes
    : Array.isArray(canvas.text_boxes)
      ? canvas.text_boxes
      : [],
});

export const flownoteApi = {
  baseUrl: apiBaseUrl,
  getMobileConfig: async () => {
    const config = await request<MobileConfigResponse>('/api/mobile/config');

    return {
      coreApiUrl: config.coreApiUrl ?? config.core_api_url ?? '',
      aiApiUrl: config.aiApiUrl ?? config.ai_api_url ?? '',
      webUrl: config.webUrl ?? config.web_url ?? '',
      minimumSupportedVersion:
        config.minimumSupportedVersion ?? config.minimum_supported_version ?? '',
      enabledFeatures: config.enabledFeatures ?? config.enabled_features ?? [],
    };
  },
  login: (email: string, password: string) =>
    request<LoginResponse>('/api/users/login', {
      method: 'POST',
      body: { email, password },
    }),
  register: (input: { username: string; email: string; password: string; nickname: string }) =>
    request<FlownoteUser>('/api/users', {
      method: 'POST',
      body: input,
    }),
  listTasks: async (token: string) => {
    const tasks = await request<TaskResponse[]>('/api/tasks', { token });
    return tasks.map(normalizeTask);
  },
  createTask: async (token: string, input: CreateTaskInput) => {
    const task = await request<TaskResponse>('/api/tasks', {
      method: 'POST',
      token,
      body: {
        id: makeUuid(),
        taskName: input.taskName,
        category: input.category || 'Mobile',
        difficultyLevel: input.difficultyLevel ?? 1,
        status: input.status || 'TODO',
        estimatedMinutes: input.estimatedMinutes ?? 30,
        dueDate: input.dueDate || undefined,
        memo: input.memo || '',
        tags: input.tags ?? ['mobile'],
      },
    });
    return normalizeTask(task);
  },
  updateTask: async (token: string, id: string, body: Partial<Task>) => {
    const result = await request<TaskMutationResponse>(`/api/tasks/${id}`, {
      method: 'PATCH',
      token,
      body: toTaskUpdateRequest(body),
    });
    const updatedTask = result.updatedTask ?? result.updated_task;
    return {
      message: result.message,
      updatedTask: updatedTask ? normalizeTask(updatedTask) : undefined,
    };
  },
  deleteTask: (token: string, id: string) =>
    request<TaskMutationResponse>(`/api/tasks/${id}`, {
      method: 'DELETE',
      token,
    }),
  listNotes: async (token: string) => {
    const notes = await request<NoteResponse[]>('/api/notes', { token });
    return notes.map(normalizeNote);
  },
  createNote: async (token: string, input: CreateNoteInput) => {
    const note = await request<NoteResponse>('/api/notes', {
      method: 'POST',
      token,
      body: {
        id: input.id ?? makeUuid(),
        title: input.title,
        content: input.content,
        createdAt: input.createdAt ?? new Date().toISOString(),
      },
    });
    return normalizeNote(note);
  },
  deleteNote: (token: string, id: string) =>
    request<NoteResponse>(`/api/notes/${id}`, {
      method: 'DELETE',
      token,
    }),
  listChatMessages: async (token: string) => {
    const messages = await request<ChatMessageResponse[]>('/api/chat', { token });
    return messages.map(normalizeChatMessage);
  },
  createChatMessage: async (token: string, input: { sender: string; message: string }) => {
    const message = await request<ChatMessageResponse>('/api/chat', {
      method: 'POST',
      token,
      body: {
        id: makeUuid(),
        sender: input.sender,
        message: input.message,
        timestamp: new Date().toISOString(),
      },
    });
    return normalizeChatMessage(message);
  },
  askAgent: async (userText: string) => {
    const config = await flownoteApi.getMobileConfig();
    const response = await request<string>('/api/aiclient/ask_stream', {
      method: 'POST',
      baseUrl: config.aiApiUrl,
      body: { user_text: userText },
    });
    return String(response ?? '').trim();
  },
  loadCanvas: async (token: string) => {
    const canvas = await request<CanvasResponse>('/api/canvas/load', { token });
    return normalizeCanvas(canvas);
  },
  saveCanvasElements: async (
    token: string,
    input: {
      lines: CanvasLine[];
      textBoxes: CanvasTextBox[];
      deletedLineIds?: string[];
      deletedTextBoxIds?: string[];
    }
  ) => {
    const canvas = await request<CanvasResponse>('/api/canvas/save', {
      method: 'POST',
      token,
      body: {
        addedLines: input.lines,
        modifiedLines: [],
        deletedLines: (input.deletedLineIds ?? []).map((id) => ({ id })),
        addedImages: [],
        modifiedImages: [],
        deletedImages: [],
        addedTextBoxes: input.textBoxes,
        modifiedTextBoxes: [],
        deletedTextBoxes: (input.deletedTextBoxIds ?? []).map((id) => ({ id })),
      },
    });
    return normalizeCanvas(canvas);
  },
  saveCanvasTextBoxes: async (token: string, textBoxes: CanvasTextBox[], deletedTextBoxIds: string[] = []) =>
    flownoteApi.saveCanvasElements(token, {
      lines: [],
      textBoxes,
      deletedTextBoxIds,
    }),
};

export { FlownoteApiError };
