import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Message } from './types';

const getConversationsDir = () => path.join(app.getPath('userData'), 'conversations');

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
          const urlPart = source.url ? ` (${source.url})` : '';
          const snippetPart = source.snippet ? `: ${source.snippet}` : '';
          return `  - ${source.title}${urlPart}${snippetPart}`;
        })
        .join('\n');
      return `${base}\n${sources}`;
    }
    return base;
  });

  return [`Conversation ID: ${conversationId}`, '', ...lines].join('\n');
};
