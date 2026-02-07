import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
import type { Message, Settings, SourceItem } from '../types';

const initialSettings: Settings = {
  webhookUrl: '',
  token: '',
  username: ''
};

const formatTime = (iso: string) => {
  const date = new Date(iso);
  return date.toLocaleString('pl-PL');
};

const App = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const markdown = useMemo(
    () =>
      new MarkdownIt({
        html: false,
        linkify: true,
        breaks: true
      }),
    []
  );

  useEffect(() => {
    const load = async () => {
      const [loadedSettings, conversation, mock] = await Promise.all([
        window.api.getSettings(),
        window.api.loadLastConversation(),
        window.api.getMockMode()
      ]);
      setSettings(loadedSettings);
      setMessages(conversation.messages);
      setConversationId(conversation.conversationId);
      setMockMode(mock);
    };
    void load();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleNewConversation = async () => {
    const conversation = await window.api.newConversation();
    setMessages(conversation.messages);
    setConversationId(conversation.conversationId);
  };

  const handleExport = async () => {
    await window.api.exportConversation(conversationId);
  };

  const handleSaveSettings = async (nextSettings: Settings) => {
    try {
      await window.api.saveSettings(nextSettings);
      setSettings(nextSettings);
      setShowSettings(false);
    } catch (error) {
      window.alert((error as Error).message);
    }
  };

  const appendAssistantError = (content: string) => {
    const errorMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content,
      createdAt: new Date().toISOString()
    };
    setMessages((prev) => [...prev, errorMessage]);
  };

  const handleSend = useCallback(async () => {
    if (isLoading || !conversationId) {
      return;
    }

    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }

    const tempId = crypto.randomUUID();
    const tempMessage: Message = {
      id: tempId,
      role: 'user',
      content: input,
      createdAt: new Date().toISOString()
    };

    setMessages((prev) => [...prev, tempMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const result = await window.api.sendMessage({
        conversationId,
        content: input,
        tempId
      });

      setMessages((prev) => {
        const replaced = prev.map((item) => (item.id === tempId ? result.userMessage : item));
        if (!replaced.find((item) => item.id === result.userMessage.id)) {
          replaced.push(result.userMessage);
        }
        replaced.push(result.assistantMessage);
        return replaced;
      });
    } catch (error) {
      appendAssistantError('Wystąpił błąd podczas wysyłania wiadomości.');
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, input, isLoading]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const renderMarkdown = (content: string) => {
    const html = markdown.render(content);
    return DOMPurify.sanitize(html);
  };

  const handleMarkdownClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target instanceof HTMLAnchorElement) {
      event.preventDefault();
      void window.api.openExternal(target.href);
    }
  };

  const handleCopy = async (content: string) => {
    await navigator.clipboard.writeText(content);
  };

  const renderSources = (sources?: SourceItem[]) => {
    if (!sources || sources.length === 0) {
      return null;
    }

    return (
      <div className="sources">
        <div className="sources-title">Źródła</div>
        <ul>
          {sources.map((source, index) => (
            <li key={`${source.title}-${index}`}>
              {source.url ? (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => window.api.openExternal(source.url!)}
                >
                  {source.title}
                </button>
              ) : (
                <span>{source.title}</span>
              )}
              {source.snippet && <div className="snippet">{source.snippet}</div>}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span>Company Assistant</span>
          {mockMode && <span className="badge">TRYB MOCK</span>}
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={handleNewConversation}>
            Nowa rozmowa
          </button>
          <button type="button" onClick={handleExport}>
            Eksportuj rozmowę
          </button>
          <button type="button" onClick={() => setShowSettings(true)}>
            Ustawienia
          </button>
        </div>
      </header>

      <main className="chat">
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <div className="bubble">
              {message.role === 'assistant' ? (
                <div
                  className="markdown"
                  onClick={handleMarkdownClick}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
                />
              ) : (
                <div className="text">{message.content}</div>
              )}
              <div className="meta">
                <span>{formatTime(message.createdAt)}</span>
                {message.role === 'assistant' && (
                  <button type="button" onClick={() => handleCopy(message.content)}>
                    Kopiuj
                  </button>
                )}
              </div>
              {message.role === 'assistant' && renderSources(message.sources)}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="message assistant">
            <div className="bubble typing">Pisze…</div>
          </div>
        )}
        <div ref={endRef} />
      </main>

      <footer className="composer">
        <textarea
          placeholder="Napisz wiadomość..."
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
        />
        <button type="button" onClick={() => void handleSend()} disabled={isLoading}>
          Wyślij
        </button>
      </footer>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={handleSaveSettings}
        />
      )}
    </div>
  );
};

const SettingsModal = ({
  settings,
  onClose,
  onSave
}: {
  settings: Settings;
  onClose: () => void;
  onSave: (settings: Settings) => void;
}) => {
  const [draft, setDraft] = useState(settings);

  const update = (key: keyof Settings) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setDraft((prev) => ({ ...prev, [key]: event.target.value }));
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>Ustawienia</h2>
        <label>
          Webhook URL
          <input type="text" value={draft.webhookUrl} onChange={update('webhookUrl')} />
        </label>
        <label>
          Token (opcjonalny)
          <input type="password" value={draft.token} onChange={update('token')} />
        </label>
        <label>
          Nazwa użytkownika
          <input type="text" value={draft.username} onChange={update('username')} />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Anuluj
          </button>
          <button type="button" onClick={() => onSave(draft)}>
            Zapisz
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
