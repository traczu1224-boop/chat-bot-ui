import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type {
  AskResult,
  ClientInfo,
  ConversationMeta,
  ConversationPayload,
  Message,
  Settings,
  SettingsState,
  SourceItem
} from '../types';

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
  const [settingsState, setSettingsState] = useState<SettingsState>({
    settings: initialSettings,
    locked: false,
    webhookLocked: false
  });
  const [showSettings, setShowSettings] = useState(false);
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [conversationIndex, setConversationIndex] = useState<ConversationMeta[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
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
      const [loadedSettingsState, conversation, client, index] = await Promise.all([
        window.companyAssistant.settings.get(),
        window.companyAssistant.conversation.loadLast(),
        window.companyAssistant.client.getInfo(),
        window.companyAssistant.conversation.list()
      ]);
      setSettingsState(loadedSettingsState);
      setSettings(loadedSettingsState.settings);
      setMessages(conversation.messages);
      setConversationId(conversation.conversationId);
      setClientInfo(client);
      setConversationIndex(index);
    };
    void load();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    window.open = () => null;
  }, []);

  useEffect(() => {
    const updateStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
    };
  }, []);

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

  const refreshConversationIndex = useCallback(async () => {
    const next = await window.companyAssistant.conversation.list();
    setConversationIndex(next);
  }, []);

  const handleNewConversation = async () => {
    const conversation = await window.companyAssistant.conversation.new();
    setMessages(conversation.messages);
    setConversationId(conversation.conversationId);
    setSearchTerm('');
    await refreshConversationIndex();
  };

  const handleSelectConversation = async (nextId: string) => {
    const conversation = await window.companyAssistant.conversation.load(nextId);
    setMessages(conversation.messages);
    setConversationId(conversation.conversationId);
    setSearchTerm('');
  };

  const handleExport = async () => {
    await window.companyAssistant.conversation.exportTxt(conversationId);
  };

  const handleExportDiagnostics = async () => {
    await window.companyAssistant.diagnostics.export();
  };

  const handleSaveSettings = async (nextSettings: Settings) => {
    try {
      const saved = await window.companyAssistant.settings.save(nextSettings);
      setSettings(saved);
      setSettingsState((prev) => ({ ...prev, settings: saved }));
      setShowSettings(false);
    } catch (error) {
      window.alert((error as Error).message);
    }
  };

  const appendAssistantMessage = (
    content: string,
    sources?: SourceItem[],
    meta?: Pick<Message, 'isError' | 'retryPayload'>
  ) => {
    const errorMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content,
      createdAt: new Date().toISOString(),
      sources,
      isError: meta?.isError,
      retryPayload: meta?.retryPayload
    };
    setMessages((prev) => [...prev, errorMessage]);
  };

  const updateMessage = (id: string, updater: (message: Message) => Message) => {
    setMessages((prev) => prev.map((message) => (message.id === id ? updater(message) : message)));
  };

  const handleSend = useCallback(async () => {
    if (isLoading || !conversationId) {
      return;
    }

    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }
    if (!isOnline) {
      appendAssistantMessage('Brak połączenia z siecią. Sprawdź połączenie i spróbuj ponownie.', [], {
        isError: true,
        retryPayload: { question: trimmed, conversationId }
      });
      return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString()
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setIsTyping(true);
    const requestId = crypto.randomUUID();
    setPendingRequestId(requestId);

    try {
      const result = (await window.companyAssistant.n8n.ask({
        question: trimmed,
        conversationId,
        requestId
      })) as AskResult;

      if (result.error || !result.answer) {
        appendAssistantMessage(result.error || 'Brak odpowiedzi z webhooka.', result.sources, {
          isError: true,
          retryPayload: { question: trimmed, conversationId }
        });
        return;
      }

      appendAssistantMessage(result.answer, result.sources);
    } catch {
      appendAssistantMessage('Wystąpił błąd podczas wysyłania wiadomości.', [], {
        isError: true,
        retryPayload: { question: trimmed, conversationId }
      });
    } finally {
      setIsLoading(false);
      setIsTyping(false);
      setPendingRequestId(null);
    }
  }, [conversationId, input, isLoading, isOnline]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }
    const payload: ConversationPayload = { conversationId, messages };
    void window.companyAssistant.conversation.save(payload);
    void refreshConversationIndex();
  }, [conversationId, messages, refreshConversationIndex]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void handleSend();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handleCancelRequest = async () => {
    if (!pendingRequestId) {
      return;
    }
    await window.companyAssistant.n8n.cancel(pendingRequestId);
    setIsLoading(false);
    setIsTyping(false);
    setPendingRequestId(null);
  };

  const handleRetry = async (message: Message) => {
    if (!message.retryPayload || isLoading) {
      return;
    }
    const { question, conversationId: retryConversationId } = message.retryPayload;
    const requestId = crypto.randomUUID();
    setIsLoading(true);
    setIsTyping(true);
    setPendingRequestId(requestId);
    updateMessage(message.id, (prev) => ({
      ...prev,
      content: 'Ponawianie zapytania...',
      isError: false
    }));

    try {
      const result = await window.companyAssistant.n8n.ask({
        question,
        conversationId: retryConversationId,
        requestId
      });
      if (result.error || !result.answer) {
        updateMessage(message.id, (prev) => ({
          ...prev,
          content: result.error || 'Brak odpowiedzi z webhooka.',
          sources: result.sources,
          isError: true,
          retryPayload: { question, conversationId: retryConversationId },
          createdAt: new Date().toISOString()
        }));
        return;
      }
      updateMessage(message.id, (prev) => ({
        ...prev,
        content: result.answer ?? '',
        sources: result.sources,
        isError: false,
        retryPayload: undefined,
        createdAt: new Date().toISOString()
      }));
    } catch {
      updateMessage(message.id, (prev) => ({
        ...prev,
        content: 'Wystąpił błąd podczas wysyłania wiadomości.',
        isError: true,
        retryPayload: { question, conversationId: retryConversationId },
        createdAt: new Date().toISOString()
      }));
    } finally {
      setIsLoading(false);
      setIsTyping(false);
      setPendingRequestId(null);
    }
  };

  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const highlightHtml = (html: string, term: string) => {
    if (!term) {
      return html;
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const regex = new RegExp(escapeRegExp(term), 'gi');
    const nodes: Text[] = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode as Text);
    }
    nodes.forEach((node) => {
      if (!node.nodeValue) {
        return;
      }
      const matches = node.nodeValue.match(regex);
      if (!matches) {
        return;
      }
      const fragment = doc.createDocumentFragment();
      let lastIndex = 0;
      node.nodeValue.replace(regex, (match, index) => {
        fragment.append(node.nodeValue!.slice(lastIndex, index));
        const mark = doc.createElement('mark');
        mark.textContent = match;
        fragment.append(mark);
        lastIndex = index + match.length;
        return match;
      });
      fragment.append(node.nodeValue.slice(lastIndex));
      node.parentNode?.replaceChild(fragment, node);
    });
    return doc.body.innerHTML;
  };

  const renderHighlightedText = (content: string) => {
    const term = searchTerm.trim();
    if (!term) {
      return content;
    }
    const regex = new RegExp(`(${escapeRegExp(term)})`, 'gi');
    const termLower = term.toLowerCase();
    return content.split(regex).map((part, index) =>
      part.toLowerCase() === termLower ? (
        <mark key={`${part}-${index}`} className="rounded bg-yellow-400/20 px-1 text-yellow-100">
          {part}
        </mark>
      ) : (
        <span key={`${part}-${index}`}>{part}</span>
      )
    );
  };

  const renderMarkdown = (content: string) => {
    const html = markdown(content);
    const sanitized = DOMPurify.sanitize(html, {
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
        'h6',
        'mark'
      ],
      ALLOWED_ATTR: ['href', 'title', 'target', 'rel']
    });
    return highlightHtml(sanitized, searchTerm.trim());
  };

  const handleMarkdownClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest('a');
    if (anchor instanceof HTMLAnchorElement) {
      event.preventDefault();
      void window.companyAssistant.shell.openExternal(anchor.href);
    }
  };

  const handleCopy = async (content: string) => {
    await navigator.clipboard.writeText(content);
  };

  const handleToggleTheme = async () => {
    if (settingsState.locked) {
      window.alert('Motyw jest zablokowany przez administratora.');
      return;
    }
    const nextTheme = settings.theme === 'dark' ? 'light' : 'dark';
    const nextSettings = { ...settings, theme: nextTheme };
    await handleSaveSettings(nextSettings);
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

  const filteredMessages = useMemo(() => {
    if (!searchTerm.trim()) {
      return messages;
    }
    const term = searchTerm.toLowerCase();
    return messages.filter((message) => message.content.toLowerCase().includes(term));
  }, [messages, searchTerm]);

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
              onClick={handleToggleTheme}
              title="Przełącz motyw"
            >
              {settings.theme === 'dark' ? 'Jasny motyw' : 'Ciemny motyw'}
            </button>
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
              onClick={handleExportDiagnostics}
              title="Eksportuj diagnostykę"
            >
              Diagnostyka
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

      {!isOnline && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-6 py-2 text-center text-xs text-red-100">
          Brak połączenia z siecią. Wysyłka wiadomości jest wstrzymana.
        </div>
      )}

      <div className="mx-auto flex max-w-6xl gap-6 px-6 py-6">
        <aside className="hidden w-72 flex-col gap-4 rounded-3xl border border-white/10 bg-base-800/60 p-4 shadow-soft lg:flex">
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-slate-400">
              Rozmowy
            </div>
            <div className="space-y-2">
              {conversationIndex.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/10 p-4 text-xs text-slate-400">
                  Brak zapisanych rozmów.
                </div>
              )}
              {conversationIndex.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  className={`w-full rounded-2xl border px-3 py-2 text-left text-sm transition ${
                    conversation.id === conversationId
                      ? 'border-accent-500/60 bg-accent-500/10 text-white'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:border-accent-400/50 hover:text-white'
                  }`}
                  onClick={() => handleSelectConversation(conversation.id)}
                >
                  <div className="line-clamp-2 text-sm font-medium">{conversation.title}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    {formatTime(conversation.updatedAt)}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-white/10 pt-4">
            <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-slate-400">
              Szukaj w rozmowie
            </div>
            <input
              className="w-full rounded-2xl border border-white/10 bg-base-900 px-3 py-2 text-sm text-slate-100 focus:border-accent-400/60 focus:outline-none"
              placeholder="Wpisz frazę..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </aside>

        <main className="flex min-h-[calc(100vh-220px)] flex-1 flex-col gap-6">
          <div className="flex flex-col gap-3 lg:hidden">
            <div className="rounded-2xl border border-white/10 bg-base-800/60 px-4 py-3">
              <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                Szukaj w rozmowie
              </div>
              <input
                className="w-full rounded-2xl border border-white/10 bg-base-900 px-3 py-2 text-sm text-slate-100 focus:border-accent-400/60 focus:outline-none"
                placeholder="Wpisz frazę..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
          </div>
          {filteredMessages.length === 0 && (
            <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-8 text-center text-sm text-slate-400">
              {messages.length === 0
                ? 'Rozpocznij rozmowę z Company Assistant. Twoje wiadomości pojawią się po prawej, odpowiedzi po lewej.'
                : 'Brak wyników wyszukiwania dla podanej frazy.'}
            </div>
          )}
          {filteredMessages.map((message) => (
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
                    className="text-sm leading-relaxed text-slate-100 [&_a]:text-accent-400 [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-4 [&_strong]:text-white [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_pre]:rounded-xl [&_pre]:bg-base-900 [&_pre]:p-3 [&_pre]:text-slate-200 [&_mark]:rounded [&_mark]:bg-yellow-400/20 [&_mark]:px-1 [&_mark]:text-yellow-100"
                    onClick={handleMarkdownClick}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
                  />
                ) : (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
                    {renderHighlightedText(message.content)}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  <span>{formatTime(message.createdAt)}</span>
                  {message.role === 'assistant' && (
                    <div className="flex items-center gap-2">
                      {message.isError && (
                        <button
                          type="button"
                          className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold tracking-[0.2em] text-slate-300 hover:border-accent-400/50 hover:text-white"
                          onClick={() => handleRetry(message)}
                          title="Ponów zapytanie"
                        >
                          Ponów
                        </button>
                      )}
                      <button
                        type="button"
                        className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold tracking-[0.2em] text-slate-300 hover:border-accent-400/50 hover:text-white"
                        onClick={() => handleCopy(message.content)}
                        title="Kopiuj odpowiedź"
                      >
                        Kopiuj
                      </button>
                    </div>
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
      </div>

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
            <div className="mt-2 text-[11px] text-slate-500">
              Enter: wyślij · Shift+Enter: nowa linia · Ctrl/Cmd+Enter: wyślij
            </div>
          </div>
          {isLoading && (
            <button
              type="button"
              className="h-12 rounded-2xl border border-white/10 bg-white/5 px-6 text-sm font-semibold text-slate-200 transition hover:border-accent-400/50 hover:text-white"
              onClick={() => void handleCancelRequest()}
              title="Stop"
            >
              Stop
            </button>
          )}
          <button
            type="button"
            className="h-12 rounded-2xl bg-accent-500 px-6 text-sm font-semibold text-slate-900 transition hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void handleSend()}
            disabled={isLoading || !isOnline}
          >
            Wyślij
          </button>
        </div>
      </footer>

      {showSettings && (
        <SettingsModal
          settings={settings}
          settingsState={settingsState}
          onClose={() => setShowSettings(false)}
          onSave={handleSaveSettings}
        />
      )}
    </div>
  );
};

const SettingsModal = ({
  settings,
  settingsState,
  onClose,
  onSave
}: {
  settings: Settings;
  settingsState: SettingsState;
  onClose: () => void;
  onSave: (settings: Settings) => void;
}) => {
  const [draft, setDraft] = useState(settings);
  const isLocked = settingsState.locked;
  const isWebhookLocked = settingsState.webhookLocked;

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const update =
    (key: keyof Settings) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setDraft((prev) => ({ ...prev, [key]: event.target.value }));
    };

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

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
        {isLocked && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
            Ustawienia są zablokowane przez administratora.
          </div>
        )}
        <div className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">Webhook URL</span>
            <input
              className="w-full rounded-xl border border-white/10 bg-base-900 px-4 py-2 text-sm text-slate-100 focus:border-accent-400/60 focus:outline-none"
              type="text"
              value={draft.webhookUrl}
              onChange={update('webhookUrl')}
              placeholder="https://n8n.example.com/webhook"
              disabled={isLocked || isWebhookLocked}
            />
            {isWebhookLocked && (
              <div className="mt-2 text-xs text-slate-400">
                Webhook został ustawiony przez ENV i nie podlega edycji.
              </div>
            )}
          </label>
          <label className="block text-sm">
            <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">API Token (opcjonalny)</span>
            <input
              className="w-full rounded-xl border border-white/10 bg-base-900 px-4 py-2 text-sm text-slate-100 focus:border-accent-400/60 focus:outline-none"
              type="password"
              value={draft.apiToken}
              onChange={update('apiToken')}
              placeholder="••••••••"
              disabled={isLocked}
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
              disabled={isLocked}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">Motyw</span>
            <select
              className="w-full rounded-xl border border-white/10 bg-base-900 px-4 py-2 text-sm text-slate-100 focus:border-accent-400/60 focus:outline-none"
              value={draft.theme}
              onChange={update('theme')}
              disabled={isLocked}
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
            className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => onSave(draft)}
            disabled={isLocked}
          >
            Zapisz
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
