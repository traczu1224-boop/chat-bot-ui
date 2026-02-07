import { app } from 'electron';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Message } from './types.js';

export const getConversationsDir = () => path.join(app.getPath('userData'), 'conversations');

const ensureConversationsDir = async () => {
  await fs.mkdir(getConversationsDir(), { recursive: true });
};

const getConversationFilePath = (conversationId: string) =>
  path.join(getConversationsDir(), `${conversationId}.json`);

export const conversationExists = async (conversationId: string) => {
  try {
    await fs.access(getConversationFilePath(conversationId));
    return true;
  } catch {
    return false;
  }
};

export const readConversation = async (conversationId: string): Promise<Message[]> => {
  await ensureConversationsDir();
  const filePath = getConversationFilePath(conversationId);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as Message[];
  } catch {
    return [];
  }
};

export const writeConversation = async (conversationId: string, messages: Message[]) => {
  await ensureConversationsDir();
  const filePath = getConversationFilePath(conversationId);
  await fs.writeFile(filePath, JSON.stringify(messages, null, 2), 'utf-8');
};

export const formatConversationTxt = (conversationId: string, messages: Message[]) => {
  const lines = messages.map((message) => {
    const date = new Date(message.createdAt);
    const formatted = date.toISOString().replace('T', ' ').substring(0, 19);
    const role = message.role === 'user' ? 'USER' : 'ASSISTANT';
    const base = `[${formatted}] ${role}: ${message.content}`;
    if (message.role === 'assistant' && message.sources && message.sources.length > 0) {
      const sources = message.sources
        .map((source) => {
          const chunkPart = source.chunk !== undefined && source.chunk !== null ? `, chunk: ${source.chunk}` : '';
          const scorePart =
            source.score !== undefined && source.score !== null ? `, score: ${source.score}` : '';
          const metaPart = chunkPart || scorePart ? ` (${[chunkPart, scorePart].filter(Boolean).join('').slice(2)})` : '';
          const textPart = source.text ? `: ${source.text}` : '';
          return `  - ${source.source}${metaPart}${textPart}`;
        })
        .join('\n');
      return `${base}\n${sources}`;
    }
    return base;
  });

  return [`Conversation ID: ${conversationId}`, '', ...lines].join('\n');
};

export const getConversationsStats = async () => {
  const dir = getConversationsDir();
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile());
    const stats = await Promise.all(
      files.map(async (entry) => {
        const filePath = path.join(dir, entry.name);
        const fileStat = await fs.stat(filePath);
        return fileStat.size;
      })
    );
    const totalSize = stats.reduce((acc, size) => acc + size, 0);
    return { directory: dir, files: files.length, totalSize };
  } catch {
    return { directory: dir, files: 0, totalSize: 0 };
  }
};
