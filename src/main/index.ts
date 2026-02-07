import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import Store from 'electron-store';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

type SourceItem = {
  title: string;
  url?: string;
  snippet?: string;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  sources?: SourceItem[];
};

type StoreSchema = {
  webhookUrl: string;
  token: string;
  username: string;
  deviceId: string;
  lastConversationId: string;
};

const store = new Store<StoreSchema>({
  defaults: {
    webhookUrl: '',
    token: '',
    username: '',
    deviceId: '',
    lastConversationId: ''
  }
});

const ensureDeviceId = () => {
  const existing = store.get('deviceId');
  if (!existing) {
    store.set('deviceId', randomUUID());
  }
};

const getConversationsDir = () => path.join(app.getPath('userData'), 'conversations');

const ensureConversationsDir = async () => {
  await fs.mkdir(getConversationsDir(), { recursive: true });
};

const getConversationFilePath = (conversationId: string) =>
  path.join(getConversationsDir(), `${conversationId}.json`);

const readConversation = async (conversationId: string): Promise<Message[]> => {
  await ensureConversationsDir();
  const filePath = getConversationFilePath(conversationId);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as Message[];
  } catch (error) {
    return [];
  }
};

const conversationExists = async (conversationId: string) => {
  try {
    await fs.access(getConversationFilePath(conversationId));
    return true;
  } catch {
    return false;
  }
};

const writeConversation = async (conversationId: string, messages: Message[]) => {
  await ensureConversationsDir();
  const filePath = getConversationFilePath(conversationId);
  await fs.writeFile(filePath, JSON.stringify(messages, null, 2), 'utf-8');
};

const createMessage = (role: Message['role'], content: string, sources?: SourceItem[]): Message => ({
  id: randomUUID(),
  role,
  content,
  createdAt: new Date().toISOString(),
  sources
});

const isValidWebhookUrl = (value: string) => {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const fetchAnswer = async (question: string, conversationId: string) => {
  const webhookUrl = store.get('webhookUrl');
  if (!isValidWebhookUrl(webhookUrl)) {
    return {
      answer: 'Nieprawidłowy URL webhooka. Ustaw poprawny adres w ustawieniach.',
      sources: [] as SourceItem[]
    };
  }

  if (process.env.USE_MOCK === 'true') {
    return {
      answer:
        'To jest przykładowa odpowiedź z trybu mock. Możesz przetestować UI bez n8n.',
      sources: [
        {
          title: 'Dokumentacja firmowa',
          url: 'https://example.com/docs',
          snippet: 'Przykładowy fragment źródła do podglądu w UI.'
        }
      ] as SourceItem[]
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const token = store.get('token');
    const username = store.get('username') || os.userInfo().username;
    const deviceId = store.get('deviceId');

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        question,
        conversation_id: conversationId,
        user: {
          username,
          device_id: deviceId
        },
        client: {
          app_version: app.getVersion(),
          platform: process.platform
        }
      }),
      signal: controller.signal
    });

    const data = (await response.json()) as {
      answer?: string;
      sources?: SourceItem[];
      error?: string | null;
    };

    if (!response.ok) {
      return {
        answer: 'Serwer zwrócił błąd. Spróbuj ponownie później.',
        sources: [] as SourceItem[]
      };
    }

    if (!data.answer || data.error) {
      return {
        answer: data.error || 'Brak odpowiedzi z webhooka. Sprawdź konfigurację.',
        sources: data.sources ?? []
      };
    }

    return {
      answer: data.answer,
      sources: data.sources ?? []
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        answer: 'Przekroczono limit czasu (30s). Spróbuj ponownie.',
        sources: [] as SourceItem[]
      };
    }

    return {
      answer: 'Brak połączenia z siecią lub nie można połączyć z webhookiem.',
      sources: [] as SourceItem[]
    };
  } finally {
    clearTimeout(timeout);
  }
};

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'dist/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(app.getAppPath(), 'dist/renderer/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
};

app.whenReady().then(() => {
  ensureDeviceId();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('settings:get', () => ({
  webhookUrl: store.get('webhookUrl'),
  token: store.get('token'),
  username: store.get('username')
}));

ipcMain.handle('settings:set', (_event, settings: { webhookUrl: string; token: string; username: string }) => {
  if (settings.webhookUrl && !isValidWebhookUrl(settings.webhookUrl)) {
    throw new Error('Webhook URL musi zaczynać się od http:// lub https://');
  }
  store.set('webhookUrl', settings.webhookUrl);
  store.set('token', settings.token);
  store.set('username', settings.username);
});

ipcMain.handle('conversation:loadLast', async () => {
  const lastConversationId = store.get('lastConversationId');
  if (lastConversationId && (await conversationExists(lastConversationId))) {
    const messages = await readConversation(lastConversationId);
    return { conversationId: lastConversationId, messages };
  }

  const conversationId = randomUUID();
  store.set('lastConversationId', conversationId);
  await writeConversation(conversationId, []);
  return { conversationId, messages: [] as Message[] };
});

ipcMain.handle('conversation:new', async () => {
  const conversationId = randomUUID();
  store.set('lastConversationId', conversationId);
  await writeConversation(conversationId, []);
  return { conversationId, messages: [] as Message[] };
});

ipcMain.handle('message:send', async (_event, payload: { conversationId: string; content: string }) => {
  const { conversationId, content } = payload;
  const userMessage = createMessage('user', content);
  const messages = await readConversation(conversationId);
  messages.push(userMessage);
  await writeConversation(conversationId, messages);

  const response = await fetchAnswer(content, conversationId);
  const assistantMessage = createMessage('assistant', response.answer, response.sources);
  messages.push(assistantMessage);
  await writeConversation(conversationId, messages);

  return { userMessage, assistantMessage };
});

ipcMain.handle('conversation:export', async (_event, conversationId: string) => {
  const messages = await readConversation(conversationId);
  const { filePath, canceled } = await dialog.showSaveDialog({
    defaultPath: `conversation-${conversationId}.txt`,
    filters: [{ name: 'Text', extensions: ['txt'] }]
  });

  if (canceled || !filePath) {
    return { saved: false };
  }

  const lines = messages.map((message) => {
    const date = new Date(message.createdAt);
    const formatted = date
      .toISOString()
      .replace('T', ' ')
      .substring(0, 19);
    const role = message.role === 'user' ? 'USER' : 'ASSISTANT';
    const base = `[${formatted}] ${role}: ${message.content}`;
    if (message.role === 'assistant' && message.sources && message.sources.length > 0) {
      const sources = message.sources
        .map((source) => `  - ${source.title}${source.url ? ` (${source.url})` : ''}${source.snippet ? `: ${source.snippet}` : ''}`)
        .join('\n');
      return `${base}\n${sources}`;
    }
    return base;
  });

  const output = [`Conversation ID: ${conversationId}`, '', ...lines].join('\n');
  await fs.writeFile(filePath, output, 'utf-8');
  return { saved: true };
});

ipcMain.handle('open-external', async (_event, url: string) => {
  await shell.openExternal(url);
});

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  deviceId: store.get('deviceId')
}));

ipcMain.handle('app:mock', () => process.env.USE_MOCK === 'true');
