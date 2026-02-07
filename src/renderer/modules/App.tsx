import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type {
  AskResult,
  ClientInfo,
  ConversationMeta,
  ConversationPayload,
  DiagnosticsInfo,
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

type ToastTone = 'info' | 'success' | 'warning' | 'error';

type Toast = {
  id: string;
  title: string;
  message?: string;
  tone?: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
  timeoutMs?: number;
};

type RetryPayload = {
  question: string;
  conversationId: string;
};

const formatTime = (iso: string) => {
  const date = new Date(iso);
  return date.toLocaleString('pl-PL');
};

const formatDiagnosticsText = (info: DiagnosticsInfo) => {
  const lines = [
    info.appName,
    `Version: ${info.appVersion}`,
    `Build: ${info.build}`,
    `Author: ${info.author}`,
    `OS: ${info.platform} ${info.arch}`,
    `Electron: ${info.electronVersion}  Chrome: ${info.chromeVersion}  Node: ${info.nodeVersion}`,
    `Storage: ${info.storage.type}`,
    `Storage path: ${info.storage.path}`,
    `Storage exists: ${info.storage.exists ? 'yes' : 'no'}`,
    `Storage format: ${info.storage.format ?? 'unknown'}`,
    `Storage examples: ${(info.storage.exampleFiles ?? []).join(', ')}`,
    `Conversations: ${info.conversationsCount ?? 'unknown'}`
  ];

  if (info.webhookUrl) {
    lines.push(`Webhook URL: ${info.webhookUrl}`);
  }

  return lines.join('\n');
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
  const [diagnosticsInfo, setDiagnosticsInfo] = useState<DiagnosticsInfo | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [conversationIndex, setConversationIndex] = useState<ConversationMeta[]>([]);
  const [conversationSearchTerm, setConversationSearchTerm] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConversationMeta | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const toastTimersRef = useRef<Map<string, number>>(new Map());
  const deleteTimersRef = useRef<Map<string, number>>(new Map());

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

  const loadDiagnosticsInfo = useCallback(async () => {
    const info = await window.companyAssistant.diagnostics.getInfo();
    setDiagnosticsInfo(info);
  }, []);

  useEffect(() => {
    if (!showSettings) {
      return;
    }
    void loadDiagnosticsInfo();
  }, [loadDiagnosticsInfo, showSettings]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    window.open = () => null;
  }, []);

  useEffect(() => {
    if (!openMenuId) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-conversation-menu]')) {
        return;
      }
      setOpenMenuId(null);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openMenuId]);

  useEffect(() => {
    return () => {
      toastTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      deleteTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
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
    return next;
  }, []);

  const handleNewConversation = async () => {
    const conversation = await window.companyAssistant.conversation.new();
    setMessages(conversation.messages);
    setConversationId(conversation.conversationId);
    setConversationSearchTerm('');
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

  const handleExportConversation = async (targetId: string) => {
    await window.companyAssistant.conversation.exportTxt(targetId);
  };

  const handleRequestDelete = (conversation: ConversationMeta) => {
    setOpenMenuId(null);
    setDeleteTarget(conversation);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    const target = deleteTarget;
    setDeleteTarget(null);
    const { deleted } = await window.companyAssistant.conversation.softDelete(target.id);
    if (!deleted) {
      pushToast({
        id: crypto.randomUUID(),
        title: 'Nie udało się usunąć rozmowy',
        message: 'Spróbuj ponownie.',
        tone: 'error'
      });
      return;
    }

    const nextIndex = await refreshConversationIndex();
    if (conversationId === target.id) {
      if (nextIndex.length > 0) {
        await handleSelectConversation(nextIndex[0].id);
      } else {
        await handleNewConversation();
      }
    }

    scheduleHardDelete(target.id);
    const toastId = crypto.randomUUID();
    pushToast({
      id: toastId,
      title: 'Usunięto rozmowę',
      message: 'Masz 10 sekund na cofnięcie.',
      tone: 'warning',
      actionLabel: 'Cofnij',
      timeoutMs: 10000,
      onAction: async () => {
        dismissToast(toastId);
        cancelHardDelete(target.id);
        const restored = await window.companyAssistant.conversation.restore(target.id);
        if (restored.restored) {
          await refreshConversationIndex();
        } else {
          pushToast({
            id: crypto.randomUUID(),
            title: 'Nie udało się przywrócić rozmowy',
            message: 'Spróbuj ponownie.',
            tone: 'error'
          });
        }
      }
    });
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

  const dismissToast = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== toastId));
    const timer = toastTimersRef.current.get(toastId);
    if (timer) {
      window.clearTimeout(timer);
      toastTimersRef.current.delete(toastId);
    }
  }, []);

  const pushToast = useCallback(
    (toast: Toast) => {
      setToasts((prev) => [...prev, toast]);
      if (toast.timeoutMs) {
        const timer = window.setTimeout(() => dismissToast(toast.id), toast.timeoutMs);
        toastTimersRef.current.set(toast.id, timer);
      }
    },
    [dismissToast]
  );

  const handleCopyDiagnostics = useCallback(async () => {
    if (!diagnosticsInfo) {
      return;
    }
    try {
      await navigator.clipboard.writeText(formatDiagnosticsText(diagnosticsInfo));
      pushToast({
        id: crypto.randomUUID(),
        title: 'Skopiowano',
        message: 'Informacje diagnostyczne trafiły do schowka.',
        tone: 'success',
        timeoutMs: 2400
      });
    } catch {
      pushToast({
        id: crypto.randomUUID(),
        title: 'Nie udało się skopiować',
        message: 'Sprawdź uprawnienia schowka.',
        tone: 'error',
        timeoutMs: 3000
      });
    }
  }, [diagnosticsInfo, pushToast]);

  const scheduleHardDelete = useCallback((conversationId: string) => {
    const existing = deleteTimersRef.current.get(conversationId);
    if (existing) {
      window.clearTimeout(existing);
    }
    const timer = window.setTimeout(async () => {
      await window.companyAssistant.conversation.delete(conversationId);
      deleteTimersRef.current.delete(conversationId);
    }, 10000);
    deleteTimersRef.current.set(conversationId, timer);
  }, []);

  const cancelHardDelete = useCallback((conversationId: string) => {
    const timer = deleteTimersRef.current.get(conversationId);
    if (timer) {
      window.clearTimeout(timer);
      deleteTimersRef.current.delete(conversationId);
    }
  }, []);

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

  const sendQuestion = useCallback(
    async (payload: RetryPayload, options: { appendUserMessage: boolean }) => {
      if (isLoading || !payload.conversationId) {
        return;
      }

      const trimmed = payload.question.trim();
      if (!trimmed) {
        return;
      }

      if (!isOnline) {
        const toastId = crypto.randomUUID();
        pushToast({
          id: toastId,
          title: 'Brak połączenia',
          message: 'Sprawdź połączenie z siecią i spróbuj ponownie.',
          tone: 'error',
          actionLabel: 'Ponów',
          onAction: () => {
            dismissToast(toastId);
            void sendQuestion(payload, { appendUserMessage: false });
          }
        });
        return;
      }

      if (options.appendUserMessage) {
        const userMessage: Message = {
          id: crypto.randomUUID(),
          role: 'user',
          content: trimmed,
          createdAt: new Date().toISOString()
        };
        setMessages((prev) => [...prev, userMessage]);
        setInput('');
      }

      setIsLoading(true);
      setIsTyping(true);
      const requestId = crypto.randomUUID();
      setPendingRequestId(requestId);

      try {
        const result = (await window.companyAssistant.n8n.ask({
          question: trimmed,
          conversationId: payload.conversationId,
          requestId
        })) as AskResult;

        if (result.error || !result.answer) {
          if (result.errorType !== 'canceled') {
            const toastId = crypto.randomUUID();
            const title =
              result.errorType === 'timeout'
                ? 'Przekroczono limit czasu'
                : result.errorType === 'network'
                  ? 'Brak połączenia'
                  : result.errorType === 'http'
                    ? 'Błąd webhooka'
                    : 'Nie udało się wysłać';
            pushToast({
              id: toastId,
              title,
              message:
                result.error ||
                (result.errorType === 'http' && result.status
                  ? `Webhook zwrócił błąd HTTP ${result.status}.`
                  : 'Brak odpowiedzi z webhooka.'),
              tone: 'error',
              actionLabel: 'Ponów',
              onAction: () => {
                dismissToast(toastId);
                void sendQuestion(payload, { appendUserMessage: false });
              }
            });
          }
          return;
        }

        appendAssistantMessage(result.answer, result.sources);
      } catch {
        const toastId = crypto.randomUUID();
        pushToast({
          id: toastId,
          title: 'Wystąpił błąd',
          message: 'Nie udało się połączyć z webhookiem. Spróbuj ponownie.',
          tone: 'error',
          actionLabel: 'Ponów',
          onAction: () => {
            dismissToast(toastId);
            void sendQuestion(payload, { appendUserMessage: false });
          }
        });
      } finally {
        setIsLoading(false);
        setIsTyping(false);
        setPendingRequestId(null);
      }
    },
    [appendAssistantMessage, dismissToast, isLoading, isOnline, pushToast]
  );

  const handleSend = useCallback(async () => {
    if (!conversationId) {
      return;
    }
    await sendQuestion({ question: input, conversationId }, { appendUserMessage: true });
  }, [conversationId, input, sendQuestion]);

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

  const handlePromptSelect = (prompt: string) => {
    setInput(prompt);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(prompt.length, prompt.length);
    });
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

  const renderSources = (messageId: string, sources?: SourceItem[]) => {
    if (!sources || sources.length === 0) {
      return null;
    }

    const isExpanded = expandedSources.has(messageId);

    return (
      <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-200/80">
        <button
          type="button"
          className="flex w-full items-center justify-between text-[11px] uppercase tracking-[0.2em] text-slate-400"
          onClick={() =>
            setExpandedSources((prev) => {
              const next = new Set(prev);
              if (next.has(messageId)) {
                next.delete(messageId);
              } else {
                next.add(messageId);
              }
              return next;
            })
          }
        >
          <span>Źródła</span>
          <span>{isExpanded ? 'Ukryj' : `Pokaż (${sources.length})`}</span>
        </button>
        {isExpanded && (
          <ul className="mt-2 space-y-2">
            {sources.map((source, index) => {
              const legacySource = source as SourceItem & {
                title?: string;
                url?: string;
                snippet?: string;
              };
              const title = source.source ?? legacySource.title ?? legacySource.url ?? 'Źródło';
              const snippetValue = source.text ?? legacySource.snippet ?? '';
              const snippet = snippetValue.slice(0, 200);
              const trimmedSnippet =
                snippet && snippetValue.length > 200 ? `${snippet}…` : snippet || undefined;
              return (
                <li key={`${title}-${index}`} className="space-y-1">
                  <div className="text-slate-200">{title}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                    {source.chunk !== undefined && source.chunk !== null && (
                      <span>chunk: {source.chunk}</span>
                    )}
                    {source.score !== undefined && source.score !== null && (
                      <span>score: {Number(source.score).toFixed(3)}</span>
                    )}
                    {legacySource.url && <span>{legacySource.url}</span>}
                  </div>
                  {trimmedSnippet && <div className="text-slate-400">{trimmedSnippet}</div>}
                </li>
              );
            })}
          </ul>
        )}
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

  const filteredConversations = useMemo(() => {
    const term = conversationSearchTerm.trim().toLowerCase();
    if (!term) {
      return conversationIndex;
    }
    return conversationIndex.filter((conversation) => {
      const title = conversation.title?.toLowerCase() ?? '';
      const preview = conversation.preview?.toLowerCase() ?? '';
      return title.includes(term) || preview.includes(term);
    });
  }, [conversationIndex, conversationSearchTerm]);

  const getConversationTitle = (conversation: ConversationMeta) =>
    conversation.title?.trim() || 'Nowa rozmowa';

  const getConversationPreview = (conversation: ConversationMeta) => {
    const preview = conversation.preview?.trim();
    return preview || 'Brak wiadomości.';
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
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Rozmowy</div>
            <input
              className="w-full rounded-2xl border border-white/10 bg-base-900 px-3 py-2 text-sm text-slate-100 focus:border-accent-400/60 focus:outline-none"
              placeholder="Szukaj..."
              value={conversationSearchTerm}
              onChange={(event) => setConversationSearchTerm(event.target.value)}
            />
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {conversationIndex.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/10 p-4 text-xs text-slate-400">
                  Brak zapisanych rozmów.
                </div>
              )}
              {conversationIndex.length > 0 && filteredConversations.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/10 p-4 text-xs text-slate-400">
                  Brak rozmów spełniających kryteria wyszukiwania.
                </div>
              )}
              {filteredConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`group relative rounded-2xl border transition ${
                    conversation.id === conversationId
                      ? 'border-accent-500/60 bg-accent-500/10 text-white'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:border-accent-400/50 hover:text-white'
                  }`}
                >
                  <button
                    type="button"
                    className="w-full rounded-2xl px-3 py-2 text-left text-sm"
                    onClick={() => handleSelectConversation(conversation.id)}
                  >
                    <div className="line-clamp-1 text-sm font-medium">
                      {getConversationTitle(conversation)}
                    </div>
                    <div className="mt-1 line-clamp-1 text-xs text-slate-400">
                      {getConversationPreview(conversation)}
                    </div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                      {formatTime(conversation.updatedAt)}
                    </div>
                  </button>
                  <div className="absolute right-2 top-2 flex items-start" data-conversation-menu>
                    <button
                      type="button"
                      className="rounded-lg border border-white/10 bg-base-900/60 px-2 py-1 text-xs text-slate-300 opacity-0 transition hover:text-white group-hover:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenMenuId((prev) => (prev === conversation.id ? null : conversation.id));
                      }}
                      title="Menu rozmowy"
                    >
                      ⋮
                    </button>
                    {openMenuId === conversation.id && (
                      <div className="absolute right-0 top-8 w-40 rounded-2xl border border-white/10 bg-base-900 p-2 text-xs text-slate-200 shadow-soft">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-white/5"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenMenuId(null);
                            void handleExportConversation(conversation.id);
                          }}
                        >
                          Eksportuj
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-rose-300 hover:bg-rose-500/10"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRequestDelete(conversation);
                          }}
                        >
                          Usuń
                        </button>
                      </div>
                    )}
                  </div>
                </div>
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
                Rozmowy
              </div>
              <input
                className="w-full rounded-2xl border border-white/10 bg-base-900 px-3 py-2 text-sm text-slate-100 focus:border-accent-400/60 focus:outline-none"
                placeholder="Szukaj..."
                value={conversationSearchTerm}
                onChange={(event) => setConversationSearchTerm(event.target.value)}
              />
              <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                {conversationIndex.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-white/10 p-3 text-xs text-slate-400">
                    Brak zapisanych rozmów.
                  </div>
                )}
                {conversationIndex.length > 0 && filteredConversations.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-white/10 p-3 text-xs text-slate-400">
                    Brak rozmów spełniających kryteria wyszukiwania.
                  </div>
                )}
                {filteredConversations.map((conversation) => (
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
                    <div className="line-clamp-1 text-sm font-medium">
                      {getConversationTitle(conversation)}
                    </div>
                    <div className="mt-1 line-clamp-1 text-xs text-slate-400">
                      {getConversationPreview(conversation)}
                    </div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                      {formatTime(conversation.updatedAt)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
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
            <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-8 text-sm text-slate-300">
              {messages.length === 0 ? (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="text-lg font-semibold text-white">Witaj w Company Assistant</div>
                    <p className="mt-2 text-sm text-slate-400">
                      Aplikacja jest gotowa, ale zanim zaczniesz, skonfiguruj webhook i wybierz temat
                      rozmowy.
                    </p>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-base-900/40 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">1. Ustawienia</div>
                      <p className="mt-2 text-sm text-slate-300">
                        Podaj adres webhooka n8n oraz opcjonalny token API, aby połączyć się z backendem.
                      </p>
                      <button
                        type="button"
                        className="mt-4 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-accent-400/50 hover:text-white"
                        onClick={() => setShowSettings(true)}
                      >
                        Otwórz ustawienia
                      </button>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-base-900/40 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">2. Pierwsze pytanie</div>
                      <p className="mt-2 text-sm text-slate-300">
                        Wpisz pytanie w polu poniżej lub wybierz jedną z gotowych propozycji.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {[
                          'Podsumuj najważniejsze zadania na dziś.',
                          'Stwórz szkic odpowiedzi dla klienta.',
                          'Jakie są statusy projektów w tym tygodniu?'
                        ].map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 hover:border-accent-400/50 hover:text-white"
                            onClick={() => handlePromptSelect(prompt)}
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-base-900/40 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">3. Wysyłka</div>
                      <p className="mt-2 text-sm text-slate-300">
                        Naciśnij Enter, aby wysłać wiadomość. W odpowiedzi zobaczysz źródła i możliwość
                        kopiowania treści.
                      </p>
                      <button
                        type="button"
                        className="mt-4 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-accent-400/50 hover:text-white"
                        onClick={handleNewConversation}
                      >
                        Utwórz rozmowę
                      </button>
                    </div>
                  </div>
                  {settings.webhookUrl ? (
                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100">
                      Webhook skonfigurowany. Możesz od razu zacząć rozmowę.
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-xs text-amber-100">
                      Brak webhooka. Ustaw URL w ustawieniach, aby aplikacja mogła pobierać odpowiedzi.
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-sm text-slate-400">
                  Brak wyników wyszukiwania dla podanej frazy.
                </div>
              )}
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
                {message.role === 'assistant' && renderSources(message.id, message.sources)}
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
              ref={inputRef}
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

      {toasts.length > 0 && (
        <div className="fixed bottom-24 right-6 z-30 flex w-80 flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`rounded-2xl border px-4 py-3 text-sm shadow-soft ${
                toast.tone === 'error'
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-100'
                  : toast.tone === 'warning'
                    ? 'border-amber-400/40 bg-amber-400/10 text-amber-100'
                    : toast.tone === 'success'
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                      : 'border-white/10 bg-base-800 text-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{toast.title}</div>
                  {toast.message && <div className="mt-1 text-xs text-slate-200/80">{toast.message}</div>}
                </div>
                <button
                  type="button"
                  className="rounded-full border border-white/10 px-2 py-1 text-xs text-slate-200 hover:text-white"
                  onClick={() => dismissToast(toast.id)}
                  title="Zamknij"
                >
                  ✕
                </button>
              </div>
              {toast.actionLabel && toast.onAction && (
                <button
                  type="button"
                  className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-white/30 hover:text-white"
                  onClick={toast.onAction}
                >
                  {toast.actionLabel}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-base-800 p-6 text-slate-100 shadow-soft">
            <h2 className="text-lg font-semibold">Usunąć rozmowę?</h2>
            <p className="mt-2 text-sm text-slate-400">
              Ta operacja usuwa lokalne dane rozmowy. Możesz ją cofnąć przez 10 sekund.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:text-white"
                onClick={() => setDeleteTarget(null)}
              >
                Anuluj
              </button>
              <button
                type="button"
                className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400"
                onClick={() => void handleConfirmDelete()}
              >
                Usuń
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          settingsState={settingsState}
          diagnosticsInfo={diagnosticsInfo}
          onClose={() => setShowSettings(false)}
          onSave={handleSaveSettings}
          onCopyDiagnostics={handleCopyDiagnostics}
        />
      )}
    </div>
  );
};

const SettingsModal = ({
  settings,
  settingsState,
  diagnosticsInfo,
  onClose,
  onSave,
  onCopyDiagnostics
}: {
  settings: Settings;
  settingsState: SettingsState;
  diagnosticsInfo: DiagnosticsInfo | null;
  onClose: () => void;
  onSave: (settings: Settings) => void;
  onCopyDiagnostics: () => void;
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
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold">O aplikacji</h3>
              <p className="text-xs text-slate-400">Podstawowe informacje i diagnostyka.</p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-accent-400/50 hover:text-white disabled:opacity-60"
              onClick={onCopyDiagnostics}
              disabled={!diagnosticsInfo}
            >
              Kopiuj info diagnostyczne
            </button>
          </div>
          {!diagnosticsInfo ? (
            <div className="mt-4 text-xs text-slate-400">Ładowanie danych diagnostycznych...</div>
          ) : (
            <div className="mt-4 space-y-3 text-sm">
              <div className="grid gap-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Nazwa aplikacji</span>
                  <span>{diagnosticsInfo.appName}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Wersja</span>
                  <span>{diagnosticsInfo.appVersion}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Build / Commit</span>
                  <span>{diagnosticsInfo.build}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Autor</span>
                  <span>{diagnosticsInfo.author}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Platforma</span>
                  <span>
                    {diagnosticsInfo.platform} {diagnosticsInfo.arch}
                  </span>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Silniki</span>
                  <span>
                    Electron {diagnosticsInfo.electronVersion} · Chrome {diagnosticsInfo.chromeVersion} · Node{' '}
                    {diagnosticsInfo.nodeVersion}
                  </span>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Storage</span>
                  <span>{diagnosticsInfo.storage.type}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Ścieżka storage</span>
                  <span className="break-all text-right">{diagnosticsInfo.storage.path}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Format</span>
                  <span>{diagnosticsInfo.storage.format ?? 'unknown'}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Przykładowe pliki</span>
                  <span className="break-all text-right">
                    {(diagnosticsInfo.storage.exampleFiles ?? []).join(', ')}
                  </span>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Liczba rozmów</span>
                  <span>{diagnosticsInfo.conversationsCount ?? 'unknown'}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Storage istnieje</span>
                  <span>{diagnosticsInfo.storage.exists ? 'Tak' : 'Nie'}</span>
                </div>
                {diagnosticsInfo.webhookUrl && (
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Webhook URL</span>
                    <span className="break-all text-right">{diagnosticsInfo.webhookUrl}</span>
                  </div>
                )}
              </div>
              <div className="text-xs text-slate-400">Autor: Michał Tracz</div>
            </div>
          )}
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
