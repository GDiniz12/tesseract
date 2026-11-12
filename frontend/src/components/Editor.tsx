'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import DrawingEmbedModal from './DrawingEmbedModal';
import DrawingModal from './DrawingModal';
import MathEquationModal from './MathEquationModal';
import LiveCursors from './LiveCursors';
import katex from 'katex';
import { marked } from 'marked';
import { parseYouTubeVideoId, getYouTubeEmbedUrl } from '@/lib/youtube';
import { extractGraphLinks } from '@/lib/graphLinks';
import { sanitizeHtml } from '@/lib/sanitizeHtml';
import { RailToc, ScrollProgress, type NoteSection, type RailTocItem } from './NoteReadingNavigation';
import {
  getNormalizedBox,
  renderDrawingElement,
  resolveLinearPoints,
} from '@/lib/excalidrawRenderer';

// Configure marked for rich GFM parsing
marked.setOptions({
  gfm: true,
  breaks: true,
});

export function ensureHtmlContent(raw: string): string {
  if (!raw || !raw.trim()) return '<p><br></p>';

  let formatted = raw;

  // Convert markdown images ![alt](url) into proper interactive image elements
  const mdImageRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/uploads\/[^\s)]+|data:image\/[^\s)]+)\)/g;
  if (mdImageRegex.test(formatted)) {
    formatted = formatted.replace(mdImageRegex, (_match, alt, src) => {
      const altText = alt || 'Imagem';
      return `<div class="synap-image-wrapper" contenteditable="false" style="width: 100%; max-width: 100%;"><img src="${src}" alt="${altText}" loading="lazy" /><div class="synap-image-controls"><button type="button" class="synap-img-btn-delete" title="Excluir imagem" style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;background:rgba(0,0,0,0.75);color:#fff;border-radius:6px;border:none;cursor:pointer;backdrop-filter:blur(4px);transition:all 0.15s ease;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button></div><div class="synap-resize-handle" title="Arraste para redimensionar"></div></div>`;
    });
  }

  // If already has common HTML block tags, return formatted
  if (/<\s*(p|h[1-6]|div|table|ul|ol|blockquote|pre)\b/i.test(formatted)) {
    return sanitizeHtml(formatted);
  }
  try {
    const parsed = marked.parse(formatted) as string;
    return sanitizeHtml(parsed);
  } catch (err) {
    return sanitizeHtml(formatted);
  }
}

const codeTokenPattern = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|`(?:\\.|[^`])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:async|await|break|case|catch|class|const|continue|def|else|export|extends|false|for|from|function|if|import|in|interface|let|new|null|return|static|switch|this|throw|true|try|type|var|while|yield)\b|\b\d+(?:\.\d+)?\b|\b[A-Z][A-Za-z0-9_]*\b|\b[A-Za-z_$][\w$]*(?=\s*\())/g;

function escapeCodeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function readCodeBlockSource(pre: HTMLPreElement): string {
  const code = pre.querySelector('code');
  if (!code) return '';
  const lines = Array.from(code.querySelectorAll<HTMLElement>(':scope > .note-code-line'));
  if (lines.length) return lines.map((line) => line.innerText.replace(/\n$/, '')).join('\n');
  return code.innerText.replace(/\r/g, '').replace(/\n$/, '');
}

function highlightCodeBlock(pre: HTMLPreElement): void {
  const code = pre.querySelector('code');
  if (!code) return;
  const source = readCodeBlockSource(pre);
  const lines = source.split('\n');
  pre.dataset.lineCount = String(lines.length);
  code.innerHTML = lines.map((line, lineIndex) => {
    let cursor = 0;
    const tokens: string[] = [];
    codeTokenPattern.lastIndex = 0;
    for (const match of line.matchAll(codeTokenPattern)) {
      const token = match[0];
      const index = match.index ?? 0;
      if (index > cursor) tokens.push(escapeCodeText(line.slice(cursor, index)));
      const type = token.startsWith('//') || token.startsWith('/*')
        ? 'comment'
        : token.startsWith('"') || token.startsWith("'") || token.startsWith('`')
          ? 'string'
          : /^\d/.test(token)
            ? 'number'
            : /^(async|await|break|case|catch|class|const|continue|def|else|export|extends|false|for|from|function|if|import|in|interface|let|new|null|return|static|switch|this|throw|true|try|type|var|while|yield)$/.test(token)
              ? 'keyword'
              : /^[A-Z]/.test(token)
                ? 'type'
                : 'function';
      tokens.push(`<span class="note-code-token-${type}">${escapeCodeText(token)}</span>`);
      cursor = index + token.length;
    }
    if (cursor < line.length) tokens.push(escapeCodeText(line.slice(cursor)));
    return `<span class="note-code-line" data-line="${lineIndex + 1}">${tokens.join('') || '<br>'}</span>`;
  }).join('');
  code.classList.add('note-code-highlighted');
}

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  notas?: any[];
  onOpenNota?: (nota: any) => void;
  workspaceId?: string;
  isCollaborative?: boolean;
  onOpenCard?: (card: any) => void;
  onUpdateNota?: (updatedNota: any) => void;
  notaId?: string; // New prop for Real-time
  onCursorLineChange?: (line: number) => void;
  fontFamily?: string;
  fontSize?: string;
  slashMenuEnabled?: boolean;
  wikilinksEnabled?: boolean;
  readOnly?: boolean;
  onCollaboratorsChange?: (users: any[]) => void;
}

interface CommandItem {
  id: string;
  command: string;
  title: string;
  subtitle: string;
  description: string;
  syntax?: string;
  shortcut?: string;
  category: string;
  badge: string;
  keywords: string[];
  icon: React.ReactNode;
  action: (editor: HTMLDivElement) => void;
}

// Smart positioning helper to prevent menus and tooltips from clipping outside the viewport
function computeFloatingPosition(
  rect: DOMRect,
  menuWidth: number,
  menuHeight: number,
  offset: number = 8
): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: rect.left, y: rect.bottom + offset };

  let x = rect.left;
  if (x + menuWidth > window.innerWidth - 16) {
    x = Math.max(16, window.innerWidth - menuWidth - 16);
  }
  if (x < 16) x = 16;

  const spaceBelow = window.innerHeight - (rect.bottom + offset);
  const spaceAbove = rect.top - offset;

  let y = rect.bottom + offset;

  // If space below is not enough and space above is sufficient or larger, pop upwards above caret
  if (spaceBelow < menuHeight && spaceAbove >= menuHeight) {
    y = rect.top - menuHeight - offset;
  } else if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
    y = Math.max(16, rect.top - menuHeight - offset);
  }

  // Constrain within viewport bounds
  if (y + menuHeight > window.innerHeight - 16) {
    y = Math.max(16, window.innerHeight - menuHeight - 16);
  }
  if (y < 16) y = 16;

  return { x, y };
}

// Side positioning helper for slash command menu (opens beside caret to keep text visible)
function computeSideFloatingPosition(
  rect: DOMRect,
  menuWidth: number,
  menuHeight: number,
  offset: number = 14
): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: rect.right + offset, y: rect.top };

  let x = rect.right + offset;
  // If not enough space on the right, position to the left of the caret
  if (x + menuWidth > window.innerWidth - 16) {
    x = rect.left - menuWidth - offset;
    if (x < 16) {
      x = Math.max(16, window.innerWidth - menuWidth - 16);
    }
  }

  // Vertically align with the caret line, clamped within viewport
  let y = rect.top - 4;
  if (y + menuHeight > window.innerHeight - 16) {
    y = Math.max(16, window.innerHeight - menuHeight - 16);
  }
  if (y < 16) y = 16;

  return { x, y };
}

function Editor({ 
  value, 
  onChange: parentOnChange, 
  placeholder = "Digite '/' para comandos, '[[' para notas ou '::' para cards...",
  notas = [],
  onOpenNota,
  workspaceId,
  isCollaborative,
  notaId,
  onOpenCard,
  onUpdateNota,
  onCursorLineChange,
  fontFamily,
  fontSize,
  slashMenuEnabled = true,
  wikilinksEnabled = true,
  readOnly = false,
  onCollaboratorsChange
}: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const readingScrollContainerRef = useRef<HTMLElement | null>(null);
  const hoveredCodeBlockRef = useRef<HTMLPreElement | null>(null);
  const activeCodeBlockRef = useRef<HTMLPreElement | null>(null);
  const [noteSections, setNoteSections] = useState<NoteSection[]>([]);
  const [activeNoteSectionId, setActiveNoteSectionId] = useState<string | null>(null);
  const [readingProgress, setReadingProgress] = useState(0);
  const [codeBlockControl, setCodeBlockControl] = useState<{ top: number; left: number } | null>(null);
  const [copiedCodeBlock, setCopiedCodeBlock] = useState(false);
  const codeCopyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [railPosition, setRailPosition] = useState<{ left: number } | null>(null);
  const [scrollContainerEl, setScrollContainerEl] = useState<HTMLElement | null>(null);

  const updateRailPosition = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const rect = editor.getBoundingClientRect();
    const is2xl = typeof window !== 'undefined' && window.innerWidth >= 1536;
    const tocWidth = is2xl ? 208 : 176;
    const gap = 16;
    setRailPosition({ left: Math.max(16, Math.round(rect.left - tocWidth - gap)) });
  }, []);

  useEffect(() => {
    updateRailPosition();
    window.addEventListener('resize', updateRailPosition);
    const editor = editorRef.current;
    const resizeObserver = typeof ResizeObserver !== 'undefined' && editor
      ? new ResizeObserver(updateRailPosition)
      : null;
    if (editor && resizeObserver) resizeObserver.observe(editor);

    return () => {
      window.removeEventListener('resize', updateRailPosition);
      resizeObserver?.disconnect();
    };
  }, [updateRailPosition]);

  const refreshNoteSections = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const headings = Array.from(editor.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'));
    const noteKey = (notaId || 'note').replace(/[^a-zA-Z0-9_-]/g, '-');
    const nextSections = headings.flatMap((heading, index) => {
      const label = heading.innerText.trim();
      if (!label) return [];
      if (!heading.id) heading.id = `note-${noteKey}-section-${index + 1}`;
      return [{ id: heading.id, label, level: Number(heading.tagName.slice(1)) }];
    });

    editor.querySelectorAll<HTMLPreElement>('pre').forEach((pre) => {
      const codeClass = pre.querySelector('code')?.className || '';
      const language = codeClass.match(/(?:^|\s)language-([\w+-]+)/)?.[1];
      pre.dataset.language = language || pre.dataset.language || 'texto';
      if (!pre.querySelector('code')) {
        const code = document.createElement('code');
        code.textContent = pre.innerText;
        pre.replaceChildren(code);
      }
      if (!pre.querySelector('code')?.classList.contains('note-code-highlighted')) {
        highlightCodeBlock(pre);
      }
    });

    setNoteSections((previous) => {
      const unchanged = previous.length === nextSections.length && previous.every((section, index) => (
        section.id === nextSections[index]?.id &&
        section.label === nextSections[index]?.label &&
        section.level === nextSections[index]?.level
      ));
      return unchanged ? previous : nextSections;
    });
  }, [notaId]);

  const updateCodeBlockControlPosition = useCallback(() => {
    const pre = hoveredCodeBlockRef.current;
    if (!pre?.isConnected) {
      hoveredCodeBlockRef.current = null;
      setCodeBlockControl(null);
      return;
    }
    const rect = pre.getBoundingClientRect();
    setCodeBlockControl({ top: rect.top + 5, left: Math.max(8, rect.right - 78) });
  }, []);

  const updateCodeBlockControlFromTarget = useCallback((target: EventTarget | null) => {
    const targetElement = target instanceof HTMLElement ? target : null;
    if (targetElement?.closest('[data-note-code-copy]')) return;

    const pre = targetElement?.closest('pre');
    if (!pre || !editorRef.current?.contains(pre)) {
      if (hoveredCodeBlockRef.current) {
        hoveredCodeBlockRef.current = null;
        setCodeBlockControl(null);
        setCopiedCodeBlock(false);
      }
      return;
    }

    if (hoveredCodeBlockRef.current !== pre) {
      hoveredCodeBlockRef.current = pre as HTMLPreElement;
      setCopiedCodeBlock(false);
      updateCodeBlockControlPosition();
    }
  }, [updateCodeBlockControlPosition]);

  const plainText = useMemo(() => {
    const htmlWithLineBreaks = (value || '')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|blockquote|pre|tr)>/gi, '\n');
    if (typeof DOMParser !== 'undefined') {
      return new DOMParser().parseFromString(htmlWithLineBreaks, 'text/html').body.textContent || '';
    }
    return htmlWithLineBreaks.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&');
  }, [value]);
  const trimmedText = plainText.trim();
  const wordCount = trimmedText ? trimmedText.split(/\s+/).length : 0;
  const characterCount = plainText.length;
  const readingProgressPercent = Math.round(readingProgress * 100);
  const connectionCount = useMemo(
    () => extractGraphLinks(notas).filter((link) => link.source === notaId || link.target === notaId).length,
    [notas, notaId]
  );
  const railTocItems = useMemo<RailTocItem[]>(() => {
    if (noteSections.length === 0) return [];
    const minLevel = Math.min(...noteSections.map((s) => s.level));
    return noteSections.map((section) => ({
      id: section.id,
      label: section.label,
      depth: Math.max(0, section.level - minLevel),
    }));
  }, [noteSections]);

  const updateReadingProgress = useCallback(() => {
    const scrollContainer = readingScrollContainerRef.current;
    if (!scrollContainer) return;

    const scrollableHeight = scrollContainer.scrollHeight - scrollContainer.clientHeight;
    const progress = scrollableHeight > 0 ? scrollContainer.scrollTop / scrollableHeight : 0;
    setReadingProgress(Math.min(1, Math.max(0, progress)));

    const headings = Array.from(editorRef.current?.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6') || []);
    const anchorY = scrollContainer.getBoundingClientRect().top + 120;
    let currentSectionId: string | null = headings[0]?.id || null;
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= anchorY) currentSectionId = heading.id;
    }
    setActiveNoteSectionId((previous) => previous === currentSectionId ? previous : currentSectionId);
    updateCodeBlockControlPosition();
  }, [updateCodeBlockControlPosition]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    let scrollContainer: HTMLElement | null = editor.parentElement;
    while (scrollContainer) {
      const overflowY = window.getComputedStyle(scrollContainer).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') break;
      scrollContainer = scrollContainer.parentElement;
    }

    if (!scrollContainer) return;
    readingScrollContainerRef.current = scrollContainer;
    setScrollContainerEl(scrollContainer);

    scrollContainer.addEventListener('scroll', updateReadingProgress, { passive: true });
    window.addEventListener('resize', updateReadingProgress);
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateReadingProgress)
      : null;
    resizeObserver?.observe(scrollContainer);
    resizeObserver?.observe(editor);
    updateReadingProgress();

    return () => {
      scrollContainer?.removeEventListener('scroll', updateReadingProgress);
      window.removeEventListener('resize', updateReadingProgress);
      resizeObserver?.disconnect();
      readingScrollContainerRef.current = null;
      setScrollContainerEl(null);
    };
  }, [updateReadingProgress]);

  useEffect(() => {
    refreshNoteSections();
    updateReadingProgress();
  }, [value, refreshNoteSections, updateReadingProgress]);

  const selectNoteSection = useCallback((sectionId: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    const escapedId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(sectionId)
      : sectionId.replace(/[^a-zA-Z0-9_-]/g, '\\$&');

    const heading =
      editor.querySelector<HTMLElement>(`#${escapedId}`) ||
      document.getElementById(sectionId) ||
      Array.from(editor.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'))
        .find((h) => h.id === sectionId);

    if (!heading) return;

    // Find the scroll container (page's main or nearest scrollable ancestor)
    let scrollContainer = readingScrollContainerRef.current;
    if (!scrollContainer || !scrollContainer.isConnected) {
      let el: HTMLElement | null = editor.parentElement;
      while (el) {
        const style = window.getComputedStyle(el);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
          scrollContainer = el;
          break;
        }
        el = el.parentElement;
      }
      if (scrollContainer) {
        readingScrollContainerRef.current = scrollContainer;
      }
    }

    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const headingRect = heading.getBoundingClientRect();
      const targetScrollTop = scrollContainer.scrollTop + (headingRect.top - containerRect.top) - 48;

      scrollContainer.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    } else {
      heading.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
    }

    setActiveNoteSectionId(sectionId);
  }, []);

  const handleCodeBlockCopy = async () => {
    const codeBlock = hoveredCodeBlockRef.current;
    if (!codeBlock) return;

    try {
      const code = readCodeBlockSource(codeBlock);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      setCopiedCodeBlock(true);
      if (codeCopyTimeoutRef.current) clearTimeout(codeCopyTimeoutRef.current);
      codeCopyTimeoutRef.current = setTimeout(() => setCopiedCodeBlock(false), 1600);
    } catch (error) {
      console.error('Não foi possível copiar o bloco de código.', error);
    }
  };

  // Track cursor line number in contentEditable (1 to infinity, counting both Enter and wrapped visual lines)
  const updateCursorLine = useCallback(() => {
    if (!onCursorLineChange || !editorRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const editorEl = editorRef.current;
    if (!editorEl.contains(range.startContainer)) return;

    try {
      let rect = range.getBoundingClientRect();

      // If collapsed on an empty block or zero-height selection, locate the container block element
      if (!rect || rect.height === 0 || (rect.top === 0 && rect.bottom === 0)) {
        let el: HTMLElement | null =
          range.startContainer.nodeType === Node.ELEMENT_NODE
            ? (range.startContainer as HTMLElement)
            : range.startContainer.parentElement;

        if (el === editorEl && editorEl.children.length > 0) {
          const childIndex = Math.min(range.startOffset, editorEl.children.length - 1);
          el = editorEl.children[childIndex] as HTMLElement;
        }

        if (el) {
          rect = el.getBoundingClientRect();
        }
      }

      const editorRect = editorEl.getBoundingClientRect();
      const editorStyle = window.getComputedStyle(editorEl);
      const paddingTop = parseFloat(editorStyle.paddingTop) || 0;
      const lineHeight = parseFloat(editorStyle.lineHeight) || 25.5;

      if (rect && rect.top > 0 && editorRect.top > 0) {
        const relativeY = (rect.top - editorRect.top) + editorEl.scrollTop - paddingTop;
        if (relativeY >= 0) {
          const lineNumber = Math.floor((relativeY + (lineHeight * 0.35)) / lineHeight) + 1;
          onCursorLineChange(Math.max(1, lineNumber));
          return;
        }
      }

      // Fallback: block counting
      let blockCount = 1;
      let curr: Node | null = range.startContainer;
      while (curr && curr.parentNode !== editorEl && curr !== editorEl) {
        curr = curr.parentNode;
      }
      if (curr && curr.parentNode === editorEl) {
        let prev = curr.previousSibling;
        while (prev) {
          blockCount++;
          prev = prev.previousSibling;
        }
        onCursorLineChange(Math.max(1, blockCount));
      }
    } catch {
      // Fallback
    }
  }, [onCursorLineChange]);

  const { users, cursors, broadcastChange, broadcastTextSelection } = require('../hooks/useCollaboration').useCollaboration(
    isCollaborative && notaId ? `${workspaceId}:${notaId}` : undefined,
    'document_change',
    (newVal: string) => {
      const safeValue = ensureHtmlContent(newVal);
      parentOnChange(safeValue);
      if (editorRef.current && editorRef.current.innerHTML !== newVal) {
        editorRef.current.innerHTML = safeValue;
        refreshNoteSections();
        updateReadingProgress();
      }
    }
  );

  useEffect(() => {
    onCollaboratorsChange?.(isCollaborative ? users : []);
  }, [isCollaborative, onCollaboratorsChange, users]);

  useEffect(() => {
    if (!isCollaborative || !notaId) return;
    const updateRemoteTextSelection = () => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection || selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) {
        broadcastTextSelection(0, 0, false);
        return;
      }
      const range = selection.getRangeAt(0);
      const offsetAt = (node: Node, offset: number) => {
        const before = document.createRange();
        before.selectNodeContents(editor);
        before.setEnd(node, offset);
        return before.toString().length;
      };
      broadcastTextSelection(offsetAt(range.startContainer, range.startOffset), offsetAt(range.endContainer, range.endOffset));
    };
    document.addEventListener('selectionchange', updateRemoteTextSelection);
    return () => {
      document.removeEventListener('selectionchange', updateRemoteTextSelection);
      broadcastTextSelection(0, 0, false);
    };
  }, [broadcastTextSelection, isCollaborative, notaId]);

  const onChange = useCallback((val: string) => {
    parentOnChange(val);
    broadcastChange(val);
  }, [parentOnChange, broadcastChange]);

  useEffect(() => {
    const handleSelectionChange = () => {
      updateCursorLine();
      const activeCodeBlock = activeCodeBlockRef.current;
      const selection = window.getSelection();
      if (activeCodeBlock && (!selection?.anchorNode || !activeCodeBlock.contains(selection.anchorNode))) {
        highlightCodeBlock(activeCodeBlock);
        activeCodeBlockRef.current = null;
        if (editorRef.current) onChange(editorRef.current.innerHTML);
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [onChange, updateCursorLine]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wikiMenuRef = useRef<HTMLDivElement>(null);
  const selectionToolbarRef = useRef<HTMLDivElement>(null);
  const linkPopoverRef = useRef<HTMLDivElement>(null);
  const linkTooltipRef = useRef<HTMLDivElement>(null);
  const imagePopoverRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const wikiItemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Drag overlay & upload state
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Active resizing state (image, youtube & drawing height/width)
  const resizingRef = useRef<{
    wrapper: HTMLElement;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    type: 'image_width' | 'drawing_height' | 'youtube_width';
  } | null>(null);

  // Drawing embed modal state & Drawing direct edit modal state
  const [isDrawingModalOpen, setIsDrawingModalOpen] = useState(false);
  const [activeDrawingEdit, setActiveDrawingEdit] = useState<any | null>(null);

  // Math equation modal state
  const [mathModal, setMathModal] = useState<{
    visible: boolean;
    targetNode: HTMLElement | null;
    latex: string;
    savedRange: Range | null;
  }>({
    visible: false,
    targetNode: null,
    latex: '',
    savedRange: null,
  });

  // Slash menu state
  const [slashMenu, setSlashMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    query: string;
    selectedIndex: number;
  }>({
    visible: false,
    x: 0,
    y: 0,
    query: '',
    selectedIndex: 0,
  });

  // Wikilink [[ menu state
  const [wikiMenu, setWikiMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    query: string;
    selectedIndex: number;
  }>({
    visible: false,
    x: 0,
    y: 0,
    query: '',
    selectedIndex: 0,
  });

  // Card Connection :: menu state
  const [cardMenu, setCardMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    query: string;
    selectedIndex: number;
  }>({
    visible: false,
    x: 0,
    y: 0,
    query: '',
    selectedIndex: 0,
  });

  const [cards, setCards] = useState<any[]>([]);
  const cardMenuRef = useRef<HTMLDivElement>(null);
  const cardItemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Load cards for card connection
  useEffect(() => {
    if (!workspaceId) return;
    api(`/flashcards/cards/workspace?workspaceId=${workspaceId}`)
      .then((data) => {
        if (Array.isArray(data)) setCards(data);
      })
      .catch((err) => console.error('Erro ao carregar cards no editor', err));
  }, [workspaceId]);

  // Floating selection toolbar state
  const [selectionToolbar, setSelectionToolbar] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({
    visible: false,
    x: 0,
    y: 0,
  });

  // Link popover state (for inserting/editing links)
  const [linkPopover, setLinkPopover] = useState<{
    visible: boolean;
    x: number;
    y: number;
    url: string;
    text: string;
    savedRange: Range | null;
  } | null>(null);

  // Image modal/popover state (Upload / URL)
  const [imageModal, setImageModal] = useState<{
    visible: boolean;
    tab: 'upload' | 'url';
    url: string;
    savedRange: Range | null;
  } | null>(null);

  // Link tooltip preview state (when clicking an existing link)
  const [linkTooltip, setLinkTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    url: string;
    linkElement: HTMLAnchorElement | null;
  } | null>(null);

  const [copied, setCopied] = useState(false);
  const isKeyboardNavRef = useRef(false);
  const initialValueRef = useRef(ensureHtmlContent(value || ''));
  const isInitializedRef = useRef(false);

  // Initialize content once on mount imperatively to keep contentEditable isolated from React reconciliation
  useEffect(() => {
    if (editorRef.current && !isInitializedRef.current) {
      editorRef.current.innerHTML = ensureHtmlContent(initialValueRef.current);
      refreshNoteSections();
      updateReadingProgress();
      isInitializedRef.current = true;
    }
  }, [refreshNoteSections, updateReadingProgress]);

  useEffect(() => () => {
    if (codeCopyTimeoutRef.current) clearTimeout(codeCopyTimeoutRef.current);
  }, []);

  // Global mousemove & mouseup for image & drawing resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const { wrapper, startX, startY, startWidth, startHeight, type } = resizingRef.current;
      if (type === 'image_width') {
        const deltaX = e.clientX - startX;
        const newWidth = Math.max(120, Math.min(800, startWidth + deltaX));
        wrapper.style.width = `${newWidth}px`;
      } else if (type === 'youtube_width') {
        const deltaX = e.clientX - startX;
        const newWidth = Math.max(260, Math.min(1000, startWidth + deltaX));
        wrapper.style.width = `${newWidth}px`;
      } else if (type === 'drawing_height') {
        const deltaY = e.clientY - startY;
        const newHeight = Math.max(160, Math.min(900, startHeight + deltaY));
        wrapper.style.height = `${newHeight}px`;
        const canvas = wrapper.querySelector('canvas') as HTMLCanvasElement | null;
        if (canvas) {
          canvas.style.height = `${newHeight}px`;
        }
      }
    };

    const handleMouseUp = () => {
      if (resizingRef.current) {
        const { wrapper, type } = resizingRef.current;
        if (type === 'youtube_width') {
          const iframe = wrapper.querySelector('iframe');
          if (iframe) iframe.style.pointerEvents = 'auto';
        }
        resizingRef.current = null;
        if (editorRef.current) {
          onChange(editorRef.current.innerHTML);
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onChange]);

  const handleInput = () => {
    if (!editorRef.current) return;
    refreshNoteSections();
    updateCodeBlockControlPosition();
    onChange(editorRef.current.innerHTML);
    updateCursorLine();
    checkSlashTrigger();
    checkWikiTrigger();
    checkSelection();
  };

  const handleEditorBlur = () => {
    const pre = activeCodeBlockRef.current;
    const editor = editorRef.current;
    if (!pre?.isConnected || !editor) return;
    highlightCodeBlock(pre);
    activeCodeBlockRef.current = null;
    onChange(editor.innerHTML);
  };

  // Helper to remove the typed slash command text (/query)
  const removeSlashText = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    const textNode = range.startContainer;

    if (textNode.nodeType === Node.TEXT_NODE && textNode.nodeValue) {
      const text = textNode.nodeValue;
      const caretOffset = range.startOffset;
      const slashIndex = text.lastIndexOf('/', caretOffset);

      if (slashIndex !== -1) {
        const newRange = document.createRange();
        newRange.setStart(textNode, slashIndex);
        newRange.setEnd(textNode, caretOffset);
        newRange.deleteContents();

        sel.removeAllRanges();
        sel.addRange(newRange);
        newRange.collapse(true);
      }
    }
  };

  // Helper to remove the typed wikilink trigger [[query
  const removeWikiTriggerText = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    const textNode = range.startContainer;

    if (textNode.nodeType === Node.TEXT_NODE && textNode.nodeValue) {
      const text = textNode.nodeValue;
      const caretOffset = range.startOffset;
      const wikiIndex = text.lastIndexOf('[[', caretOffset);

      if (wikiIndex !== -1) {
        const newRange = document.createRange();
        newRange.setStart(textNode, wikiIndex);
        newRange.setEnd(textNode, caretOffset);
        newRange.deleteContents();

        sel.removeAllRanges();
        sel.addRange(newRange);
        newRange.collapse(true);
      }
    }
  };

  // Insert connected note (wikilink badge)
  const insertNoteLink = (targetNota: any) => {
    if (!editorRef.current) return;
    editorRef.current.focus();

    removeWikiTriggerText();
    removeSlashText();

    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const range = sel.getRangeAt(0);

    const a = document.createElement('a');
    a.className = 'synap-wikilink';
    a.setAttribute('data-note-id', targetNota.id);
    a.href = `#note-${targetNota.id}`;
    a.title = `Abrir nota: ${targetNota.titulo}`;
    a.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.75;flex-shrink:0;"><path d="M10 13a5 5 0 0 1 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
    const label = document.createElement('span');
    label.textContent = targetNota.titulo;
    a.appendChild(label);

    range.insertNode(a);

    // Space after link
    const spaceNode = document.createTextNode('\u00A0');
    a.parentNode?.insertBefore(spaceNode, a.nextSibling);

    const newRange = document.createRange();
    newRange.setStartAfter(spaceNode);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    setWikiMenu((prev) => ({ ...prev, visible: false }));
    setSlashMenu((prev) => ({ ...prev, visible: false }));

    onChange(editorRef.current.innerHTML);
  };

  // Helper to remove the typed card trigger ::query
  const removeCardTriggerText = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    const textNode = range.startContainer;

    if (textNode.nodeType === Node.TEXT_NODE && textNode.nodeValue) {
      const text = textNode.nodeValue;
      const caretOffset = range.startOffset;
      const cardIndex = text.lastIndexOf('::', caretOffset);

      if (cardIndex !== -1) {
        const newRange = document.createRange();
        newRange.setStart(textNode, cardIndex);
        newRange.setEnd(textNode, caretOffset);
        newRange.deleteContents();

        sel.removeAllRanges();
        sel.addRange(newRange);
        newRange.collapse(true);
      }
    }
  };

  // Insert connected flashcard (cardlink badge)
  const insertCardLink = (targetCard: any) => {
    if (!editorRef.current) return;
    editorRef.current.focus();

    removeCardTriggerText();
    removeWikiTriggerText();
    removeSlashText();

    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const range = sel.getRangeAt(0);

    const a = document.createElement('a');
    a.className = 'synap-cardlink';
    a.setAttribute('data-card-id', targetCard.id);
    a.href = `#card-${targetCard.id}`;
    a.title = `Flashcard: ${targetCard.frente}`;
    a.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.75;flex-shrink:0;"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/></svg>';
    const label = document.createElement('span');
    label.textContent = targetCard.frente;
    a.appendChild(label);

    range.insertNode(a);

    // Space after link
    const spaceNode = document.createTextNode('\u00A0');
    a.parentNode?.insertBefore(spaceNode, a.nextSibling);

    const newRange = document.createRange();
    newRange.setStartAfter(spaceNode);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    setCardMenu((prev) => ({ ...prev, visible: false }));
    setWikiMenu((prev) => ({ ...prev, visible: false }));
    setSlashMenu((prev) => ({ ...prev, visible: false }));

    onChange(editorRef.current.innerHTML);
  };

  // Helper to render drawing snapshot on an embedded canvas
  const renderEmbeddedCanvas = (wrapper: HTMLElement, contentJson?: string) => {
    const canvas = wrapper.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return;

    let elements: any[] = [];
    if (contentJson) {
      try {
        const parsed = JSON.parse(contentJson);
        if (Array.isArray(parsed)) elements = parsed;
      } catch {}
    }

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || wrapper.offsetWidth || 500;
    const height = rect.height || wrapper.offsetHeight || 300;

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, width, height);

    // Dot grid
    const gridSize = 24;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    for (let x = 0; x < width; x += gridSize) {
      for (let y = 0; y < height; y += gridSize) {
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }

    // Auto-center drawing if elements exist
    if (elements.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      elements.forEach((el) => {
        if ((el.type === 'line' || el.type === 'arrow') && el.points && el.points.length > 0) {
          const pts = resolveLinearPoints(el, elements);
          pts.forEach((p: any) => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
          });
        } else if (el.points && el.points.length > 0) {
          el.points.forEach((p: any) => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
          });
        } else {
          const box = getNormalizedBox(el);
          minX = Math.min(minX, box.x);
          minY = Math.min(minY, box.y);
          maxX = Math.max(maxX, box.x + Math.max(60, box.width));
          maxY = Math.max(maxY, box.y + Math.max(40, box.height));
        }
      });

      const drawWidth = Math.max(1, maxX - minX);
      const drawHeight = Math.max(1, maxY - minY);
      const scale = Math.min(1.2, Math.min((width - 40) / drawWidth, (height - 40) / drawHeight));
      const offsetX = (width - drawWidth * scale) / 2 - minX * scale;
      const offsetY = (height - drawHeight * scale) / 2 - minY * scale;

      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      elements.forEach((el) => {
        renderDrawingElement(ctx, el, {
          allElements: elements,
          isPreview: true,
        });
      });
    }

    ctx.restore();
  };

  // Re-render all embedded drawing canvases whenever editor value/notes update
  useEffect(() => {
    if (!editorRef.current) return;
    const drawingWrappers = editorRef.current.querySelectorAll('.synap-drawing-wrapper');
    drawingWrappers.forEach((wrap) => {
      const wrapperEl = wrap as HTMLElement;
      const drawingId = wrapperEl.getAttribute('data-drawing-id');
      const drawingNota = notas.find((n) => n.id === drawingId);
      renderEmbeddedCanvas(wrapperEl, drawingNota?.conteudo);
    });
  }, [value, notas]);

  const insertImageAtRange = (src: string, alt: string = 'Imagem', targetRange?: Range | null) => {
    if (!editorRef.current) return;
    editorRef.current.focus();

    const sel = window.getSelection();
    const range = targetRange || (sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null);

    const wrapper = document.createElement('div');
    wrapper.className = 'synap-image-wrapper';
    wrapper.contentEditable = 'false';
    wrapper.style.width = '100%';
    wrapper.style.maxWidth = '100%';

    wrapper.innerHTML = `
      <img src="${src}" alt="${alt}" loading="lazy" />
      <div class="synap-image-controls">
        <button type="button" class="synap-img-btn-delete" title="Excluir imagem" style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;background:rgba(0,0,0,0.75);color:#fff;border-radius:6px;border:none;cursor:pointer;backdrop-filter:blur(4px);transition:all 0.15s ease;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"/>
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            <line x1="10" y1="11" x2="10" y2="17"/>
            <line x1="14" y1="11" x2="14" y2="17"/>
          </svg>
        </button>
      </div>
      <div class="synap-resize-handle" title="Arraste para redimensionar"></div>
    `;

    const pAfter = document.createElement('p');
    pAfter.innerHTML = '<br>';

    if (range && editorRef.current.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(wrapper);
      wrapper.parentNode?.insertBefore(pAfter, wrapper.nextSibling);

      const newRange = document.createRange();
      newRange.setStart(pAfter, 0);
      newRange.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(newRange);
    } else {
      editorRef.current.appendChild(wrapper);
      editorRef.current.appendChild(pAfter);
    }

    onChange(editorRef.current.innerHTML);
  };

  // Insert Embedded Drawing Canvas block
  const insertDrawingAtRange = (drawingNota: any, targetRange?: Range | null) => {
    if (!editorRef.current) return;
    editorRef.current.focus();

    const sel = window.getSelection();
    const range = targetRange || (sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null);

    const wrapper = document.createElement('div');
    wrapper.className = 'synap-drawing-wrapper';
    wrapper.contentEditable = 'false';
    wrapper.setAttribute('data-drawing-id', drawingNota.id);
    wrapper.style.height = '320px';

    wrapper.innerHTML = `
      <div class="synap-drawing-header" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--accents-1);border-bottom:1px solid var(--accents-2);">
        <div style="display:flex;align-items:center;gap:6px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accents-5);">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
          </svg>
          <span style="font-size:12px;font-weight:600;color:var(--foreground);">${drawingNota.titulo}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <button type="button" class="synap-drawing-btn-edit" title="Editar desenho" style="display:flex;align-items:center;gap:4px;padding:3px 8px;background:var(--accents-2);color:var(--foreground);border-radius:4px;border:1px solid var(--accents-3);font-size:11px;font-weight:500;cursor:pointer;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
            </svg>
            <span>Editar</span>
          </button>
          <button type="button" class="synap-drawing-btn-delete" title="Remover bloco" style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;background:var(--accents-2);color:var(--accents-5);border-radius:4px;border:1px solid var(--accents-3);cursor:pointer;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18"/>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="synap-drawing-canvas-container" style="width:100%;height:calc(100% - 37px);background:var(--background);position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer;" title="Clique para abrir e editar o desenho">
        <canvas class="synap-embedded-canvas" style="width:100%;height:100%;display:block;"></canvas>
      </div>
      <div class="synap-drawing-resize-handle" title="Arraste para ajustar a altura"></div>
    `;

    const pAfter = document.createElement('p');
    pAfter.innerHTML = '<br>';

    if (range && editorRef.current.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(wrapper);
      wrapper.parentNode?.insertBefore(pAfter, wrapper.nextSibling);

      const newRange = document.createRange();
      newRange.setStart(pAfter, 0);
      newRange.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(newRange);
    } else {
      editorRef.current.appendChild(wrapper);
      editorRef.current.appendChild(pAfter);
    }

    // Render snapshot on embedded canvas
    renderEmbeddedCanvas(wrapper, drawingNota.conteudo);

    onChange(editorRef.current.innerHTML);
  };

  // Insert or Update Math Equation Block
  const handleConfirmMath = (latex: string) => {
    let mathHtml = '';
    try {
      mathHtml = katex.renderToString(latex, { throwOnError: false, displayMode: true });
    } catch (e) {
      mathHtml = `<span style="color:var(--error);font-family:var(--font-mono);font-size:12px;">${latex}</span>`;
    }

    if (mathModal.targetNode) {
      mathModal.targetNode.setAttribute('data-latex', latex);
      const contentDiv = mathModal.targetNode.querySelector('.synap-math-content');
      if (contentDiv) {
        contentDiv.innerHTML = mathHtml;
      } else {
        mathModal.targetNode.innerHTML = `
          <div class="synap-math-content" style="pointer-events:none;font-size:16px;overflow-x:auto;max-width:100%;text-align:center;">${mathHtml}</div>
          <div class="synap-math-actions" style="position:absolute;top:6px;right:8px;display:flex;align-items:center;gap:6px;">
            <span style="font-size:10px;font-family:var(--font-mono);color:var(--accents-5);">f(x)</span>
            <button type="button" class="synap-math-btn-delete" title="Excluir equação" style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;background:var(--accents-2);color:var(--accents-5);border-radius:4px;border:none;cursor:pointer;">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        `;
      }
      if (editorRef.current) {
        onChange(editorRef.current.innerHTML);
      }
    } else {
      if (!editorRef.current) return;
      const sel = window.getSelection();
      let range = mathModal.savedRange;
      if (!range && sel && sel.rangeCount > 0) {
        range = sel.getRangeAt(0);
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'synap-math-block geist-card';
      wrapper.contentEditable = 'false';
      wrapper.setAttribute('data-latex', latex);
      wrapper.style.margin = '16px 0';
      wrapper.style.padding = '16px 24px';
      wrapper.style.background = 'var(--accents-1)';
      wrapper.style.border = '1px solid var(--accents-2)';
      wrapper.style.borderRadius = 'var(--radius, 6px)';
      wrapper.style.cursor = 'pointer';
      wrapper.style.position = 'relative';
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.justifyContent = 'center';
      wrapper.style.userSelect = 'none';
      wrapper.title = 'Clique para editar a equação matemática';

      wrapper.innerHTML = `
        <div class="synap-math-content" style="pointer-events:none;font-size:16px;overflow-x:auto;max-width:100%;text-align:center;">${mathHtml}</div>
        <div class="synap-math-actions" style="position:absolute;top:6px;right:8px;display:flex;align-items:center;gap:6px;">
          <span style="font-size:10px;font-family:var(--font-mono);color:var(--accents-5);">f(x)</span>
          <button type="button" class="synap-math-btn-delete" title="Excluir equação" style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;background:var(--accents-2);color:var(--accents-5);border-radius:4px;border:none;cursor:pointer;">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      `;

      const pAfter = document.createElement('p');
      pAfter.innerHTML = '<br>';

      if (range && editorRef.current.contains(range.commonAncestorContainer)) {
        range.deleteContents();
        range.insertNode(pAfter);
        range.insertNode(wrapper);
        range.setStart(pAfter, 0);
        range.setEnd(pAfter, 0);
      } else {
        editorRef.current.appendChild(wrapper);
        editorRef.current.appendChild(pAfter);
      }

      if (editorRef.current) {
        onChange(editorRef.current.innerHTML);
      }
    }
  };

  // Upload file to backend
  const uploadImageFile = async (file: File, targetRange?: Range | null) => {
    if (!file.type.startsWith('image/')) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const data = await api('/upload', {
        method: 'POST',
        body: formData,
      });

      const imageUrl = data?.url || data?.fileUrl || data?.imageUrl || data?.data?.url || data?.secure_url || (data?.filename ? `/uploads/${data.filename}` : null);

      if (imageUrl) {
        insertImageAtRange(imageUrl, file.name, targetRange);
      }
    } catch (err: any) {
      alert('Erro ao enviar imagem: ' + (err.message || 'Falha no upload'));
    } finally {
      setIsUploading(false);
    }
  };

  // Open Image Modal dialog
  const openImageDialog = () => {
    removeSlashText();
    setSlashMenu((prev) => ({ ...prev, visible: false }));
    setSelectionToolbar((prev) => ({ ...prev, visible: false }));

    const sel = window.getSelection();
    let savedRange: Range | null = null;
    if (sel && sel.rangeCount > 0) {
      savedRange = sel.getRangeAt(0).cloneRange();
    }

    setImageModal({
      visible: true,
      tab: 'upload',
      url: '',
      savedRange,
    });
  };

  // Transform block elements
  const transformCurrentBlockToElement = (tag: 'h1' | 'h2' | 'h3' | 'h4' | 'ul' | 'ol' | 'pre') => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !editorRef.current) return;

    if (tag === 'ul') {
      removeSlashText();
      document.execCommand('insertUnorderedList', false);
      return;
    }
    if (tag === 'ol') {
      removeSlashText();
      document.execCommand('insertOrderedList', false);
      return;
    }

    const range = sel.getRangeAt(0);
    let node: Node | null = range.startContainer;

    let blockEl: HTMLElement | null = null;
    while (node && node !== editorRef.current) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = (node as HTMLElement).tagName.toLowerCase();
        if (['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'section', 'pre'].includes(tagName)) {
          blockEl = node as HTMLElement;
          break;
        }
      }
      node = node.parentNode;
    }

    removeSlashText();

    if (tag === 'pre') {
      const pre = document.createElement('pre');
      pre.dataset.language = 'texto';
      const code = document.createElement('code');
      pre.appendChild(code);

      if (blockEl && blockEl !== editorRef.current) {
        const rawText = blockEl.innerText.replace(/\r/g, '');
        code.innerHTML = rawText.trim() ? escapeCodeText(rawText) : '<br>';
        blockEl.parentNode?.replaceChild(pre, blockEl);
      } else {
        code.innerHTML = '<br>';
        if (range.startContainer === editorRef.current) {
          editorRef.current.appendChild(pre);
        } else {
          range.insertNode(pre);
        }
      }

      const newRange = document.createRange();
      newRange.selectNodeContents(code);
      newRange.collapse(false);
      sel.removeAllRanges();
      sel.addRange(newRange);
      refreshNoteSections();
      return;
    }

    const newHeading = document.createElement(tag);

    if (blockEl && blockEl !== editorRef.current) {
      const rawText = blockEl.innerText.trim();
      if (!rawText) {
        newHeading.innerHTML = '<br>';
      } else {
        newHeading.innerHTML = blockEl.innerHTML;
      }
      blockEl.parentNode?.replaceChild(newHeading, blockEl);
    } else {
      newHeading.innerHTML = '<br>';
      if (range.startContainer === editorRef.current) {
        editorRef.current.appendChild(newHeading);
      } else {
        range.insertNode(newHeading);
      }
    }

    const newRange = document.createRange();
    newRange.selectNodeContents(newHeading);
    newRange.collapse(false);
    sel.removeAllRanges();
    sel.addRange(newRange);
  };

  const applyInlineFormat = (command: 'bold' | 'italic') => {
    removeSlashText();
    document.execCommand(command, false);
  };

  // Open Link Popover dialog
  const openLinkDialog = (initialText: string = '') => {
    const sel = window.getSelection();
    let savedRange: Range | null = null;
    let x = window.innerWidth / 2 - 160;
    let y = 200;

    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      savedRange = range.cloneRange();
      const rect = range.getBoundingClientRect();
      if (rect.top || rect.left) {
        const pos = computeFloatingPosition(rect, 320, 180, 8);
        x = pos.x;
        y = pos.y;
      }
    }

    setSlashMenu((prev) => ({ ...prev, visible: false }));
    setSelectionToolbar((prev) => ({ ...prev, visible: false }));
    setLinkTooltip(null);

    setLinkPopover({
      visible: true,
      x,
      y,
      url: '',
      text: initialText,
      savedRange,
    });
  };

  const handleInsertLink = () => {
    if (!linkPopover || !editorRef.current) return;
    const rawUrl = linkPopover.url.trim();
    if (!rawUrl) {
      setLinkPopover(null);
      return;
    }

    let formattedUrl = rawUrl;
    if (!/^https?:\/\//i.test(formattedUrl) && !/^mailto:/i.test(formattedUrl) && !/^tel:/i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
    }

    // Check if the URL is a YouTube link
    const youtubeId = parseYouTubeVideoId(formattedUrl);
    if (youtubeId) {
      const embedUrl = getYouTubeEmbedUrl(youtubeId);
      const wrapper = document.createElement('div');
      wrapper.className = 'synap-youtube-wrapper geist-card';
      wrapper.contentEditable = 'false';
      wrapper.setAttribute('data-youtube-id', youtubeId);
      wrapper.setAttribute('data-youtube-url', formattedUrl);
      wrapper.style.position = 'relative';
      wrapper.style.margin = '20px 0';
      wrapper.style.borderRadius = 'var(--radius, 8px)';
      wrapper.style.overflow = 'hidden';
      wrapper.style.border = '1px solid var(--accents-2)';
      wrapper.style.background = 'var(--accents-1)';
      wrapper.style.aspectRatio = '16/9';
      wrapper.style.maxWidth = '100%';
      wrapper.style.width = '100%';

      wrapper.innerHTML = `
        <iframe
          src="${embedUrl}"
          title="YouTube video player"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
          style="width:100%;height:100%;border:none;display:block;"
        ></iframe>
        <button
          type="button"
          class="synap-youtube-btn-delete"
          title="Excluir vídeo"
          style="position:absolute;top:8px;right:8px;display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:rgba(0,0,0,0.65);color:#fff;border-radius:4px;border:none;cursor:pointer;opacity:0;transition:opacity 0.15s ease;backdrop-filter:blur(4px);z-index:10;"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
        <div class="synap-youtube-resize-handle" title="Arraste para redimensionar o vídeo" style="position:absolute;bottom:0;right:0;width:18px;height:18px;cursor:nwse-resize;z-index:20;background:linear-gradient(135deg, transparent 50%, var(--accents-4) 50%);border-bottom-right-radius:var(--radius, 8px);"></div>
      `;

      const pAfter = document.createElement('p');
      pAfter.innerHTML = '<br>';

      if (linkPopover.savedRange && editorRef.current.contains(linkPopover.savedRange.commonAncestorContainer)) {
        linkPopover.savedRange.deleteContents();
        linkPopover.savedRange.insertNode(pAfter);
        linkPopover.savedRange.insertNode(wrapper);
        linkPopover.savedRange.setStart(pAfter, 0);
        linkPopover.savedRange.setEnd(pAfter, 0);
      } else {
        editorRef.current.appendChild(wrapper);
        editorRef.current.appendChild(pAfter);
      }

      setLinkPopover(null);
      if (editorRef.current) {
        onChange(editorRef.current.innerHTML);
      }
      return;
    }

    const displayText = linkPopover.text.trim() ? linkPopover.text.trim() : rawUrl;

    const sel = window.getSelection();
    if (linkPopover.savedRange) {
      sel?.removeAllRanges();
      sel?.addRange(linkPopover.savedRange);

      const a = document.createElement('a');
      a.href = formattedUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = displayText;

      linkPopover.savedRange.deleteContents();
      linkPopover.savedRange.insertNode(a);

      const spaceNode = document.createTextNode('\u00A0');
      a.parentNode?.insertBefore(spaceNode, a.nextSibling);

      const newRange = document.createRange();
      newRange.setStartAfter(spaceNode);
      newRange.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(newRange);
    } else {
      document.execCommand('insertHTML', false, `<a href="${formattedUrl}" target="_blank" rel="noopener noreferrer">${displayText}</a>&nbsp;`);
    }

    setLinkPopover(null);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  // Selection toolbar action handlers
  const handleSelectionHeading = (headingTag: 'h1' | 'h2' | 'h3' | 'h4') => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand('formatBlock', false, `<${headingTag}>`);
    refreshNoteSections();
    onChange(editorRef.current.innerHTML);
    setTimeout(checkSelection, 50);
  };

  const handleSelectionInline = (command: 'bold' | 'italic') => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false);
    onChange(editorRef.current.innerHTML);
    setTimeout(checkSelection, 50);
  };

  const handleSelectionList = (type: 'ul' | 'ol') => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(type === 'ul' ? 'insertUnorderedList' : 'insertOrderedList', false);
    onChange(editorRef.current.innerHTML);
    setTimeout(checkSelection, 50);
  };

  const handleSelectionCode = () => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      const selectedText = sel.toString();
      document.execCommand('insertHTML', false, `<pre data-language="texto"><code>${escapeCodeText(selectedText)}</code></pre>`);
      refreshNoteSections();
      onChange(editorRef.current.innerHTML);
    } else {
      transformCurrentBlockToElement('pre');
    }
    setTimeout(checkSelection, 50);
  };

  // Check text selection for floating toolbar
  const checkSelection = useCallback(() => {
    if (linkPopover?.visible || imageModal?.visible || wikiMenu.visible) return;

    const sel = window.getSelection();
    if (
      !sel ||
      sel.isCollapsed ||
      !sel.rangeCount ||
      !editorRef.current ||
      !editorRef.current.contains(sel.anchorNode) ||
      !editorRef.current.contains(sel.focusNode)
    ) {
      setSelectionToolbar((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    const text = sel.toString().trim();
    if (!text) {
      setSelectionToolbar((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) {
      setSelectionToolbar((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    let x = rect.left + rect.width / 2;
    let y = rect.top - 46;

    if (y < 60) {
      y = rect.bottom + 8;
    }

    setSelectionToolbar({
      visible: true,
      x,
      y,
    });
  }, [linkPopover, imageModal, wikiMenu.visible]);

  // Command definitions for Slash Menu
  const commands: CommandItem[] = [
    {
      id: 'connect',
      command: 'conectar',
      title: 'Conectar Nota',
      subtitle: 'Vincular nota bidirecionalmente (wikilink)',
      description: 'Cria um vínculo bidirecional direto para outra nota do workspace, conectando os nós na visualização em gráfico.',
      syntax: '[[Título da Nota]]',
      shortcut: '[[',
      category: 'CONEXÕES',
      badge: 'WIKILINK',
      keywords: ['conectar', 'conectar nota', 'link nota', 'wikilink', 'relacao', 'grafo', '[[', 'nota'],
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <path d="M10 13a3 3 0 0 0 4 0"/>
        </svg>
      ),
      action: () => {
        removeSlashText();
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const pos = computeFloatingPosition(rect, 320, 320, 8);
          setWikiMenu({
            visible: true,
            x: pos.x,
            y: pos.y,
            query: '',
            selectedIndex: 0,
          });
        }
      },
    },
    {
      id: 'connect_card',
      command: 'card',
      title: 'Flashcard',
      subtitle: 'Badge de revisão espaçada ativa',
      description: 'Insere um flashcard integrado diretamente no texto para estudo ativo com repetição espaçada no painel de flashcards.',
      syntax: '::Pergunta::Resposta',
      shortcut: '::',
      category: 'CONEXÕES',
      badge: 'CARD',
      keywords: ['conectar card', 'flashcard', 'card', 'anki', 'revisao', 'conectar flashcard', '::'],
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
      ),
      action: () => {
        removeSlashText();
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const pos = computeFloatingPosition(rect, 320, 320, 8);
          setCardMenu({
            visible: true,
            x: pos.x,
            y: pos.y,
            query: '',
            selectedIndex: 0,
          });
        }
      },
    },
    {
      id: 'image',
      command: 'imagem',
      title: 'Imagem',
      subtitle: 'Upload de arquivo ou URL externa',
      description: 'Insere uma imagem redimensionável a partir do seu computador ou através de uma URL pública da web.',
      syntax: '![Descrição](https://...)',
      category: 'MÍDIA',
      badge: 'IMAGEM',
      keywords: ['imagem', 'image', 'foto', 'picture', 'upload', 'figura', 'img'],
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
          <circle cx="9" cy="9" r="2"/>
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
        </svg>
      ),
      action: () => openImageDialog(),
    },
    {
      id: 'drawing',
      command: 'canvas',
      title: 'Canvas / Desenho',
      subtitle: 'Quadro interativo vetorial',
      description: 'Abre um quadro de desenho vetorial com ferramentas manuais de lápis, retângulos, círculos, setas e texto.',
      syntax: 'Quadro vetorial integrado',
      category: 'MÍDIA',
      badge: 'CANVAS',
      keywords: ['desenho', 'canvas', 'excalidraw', 'quadro', 'draw', 'esboco', 'rascunho', 'diagrama'],
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
        </svg>
      ),
      action: () => {
        removeSlashText();
        setSlashMenu((prev) => ({ ...prev, visible: false }));
        setIsDrawingModalOpen(true);
      },
    },
    {
      id: 'math',
      command: 'math',
      title: 'Equação Matemática',
      subtitle: 'Fórmula científica KaTeX (LaTeX)',
      description: 'Renderiza expressões matemáticas, funções, matrizes e integrais com tipografia científica profissional KaTeX.',
      syntax: '$$ f(x) = \\int_0^1 x^2 dx $$',
      category: 'CIÊNCIA',
      badge: 'LATEX',
      keywords: ['math', 'matematica', 'funcao', 'equacao', 'formula', 'latex', 'katex', 'integral', 'fracao', 'soma', 'fx'],
      icon: (
        <span className="font-mono font-bold text-xs">
          f(x)
        </span>
      ),
      action: () => {
        const sel = window.getSelection();
        const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
        removeSlashText();
        setSlashMenu((prev) => ({ ...prev, visible: false }));
        setMathModal({ visible: true, targetNode: null, latex: '', savedRange: range });
      },
    },
    {
      id: 'h1',
      command: 'h1',
      title: 'Título 1',
      subtitle: 'Cabeçalho principal grande',
      description: 'Converte o bloco atual no cabeçalho principal de primeiro nível (H1), ideal para o tema principal da seção.',
      syntax: '# Título Principal',
      category: 'ESTRUTURA',
      badge: 'H1',
      keywords: ['titulo 1', 'h1', 'heading 1', 't1', 'grande'],
      icon: (
        <span className="font-bold text-xs font-mono">
          H1
        </span>
      ),
      action: () => transformCurrentBlockToElement('h1'),
    },
    {
      id: 'h2',
      command: 'h2',
      title: 'Título 2',
      subtitle: 'Subtítulo médio de seção',
      description: 'Converte o bloco atual em um subtítulo intermediário (H2) para divisão de tópicos principais.',
      syntax: '## Subtítulo',
      category: 'ESTRUTURA',
      badge: 'H2',
      keywords: ['titulo 2', 'h2', 'heading 2', 't2', 'medio'],
      icon: (
        <span className="font-bold text-xs font-mono">
          H2
        </span>
      ),
      action: () => transformCurrentBlockToElement('h2'),
    },
    {
      id: 'h3',
      command: 'h3',
      title: 'Título 3',
      subtitle: 'Título pequeno de tópico',
      description: 'Converte o bloco atual em um título menor de terceiro nível (H3) para subseções detalhadas.',
      syntax: '### Tópico Menor',
      category: 'ESTRUTURA',
      badge: 'H3',
      keywords: ['titulo 3', 'h3', 'heading 3', 't3', 'pequeno'],
      icon: (
        <span className="font-bold text-xs font-mono">
          H3
        </span>
      ),
      action: () => transformCurrentBlockToElement('h3'),
    },
    {
      id: 'h4',
      command: 'h4',
      title: 'Título 4',
      subtitle: 'Cabeçalho menor',
      description: 'Converte o bloco atual em um cabeçalho sutil de quarto nível (H4) para agrupamento fino de blocos.',
      syntax: '#### Subtópico',
      category: 'ESTRUTURA',
      badge: 'H4',
      keywords: ['titulo 4', 'h4', 'heading 4', 't4', 'subtopico'],
      icon: (
        <span className="font-bold text-xs font-mono">
          H4
        </span>
      ),
      action: () => transformCurrentBlockToElement('h4'),
    },
    {
      id: 'ul',
      command: 'lista',
      title: 'Lista com Marcadores',
      subtitle: 'Lista de tópicos simples',
      description: 'Cria uma lista não ordenada com marcadores (bullet points) para listar itens e ideias.',
      syntax: '- Item da lista',
      category: 'ESTRUTURA',
      badge: 'BULLET',
      keywords: ['lista', 'bullet', 'marcadores', 'pontos', 'ul', 'lista com marcadores'],
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6"/>
          <line x1="8" y1="12" x2="21" y2="12"/>
          <line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6" x2="3.01" y2="6"/>
          <line x1="3" y1="12" x2="3.01" y2="12"/>
          <line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
      ),
      action: () => transformCurrentBlockToElement('ul'),
    },
    {
      id: 'ol',
      command: 'numerada',
      title: 'Lista Numerada',
      subtitle: 'Lista ordenada sequencial',
      description: 'Cria uma sequência numerada crescente (1, 2, 3...) ideal para instruções, passos e tutoriais.',
      syntax: '1. Primeiro passo',
      category: 'ESTRUTURA',
      badge: 'NÚMEROS',
      keywords: ['lista numerada', 'numerada', 'ordenada', 'numeros', 'ol', '1.'],
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="10" y1="6" x2="21" y2="6"/>
          <line x1="10" y1="12" x2="21" y2="12"/>
          <line x1="10" y1="18" x2="21" y2="18"/>
          <path d="M4 6h1v4"/>
          <path d="M4 10h2"/>
          <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>
        </svg>
      ),
      action: () => transformCurrentBlockToElement('ol'),
    },
    {
      id: 'code',
      command: 'codigo',
      title: 'Bloco de Código',
      subtitle: 'Realce de sintaxe e numeração',
      description: 'Cria um bloco isolado com fonte monoespaçada e realce de sintaxe para programação e scripts.',
      syntax: '```javascript',
      category: 'BLOCOS',
      badge: 'CÓDIGO',
      keywords: ['codigo', 'code', 'bloco de codigo', 'programacao', 'linguagem', 'pre', 'script', 'dev'],
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6"/>
          <polyline points="8 6 2 12 8 18"/>
        </svg>
      ),
      action: () => transformCurrentBlockToElement('pre'),
    },
    {
      id: 'bold',
      command: 'negrito',
      title: 'Negrito',
      subtitle: 'Destaque forte no texto',
      description: 'Aplica espessura visual em negrito ao texto selecionado ou na posição atual do cursor.',
      syntax: '**texto em negrito**',
      shortcut: 'Ctrl + B',
      category: 'FORMATAÇÃO',
      badge: 'BOLD',
      keywords: ['negrito', 'bold', 'forte', 'b'],
      icon: (
        <span className="font-bold text-xs font-mono">
          B
        </span>
      ),
      action: () => applyInlineFormat('bold'),
    },
    {
      id: 'italic',
      command: 'italico',
      title: 'Itálico',
      subtitle: 'Texto com ênfase inclinada',
      description: 'Aplica inclinação visual ao texto selecionado para destacar termos estrangeiros, títulos ou citações.',
      syntax: '*texto em itálico*',
      shortcut: 'Ctrl + I',
      category: 'FORMATAÇÃO',
      badge: 'ITALIC',
      keywords: ['italico', 'italic', 'inclinado', 'i', 'enfase'],
      icon: (
        <span className="italic font-serif text-xs font-bold">
          I
        </span>
      ),
      action: () => applyInlineFormat('italic'),
    },
    {
      id: 'link',
      command: 'link',
      title: 'Link Web',
      subtitle: 'Hiperlink para URL externa',
      description: 'Insere um hiperlink clicável direcionando para qualquer página ou endereço na internet.',
      syntax: '[Texto](https://...)',
      shortcut: 'Ctrl + K',
      category: 'FORMATAÇÃO',
      badge: 'LINK',
      keywords: ['link', 'url', 'hiperlink', 'site', 'adicionar link'],
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
      ),
      action: () => {
        removeSlashText();
        openLinkDialog('');
      },
    },
  ];

  const filteredCommands = commands.filter((cmd) => {
    if (!slashMenu.query) return true;
    const q = slashMenu.query.toLowerCase().trim();
    return (
      cmd.command.toLowerCase().includes(q) ||
      cmd.title.toLowerCase().includes(q) ||
      cmd.subtitle.toLowerCase().includes(q) ||
      cmd.badge.toLowerCase().includes(q) ||
      cmd.keywords.some((k) => k.toLowerCase().includes(q))
    );
  });

  // Filter notes for [[ Wikilinks menu
  const filteredWikiNotas = notas.filter((n) => {
    if (!wikiMenu.query) return true;
    const q = wikiMenu.query.toLowerCase().trim();
    return n.titulo.toLowerCase().includes(q);
  });

  // Filter flashcards for :: Card Connection menu
  const filteredCards = cards.filter((c) => {
    if (!cardMenu.query) return true;
    const q = cardMenu.query.toLowerCase().trim();
    return (
      c.frente.toLowerCase().includes(q) ||
      c.verso.toLowerCase().includes(q) ||
      (c.deck?.nome && c.deck.nome.toLowerCase().includes(q))
    );
  });

  const checkSlashTrigger = useCallback(() => {
    if (!slashMenuEnabled || linkPopover?.visible || imageModal?.visible || wikiMenu.visible || cardMenu.visible) return;

    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) {
      setSlashMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    const range = sel.getRangeAt(0);
    const textNode = range.startContainer;

    if (textNode.nodeType === Node.TEXT_NODE && textNode.nodeValue) {
      const text = textNode.nodeValue;
      const caretOffset = range.startOffset;

      const textBeforeCaret = text.slice(0, caretOffset);
      const lastSlashIndex = textBeforeCaret.lastIndexOf('/');

      if (
        lastSlashIndex !== -1 &&
        (lastSlashIndex === 0 || /\s/.test(textBeforeCaret[lastSlashIndex - 1]))
      ) {
        const query = textBeforeCaret.slice(lastSlashIndex + 1);

        if (!/\s/.test(query)) {
          const clonedRange = range.cloneRange();
          clonedRange.setStart(textNode, lastSlashIndex);
          clonedRange.setEnd(textNode, caretOffset);
          const rect = clonedRange.getBoundingClientRect();
          const { x, y } = computeSideFloatingPosition(rect, 480, 360, 14);

          setSlashMenu((prev) => ({
            visible: true,
            x,
            y,
            query,
            selectedIndex: prev.query === query ? prev.selectedIndex : 0,
          }));
          return;
        }
      }
    }

    setSlashMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  }, [linkPopover, imageModal, wikiMenu.visible, cardMenu.visible]);

  // Check [[ Wikilink trigger
  const checkWikiTrigger = useCallback(() => {
    if (!wikilinksEnabled || linkPopover?.visible || imageModal?.visible || slashMenu.visible || cardMenu.visible) return;

    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) {
      setWikiMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    const range = sel.getRangeAt(0);
    const textNode = range.startContainer;

    if (textNode.nodeType === Node.TEXT_NODE && textNode.nodeValue) {
      const text = textNode.nodeValue;
      const caretOffset = range.startOffset;

      const textBeforeCaret = text.slice(0, caretOffset);
      const lastWikiIndex = textBeforeCaret.lastIndexOf('[[');

      if (lastWikiIndex !== -1) {
        const query = textBeforeCaret.slice(lastWikiIndex + 2);

        // Don't show if there's a closing bracket or newline
        if (!query.includes(']]') && !query.includes('\n')) {
          const clonedRange = range.cloneRange();
          clonedRange.setStart(textNode, lastWikiIndex);
          clonedRange.setEnd(textNode, caretOffset);
          const rect = clonedRange.getBoundingClientRect();

          const { x, y } = computeFloatingPosition(rect, 280, 300, 8);

          setWikiMenu((prev) => ({
            visible: true,
            x,
            y,
            query,
            selectedIndex: prev.query === query ? prev.selectedIndex : 0,
          }));
          return;
        }
      }
    }

    setWikiMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  }, [linkPopover, imageModal, slashMenu.visible, cardMenu.visible]);

  // Check :: Card Connection trigger
  const checkCardTrigger = useCallback(() => {
    if (linkPopover?.visible || imageModal?.visible || slashMenu.visible || wikiMenu.visible) return;

    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) {
      setCardMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    const range = sel.getRangeAt(0);
    const textNode = range.startContainer;

    if (textNode.nodeType === Node.TEXT_NODE && textNode.nodeValue) {
      const text = textNode.nodeValue;
      const caretOffset = range.startOffset;

      const textBeforeCaret = text.slice(0, caretOffset);
      const lastCardIndex = textBeforeCaret.lastIndexOf('::');

      if (lastCardIndex !== -1) {
        const query = textBeforeCaret.slice(lastCardIndex + 2);

        if (!query.includes('\n')) {
          const clonedRange = range.cloneRange();
          clonedRange.setStart(textNode, lastCardIndex);
          clonedRange.setEnd(textNode, caretOffset);
          const rect = clonedRange.getBoundingClientRect();

          const { x, y } = computeFloatingPosition(rect, 280, 300, 8);

          setCardMenu((prev) => ({
            visible: true,
            x,
            y,
            query,
            selectedIndex: prev.query === query ? prev.selectedIndex : 0,
          }));
          return;
        }
      }
    }

    setCardMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  }, [linkPopover, imageModal, slashMenu.visible, wikiMenu.visible]);

  const executeCommand = (cmd: CommandItem) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    cmd.action(editorRef.current);
    setSlashMenu((prev) => ({ ...prev, visible: false }));
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Card connection :: Menu Navigation
    if (cardMenu.visible && filteredCards.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        isKeyboardNavRef.current = true;
        setCardMenu((prev) => {
          const nextIndex = (prev.selectedIndex + 1) % filteredCards.length;
          cardItemRefs.current[nextIndex]?.scrollIntoView({ block: 'nearest' });
          return { ...prev, selectedIndex: nextIndex };
        });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        isKeyboardNavRef.current = true;
        setCardMenu((prev) => {
          const nextIndex = (prev.selectedIndex - 1 + filteredCards.length) % filteredCards.length;
          cardItemRefs.current[nextIndex]?.scrollIntoView({ block: 'nearest' });
          return { ...prev, selectedIndex: nextIndex };
        });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = filteredCards[cardMenu.selectedIndex];
        if (selected) {
          insertCardLink(selected);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setCardMenu((prev) => ({ ...prev, visible: false }));
        return;
      }
    }

    // Wikilink [[ Menu Navigation
    if (wikiMenu.visible && filteredWikiNotas.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        isKeyboardNavRef.current = true;
        setWikiMenu((prev) => {
          const nextIndex = (prev.selectedIndex + 1) % filteredWikiNotas.length;
          wikiItemRefs.current[nextIndex]?.scrollIntoView({ block: 'nearest' });
          return { ...prev, selectedIndex: nextIndex };
        });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        isKeyboardNavRef.current = true;
        setWikiMenu((prev) => {
          const nextIndex = (prev.selectedIndex - 1 + filteredWikiNotas.length) % filteredWikiNotas.length;
          wikiItemRefs.current[nextIndex]?.scrollIntoView({ block: 'nearest' });
          return { ...prev, selectedIndex: nextIndex };
        });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = filteredWikiNotas[wikiMenu.selectedIndex];
        if (selected) {
          insertNoteLink(selected);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setWikiMenu((prev) => ({ ...prev, visible: false }));
        return;
      }
    }

    // Slash menu navigation
    if (slashMenu.visible && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        isKeyboardNavRef.current = true;
        setSlashMenu((prev) => {
          const nextIndex = (prev.selectedIndex + 1) % filteredCommands.length;
          itemRefs.current[nextIndex]?.scrollIntoView({ block: 'nearest' });
          return {
            ...prev,
            selectedIndex: nextIndex,
          };
        });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        isKeyboardNavRef.current = true;
        setSlashMenu((prev) => {
          const nextIndex = (prev.selectedIndex - 1 + filteredCommands.length) % filteredCommands.length;
          itemRefs.current[nextIndex]?.scrollIntoView({ block: 'nearest' });
          return {
            ...prev,
            selectedIndex: nextIndex,
          };
        });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = filteredCommands[slashMenu.selectedIndex];
        if (selected) {
          executeCommand(selected);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashMenu((prev) => ({ ...prev, visible: false }));
        return;
      }
    }

    // Code block tab indent helper
    if (e.key === 'Tab' && !slashMenu.visible && !wikiMenu.visible) {
      const sel = window.getSelection();
      if (sel && sel.anchorNode) {
        let node: Node | null = sel.anchorNode;
        let inCode = false;
        while (node && node !== editorRef.current) {
          if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toLowerCase() === 'pre') {
            inCode = true;
            break;
          }
          node = node.parentNode;
        }
        if (inCode) {
          e.preventDefault();
          document.execCommand('insertText', false, '  ');
        }
      }
    }

    // Schedule line update after keyboard action (e.g. Enter, backspace, typing)
    requestAnimationFrame(() => {
      updateCursorLine();
    });
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    updateCursorLine();
    if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
      return;
    }
    checkSlashTrigger();
    checkWikiTrigger();
    checkCardTrigger();
    checkSelection();
  };

  // CLIPBOARD PASTE IMAGE HANDLER
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            const sel = window.getSelection();
            const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
            uploadImageFile(file, range);
            return;
          }
        }
      }
    }

    // Check if pasted plain text is markdown image ![alt](url) or direct image URL
    const text = e.clipboardData?.getData('text/plain')?.trim();
    if (text) {
      const mdImgMatch = text.match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/uploads\/[^\s)]+|data:image\/[^\s)]+)\)$/);
      if (mdImgMatch) {
        e.preventDefault();
        const alt = mdImgMatch[1] || 'Imagem';
        const src = mdImgMatch[2];
        const sel = window.getSelection();
        const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
        insertImageAtRange(src, alt, range);
        return;
      }

      if (/^https?:\/\/[^\s]+?\.(png|jpe?g|webp|gif|svg)(\?[^\s]*)?$/i.test(text)) {
        e.preventDefault();
        const sel = window.getSelection();
        const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
        insertImageAtRange(text, 'Imagem', range);
        return;
      }
    }
  };

  // DRAG & DROP IMAGE HANDLER
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
          uploadImageFile(file);
        }
      }
    }
  };

  // Handle mousedown on editor for Image & Drawing Resize Handles
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const codeBlock = target.closest('pre');
    if (codeBlock && editorRef.current?.contains(codeBlock)) activeCodeBlockRef.current = codeBlock as HTMLPreElement;

    // YouTube resize handle click
    if (target.classList.contains('synap-youtube-resize-handle')) {
      e.preventDefault();
      e.stopPropagation();
      const wrapper = target.closest('.synap-youtube-wrapper') as HTMLElement | null;
      if (wrapper) {
        const iframe = wrapper.querySelector('iframe');
        if (iframe) iframe.style.pointerEvents = 'none';

        resizingRef.current = {
          wrapper,
          startX: e.clientX,
          startY: e.clientY,
          startWidth: wrapper.offsetWidth,
          startHeight: wrapper.offsetHeight,
          type: 'youtube_width',
        };
      }
      return;
    }

    // Image resize handle click
    if (target.classList.contains('synap-resize-handle')) {
      e.preventDefault();
      e.stopPropagation();
      const wrapper = target.closest('.synap-image-wrapper') as HTMLElement | null;
      if (wrapper) {
        resizingRef.current = {
          wrapper,
          startX: e.clientX,
          startY: e.clientY,
          startWidth: wrapper.offsetWidth,
          startHeight: wrapper.offsetHeight,
          type: 'image_width',
        };
      }
      return;
    }

    // Drawing height resize handle click
    if (target.classList.contains('synap-drawing-resize-handle')) {
      e.preventDefault();
      e.stopPropagation();
      const wrapper = target.closest('.synap-drawing-wrapper') as HTMLElement | null;
      if (wrapper) {
        resizingRef.current = {
          wrapper,
          startX: e.clientX,
          startY: e.clientY,
          startWidth: wrapper.offsetWidth,
          startHeight: wrapper.offsetHeight,
          type: 'drawing_height',
        };
      }
      return;
    }
  };

  // Handle click on editor surface, wikilinks, cardlinks, drawing embeds, links, or image delete buttons
  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // Delete embedded drawing button click
    const deleteDrawingBtn = target.closest('.synap-drawing-btn-delete');
    if (deleteDrawingBtn) {
      e.preventDefault();
      e.stopPropagation();
      const wrapper = deleteDrawingBtn.closest('.synap-drawing-wrapper');
      if (wrapper) {
        wrapper.remove();
        if (editorRef.current) {
          onChange(editorRef.current.innerHTML);
        }
      }
      return;
    }

    // Edit embedded drawing button / canvas click
    const editDrawingBtn = target.closest('.synap-drawing-btn-edit') || target.closest('.synap-drawing-canvas-container');
    if (editDrawingBtn) {
      e.preventDefault();
      e.stopPropagation();
      const wrapper = editDrawingBtn.closest('.synap-drawing-wrapper');
      if (wrapper) {
        const drawingId = wrapper.getAttribute('data-drawing-id');
        if (drawingId) {
          const found = notas.find((n) => n.id === drawingId);
          if (found) {
            setActiveDrawingEdit(found);
          } else {
            api(`/notas/${drawingId}`).then((nota) => {
              if (nota) setActiveDrawingEdit(nota);
            }).catch((err) => console.error('Erro ao carregar desenho', err));
          }
        }
      }
      return;
    }

    // Delete image button click
    const deleteBtn = target.closest('.synap-img-btn-delete');
    if (deleteBtn) {
      e.preventDefault();
      e.stopPropagation();
      const wrapper = deleteBtn.closest('.synap-image-wrapper');
      if (wrapper) {
        const imgEl = wrapper.querySelector('img') as HTMLImageElement | null;
        if (imgEl) {
          const src = imgEl.getAttribute('src') || imgEl.src;
          // If the image is hosted on /uploads/, delete from backend
          const match = src.match(/\/uploads\/([^/?#]+)/);
          if (match && match[1]) {
            const filename = match[1];
            api(`/upload/${filename}`, { method: 'DELETE' }).catch((err) =>
              console.error('Erro ao deletar imagem do servidor:', err)
            );
          }
        }
        wrapper.remove();
        if (editorRef.current) {
          onChange(editorRef.current.innerHTML);
        }
      }
      return;
    }

    // YouTube Container Delete button click
    const ytDeleteBtn = target.closest('.synap-youtube-btn-delete') as HTMLElement | null;
    if (ytDeleteBtn && editorRef.current?.contains(ytDeleteBtn)) {
      e.preventDefault();
      e.stopPropagation();
      const ytWrapper = ytDeleteBtn.closest('.synap-youtube-wrapper');
      if (ytWrapper) {
        ytWrapper.remove();
        if (editorRef.current) {
          onChange(editorRef.current.innerHTML);
        }
      }
      return;
    }

    // Math Block Delete button click
    const mathDeleteBtn = target.closest('.synap-math-btn-delete') as HTMLElement | null;
    if (mathDeleteBtn && editorRef.current?.contains(mathDeleteBtn)) {
      e.preventDefault();
      e.stopPropagation();
      const mathBlock = mathDeleteBtn.closest('.synap-math-block');
      if (mathBlock) {
        mathBlock.remove();
        if (editorRef.current) {
          onChange(editorRef.current.innerHTML);
        }
      }
      return;
    }

    // Math Block Click (Open math editor modal)
    const mathBlock = target.closest('.synap-math-block') as HTMLElement | null;
    if (mathBlock && editorRef.current?.contains(mathBlock)) {
      e.preventDefault();
      e.stopPropagation();
      const currentLatex = mathBlock.getAttribute('data-latex') || '';
      setMathModal({ visible: true, targetNode: mathBlock, latex: currentLatex, savedRange: null });
      return;
    }

    // Cardlink Click (Open linked flashcard modal)
    const cardLinkEl = target.closest('a.synap-cardlink') as HTMLAnchorElement | null;
    if (cardLinkEl && editorRef.current?.contains(cardLinkEl)) {
      e.preventDefault();
      e.stopPropagation();
      const targetCardId = cardLinkEl.getAttribute('data-card-id');
      if (targetCardId && onOpenCard) {
        const found = cards.find((c) => c.id === targetCardId);
        if (found) {
          onOpenCard(found);
        }
      }
      return;
    }

    // Wikilink Click (Open linked note)
    const wikiLinkEl = target.closest('a.synap-wikilink') as HTMLAnchorElement | null;
    if (wikiLinkEl && editorRef.current?.contains(wikiLinkEl)) {
      e.preventDefault();
      e.stopPropagation();
      const targetNoteId = wikiLinkEl.getAttribute('data-note-id');
      if (targetNoteId && onOpenNota) {
        const found = notas.find((n) => n.id === targetNoteId);
        if (found) {
          onOpenNota(found);
        }
      }
      return;
    }

    // External Link click
    const linkEl = target.closest('a') as HTMLAnchorElement | null;
    if (linkEl && editorRef.current?.contains(linkEl) && !linkEl.classList.contains('synap-wikilink') && !linkEl.classList.contains('synap-cardlink')) {
      const href = linkEl.getAttribute('href') || linkEl.href;

      if (e.ctrlKey || e.metaKey) {
        window.open(href, '_blank', 'noopener,noreferrer');
        return;
      }

      const rect = linkEl.getBoundingClientRect();
      const pos = computeFloatingPosition(rect, 360, 45, 6);

      setLinkTooltip({
        visible: true,
        x: pos.x,
        y: pos.y,
        url: href,
        linkElement: linkEl,
      });
      setSelectionToolbar((prev) => ({ ...prev, visible: false }));
      setSlashMenu((prev) => ({ ...prev, visible: false }));
      setWikiMenu((prev) => ({ ...prev, visible: false }));
      return;
    }

    setLinkTooltip(null);
    checkSlashTrigger();
    checkWikiTrigger();
    checkSelection();
  };

  const handleRemoveLink = () => {
    if (!linkTooltip?.linkElement) return;
    const linkEl = linkTooltip.linkElement;
    const parent = linkEl.parentNode;
    if (parent) {
      while (linkEl.firstChild) {
        parent.insertBefore(linkEl.firstChild, linkEl);
      }
      parent.removeChild(linkEl);
    }
    setLinkTooltip(null);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleCopyLink = () => {
    if (!linkTooltip?.url) return;
    navigator.clipboard.writeText(linkTooltip.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Close menus if clicked outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        editorRef.current &&
        !editorRef.current.contains(e.target as Node)
      ) {
        setSlashMenu((prev) => ({ ...prev, visible: false }));
      }
      if (
        wikiMenuRef.current &&
        !wikiMenuRef.current.contains(e.target as Node) &&
        editorRef.current &&
        !editorRef.current.contains(e.target as Node)
      ) {
        setWikiMenu((prev) => ({ ...prev, visible: false }));
      }
      if (
        selectionToolbarRef.current &&
        !selectionToolbarRef.current.contains(e.target as Node) &&
        editorRef.current &&
        !editorRef.current.contains(e.target as Node)
      ) {
        setSelectionToolbar((prev) => ({ ...prev, visible: false }));
      }
      if (
        linkPopoverRef.current &&
        !linkPopoverRef.current.contains(e.target as Node)
      ) {
        setLinkPopover(null);
      }
      if (
        linkTooltipRef.current &&
        !linkTooltipRef.current.contains(e.target as Node) &&
        editorRef.current &&
        !editorRef.current.contains(e.target as Node)
      ) {
        setLinkTooltip(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div 
      className="relative w-full h-full flex flex-col cursor-text" 
      onClick={() => editorRef.current?.focus()}
      onMouseMove={(event) => updateCodeBlockControlFromTarget(event.target)}
      onMouseLeave={() => updateCodeBlockControlFromTarget(null)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Real-time Multiplayer Cursors (Miro/Figma style) */}
      {workspaceId && notaId && isCollaborative && (
        <LiveCursors cursors={cursors} textEditor={editorRef.current} />
      )}

      {/* Hidden File Input for Image Upload */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            uploadImageFile(file, imageModal?.savedRange);
            setImageModal(null);
            e.target.value = '';
          }
        }}
      />

      {/* Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 bg-[var(--background)]/85 border-2 border-dashed border-[var(--foreground)] rounded-xl flex flex-col items-center justify-center pointer-events-none backdrop-blur-xs transition-all">
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-[var(--foreground)] animate-bounce">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span className="text-base font-semibold text-[var(--foreground)]">Solte sua imagem aqui</span>
          <span className="text-xs text-[var(--accents-5)] mt-1">PNG, JPG, GIF, WebP, SVG</span>
        </div>
      )}

      {/* Uploading Status Banner */}
      {isUploading && (
        <div className="fixed bottom-6 right-6 z-50 bg-[var(--background)] border border-[var(--accents-2)] shadow-2xl rounded-lg px-4 py-2.5 flex items-center gap-3 animate-in slide-in-from-bottom-4 text-xs font-medium text-[var(--foreground)]">
          <svg className="animate-spin h-4 w-4 text-[var(--foreground)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          Fazendo upload da imagem...
        </div>
      )}

      {/* Floating Link Preview Tooltip */}
      {linkTooltip?.visible && (
        <div
          ref={linkTooltipRef}
          style={{
            position: 'fixed',
            top: linkTooltip.y,
            left: linkTooltip.x,
            zIndex: 1002,
          }}
          className="flex items-center gap-1.5 bg-[var(--background)]/95 border border-[var(--accents-2)] rounded-md shadow-2xl p-1 text-xs backdrop-blur-md animate-smooth-pop select-none max-w-[400px]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Clean URL link */}
          <a
            href={linkTooltip.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--foreground)] hover:text-white hover:bg-[var(--accents-1)] transition-colors truncate max-w-[180px] font-mono text-[11px]"
            title="Abrir link em nova aba"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-70 shrink-0">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            <span className="truncate">{linkTooltip.url.replace(/^https?:\/\//, '')}</span>
          </a>

          <div className="w-[1px] h-3 bg-[var(--accents-2)]" />

          {/* Geist "Abrir" Action Button */}
          <button
            type="button"
            onClick={() => window.open(linkTooltip.url, '_blank', 'noopener,noreferrer')}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-[var(--foreground)] bg-[var(--accents-1)] border border-[var(--accents-2)] hover:border-[var(--accents-4)] hover:bg-[var(--accents-2)] transition-all cursor-pointer shadow-xs active:scale-[0.97]"
            title="Abrir link em nova aba (Ctrl + Clique)"
          >
            <span>Abrir</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </button>

          {/* Geist "Copiar" Action Button */}
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-[var(--accents-5)] hover:text-[var(--foreground)] hover:bg-[var(--accents-1)] transition-colors cursor-pointer"
            title="Copiar URL para a área de transferência"
          >
            {copied ? (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span className="text-[var(--foreground)] font-medium">Copiado</span>
              </>
            ) : (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="13" height="13" x="9" y="9" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                <span>Copiar</span>
              </>
            )}
          </button>

          {/* Geist "Remover" Action Button */}
          <button
            type="button"
            onClick={handleRemoveLink}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-[var(--accents-4)] hover:text-[var(--error)] hover:bg-[var(--accents-1)] transition-colors cursor-pointer"
            title="Remover hiperlink do texto"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            <span>Remover</span>
          </button>
        </div>
      )}

      {/* Image Upload / Embed Modal */}
      {imageModal?.visible && (
        <div 
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150 font-sansation"
          onClick={() => setImageModal(null)}
        >
          <div 
            ref={imagePopoverRef}
            className="w-full max-w-md bg-[#181818] border border-white/10 rounded-none shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-white/10 bg-[#141414] flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <div className="w-5 h-5 rounded-none bg-white text-black flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="18" x="3" y="3" rx="0" ry="0"/>
                    <circle cx="9" cy="9" r="2"/>
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                  </svg>
                </div>
                <span>Adicionar Imagem</span>
              </h3>
              <button 
                type="button"
                onClick={() => setImageModal(null)}
                className="w-6 h-6 flex items-center justify-center rounded-none text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                aria-label="Fechar"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              {/* Tabs */}
              <div className="flex border-b border-white/10">
                <button
                  type="button"
                  onClick={() => setImageModal(prev => prev ? { ...prev, tab: 'upload' } : null)}
                  className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer rounded-none ${
                    imageModal.tab === 'upload'
                      ? 'border-white text-white'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Upload do Dispositivo
                </button>
                <button
                  type="button"
                  onClick={() => setImageModal(prev => prev ? { ...prev, tab: 'url' } : null)}
                  className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer rounded-none ${
                    imageModal.tab === 'url'
                      ? 'border-white text-white'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Link da Web (URL)
                </button>
              </div>

              {imageModal.tab === 'upload' ? (
                <div className="flex flex-col gap-3">
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border border-dashed border-white/20 hover:border-white/40 bg-white/5 rounded-none p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors text-center group"
                  >
                    <div className="w-9 h-9 rounded-none bg-white/10 border border-white/10 flex items-center justify-center text-zinc-400 group-hover:text-white transition-colors">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                    </div>
                    <span className="text-xs font-semibold text-white">Escolha um arquivo do seu computador</span>
                    <span className="text-[11px] text-zinc-500">ou arraste e solte direto no editor</span>
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setImageModal(null)}
                      className="h-8 px-3.5 text-xs font-semibold rounded-none bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-8 px-4 text-xs font-bold rounded-none bg-white text-black hover:bg-zinc-200 shadow-xs transition-colors cursor-pointer"
                    >
                      Procurar Arquivo
                    </button>
                  </div>
                </div>
              ) : (
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (imageModal.url.trim()) {
                      insertImageAtRange(imageModal.url.trim(), 'Imagem', imageModal.savedRange);
                      setImageModal(null);
                    }
                  }}
                  className="flex flex-col gap-3"
                >
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-mono font-semibold uppercase tracking-wider text-zinc-400">URL da Imagem</label>
                    <input
                      type="text"
                      autoFocus
                      placeholder="https://exemplo.com/imagem.png"
                      value={imageModal.url}
                      onChange={(e) => setImageModal(prev => prev ? { ...prev, url: e.target.value } : null)}
                      className="w-full h-8 px-3 text-xs bg-white/5 border border-white/10 focus:border-white/30 rounded-none outline-none text-white placeholder-zinc-500 transition-colors"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setImageModal(null)}
                      className="h-8 px-3.5 text-xs font-semibold rounded-none bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={!imageModal.url.trim()}
                      className="h-8 px-4 text-xs font-bold rounded-none bg-white text-black hover:bg-zinc-200 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Inserir Imagem
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Selection Formatting Toolbar */}
      {selectionToolbar.visible && !linkPopover?.visible && !linkTooltip?.visible && !imageModal?.visible && !wikiMenu.visible && (
        <div
          ref={selectionToolbarRef}
          style={{
            position: 'fixed',
            top: selectionToolbar.y,
            left: selectionToolbar.x,
            transform: 'translateX(-50%)',
            zIndex: 1000,
          }}
          className="flex items-center gap-1 bg-[var(--background)]/90 border border-[var(--accents-2)] rounded-lg shadow-2xl px-1.5 py-1 text-sm backdrop-blur-md animate-smooth-pop select-none"
        >
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleSelectionHeading('h1');
            }}
            className="px-2 py-1 rounded text-xs font-bold text-[var(--foreground)] hover:bg-[var(--accents-2)] transition-colors cursor-pointer"
            title="Título 1"
          >
            H1
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleSelectionHeading('h2');
            }}
            className="px-2 py-1 rounded text-xs font-bold text-[var(--foreground)] hover:bg-[var(--accents-2)] transition-colors cursor-pointer"
            title="Título 2"
          >
            H2
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleSelectionHeading('h3');
            }}
            className="px-2 py-1 rounded text-xs font-bold text-[var(--foreground)] hover:bg-[var(--accents-2)] transition-colors cursor-pointer"
            title="Título 3"
          >
            H3
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleSelectionHeading('h4');
            }}
            className="px-2 py-1 rounded text-xs font-bold text-[var(--foreground)] hover:bg-[var(--accents-2)] transition-colors cursor-pointer"
            title="Título 4"
          >
            H4
          </button>

          <div className="w-[1px] h-4 bg-[var(--accents-2)] mx-0.5" />

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleSelectionInline('bold');
            }}
            className="w-7 h-7 flex items-center justify-center rounded text-sm font-bold text-[var(--foreground)] hover:bg-[var(--accents-2)] transition-colors cursor-pointer"
            title="Negrito"
          >
            B
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleSelectionInline('italic');
            }}
            className="w-7 h-7 flex items-center justify-center rounded text-sm italic font-serif text-[var(--foreground)] hover:bg-[var(--accents-2)] transition-colors cursor-pointer"
            title="Itálico"
          >
            I
          </button>

          <div className="w-[1px] h-4 bg-[var(--accents-2)] mx-0.5" />

          {/* Bullet List */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleSelectionList('ul');
            }}
            className="w-7 h-7 flex items-center justify-center rounded text-sm text-[var(--foreground)] hover:bg-[var(--accents-2)] transition-colors cursor-pointer"
            title="Lista com Marcadores"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"/>
              <line x1="8" y1="12" x2="21" y2="12"/>
              <line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/>
              <line x1="3" y1="12" x2="3.01" y2="12"/>
              <line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
          </button>

          {/* Numbered List */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleSelectionList('ol');
            }}
            className="w-7 h-7 flex items-center justify-center rounded text-sm text-[var(--foreground)] hover:bg-[var(--accents-2)] transition-colors cursor-pointer"
            title="Lista Numerada"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="10" y1="6" x2="21" y2="6"/>
              <line x1="10" y1="12" x2="21" y2="12"/>
              <line x1="10" y1="18" x2="21" y2="18"/>
              <path d="M4 6h1v4"/>
              <path d="M4 10h2"/>
              <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>
            </svg>
          </button>

          {/* Code Block */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleSelectionCode();
            }}
            className="w-7 h-7 flex items-center justify-center rounded text-sm text-[var(--foreground)] hover:bg-[var(--accents-2)] transition-colors cursor-pointer"
            title="Bloco de Código"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6"/>
              <polyline points="8 6 2 12 8 18"/>
            </svg>
          </button>

          <div className="w-[1px] h-4 bg-[var(--accents-2)] mx-0.5" />

          {/* Connect Note in selection */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              const sel = window.getSelection();
              if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                setWikiMenu({
                  visible: true,
                  x: rect.left,
                  y: rect.bottom + 8,
                  query: '',
                  selectedIndex: 0,
                });
              }
            }}
            className="w-7 h-7 flex items-center justify-center rounded text-sm text-[var(--foreground)] hover:bg-[var(--accents-2)] transition-colors cursor-pointer"
            title="Conectar a outra Nota ([[)"
          >
            <span className="font-bold text-xs">[[</span>
          </button>

          {/* Link */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              const sel = window.getSelection();
              openLinkDialog(sel?.toString() || '');
            }}
            className="w-7 h-7 flex items-center justify-center rounded text-sm text-[var(--foreground)] hover:bg-[var(--accents-2)] transition-colors cursor-pointer"
            title="Adicionar Link Web"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </button>

          {/* Add Image in Selection Toolbar */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              openImageDialog();
            }}
            className="w-7 h-7 flex items-center justify-center rounded text-sm text-[var(--foreground)] hover:bg-[var(--accents-2)] transition-colors cursor-pointer"
            title="Adicionar Imagem"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
              <circle cx="9" cy="9" r="2"/>
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
            </svg>
          </button>
        </div>
      )}

      {/* Floating Link Popover Dialog */}
      {linkPopover?.visible && (
        <div
          ref={linkPopoverRef}
          style={{
            position: 'fixed',
            top: linkPopover.y,
            left: linkPopover.x,
            zIndex: 1001,
          }}
          className="w-[320px] bg-[var(--background)]/95 border border-[var(--accents-2)] rounded-lg shadow-2xl p-3 text-sm backdrop-blur-md animate-smooth-pop"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-xs font-semibold text-[var(--foreground)] mb-2 flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            Inserir Link Web
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleInsertLink();
            }}
            className="flex flex-col gap-2"
          >
            <input
              type="text"
              autoFocus
              placeholder="URL (ex: https://exemplo.com)..."
              value={linkPopover.url}
              onChange={(e) => setLinkPopover((prev) => (prev ? { ...prev, url: e.target.value } : null))}
              className="w-full px-2.5 py-1.5 text-[13px] bg-[var(--background)] border border-[var(--accents-2)] rounded-md outline-none focus:border-[var(--accents-5)] text-[var(--foreground)] transition-colors"
            />

            <input
              type="text"
              placeholder="Texto de exibição (opcional)..."
              value={linkPopover.text}
              onChange={(e) => setLinkPopover((prev) => (prev ? { ...prev, text: e.target.value } : null))}
              className="w-full px-2.5 py-1.5 text-[13px] bg-[var(--background)] border border-[var(--accents-2)] rounded-md outline-none focus:border-[var(--accents-5)] text-[var(--foreground)] transition-colors"
            />

            <div className="flex justify-end gap-2 mt-1">
              <button
                type="button"
                onClick={() => setLinkPopover(null)}
                className="px-2.5 py-1 text-xs rounded-md text-[var(--accents-5)] hover:bg-[var(--accents-2)] hover:text-[var(--foreground)] transition-all active:scale-95 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-3 py-1 text-xs font-medium rounded-md bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 transition-all active:scale-95 cursor-pointer"
              >
                Inserir
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Floating Wikilink [[ Notes Menu */}
      {wikiMenu.visible && (
        <div
          ref={wikiMenuRef}
          style={{
            position: 'fixed',
            top: wikiMenu.y,
            left: wikiMenu.x,
            zIndex: 1000,
          }}
          className="w-[320px] max-h-[320px] overflow-y-auto no-scrollbar bg-[#181818] border border-white/10 rounded-none shadow-2xl shadow-black/50 p-1.5 text-sm animate-smooth-pop select-none font-sansation"
        >
          <div className="px-2.5 py-1.5 text-[11px] font-bold tracking-wider text-zinc-400 uppercase select-none flex items-center gap-1.5 border-b border-white/10 mb-1 font-mono">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            <span>Conectar Nota</span>
            <span className="text-[10px] text-zinc-500 normal-case font-normal">(Wikilink)</span>
          </div>

          {filteredWikiNotas.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-zinc-500">
              Nenhuma nota encontrada
            </div>
          ) : (
            filteredWikiNotas.map((nota, idx) => {
              const isSelected = idx === wikiMenu.selectedIndex;
              const isDrawing = nota.tipo === 'desenho';
              return (
                <button
                  key={nota.id}
                  ref={(el) => {
                    wikiItemRefs.current[idx] = el;
                  }}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    insertNoteLink(nota);
                  }}
                  onMouseMove={() => {
                    if (isKeyboardNavRef.current) isKeyboardNavRef.current = false;
                    if (wikiMenu.selectedIndex !== idx) {
                      setWikiMenu((prev) => ({ ...prev, selectedIndex: idx }));
                    }
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-none text-left transition-colors duration-100 cursor-pointer select-none ${
                    isSelected
                      ? 'bg-white/10 text-white font-medium'
                      : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-center w-5 h-5 shrink-0 text-zinc-400">
                    {isDrawing ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                        <path d="M2 2l7.586 7.586"/>
                        <circle cx="11" cy="11" r="2"/>
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-[13px] text-white truncate leading-snug">
                      {nota.titulo || (isDrawing ? 'Desenho sem título' : 'Nota sem título')}
                    </span>
                    <span className="text-[11px] text-zinc-500 truncate leading-snug">
                      {isDrawing
                        ? 'Canvas / Desenho vetorial'
                        : nota.conteudo
                          ? (nota.conteudo.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim().slice(0, 45) || 'Nota vazia')
                          : 'Nota vazia'}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Floating Card Connection :: Cards Menu */}
      {cardMenu.visible && (
        <div
          ref={cardMenuRef}
          style={{
            position: 'fixed',
            top: cardMenu.y,
            left: cardMenu.x,
            zIndex: 1000,
          }}
          className="w-[320px] max-h-[320px] overflow-y-auto no-scrollbar bg-[#181818] border border-white/10 rounded-none shadow-2xl shadow-black/50 p-1.5 text-sm animate-smooth-pop select-none font-sansation"
        >
          <div className="px-2.5 py-1.5 text-[11px] font-bold tracking-wider text-zinc-400 uppercase select-none flex items-center gap-1.5 border-b border-white/10 mb-1 font-mono">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <rect width="18" height="18" x="3" y="3" rx="2"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
            <span>Conectar Flashcard</span>
            <span className="text-[10px] text-zinc-500 normal-case font-normal">(::)</span>
          </div>

          {filteredCards.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-zinc-500">
              Nenhum flashcard encontrado
            </div>
          ) : (
            filteredCards.map((card, idx) => {
              const isSelected = idx === cardMenu.selectedIndex;
              return (
                <button
                  key={card.id}
                  ref={(el) => {
                    cardItemRefs.current[idx] = el;
                  }}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    insertCardLink(card);
                  }}
                  onMouseMove={() => {
                    if (isKeyboardNavRef.current) isKeyboardNavRef.current = false;
                    if (cardMenu.selectedIndex !== idx) {
                      setCardMenu((prev) => ({ ...prev, selectedIndex: idx }));
                    }
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-none text-left transition-colors duration-100 cursor-pointer select-none ${
                    isSelected
                      ? 'bg-white/10 text-white font-medium'
                      : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-center w-5 h-5 shrink-0 text-zinc-400">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="18" height="18" x="3" y="3" rx="2"/>
                      <path d="m9 12 2 2 4-4"/>
                    </svg>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-[13px] text-white truncate leading-snug">
                      {card.frente}
                    </span>
                    <span className="text-[11px] text-zinc-500 truncate leading-snug">
                      {card.deck ? `${card.deck.nome} • ` : ''}{card.verso}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Notion-style Editor Surface */}
      <div
        id={`synap-editor-${notaId}`}
        ref={editorRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleEditorBlur}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onPaste={handlePaste}
        onMouseDown={handleMouseDown}
        onMouseUp={() => {
          checkSlashTrigger();
          checkWikiTrigger();
          checkSelection();
        }}
        onClick={(event) => {
          updateCodeBlockControlFromTarget(event.target);
          handleEditorClick(event);
        }}
        style={{
          fontFamily: fontFamily || 'inherit',
          fontSize: fontSize || '15px',
        }}
        className="notion-editor min-h-[450px] w-full flex-1 pb-12 outline-none leading-[1.7] text-[var(--foreground)]"
        data-placeholder={placeholder}
      />

      <aside
        aria-label="Sumário da nota"
        className="fixed top-24 z-20 hidden w-44 2xl:w-52 xl:block pointer-events-auto"
        style={{
          left: railPosition ? `${railPosition.left}px` : undefined,
          visibility: railPosition ? 'visible' : 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto no-scrollbar pr-1">
          <RailToc
            items={railTocItems}
            containerRef={readingScrollContainerRef}
            offset={96}
            indent={12}
            title="Nesta nota"
            onSelect={selectNoteSection}
          />
        </div>
      </aside>

      {codeBlockControl && (
        <button
          type="button"
          data-note-code-copy
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleCodeBlockCopy}
          style={{ position: 'fixed', top: codeBlockControl.top, left: codeBlockControl.left }}
          className="z-[105] inline-flex h-7 items-center gap-1.5 border border-[var(--accents-3)] bg-[var(--background)] px-2 text-[10px] text-[var(--accents-6)] shadow-md transition-colors hover:border-[var(--accents-5)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accents-5)]"
          aria-label={copiedCodeBlock ? 'Código copiado' : 'Copiar bloco de código'}
          title={copiedCodeBlock ? 'Código copiado' : 'Copiar código'}
        >
          {copiedCodeBlock ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m5 12 4 4L19 6" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="8" y="8" width="13" height="13" rx="1" />
              <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
            </svg>
          )}
          {copiedCodeBlock ? 'Copiado' : 'Copiar'}
        </button>
      )}

      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex items-center gap-3 border border-[var(--accents-2)] bg-[var(--background)] px-3 py-1.5 text-[10px] text-[var(--accents-5)] shadow-lg" aria-label={`${wordCount} palavras, ${characterCount} caracteres, ${connectionCount} conexões, ${readingProgressPercent}% da nota lida`}>
        <span><span className="font-mono text-[var(--foreground)]">{wordCount}</span> palavras</span>
        <span><span className="font-mono text-[var(--foreground)]">{characterCount}</span> caracteres</span>
        <span><span className="font-mono text-[var(--foreground)]">{connectionCount}</span> conexões</span>
        <ScrollProgress progress={readingProgress} />
      </div>

      {/* Minimalist Floating Slash Command Menu with Side Explanation Modal */}
      {slashMenu.visible && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: slashMenu.y,
            left: slashMenu.x,
            zIndex: 1000,
          }}
          className="flex items-start gap-2 select-none font-sansation animate-in fade-in zoom-in-95 duration-200 ease-out"
        >
          {/* Main Command List Panel (Black background, rounded-none, no top header) */}
          <div className="w-[200px] sm:w-[220px] max-h-[360px] flex flex-col bg-black border border-white/15 rounded-none shadow-2xl shadow-black/80 overflow-hidden text-sm">
            {/* Commands List */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-1.5 space-y-1">
              {filteredCommands.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-zinc-500">
                  Nenhum comando
                </div>
              ) : (
                filteredCommands.map((cmd, idx) => {
                  const isSelected = idx === slashMenu.selectedIndex;

                  return (
                    <button
                      key={cmd.id}
                      ref={(el) => {
                        itemRefs.current[idx] = el;
                      }}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        executeCommand(cmd);
                      }}
                      onMouseMove={() => {
                        if (isKeyboardNavRef.current) {
                          isKeyboardNavRef.current = false;
                        }
                        if (slashMenu.selectedIndex !== idx) {
                          setSlashMenu((prev) => ({ ...prev, selectedIndex: idx }));
                        }
                      }}
                      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-none text-left transition-colors duration-150 cursor-pointer select-none ${
                        isSelected
                          ? 'bg-white text-black font-semibold'
                          : 'bg-transparent text-zinc-300 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {/* Ícone em um quadrado cinza padrão sem bordas brancas duplas */}
                      <div
                        className={`w-6 h-6 rounded-none flex items-center justify-center shrink-0 text-xs transition-colors ${
                          isSelected
                            ? 'bg-zinc-800 text-white'
                            : 'bg-white/10 text-zinc-300'
                        }`}
                      >
                        {cmd.icon}
                      </div>

                      {/* Apenas o nome do comando */}
                      <span className="text-xs truncate tracking-wide font-sansation flex-1">
                        {cmd.title}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Side Explanatory Modal (Apenas o que o comando faz em formato de retângulo) */}
          {filteredCommands.length > 0 &&
            slashMenu.selectedIndex >= 0 &&
            slashMenu.selectedIndex < filteredCommands.length &&
            (() => {
              const selectedCmd = filteredCommands[slashMenu.selectedIndex];
              if (!selectedCmd) return null;

              return (
                <div className="w-[230px] sm:w-[250px] bg-black border border-white/15 rounded-none shadow-2xl p-3.5 flex flex-col justify-center font-sansation text-left animate-in fade-in duration-200 ease-out">
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {selectedCmd.description || selectedCmd.subtitle}
                  </p>
                </div>
              );
            })()}
        </div>
      )}

      {/* Embedded Drawing Creation / Selection Modal */}
      {isDrawingModalOpen && (
        <DrawingEmbedModal
          workspaceId={workspaceId}
          notas={notas}
          onSelectDrawing={(drawing) => insertDrawingAtRange(drawing)}
          onCreateNewDrawing={(drawing) => {
            if (onUpdateNota) onUpdateNota(drawing);
            insertDrawingAtRange(drawing);
          }}
          onClose={() => setIsDrawingModalOpen(false)}
        />
      )}

      {/* Embedded Drawing Full In-Place Editor Modal */}
      {activeDrawingEdit && (
        <DrawingModal
          drawingNota={activeDrawingEdit}
          notas={notas}
          workspaceId={workspaceId}
          onOpenNota={onOpenNota}
          onOpenCard={onOpenCard}
          onSave={(updatedNota) => {
            if (onUpdateNota) onUpdateNota(updatedNota);
            // Re-render local canvas in editor immediately
            if (editorRef.current) {
              const wrappers = editorRef.current.querySelectorAll(`.synap-drawing-wrapper[data-drawing-id="${updatedNota.id}"]`);
              wrappers.forEach((w) => {
                const titleSpan = w.querySelector('.synap-drawing-header span');
                if (titleSpan) titleSpan.textContent = updatedNota.titulo;
                renderEmbeddedCanvas(w as HTMLElement, updatedNota.conteudo);
              });
              onChange(editorRef.current.innerHTML);
            }
          }}
          onClose={() => setActiveDrawingEdit(null)}
        />
      )}


      {/* Math Equation Modal */}
      <MathEquationModal
        isOpen={mathModal.visible}
        initialLatex={mathModal.latex}
        onClose={() => setMathModal({ visible: false, targetNode: null, latex: '', savedRange: null })}
        onConfirm={handleConfirmMath}
      />
    </div>
  );
}

export default React.memo(Editor);
