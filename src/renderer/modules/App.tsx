import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { AskResult, ClientInfo, ConversationPayload, Message, Settings, SourceItem } from '../types';

const initialSettings: Settings = {
  webhookUrl: '',
  apiToken: '',
  username: '',
  theme: 'dark'
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
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const markdown = useMemo(() => {
    const renderer = new marked.Renderer();
    renderer.html = () => '';
    return (content: string) =>
      marked.parse(content, {
        renderer,
        breaks: true,
        mangle: false,
        headerIds: false
      }) as string;
  }, []);

  useEffect(() => {
    const load = async () => {
      const [loadedSettings, conversation, client] = await Promise.all([
        window.companyAssistant.settings.get(),
        window.companyAssistant.conversation.loadLast(),
        window.companyAssistant.client.getInfo()
      ]);
      setSettings(loadedSettings);
      setMessages(conversation.messages);
      setConversationId(conversation.conversationId);
      setClientInfo(client);
    };
    void load();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const handler = (event: MediaQueryListEvent) => {
      if (settings.theme === 'system') {
        root.classList.toggle('light', event.matches);
      }
    };

    if (settings.theme === 'system') {
      root.classList.toggle('light', media.matches);
      media.addEventListener('change', handler);
    } else {
      root.classList.toggle('light', settings.theme === 'light');
    }

    return () => {
      media.removeEventListener('change', handler);
    };
  }, [settings.theme]);

  const handleNewConversation = async () => {
    const conversation = await window.companyAssistant.conversation.new();
    setMessages(conversation.messages);
    setConversationId(conversation.conversationId);
  };

  const handleExport = async () => {
    await window.companyAssistant.conversation.exportTxt(conversationId);
  };

  const handleSaveSettings = async (nextSettings: Settings) => {
    try {
      await window.companyAssistant.settings.save(nextSettings);
      setSettings(nextSettings);
      setShowSettings(false);
    } catch (error) {
      window.alert((error as Error).message);
    }
  };

  const appendAssistantMessage = (content: string, sources?: SourceItem[]) => {
    const errorMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content,
      createdAt: new Date().toISOString(),
      sources
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

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      createdAt: new Date().toISOString()
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setIsTyping(true);

    try {
      const result = (await window.companyAssistant.n8n.ask({
        question: input,
        conversationId
      })) as AskResult;

      if (result.error || !result.answer) {
        appendAssistantMessage(result.error || 'Brak odpowiedzi z webhooka.', result.sources);
        return;
      }

      appendAssistantMessage(result.answer, result.sources);
    } catch {
      appendAssistantMessage('Wystąpił błąd podczas wysyłania wiadomości.');
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  }, [conversationId, input, isLoading]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }
    const payload: ConversationPayload = { conversationId, messages };
    void window.companyAssistant.conversation.save(payload);
  }, [conversationId, messages]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const renderMarkdown = (content: string) => {
    const html = markdown(content);
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p',
        'strong',
        'em',
        'a',
        'code',
        'pre',
        'ul',
        'ol',
        'li',
        'blockquote',
        'br',
        'hr',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6'
      ],
      ALLOWED_ATTR: ['href', 'title', 'target', 'rel']
    });
  };

  const handleMarkdownClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target instanceof HTMLAnchorElement) {
      event.preventDefault();
      void window.companyAssistant.shell.openExternal(target.href);
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
      <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-200/80">
        <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-slate-400">Źródła</div>
        <ul className="space-y-2">
          {sources.map((source, index) => (
            <li key={`${source.title}-${index}`} className="space-y-1">
              {source.url ? (
                <button
                  type="button"
                  className="flex items-center gap-2 text-left text-accent-400 hover:text-accent-500"
                  onClick={() => window.companyAssistant.shell.openExternal(source.url!)}
                >
                  <span>↗</span>
                  <span className="underline decoration-dotted underline-offset-4">
                    {source.title}
                  </span>
                </button>
              ) : (
                <span className="text-slate-200">{source.title}</span>
              )}
              {source.snippet && <div className="text-slate-400">{source.snippet}</div>}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-base-900 text-slate-100">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-base-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-500/20 text-accent-400">
              CA
            </div>
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                Company Assistant
              </div>
              <div className="text-xs text-slate-500">
                {clientInfo ? `${clientInfo.platform} · v${clientInfo.app_version}` : 'Ładowanie...'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-accent-400/50 hover:text-white"
              onClick={handleNewConversation}
              title="Nowa rozmowa"
            >
              Nowa rozmowa
            </button>
            <button
              type="button"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-accent-400/50 hover:text-white"
              onClick={handleExport}
              title="Eksportuj rozmowę"
            >
              Eksportuj
            </button>
            <button
              type="button"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-accent-400/50 hover:text-white"
              onClick={() => setShowSettings(true)}
              title="Ustawienia"
            >
              Ustawienia
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-180px)] max-w-6xl flex-col gap-6 px-6 py-6">
        {messages.length === 0 && (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-8 text-center text-sm text-slate-400">
            Rozpocznij rozmowę z Company Assistant. Twoje wiadomości pojawią się po prawej,
            odpowiedzi po lewej.
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`w-full max-w-2xl rounded-3xl border px-5 py-4 shadow-soft transition ${
                message.role === 'user'
                  ? 'border-accent-500/40 bg-accent-500/10 text-white'
                  : 'border-white/10 bg-base-800 text-slate-100'
              }`}
            >
              {message.role === 'assistant' ? (
                <div
                  className="text-sm leading-relaxed text-slate-100 [&_a]:text-accent-400 [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-4 [&_strong]:text-white [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_pre]:rounded-xl [&_pre]:bg-base-900 [&_pre]:p-3 [&_pre]:text-slate-200"
                  onClick={handleMarkdownClick}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
                />
              ) : (
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
                  {message.content}
                </div>
              )}
              <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-slate-400">
                <span>{formatTime(message.createdAt)}</span>
                {message.role === 'assistant' && (
                  <button
                    type="button"
                    className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold tracking-[0.2em] text-slate-300 hover:border-accent-400/50 hover:text-white"
                    onClick={() => handleCopy(message.content)}
                    title="Kopiuj odpowiedź"
                  >
                    Kopiuj
                  </button>
                )}
              </div>
              {message.role === 'assistant' && renderSources(message.sources)}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-3xl border border-white/10 bg-base-800 px-5 py-4 text-sm text-slate-300">
              <span>Pisze</span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-400 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-400 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-400 [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </main>

      <footer className="sticky bottom-0 border-t border-white/10 bg-base-900/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-end gap-3">
          <div className="flex-1 rounded-2xl border border-white/10 bg-base-800 px-4 py-3">
            <textarea
              className="h-20 w-full resize-none bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
              placeholder="Napisz wiadomość..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
            />
            <div className="mt-2 text-[11px] text-slate-500">Enter: wyślij · Shift+Enter: nowa linia</div>
          </div>
          <button
            type="button"
            className="h-12 rounded-2xl bg-accent-500 px-6 text-sm font-semibold text-slate-900 transition hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void handleSend()}
            disabled={isLoading}
          >
            Wyślij
          </button>
        </div>
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

  const update =
    (key: keyof Settings) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setDraft((prev) => ({ ...prev, [key]: event.target.value }));
    };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-base-800 p-6 text-slate-100 shadow-soft">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Ustawienia</h2>
            <p className="text-sm text-slate-400">Konfiguracja webhooka i profilu użytkownika.</p>
          </div>
          <button
            type="button"
            className="rounded-full border border-white/10 px-2 py-1 text-xs text-slate-400 hover:text-white"
            onClick={onClose}
            title="Zamknij"
          >
            ✕
          </button>
        </div>
        <div className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">Webhook URL</span>
            <input
              className="w-full rounded-xl border border-white/10 bg-base-900 px-4 py-2 text-sm text-slate-100 focus:border-accent-400/60 focus:outline-none"
              type="text"
              value={draft.webhookUrl}
              onChange={update('webhookUrl')}
              placeholder="https://n8n.example.com/webhook"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">API Token (opcjonalny)</span>
            <input
              className="w-full rounded-xl border border-white/10 bg-base-900 px-4 py-2 text-sm text-slate-100 focus:border-accent-400/60 focus:outline-none"
              type="password"
              value={draft.apiToken}
              onChange={update('apiToken')}
              placeholder="••••••••"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">Nazwa użytkownika</span>
            <input
              className="w-full rounded-xl border border-white/10 bg-base-900 px-4 py-2 text-sm text-slate-100 focus:border-accent-400/60 focus:outline-none"
              type="text"
              value={draft.username}
              onChange={update('username')}
              placeholder="np. Anna"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">Motyw</span>
            <select
              className="w-full rounded-xl border border-white/10 bg-base-900 px-4 py-2 text-sm text-slate-100 focus:border-accent-400/60 focus:outline-none"
              value={draft.theme}
              onChange={update('theme')}
            >
              <option value="dark">Ciemny</option>
              <option value="light">Jasny</option>
              <option value="system">System</option>
            </select>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:text-white"
            onClick={onClose}
          >
            Anuluj
          </button>
          <button
            type="button"
            className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-accent-400"
            onClick={() => onSave(draft)}
          >
            Zapisz
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
