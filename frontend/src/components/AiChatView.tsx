'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import katex from 'katex';
import TesseractLogo from './TesseractLogo';

export interface AiChatThread {
  id: string;
  titulo: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    mensagens: number;
  };
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  conteudo: string;
  metadata?: any;
  createdAt?: string;
}

export interface AttachedContext {
  type: 'nota' | 'desenho' | 'pasta' | 'file';
  id: string;
  title: string;
  noteCount?: number;
  url?: string;
}

interface AiChatViewProps {
  workspaceId: string;
  notas?: any[];
  pastas?: any[];
  currentUser?: any;
  activeNote?: { id: string; titulo: string; conteudo?: string } | null;
  onOpenNota?: (nota: any) => void;
  onRefreshWorkspace?: () => void;
  onClose?: () => void;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

// Markdown and LaTeX Formatter Component
function FormattedAiContent({ content, onOpenNoteById }: { content: string; onOpenNoteById?: (noteId: string) => void }) {
  const renderFormattedText = (text: string) => {
    // 1. Split code blocks (```lang ... ```)
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      const precedingText = text.substring(lastIndex, match.index);
      if (precedingText) {
        parts.push(renderTextAndMath(precedingText, `text-${lastIndex}`));
      }

      const lang = match[1] || 'plaintext';
      const codeContent = match[2];
      const blockKey = `code-${match.index}`;

      parts.push(
        <div
          key={blockKey}
          className="my-3 rounded border border-[var(--accents-2)] bg-[var(--accents-1)] overflow-hidden font-mono text-xs"
        >
          <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--accents-2)]/40 border-b border-[var(--accents-2)] text-[var(--accents-5)] text-[11px]">
            <span>{lang}</span>
            <button
              onClick={() => navigator.clipboard.writeText(codeContent)}
              className="flex items-center gap-1 hover:text-[var(--foreground)] transition-colors cursor-pointer px-1.5 py-0.5 rounded hover:bg-[var(--accents-2)]"
              title="Copiar código"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copiar
            </button>
          </div>
          <pre className="p-3 overflow-x-auto text-[var(--foreground)] leading-relaxed whitespace-pre font-mono">
            <code>{codeContent}</code>
          </pre>
        </div>
      );

      lastIndex = match.index + match[0].length;
    }

    const remainingText = text.substring(lastIndex);
    if (remainingText) {
      parts.push(renderTextAndMath(remainingText, `text-${lastIndex}`));
    }

    return parts;
  };

  const renderTextAndMath = (plainText: string, keyPrefix: string): React.ReactNode => {
    // Split block math $$...$$
    const blockMathRegex = /\$\$([\s\S]*?)\$\$/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = blockMathRegex.exec(plainText)) !== null) {
      const preceding = plainText.substring(lastIndex, match.index);
      if (preceding) {
        parts.push(renderInlineFormatting(preceding, `${keyPrefix}-pre-${lastIndex}`));
      }

      const mathSource = match[1];
      let html = '';
      try {
        html = katex.renderToString(mathSource, { displayMode: true, throwOnError: false });
      } catch {
        html = mathSource;
      }

      parts.push(
        <div
          key={`${keyPrefix}-math-block-${match.index}`}
          className="my-3 overflow-x-auto py-2 text-center text-[var(--foreground)]"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );

      lastIndex = match.index + match[0].length;
    }

    const remaining = plainText.substring(lastIndex);
    if (remaining) {
      parts.push(renderInlineFormatting(remaining, `${keyPrefix}-post-${lastIndex}`));
    }

    return <div key={keyPrefix}>{parts}</div>;
  };

  const renderInlineFormatting = (chunk: string, key: string): React.ReactNode => {
    // Process markdown headers, bold, italics, inline code, and inline math ($...$)
    const lines = chunk.split('\n');

    return (
      <div key={key} className="space-y-2">
        {lines.map((line, lineIdx) => {
          if (!line.trim()) {
            return <div key={lineIdx} className="h-2" />;
          }

          // Markdown Image standalone line
          const imgMatch = line.trim().match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/uploads\/[^\s)]+|data:image\/[^\s)]+)\)$/);
          if (imgMatch) {
            const altText = imgMatch[1] || 'Imagem';
            const src = imgMatch[2];
            return (
              <div key={lineIdx} className="my-3 max-w-xl rounded-none border border-[var(--accents-2)] bg-[var(--accents-1)] overflow-hidden shadow-lg">
                <img
                  src={src}
                  alt={altText}
                  className="w-full max-h-96 object-contain rounded-none bg-black/40"
                  loading="lazy"
                />
                {altText && altText !== 'Imagem' && (
                  <div className="px-3 py-1.5 bg-[var(--accents-2)]/40 border-t border-[var(--accents-2)] text-[11px] font-mono text-[var(--accents-5)]">
                    {altText}
                  </div>
                )}
              </div>
            );
          }

          // Headers
          if (line.startsWith('### ')) {
            return (
              <h3 key={lineIdx} className="text-sm font-semibold text-[var(--foreground)] mt-3 mb-1">
                {parseInlineSpans(line.replace('### ', ''))}
              </h3>
            );
          }
          if (line.startsWith('## ')) {
            return (
              <h2 key={lineIdx} className="text-base font-bold text-[var(--foreground)] mt-4 mb-1.5 border-b border-[var(--accents-2)] pb-1">
                {parseInlineSpans(line.replace('## ', ''))}
              </h2>
            );
          }
          if (line.startsWith('# ')) {
            return (
              <h1 key={lineIdx} className="text-lg font-bold text-[var(--foreground)] mt-4 mb-2">
                {parseInlineSpans(line.replace('# ', ''))}
              </h1>
            );
          }

          // Bullet lists
          if (line.startsWith('- ') || line.startsWith('* ')) {
            return (
              <div key={lineIdx} className="flex items-start gap-2 pl-2 text-sm text-[var(--foreground)] leading-relaxed">
                <span className="text-[var(--accents-4)] mt-1">•</span>
                <span className="flex-1">{parseInlineSpans(line.substring(2))}</span>
              </div>
            );
          }

          // Numbered lists
          const numMatch = line.match(/^(\d+)\.\s+(.*)$/);
          if (numMatch) {
            return (
              <div key={lineIdx} className="flex items-start gap-2 pl-2 text-sm text-[var(--foreground)] leading-relaxed">
                <span className="text-[var(--accents-5)] font-mono text-xs min-w-[18px]">{numMatch[1]}.</span>
                <span className="flex-1">{parseInlineSpans(numMatch[2])}</span>
              </div>
            );
          }

          // Blockquote
          if (line.startsWith('> ')) {
            return (
              <blockquote
                key={lineIdx}
                className="border-l-2 border-[var(--accents-4)] pl-3 py-0.5 text-sm text-[var(--accents-6)] italic"
              >
                {parseInlineSpans(line.replace('> ', ''))}
              </blockquote>
            );
          }

          // Regular paragraph
          return (
            <p key={lineIdx} className="text-sm text-[var(--foreground)] leading-relaxed">
              {parseInlineSpans(line)}
            </p>
          );
        })}
      </div>
    );
  };

  const parseInlineSpans = (text: string): React.ReactNode[] => {
    // Regex for inline math $...$, inline code `...`, bold **...**, italic *...*, images ![alt](url), links [text](url)
    const tokens = text.split(/(\$[^\$]+?\$|`[^`]+?`|\*\*[^\*]+?\*\*|\*[^\*]+?\*|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\))/g);

    return tokens.map((token, idx) => {
      if (token.startsWith('$') && token.endsWith('$') && token.length > 2) {
        const mathSource = token.slice(1, -1);
        let html = '';
        try {
          html = katex.renderToString(mathSource, { displayMode: false, throwOnError: false });
        } catch {
          html = mathSource;
        }
        return (
          <span
            key={idx}
            className="inline-math px-0.5"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      }

      if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
        return (
          <code
            key={idx}
            className="font-mono text-xs px-1.5 py-0.5 rounded bg-[var(--accents-2)] text-[var(--foreground)] border border-[var(--accents-3)]"
          >
            {token.slice(1, -1)}
          </code>
        );
      }

      if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
        return (
          <strong key={idx} className="font-semibold text-[var(--foreground)]">
            {token.slice(2, -2)}
          </strong>
        );
      }

      if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
        return (
          <em key={idx} className="italic">
            {token.slice(1, -1)}
          </em>
        );
      }

      // Inline Image ![alt](url)
      const imgMatch = token.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imgMatch) {
        const altText = imgMatch[1] || 'Imagem';
        const src = imgMatch[2];
        return (
          <span key={idx} className="inline-block my-1 max-w-full align-middle">
            <img
              src={src}
              alt={altText}
              className="max-h-60 max-w-full rounded-none border border-[var(--accents-2)] object-contain shadow-sm bg-black/40"
              loading="lazy"
            />
          </span>
        );
      }

      // Inline Link [text](url)
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const linkText = linkMatch[1];
        const href = linkMatch[2];
        return (
          <a
            key={idx}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline underline-offset-2 break-all"
          >
            {linkText}
          </a>
        );
      }

      return <span key={idx}>{token}</span>;
    });
  };

  return <div className="space-y-1">{renderFormattedText(content)}</div>;
}

export default function AiChatView({
  workspaceId,
  notas = [],
  pastas = [],
  currentUser,
  activeNote,
  onOpenNota,
  onRefreshWorkspace,
  onClose,
  onToggleSidebar,
  isSidebarOpen,
}: AiChatViewProps) {
  // Threads state
  const [threads, setThreads] = useState<AiChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isThreadsPanelOpen, setIsThreadsPanelOpen] = useState(true);

  // Messages state
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [toolLogs, setToolLogs] = useState<Array<{ name: string; status: 'running' | 'done'; info?: string }>>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Advanced input features: toolbox & attached contexts
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [includeGlobalContext, setIncludeGlobalContext] = useState(false);
  const [attachedContexts, setAttachedContexts] = useState<AttachedContext[]>([]);

  // Autocomplete popup state for / and #
  const [autocompleteState, setAutocompleteState] = useState<{
    isOpen: boolean;
    trigger: '/' | '#';
    query: string;
    selectedIndex: number;
    cursorPosition: number;
  }>({
    isOpen: false,
    trigger: '/',
    query: '',
    selectedIndex: 0,
    cursorPosition: 0,
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => {
    scrollToBottom(true);
  }, [messages, streamingText, toolLogs, scrollToBottom]);

  // Auto-resize textarea as content changes
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollH = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollH, 26), 180)}px`;
    }
  }, [inputValue]);

  // Click outside listener for plus menu and autocomplete
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setIsPlusMenuOpen(false);
      }
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target as Node)) {
        setAutocompleteState((prev) => ({ ...prev, isOpen: false }));
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load threads on mount
  const loadThreads = useCallback(async () => {
    try {
      const data = await api(`/ai/workspace/${workspaceId}/threads`);
      if (Array.isArray(data)) {
        setThreads(data);
        if (data.length > 0 && !activeThreadId) {
          setActiveThreadId(data[0].id);
        }
      }
    } catch (err: any) {
      console.error('Erro ao carregar threads de IA:', err);
    }
  }, [workspaceId, activeThreadId]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  // Load messages when active thread changes
  const loadThreadMessages = useCallback(async (threadId: string) => {
    try {
      setErrorMessage(null);
      const data = await api(`/ai/threads/${threadId}`);
      if (data && Array.isArray(data.mensagens)) {
        setMessages(data.mensagens);
      }
    } catch (err: any) {
      console.error('Erro ao carregar mensagens da thread:', err);
    }
  }, []);

  useEffect(() => {
    if (activeThreadId) {
      loadThreadMessages(activeThreadId);
    } else {
      setMessages([]);
    }
  }, [activeThreadId, loadThreadMessages]);

  // Create new thread
  const handleCreateNewThread = async () => {
    try {
      const newThread = await api(`/ai/workspace/${workspaceId}/threads`, {
        method: 'POST',
        body: JSON.stringify({ titulo: 'Nova conversa' }),
      });
      if (newThread && newThread.id) {
        setThreads((prev) => [newThread, ...prev]);
        setActiveThreadId(newThread.id);
        setMessages([]);
        setErrorMessage(null);
        setTimeout(() => textareaRef.current?.focus(), 100);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao criar nova conversa.');
    }
  };

  // Delete thread
  const handleDeleteThread = async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api(`/ai/threads/${threadId}`, { method: 'DELETE' });
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      if (activeThreadId === threadId) {
        const remaining = threads.filter((t) => t.id !== threadId);
        setActiveThreadId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err: any) {
      console.error('Erro ao excluir thread:', err);
    }
  };

  // Clear current thread messages
  const handleClearCurrentMessages = () => {
    setMessages([]);
    setIsPlusMenuOpen(false);
  };

  // Autocomplete filtered options
  const autocompleteOptions = useMemo(() => {
    if (!autocompleteState.isOpen) return [];

    const q = autocompleteState.query.toLowerCase().trim();

    if (autocompleteState.trigger === '/') {
      // Notes and drawings
      return notas
        .filter((n) => !q || (n.titulo || '').toLowerCase().includes(q))
        .slice(0, 8)
        .map((n) => ({
          type: n.tipo === 'desenho' ? ('desenho' as const) : ('nota' as const),
          id: n.id,
          title: n.titulo || 'Sem Título',
          rawItem: n,
        }));
    } else {
      // Folders (#)
      return pastas
        .filter((p) => !q || (p.nome || '').toLowerCase().includes(q))
        .slice(0, 8)
        .map((p) => {
          const count = notas.filter((n) => n.pastaId === p.id).length;
          return {
            type: 'pasta' as const,
            id: p.id,
            title: p.nome || 'Pasta sem nome',
            noteCount: count,
            rawItem: p,
          };
        });
    }
  }, [autocompleteState.isOpen, autocompleteState.trigger, autocompleteState.query, notas, pastas]);

  // Handle Input Change and trigger detection for / and #
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart;
    setInputValue(val);

    // Look backward from cursor to check if / or # was typed
    const textBeforeCursor = val.slice(0, cursorPos);
    const slashMatch = textBeforeCursor.match(/(?:^|\s)\/([a-zA-Z0-9_\u00C0-\u00FF-]*)$/);
    const hashMatch = textBeforeCursor.match(/(?:^|\s)#([a-zA-Z0-9_\u00C0-\u00FF-]*)$/);

    if (slashMatch) {
      setAutocompleteState({
        isOpen: true,
        trigger: '/',
        query: slashMatch[1],
        selectedIndex: 0,
        cursorPosition: cursorPos,
      });
    } else if (hashMatch) {
      setAutocompleteState({
        isOpen: true,
        trigger: '#',
        query: hashMatch[1],
        selectedIndex: 0,
        cursorPosition: cursorPos,
      });
    } else {
      setAutocompleteState((prev) => ({ ...prev, isOpen: false }));
    }
  };

  // Select autocomplete option
  const handleSelectAutocomplete = (option: {
    type: 'nota' | 'desenho' | 'pasta';
    id: string;
    title: string;
    noteCount?: number;
  }) => {
    // Add to attachedContexts if not already present
    if (!attachedContexts.some((c) => c.id === option.id && c.type === option.type)) {
      setAttachedContexts((prev) => [
        ...prev,
        {
          type: option.type,
          id: option.id,
          title: option.title,
          noteCount: option.noteCount,
        },
      ]);
    }

    // Replace the trigger word in the input text with /Title or #Title
    const cursorPos = autocompleteState.cursorPosition;
    const textBefore = inputValue.slice(0, cursorPos);
    const textAfter = inputValue.slice(cursorPos);

    const regex = autocompleteState.trigger === '/' ? /(?:^|\s)\/([a-zA-Z0-9_\u00C0-\u00FF-]*)$/ : /(?:^|\s)#([a-zA-Z0-9_\u00C0-\u00FF-]*)$/;
    const match = textBefore.match(regex);

    if (match) {
      const replaceStart = textBefore.length - match[1].length - 1;
      const prefix = textBefore.slice(0, replaceStart);
      const insertedTag = `${autocompleteState.trigger}${option.title} `;
      const newText = `${prefix}${insertedTag}${textAfter}`;
      setInputValue(newText);
    }

    setAutocompleteState((prev) => ({ ...prev, isOpen: false }));
    textareaRef.current?.focus();
  };

  // Remove an attached context chip
  const handleRemoveContext = (id: string, type: string) => {
    setAttachedContexts((prev) => prev.filter((c) => !(c.id === id && c.type === type)));
  };

  // Handle File Upload from + button
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api('/upload', {
        method: 'POST',
        body: formData,
      });

      const imageUrl = res?.url || res?.imageUrl || res?.fileUrl || res?.data?.url || res?.secure_url || (res?.filename ? `/uploads/${res.filename}` : null);

      if (imageUrl) {
        setAttachedContexts((prev) => [
          ...prev,
          {
            type: 'file',
            id: `file-${Date.now()}`,
            title: file.name,
            url: imageUrl,
          },
        ]);
      }
    } catch (err) {
      console.error('Erro ao fazer upload de anexo:', err);
    } finally {
      e.target.value = '';
      setIsPlusMenuOpen(false);
    }
  };

  // Build full prompt including contexts
  const buildPromptWithContext = (userQuestion: string) => {
    let contextBlocks = '';

    // 1. Attached Notes & Drawings
    const noteContexts = attachedContexts.filter((c) => c.type === 'nota' || c.type === 'desenho');
    if (noteContexts.length > 0) {
      contextBlocks += '\n\n--- NOTAS E DESENHOS REFERENCIADOS ---\n';
      for (const item of noteContexts) {
        const fullNota = notas.find((n) => n.id === item.id);
        if (fullNota) {
          contextBlocks += `\n[${fullNota.tipo === 'desenho' ? 'Desenho' : 'Nota'}: "${fullNota.titulo || 'Sem Título'}"]:\n${fullNota.conteudo || '(Sem conteúdo textual)'}\n`;
        }
      }
    }

    // 2. Attached Folders
    const folderContexts = attachedContexts.filter((c) => c.type === 'pasta');
    if (folderContexts.length > 0) {
      contextBlocks += '\n\n--- PASTAS REFERENCIADAS ---\n';
      for (const folder of folderContexts) {
        const notesInFolder = notas.filter((n) => n.pastaId === folder.id);
        contextBlocks += `\n[Pasta: "${folder.title}" contendo ${notesInFolder.length} notas]:\n`;
        for (const n of notesInFolder) {
          contextBlocks += `- Nota "${n.titulo}": ${n.conteudo ? n.conteudo.slice(0, 1500) : '(Vazia)'}\n`;
        }
      }
    }

    // 3. Attached Files
    const fileContexts = attachedContexts.filter((c) => c.type === 'file');
    if (fileContexts.length > 0) {
      contextBlocks += '\n\n--- ARQUIVOS ANEXADOS ---\n';
      for (const f of fileContexts) {
        contextBlocks += `- Arquivo: "${f.title}" (${f.url})\n`;
      }
    }

    // 4. Global Workspace Context if toggled
    if (includeGlobalContext) {
      contextBlocks += '\n\n--- CONTEXTO GLOBAL DO WORKSPACE ---\n';
      contextBlocks += `Total de notas no workspace: ${notas.length}\n`;
      for (const n of notas.slice(0, 15)) {
        contextBlocks += `- "${n.titulo}": ${(n.conteudo || '').slice(0, 300)}...\n`;
      }
    }

    return `${userQuestion}${contextBlocks}`;
  };

  // Send message and handle SSE streaming
  const handleSendMessage = async (customPrompt?: string) => {
    const rawMessage = (customPrompt || inputValue).trim();
    if ((!rawMessage && attachedContexts.length === 0) || isLoading) return;

    setErrorMessage(null);
    setInputValue('');
    setAutocompleteState((prev) => ({ ...prev, isOpen: false }));

    const finalPrompt = buildPromptWithContext(rawMessage);

    // Optimistically add user message
    const userMsg: AiChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      conteudo: rawMessage,
      createdAt: new Date().toISOString(),
      metadata: {
        contextsCount: attachedContexts.length,
        contexts: [...attachedContexts],
      },
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setStreamingText('');
    setToolLogs([]);

    // Clear attached contexts after sending
    setAttachedContexts([]);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const baseUrl = '/api';

    try {
      const response = await fetch(`${baseUrl}/ai/workspace/${workspaceId}/chat`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Mode': 'cookie',
        },
        body: JSON.stringify({
          threadId: activeThreadId,
          message: finalPrompt,
          activeNote: activeNote ? { id: activeNote.id, titulo: activeNote.titulo } : null,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Erro de conexão (${response.status})`);
      }

      if (!response.body) {
        throw new Error('Nenhum fluxo de resposta recebido da IA.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let currentStreamingAccumulator = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const lineBlock of lines) {
          if (!lineBlock.trim()) continue;

          let eventType = 'message';
          let eventData = '';

          const blockLines = lineBlock.split('\n');
          for (const bl of blockLines) {
            if (bl.startsWith('event:')) {
              eventType = bl.slice(6).trim();
            } else if (bl.startsWith('data:')) {
              eventData = bl.slice(5).trim();
            }
          }

          if (!eventData) continue;

          try {
            const parsed = JSON.parse(eventData);

            if (eventType === 'init') {
              if (parsed.threadId && parsed.threadId !== activeThreadId) {
                setActiveThreadId(parsed.threadId);
              }
            } else if (eventType === 'delta') {
              const piece = parsed.text ?? parsed.content ?? '';
              if (piece) {
                currentStreamingAccumulator += piece;
                setStreamingText(currentStreamingAccumulator);
              }
            } else if (eventType === 'tool') {
              setToolLogs((prev) => {
                const existing = prev.findIndex((l) => l.name === parsed.name);
                if (existing >= 0) {
                  const copy = [...prev];
                  copy[existing] = {
                    name: parsed.name,
                    info: parsed.info,
                    status: parsed.status || 'running',
                  };
                  return copy;
                }
                return [...prev, { name: parsed.name, info: parsed.info, status: parsed.status || 'running' }];
              });
            } else if (eventType === 'done') {
              const finalContent = parsed.fullText ?? parsed.content ?? parsed.text ?? currentStreamingAccumulator;
              const finalEntities = parsed.createdEntities;
              const assistantMsg: AiChatMessage = {
                id: parsed.messageId || `ai-${Date.now()}`,
                role: 'assistant',
                conteudo: finalContent,
                createdAt: new Date().toISOString(),
                metadata: {
                  createdEntities: finalEntities,
                },
              };

              setMessages((prev) => [...prev, assistantMsg]);
              setStreamingText('');
              setToolLogs([]);

              if (
                finalEntities?.notesCreated?.length > 0 ||
                finalEntities?.drawingsCreated?.length > 0 ||
                finalEntities?.foldersCreated?.length > 0 ||
                finalEntities?.decksCreated?.length > 0
              ) {
                onRefreshWorkspace?.();
              }
              loadThreads();
            } else if (eventType === 'error') {
              setErrorMessage(parsed.error || 'Erro na resposta da IA.');
            }
          } catch (parseErr) {
            console.error('Erro ao processar evento SSE:', parseErr, eventData);
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setErrorMessage(err.message || 'Falha ao se comunicar com o Tesseract AI.');
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      if (streamingText) {
        setMessages((prev) => [
          ...prev,
          {
            id: `stopped-${Date.now()}`,
            role: 'assistant',
            conteudo: streamingText,
          },
        ]);
        setStreamingText('');
      }
    }
  };

  // Quick Prompt Cards for Empty State
  const quickPrompts = [
    {
      title: 'Resumo Geral do Workspace',
      prompt: 'Faça um resumo geral de todos os conceitos e tópicos anotados neste workspace.',
    },
    {
      title: 'Gerar Flashcards de Estudo',
      prompt: 'Crie um baralho com flashcards objetivos para memorização ativa sobre os conteúdos principais.',
    },
    {
      title: 'Criar Plano de Estudos',
      prompt: 'Monte um cronograma e plano de estudos detalhado dividido em dias e tópicos a partir deste workspace.',
    },
    {
      title: 'Explicar Conceitos Complexos',
      prompt: 'Explique de forma simples e intuitiva os conceitos mais difíceis encontrados nas minhas notas.',
    },
  ];

  return (
    <div className="flex h-full w-full bg-[#141414] text-white select-text overflow-hidden font-sansation">
      {/* Hidden File Input for Attachments */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        accept="image/*,.pdf,.txt,.md"
      />

      {/* Main Chat Column */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Header */}
        <div className="h-12 min-h-[48px] px-4 border-b border-white/10 bg-[#181818] flex items-center justify-between shrink-0 z-10 font-sansation">
          <div className="flex items-center gap-2 overflow-hidden">
            {!isSidebarOpen && onToggleSidebar && (
              <button
                type="button"
                onClick={onToggleSidebar}
                className="p-1.5 rounded-none hover:bg-white/5 text-zinc-400 hover:text-white transition-colors cursor-pointer border-none bg-transparent shrink-0 mr-1"
                title="Expandir Barra Lateral"
                aria-label="Expandir Barra Lateral"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M9 3v18" />
                  <path d="m14 9 3 3-3 3" />
                </svg>
              </button>
            )}
            <div className="flex items-center gap-2">
              <TesseractLogo size={20} variant="ai" priority />
              <h2 className="text-sm font-bold text-white tracking-tight">
                Tesseract AI
              </h2>
            </div>
            <div className="w-[1px] h-4 bg-white/10 mx-1.5 hidden sm:block" />
            <span className="text-xs text-zinc-400 truncate hidden sm:inline">
              Assistente de IA do workspace
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Global Context Indicator Badge */}
            {includeGlobalContext && (
              <span className="hidden md:flex items-center gap-1.5 text-[11px] font-mono text-white bg-white/5 border border-white/10 px-2 py-0.5 rounded-none">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Contexto Global
              </span>
            )}

            {/* Toggle Threads / Conversas Panel Button */}
            <button
              type="button"
              onClick={() => setIsThreadsPanelOpen((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-none text-xs font-medium transition-colors cursor-pointer ${
                isThreadsPanelOpen
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
              title="Alternar painel de conversas (Threads)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span className="hidden sm:inline">Conversas</span>
              <span className="text-[10px] font-mono opacity-80">({threads.length})</span>
            </button>

            {/* Close Button if onClose provided */}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-none text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                title="Fechar Tesseract AI"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Message Feed Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 no-scrollbar">
          {/* Welcome Banner when empty */}
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-start max-w-2xl py-6 animate-smooth-pop font-sansation">
              <div className="mb-4">
                <TesseractLogo size={42} variant="ai" priority />
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">Como posso ajudar você hoje?</h1>
              <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                Converse sobre suas notas, analise documentos, resuma ideias ou crie novos flashcards e diagramas diretamente no seu workspace.
              </p>

              {/* Mentions usage hint banner */}
              <div className="mt-4 p-3 rounded-none bg-[#181818] border border-white/10 w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-zinc-300">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-white px-1.5 py-0.5 rounded-none bg-white/10">/</span>
                  <span>Adicione contexto de notas ou desenhos</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-white px-1.5 py-0.5 rounded-none bg-white/10">#</span>
                  <span>Adicione pastas completas com todas as notas</span>
                </div>
              </div>

              {/* Quick Prompts Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full mt-6">
                {quickPrompts.map((qp, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(qp.prompt)}
                    className="p-3 text-left rounded-none bg-[#181818] hover:bg-white/5 border border-white/10 transition-colors cursor-pointer flex flex-col gap-1 group"
                  >
                    <span className="text-xs font-semibold text-zinc-200 group-hover:text-white transition-colors">
                      {qp.title}
                    </span>
                    <span className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                      {qp.prompt}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Render Messages */}
          {messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            const createdEntities = msg.metadata?.createdEntities;
            const displayName = isUser
              ? (currentUser?.username ? `@${currentUser.username}` : (currentUser?.name || 'Você'))
              : 'Tesseract AI';

            return (
              <div
                key={msg.id || idx}
                className="group flex items-start gap-3.5 hover:bg-white/[0.02] -mx-4 px-4 py-1.5 rounded-none transition-colors"
              >
                {/* Avatar */}
                <div className="w-8 h-8 rounded-none overflow-hidden shrink-0 mt-0.5 border border-white/10 flex items-center justify-center select-none bg-zinc-800">
                  {isUser ? (
                    currentUser?.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={currentUser.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-zinc-700 flex items-center justify-center text-white font-bold text-xs">
                        {(currentUser?.name || currentUser?.username || 'U').charAt(0).toUpperCase()}
                      </div>
                    )
                  ) : (
                    <div className="w-full h-full bg-[#181818] flex items-center justify-center">
                      <TesseractLogo size={18} variant="ai" />
                    </div>
                  )}
                </div>

                {/* Message Content Body */}
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-white tracking-tight">{displayName}</span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {msg.createdAt
                        ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : 'Agora'}
                    </span>
                  </div>

                  {/* Body text */}
                  {isUser ? (
                    <div className="space-y-2">
                      {/* Attached image preview cards */}
                      {msg.metadata?.contexts?.filter((c: any) => c.type === 'file' && c.url && (/\.(png|jpe?g|webp|gif|svg)($|\?)/i.test(c.url) || /\.(png|jpe?g|webp|gif|svg)$/i.test(c.title || ''))).map((imgCtx: any, i: number) => (
                        <div key={i} className="my-1.5 max-w-sm rounded-none border border-white/10 bg-[#161616] overflow-hidden">
                          <img
                            src={imgCtx.url}
                            alt={imgCtx.title || 'Imagem anexada'}
                            className="max-h-56 w-auto object-contain rounded-none bg-black/40"
                            loading="lazy"
                          />
                          <div className="px-2.5 py-1 bg-white/5 border-t border-white/10 text-[10px] font-mono text-zinc-400 truncate">
                            {imgCtx.title}
                          </div>
                        </div>
                      ))}
                      {msg.conteudo && (
                        <p className="text-[13px] leading-relaxed text-zinc-200 whitespace-pre-wrap">
                          {msg.conteudo}
                        </p>
                      )}
                    </div>
                  ) : (
                    <FormattedAiContent
                      content={msg.conteudo}
                      onOpenNoteById={(noteId) => onOpenNota?.({ id: noteId })}
                    />
                  )}

                  {/* Created Entities Cards (Notes, Canvas, Folders, Decks created by AI tools) */}
                  {createdEntities && (
                    <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-col gap-1.5">
                      {createdEntities.notesCreated?.map((n: any) => (
                        <div
                          key={n.id}
                          onClick={() => onOpenNota?.({ id: n.id, titulo: n.titulo })}
                          className="flex items-center justify-between p-2 rounded-none bg-[#181818] hover:bg-white/5 border border-white/10 cursor-pointer text-xs transition-colors"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                            <span className="font-medium text-white truncate">Nota criada: {n.titulo}</span>
                          </div>
                          <span className="text-[11px] font-mono text-white font-semibold shrink-0">Abrir ↗</span>
                        </div>
                      ))}

                      {createdEntities.drawingsCreated?.map((d: any) => (
                        <div
                          key={d.id}
                          onClick={() => onOpenNota?.({ id: d.id, titulo: d.titulo, tipo: 'desenho' })}
                          className="flex items-center justify-between p-2 rounded-none bg-[#181818] hover:bg-white/5 border border-white/10 cursor-pointer text-xs transition-colors"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400">
                              <rect x="3" y="3" width="7" height="7" rx="1" />
                              <rect x="14" y="3" width="7" height="7" rx="1" />
                              <rect x="14" y="14" width="7" height="7" rx="1" />
                              <rect x="3" y="14" width="7" height="7" rx="1" />
                            </svg>
                            <span className="font-medium text-white truncate">Canvas criado: {d.titulo}</span>
                          </div>
                          <span className="text-[11px] font-mono text-white font-semibold shrink-0">Abrir Canvas ↗</span>
                        </div>
                      ))}

                      {createdEntities.foldersCreated?.map((f: any) => (
                        <div
                          key={f.id}
                          className="flex items-center justify-between p-2 rounded-none bg-[#181818] border border-white/10 text-xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400">
                              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            </svg>
                            <span className="font-medium text-white truncate">Pasta criada: {f.nome}</span>
                          </div>
                          <span className="text-[10px] font-mono text-zinc-500 shrink-0">Organização</span>
                        </div>
                      ))}

                      {createdEntities.decksCreated?.map((d: any) => (
                        <div
                          key={d.id}
                          className="flex items-center justify-between p-2 rounded-none bg-[#181818] border border-white/10 text-xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400">
                              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                            </svg>
                            <span className="font-medium text-white truncate">Deck criado: {d.nome}</span>
                          </div>
                          <span className="text-[10px] font-mono text-zinc-500 shrink-0">{d.count} cartões</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Live Streaming Message Block */}
          {isLoading && (
            <div className="flex items-start gap-3.5 -mx-4 px-4 py-1.5">
              <div className="w-8 h-8 rounded-none overflow-hidden shrink-0 mt-0.5 bg-[#181818] border border-white/10 flex items-center justify-center">
                <TesseractLogo size={18} variant="ai" />
              </div>
              <div className="flex-1 overflow-hidden space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white">Tesseract AI</span>
                  <span className="text-[10px] text-zinc-500 font-mono">Pensando...</span>
                </div>

                {/* Tool Execution Badges */}
                {toolLogs.map((log, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 text-xs font-mono text-zinc-400 bg-[#181818] px-2.5 py-1 rounded-none border border-white/10 w-fit"
                  >
                    {log.status === 'running' ? (
                      <div className="w-2.5 h-2.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                    <span>{log.info || log.name}</span>
                  </div>
                ))}

                {streamingText ? (
                  <FormattedAiContent
                    content={streamingText}
                    onOpenNoteById={(noteId) => onOpenNota?.({ id: noteId })}
                  />
                ) : (
                  toolLogs.length === 0 && (
                    <div className="flex items-center gap-2 text-xs text-zinc-500 py-1">
                      <div className="w-2.5 h-2.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      <span>Processando contexto e formulando resposta...</span>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-none border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex items-start gap-2.5 font-sansation">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div className="flex-1">
                <p className="font-semibold text-red-400">Erro no Tesseract AI</p>
                <p className="mt-0.5 leading-relaxed text-zinc-300">{errorMessage}</p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Input Box */}
        <div className="px-4 pb-6 pt-0 bg-[#141414] shrink-0 relative">
          {/* Autocomplete Popover for / (notes/drawings) and # (folders) */}
          {autocompleteState.isOpen && autocompleteOptions.length > 0 && (
            <div
              ref={autocompleteRef}
              className="absolute bottom-full left-4 mb-2 w-72 sm:w-96 bg-[#181818] border border-white/10 rounded-none shadow-2xl overflow-hidden z-50 animate-smooth-pop font-sansation"
            >
              <div className="px-3 py-2 bg-[#121212] border-b border-white/10 flex items-center justify-between text-[11px] font-mono text-zinc-400">
                <span className="font-semibold uppercase tracking-wider">
                  {autocompleteState.trigger === '/' ? 'NOTAS E DESENHOS (/)' : 'PASTAS DO WORKSPACE (#)'}
                </span>
                <span>{autocompleteOptions.length} resultados</span>
              </div>
              <div className="max-h-56 overflow-y-auto p-1.5 flex flex-col gap-0.5 no-scrollbar">
                {autocompleteOptions.map((opt, idx) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectAutocomplete(opt)}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-none text-left text-xs transition-colors cursor-pointer ${
                      idx === autocompleteState.selectedIndex
                        ? 'bg-white/10 text-white font-medium'
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {opt.type === 'desenho' ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-300 shrink-0">
                          <path d="M12 19l7-7 3 3-7 7-3-3z" />
                          <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                        </svg>
                      ) : opt.type === 'pasta' ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-300 shrink-0">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                      ) : (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400 shrink-0">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                      )}
                      <span className="truncate">{opt.title}</span>
                    </div>
                    {opt.type === 'pasta' && 'noteCount' in opt && (opt as any).noteCount !== undefined && (
                      <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                        {(opt as any).noteCount} notas
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Plus Button Toolbox Menu */}
          {isPlusMenuOpen && (
            <div
              ref={plusMenuRef}
              className="absolute bottom-full left-4 mb-2 w-64 bg-[#181818] border border-white/10 rounded-none shadow-2xl p-1.5 flex flex-col gap-1 z-50 animate-smooth-pop font-sansation"
            >
              <div className="px-2 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400 border-b border-white/10 mb-0.5">
                Caixa de Ferramentas
              </div>

              {/* 1. Anexar Arquivo ou Imagem */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-none text-xs text-zinc-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer text-left"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
                <span>Anexar Imagem ou Arquivo</span>
              </button>

              {/* 2. Alternar Contexto Global do Workspace */}
              <button
                type="button"
                onClick={() => {
                  setIncludeGlobalContext((prev) => !prev);
                  setIsPlusMenuOpen(false);
                }}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-none text-xs text-zinc-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center gap-2.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  <span>Contexto Global ({notas.length} notas)</span>
                </div>
                <input
                  type="checkbox"
                  checked={includeGlobalContext}
                  readOnly
                  className="accent-white w-3.5 h-3.5 pointer-events-none"
                />
              </button>

              {/* 3. Limpar Mensagens da Conversa Atual */}
              <button
                type="button"
                onClick={handleClearCurrentMessages}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-none text-xs text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer text-left border-t border-white/10 mt-0.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span>Limpar Mensagens da Conversa</span>
              </button>
            </div>
          )}

          {/* Main Input Box Wrapper */}
          <div className="rounded-none bg-[#181818] border border-white/10 flex flex-col transition-all shadow-md focus-within:border-white/30 font-sansation">
            {/* Attached Context Chips Tray */}
            {(attachedContexts.length > 0 || includeGlobalContext) && (
              <div className="flex flex-wrap items-center gap-1.5 px-3.5 pt-2.5 pb-1.5 border-b border-white/10">
                {includeGlobalContext && (
                  <span className="flex items-center gap-1.5 text-[11px] font-mono font-medium text-white bg-white/5 border border-white/10 px-2 py-0.5 rounded-none">
                    <span>🌐 Workspace Completo</span>
                    <button
                      type="button"
                      onClick={() => setIncludeGlobalContext(false)}
                      className="hover:text-white cursor-pointer ml-0.5"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </span>
                )}

                {attachedContexts.map((ctx) => {
                  const isImage = ctx.url && (/\.(png|jpe?g|webp|gif|svg)($|\?)/i.test(ctx.url) || /\.(png|jpe?g|webp|gif|svg)$/i.test(ctx.title || ''));
                  return (
                    <span
                      key={`${ctx.type}-${ctx.id}`}
                      className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-200 bg-[#121212] border border-white/10 px-2 py-0.5 rounded-none"
                    >
                      {ctx.type === 'desenho' ? (
                        <span className="text-zinc-400 font-bold">/</span>
                      ) : ctx.type === 'pasta' ? (
                        <span className="text-zinc-400 font-bold">#</span>
                      ) : ctx.type === 'file' ? (
                        isImage ? (
                          <img src={ctx.url} alt={ctx.title} className="w-3.5 h-3.5 object-cover rounded-xs border border-white/15 shrink-0" />
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 shrink-0">
                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                          </svg>
                        )
                      ) : (
                        <span className="text-zinc-400 font-bold">/</span>
                      )}
                      <span className="truncate max-w-[140px]">{ctx.title}</span>
                      {ctx.noteCount !== undefined && (
                        <span className="text-[10px] text-zinc-500">({ctx.noteCount} notas)</span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveContext(ctx.id, ctx.type)}
                        className="text-zinc-500 hover:text-white cursor-pointer ml-0.5"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Input Form & Buttons */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-3 px-4 py-2.5 min-h-[48px]"
            >
              {/* Plus Button (Toolbox Trigger) */}
              <button
                type="button"
                onClick={() => setIsPlusMenuOpen((prev) => !prev)}
                className={`w-7 h-7 rounded-none flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                  isPlusMenuOpen
                    ? 'bg-white/15 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
                title="Caixa de ferramentas (+)"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (autocompleteState.isOpen && autocompleteOptions.length > 0) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setAutocompleteState((prev) => ({
                        ...prev,
                        selectedIndex: (prev.selectedIndex + 1) % autocompleteOptions.length,
                      }));
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setAutocompleteState((prev) => ({
                        ...prev,
                        selectedIndex: (prev.selectedIndex - 1 + autocompleteOptions.length) % autocompleteOptions.length,
                      }));
                      return;
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSelectAutocomplete(autocompleteOptions[autocompleteState.selectedIndex]);
                      return;
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setAutocompleteState((prev) => ({ ...prev, isOpen: false }));
                      return;
                    }
                  }

                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Perguntar ao Tesseract AI... (Shift+Enter para nova linha)"
                className="flex-1 bg-transparent border-none outline-none text-[14px] leading-[22px] text-white placeholder-zinc-500 resize-none max-h-48 min-h-[26px] py-0.5 font-sansation no-scrollbar"
              />

              {/* Right Side Action Icons */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Send or Stop button */}
                {isLoading ? (
                  <button
                    type="button"
                    onClick={handleStopGeneration}
                    className="px-2.5 py-1 rounded-none bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 border border-red-500/30"
                    title="Parar geração"
                  >
                    <div className="w-2 h-2 bg-red-400 rounded-none" />
                    <span>Parar</span>
                  </button>
                ) : (
                  (inputValue.trim() || attachedContexts.length > 0) && (
                    <button
                      type="submit"
                      className="w-7 h-7 rounded-none bg-white hover:bg-zinc-200 text-black flex items-center justify-center transition-colors cursor-pointer shrink-0"
                      title="Enviar mensagem (Enter)"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </button>
                  )
                )}
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Collapsible Threads Panel (Right Side) */}
      {isThreadsPanelOpen && (
        <div className="w-72 sm:w-80 h-full border-l border-white/10 bg-[#181818] flex flex-col shrink-0 overflow-hidden font-sansation">
          {/* Threads Header */}
          <div className="h-12 min-h-[48px] px-3.5 border-b border-white/10 flex items-center justify-between bg-[#121212]">
            <div className="flex items-center gap-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <h3 className="text-xs font-bold text-white tracking-tight">Tópicos & Conversas</h3>
            </div>
            <button
              type="button"
              onClick={() => setIsThreadsPanelOpen(false)}
              className="w-6 h-6 flex items-center justify-center rounded-none text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer text-xs"
              title="Recolher painel"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* New Conversation Button */}
          <div className="p-3 border-b border-white/10 bg-[#181818]">
            <button
              type="button"
              onClick={handleCreateNewThread}
              className="w-full py-1.5 px-3 rounded-none bg-white hover:bg-zinc-200 text-black text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Nova Conversa</span>
            </button>
          </div>

          {/* Thread List */}
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1 no-scrollbar">
            {threads.length === 0 ? (
              <div className="py-8 px-4 text-center text-xs text-zinc-500">
                Nenhuma conversa salva ainda.
              </div>
            ) : (
              threads.map((thread) => {
                const isActive = activeThreadId === thread.id;
                return (
                  <div
                    key={thread.id}
                    onClick={() => setActiveThreadId(thread.id)}
                    className={`group flex items-center justify-between p-2.5 rounded-none cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-white/10 text-white font-medium'
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <div className="flex flex-col gap-0.5 truncate pr-2">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-[10px] font-mono text-zinc-500">#</span>
                        <span className="text-xs truncate font-medium">{thread.titulo}</span>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-500 pl-3">
                        {thread.updatedAt ? new Date(thread.updatedAt).toLocaleDateString() : 'Hoje'}
                        {thread._count?.mensagens ? ` • ${thread._count.mensagens} msgs` : ''}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteThread(thread.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity cursor-pointer text-xs"
                      title="Excluir conversa"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
