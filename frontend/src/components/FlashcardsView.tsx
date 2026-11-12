"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { api } from "@/lib/api";
import { ensureHtmlContent } from "./Editor";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

// ─────────────────────────────────────────────────────────────────────────────
// ANKI DATA STRUCTURES & INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

export interface DeckOptions {
  newCardsPerDay: number;
  maxReviewsPerDay: number;
  learningSteps: string;
  graduatingInterval: number;
  easyInterval: number;
  startingEase: number;
  easyBonus: number;
  intervalModifier: number;
  hardInterval: number;
  relearningSteps: string;
  newInterval: number;
  minimumInterval: number;
  leechThreshold: number;
  leechAction: "tag" | "suspend";
  maxAnswerSeconds: number;
  showAnswerTimer: boolean;
  buryNewSiblings: boolean;
  buryReviewSiblings: boolean;
}

export const DEFAULT_DECK_OPTIONS: DeckOptions = {
  newCardsPerDay: 20,
  maxReviewsPerDay: 200,
  learningSteps: "1 10",
  graduatingInterval: 1,
  easyInterval: 4,
  startingEase: 2.5,
  easyBonus: 1.3,
  intervalModifier: 1.0,
  hardInterval: 1.2,
  relearningSteps: "10",
  newInterval: 0.0,
  minimumInterval: 1,
  leechThreshold: 8,
  leechAction: "tag",
  maxAnswerSeconds: 60,
  showAnswerTimer: false,
  buryNewSiblings: false,
  buryReviewSiblings: false,
};

export interface Deck {
  id: string;
  nome: string;
  descricao?: string;
  options?: DeckOptions;
  workspaceId: string;
  parentId?: string | null;
  createdAt: string;
  stats: {
    total: number;
    novos: number;
    novosTotal?: number;
    aprendendo: number;
    aRevisar: number;
    aRevisarTotal?: number;
    suspensos?: number;
  };
}

export type NoteType = "basic" | "basic_reversed" | "basic_type" | "cloze" | "nota" | "card";

export interface ReviewLogEntry {
  date: string;
  grade: 1 | 2 | 3 | 4;
  interval: number;
  easeFactor: number;
  timeMs?: number;
  state: "new" | "learning" | "review" | "relearning";
}

export interface Flashcard {
  id: string;
  frente: string;
  verso: string;
  extra?: string | null;
  tipo: NoteType;
  clozeIndex?: number | null;
  tags?: string[];
  flag?: number;
  state?: "new" | "learning" | "review" | "relearning";
  suspended?: boolean;
  buried?: boolean;
  lapses?: number;
  stepIndex?: number;
  reviewHistory?: ReviewLogEntry[] | null;
  deckId: string;
  deck?: {
    id: string;
    nome: string;
    parentId?: string | null;
    options?: DeckOptions;
  };
  notaId?: string | null;
  nota?: {
    id: string;
    titulo: string;
    conteudo?: string;
  } | null;
  reps: number;
  interval: number;
  easeFactor: number;
  proximaRevisao: string;
  ultimaRevisao?: string | null;
  createdAt?: string;
}

interface FlashcardsViewProps {
  workspace: any;
  notas: any[];
  onOpenNota: (nota: any) => void;
  onClose: () => void;
}

type ViewMode = "decks" | "deck-hub" | "review" | "browser" | "stats";

interface DeckTreeNode {
  deck: Deck;
  children: DeckTreeNode[];
  depth: number;
  path: string;
}

export const ANKI_FLAGS: {
  id: number;
  label: string;
  shortcut: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  dotColor: string;
}[] = [
  { id: 0, label: "Nenhuma Marcação", shortcut: "Ctrl+0", colorClass: "text-zinc-500", bgClass: "bg-white/5", borderClass: "border-white/10", dotColor: "#71717a" },
  { id: 1, label: "Vermelha", shortcut: "Ctrl+1", colorClass: "text-red-400", bgClass: "bg-red-500/10", borderClass: "border-red-500/30", dotColor: "#f87171" },
  { id: 2, label: "Laranja", shortcut: "Ctrl+2", colorClass: "text-amber-400", bgClass: "bg-amber-500/10", borderClass: "border-amber-500/30", dotColor: "#fbbf24" },
  { id: 3, label: "Verde", shortcut: "Ctrl+3", colorClass: "text-emerald-400", bgClass: "bg-emerald-500/10", borderClass: "border-emerald-500/30", dotColor: "#34d399" },
  { id: 4, label: "Azul", shortcut: "Ctrl+4", colorClass: "text-sky-400", bgClass: "bg-sky-500/10", borderClass: "border-sky-500/30", dotColor: "#38bdf8" },
  { id: 5, label: "Rosa", shortcut: "Ctrl+5", colorClass: "text-pink-400", bgClass: "bg-pink-500/10", borderClass: "border-pink-500/30", dotColor: "#f472b6" },
  { id: 6, label: "Turquesa", shortcut: "Ctrl+6", colorClass: "text-cyan-400", bgClass: "bg-cyan-500/10", borderClass: "border-cyan-500/30", dotColor: "#22d3ee" },
  { id: 7, label: "Roxa", shortcut: "Ctrl+7", colorClass: "text-purple-400", bgClass: "bg-purple-500/10", borderClass: "border-purple-500/30", dotColor: "#c084fc" },
];

export const NOTE_TYPE_DEFINITIONS: {
  id: NoteType;
  label: string;
  shortLabel: string;
  desc: string;
}[] = [
  {
    id: "basic",
    label: "Básico",
    shortLabel: "Básico",
    desc: "Frente e Verso clássico do Anki (1 cartão gerado).",
  },
  {
    id: "basic_reversed",
    label: "Básico (e cartão invertido)",
    shortLabel: "Invertido",
    desc: "Gera automaticamente 2 cartões: Frente → Verso e Verso → Frente.",
  },
  {
    id: "basic_type",
    label: "Básico (digite a resposta)",
    shortLabel: "Digitar",
    desc: "Exige digitar a resposta exata durante o estudo com comparação caractere a caractere.",
  },
  {
    id: "cloze",
    label: "Omissão de Palavras (Cloze)",
    shortLabel: "Cloze",
    desc: "Oculta termos com {{c1::resposta::dica}} gerando 1 cartão por índice.",
  },
  {
    id: "nota",
    label: "Nota Conectada do Workspace",
    shortLabel: "Nota",
    desc: "Transforma uma nota completa do seu workspace em um cartão sincronizado.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT-SIDE ANKI SCHEDULER PREVIEW & CLOZE RENDERER
// ─────────────────────────────────────────────────────────────────────────────

function parseStepsMinutes(stepsStr: string, fallback: number[]): number[] {
  const parsed = (stepsStr || "")
    .trim()
    .split(/\s+/)
    .map((s) => {
      if (s.endsWith("d")) return parseFloat(s) * 1440;
      if (s.endsWith("h")) return parseFloat(s) * 60;
      if (s.endsWith("m")) return parseFloat(s);
      return parseFloat(s);
    })
    .filter((n) => !isNaN(n) && n > 0);
  return parsed.length > 0 ? parsed : fallback;
}

function formatMinutesLabel(mins: number): string {
  if (mins < 1) return "<1m";
  if (mins < 60) return `${Math.round(mins)}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

function formatDaysLabel(days: number): string {
  if (days <= 0) return "<10m";
  if (days < 30) return `${days}d`;
  if (days < 365) return `${(days / 30).toFixed(1).replace(/\.0$/, "")}mo`;
  return `${(days / 365).toFixed(1).replace(/\.0$/, "")}a`;
}

export function previewAnkiIntervals(
  card: Flashcard,
  rawOptions?: Partial<DeckOptions> | null
): Record<1 | 2 | 3 | 4, string> {
  const opts: DeckOptions = { ...DEFAULT_DECK_OPTIONS, ...(rawOptions || card.deck?.options || {}) };
  const learningSteps = parseStepsMinutes(opts.learningSteps, [1, 10]);
  const relearningSteps = parseStepsMinutes(opts.relearningSteps, [10]);
  const state = card.state || (card.reps === 0 ? "new" : "review");
  const stepIndex = card.stepIndex || 0;
  const interval = card.interval || 0;
  const ease = card.easeFactor || opts.startingEase || 2.5;

  if (state === "new" || state === "learning") {
    const againMins = learningSteps[0] || 1;
    const hardMins =
      stepIndex === 0 && learningSteps.length > 1
        ? (learningSteps[0] + learningSteps[1]) / 2
        : learningSteps[Math.min(stepIndex, learningSteps.length - 1)] || 6;
    const nextStep = state === "new" ? 1 : stepIndex + 1;
    const goodLabel =
      nextStep < learningSteps.length
        ? formatMinutesLabel(learningSteps[nextStep])
        : formatDaysLabel(Math.max(1, Math.round(opts.graduatingInterval * opts.intervalModifier)));
    const easyLabel = formatDaysLabel(Math.max(1, Math.round(opts.easyInterval * opts.intervalModifier)));

    return {
      1: `<${formatMinutesLabel(againMins)}`,
      2: formatMinutesLabel(hardMins),
      3: goodLabel,
      4: easyLabel,
    };
  }

  if (state === "relearning") {
    const againMins = relearningSteps[0] || 10;
    const hardMins = (relearningSteps[Math.min(stepIndex, relearningSteps.length - 1)] || 10) * 1.5;
    const nextStep = stepIndex + 1;
    const goodLabel =
      nextStep < relearningSteps.length
        ? formatMinutesLabel(relearningSteps[nextStep])
        : formatDaysLabel(Math.max(opts.minimumInterval, interval || 1));
    const easyLabel = formatDaysLabel(Math.max(opts.minimumInterval + 1, Math.round((interval || 1) * opts.easyBonus)));

    return {
      1: `<${formatMinutesLabel(againMins)}`,
      2: formatMinutesLabel(hardMins),
      3: goodLabel,
      4: easyLabel,
    };
  }

  // Review state
  const currentIvl = Math.max(1, interval);
  const againLabel =
    relearningSteps.length > 0
      ? `<${formatMinutesLabel(relearningSteps[0])}`
      : formatDaysLabel(Math.max(opts.minimumInterval, Math.round(currentIvl * opts.newInterval)));
  const hardIvl = Math.max(currentIvl + 1, Math.round(currentIvl * opts.hardInterval * opts.intervalModifier));
  const goodIvl = Math.max(hardIvl + 1, Math.round(currentIvl * ease * opts.intervalModifier));
  const easyIvl = Math.max(goodIvl + 1, Math.round(currentIvl * (ease + 0.15) * opts.easyBonus * opts.intervalModifier));

  return {
    1: againLabel,
    2: formatDaysLabel(hardIvl),
    3: formatDaysLabel(goodIvl),
    4: formatDaysLabel(easyIvl),
  };
}

/**
 * Renders Cloze deletion syntax {{c1::answer::hint}} for question or answer side
 */
export function renderClozeNodes(text: string, targetIndex: number = 1, isRevealed: boolean = false): React.ReactNode {
  if (!text) return null;
  const regex = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/gi;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyCounter = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const cIdx = parseInt(match[1], 10);
    const answer = match[2] || "";
    const hint = match[3] || "...";

    if (cIdx === targetIndex) {
      if (isRevealed) {
        parts.push(
          <span
            key={`cloze-${keyCounter++}`}
            className="inline-block px-2 py-0.5 mx-0.5 bg-sky-500/15 border border-sky-400/40 text-sky-300 font-bold font-mono"
          >
            {answer}
          </span>
        );
      } else {
        parts.push(
          <span
            key={`cloze-${keyCounter++}`}
            className="inline-block px-2.5 py-0.5 mx-0.5 bg-white/10 border border-white/30 text-white font-mono font-bold tracking-wider"
          >
            [{hint}]
          </span>
        );
      }
    } else {
      parts.push(
        <span key={`cloze-${keyCounter++}`} className="text-zinc-100">
          {answer}
        </span>
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

/**
 * Strips cloze syntax for table previews
 */
function formatCleanPreview(text: string): string {
  if (!text) return "";
  return text.replace(/\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/gi, "[...$2...]");
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ANKI COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function FlashcardsView({
  workspace,
  notas,
  onOpenNota,
  onClose,
}: FlashcardsViewProps) {
  // Navigation State
  const [viewMode, setViewMode] = useState<ViewMode>("decks");
  const [decks, setDecks] = useState<Deck[]>([]);
  const [allWorkspaceCards, setAllWorkspaceCards] = useState<Flashcard[]>([]);
  const [activeDeck, setActiveDeck] = useState<Deck | null>(null);
  const [loading, setLoading] = useState(true);

  // Expanded Decks in Tree View
  const [expandedDeckIds, setExpandedDeckIds] = useState<Set<string>>(new Set());

  // Active Deck Cards & Due Cards
  const [activeDeckCards, setActiveDeckCards] = useState<Flashcard[]>([]);
  const [dueCards, setDueCards] = useState<Flashcard[]>([]);
  const [loadingDeckDetails, setLoadingDeckDetails] = useState(false);

  // Review Session States
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [cardStartTime, setCardStartTime] = useState<number>(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [viewingNote, setViewingNote] = useState<any | null>(null);
  const [reviewSuccessFeedback, setReviewSuccessFeedback] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<
    Array<{
      cardIndex: number;
      previousCardSnapshot: Flashcard;
    }>
  >([]);
  const [isReviewMoreMenuOpen, setIsReviewMoreMenuOpen] = useState(false);

  // Browser (Painel Anki) States
  const [browserSearch, setBrowserSearch] = useState("");
  const [browserSidebarFilter, setBrowserSidebarFilter] = useState<string>("all");
  const [browserSortField, setBrowserSortField] = useState<"frente" | "deck" | "proximaRevisao" | "interval" | "easeFactor" | "lapses">("proximaRevisao");
  const [browserSortAsc, setBrowserSortAsc] = useState(true);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [focusedBrowserCardId, setFocusedBrowserCardId] = useState<string | null>(null);
  const [inspectorDraft, setInspectorDraft] = useState<{
    frente: string;
    verso: string;
    extra: string;
    tagsInput: string;
    deckId: string;
    tipo: NoteType;
    flag: number;
    notaId: string;
  } | null>(null);
  const [savingInspector, setSavingInspector] = useState(false);
  const [isBulkMoveOpen, setIsBulkMoveOpen] = useState(false);
  const [bulkMoveDeckId, setBulkMoveDeckId] = useState("");
  const [isBulkTagOpen, setIsBulkTagOpen] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState("");

  // Modals: Create / Edit / Delete Deck / Deck Options / Custom Study / Import-Export
  const [isCreateDeckOpen, setIsCreateDeckOpen] = useState(false);
  const [deckParentIdForCreate, setDeckParentIdForCreate] = useState<string | null>(null);
  const [newDeckName, setNewDeckName] = useState("");
  const [newDeckDesc, setNewDeckDesc] = useState("");

  const [isEditDeckOpen, setIsEditDeckOpen] = useState(false);
  const [editingDeck, setEditingDeck] = useState<Deck | null>(null);
  const [editDeckName, setEditDeckName] = useState("");
  const [editDeckDesc, setEditDeckDesc] = useState("");
  const [editDeckParentId, setEditDeckParentId] = useState<string | null>(null);

  const [deletingDeck, setDeletingDeck] = useState<Deck | null>(null);

  // Deck Options Modal (Anki Preset Configuration)
  const [optionsDeck, setOptionsDeck] = useState<Deck | null>(null);
  const [deckOptionsDraft, setDeckOptionsDraft] = useState<DeckOptions>(DEFAULT_DECK_OPTIONS);
  const [savingDeckOptions, setSavingDeckOptions] = useState(false);

  // Custom Study / Filtered Session Modal
  const [isCustomStudyOpen, setIsCustomStudyOpen] = useState(false);
  const [customStudyMode, setCustomStudyMode] = useState<"cram_all" | "preview_new" | "failed_today" | "by_tag" | "by_state">("cram_all");
  const [customStudyTag, setCustomStudyTag] = useState("");
  const [customStudyState, setCustomStudyState] = useState("learning");
  const [customStudyLimit, setCustomStudyLimit] = useState(50);

  // Add Card Modal (Anki Editor Window)
  const [isAddCardOpen, setIsAddCardOpen] = useState(false);
  const [addCardDeckId, setAddCardDeckId] = useState<string>("");
  const [addCardType, setAddCardType] = useState<NoteType>("basic");
  const [addCardFrente, setAddCardFrente] = useState("");
  const [addCardVerso, setAddCardVerso] = useState("");
  const [addCardExtra, setAddCardExtra] = useState("");
  const [addCardTags, setAddCardTags] = useState("");
  const [addCardNotaId, setAddCardNotaId] = useState("");
  const [addCardSuccessCount, setAddCardSuccessCount] = useState(0);

  // Import / Export Modal
  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [importExportTab, setImportExportTab] = useState<"import" | "export">("import");
  const [importDeckId, setImportDeckId] = useState<string>("");
  const [importSeparator, setImportSeparator] = useState<"tab" | "semicolon" | "comma" | "double_colon">("double_colon");
  const [importRawText, setImportRawText] = useState("");
  const [importingStatus, setImportingStatus] = useState<string | null>(null);
  const [exportDeckFilter, setExportDeckFilter] = useState<string>("all");
  const [exportFormat, setExportFormat] = useState<"anki_txt" | "csv" | "json">("anki_txt");
  const [exportIncludeScheduling, setExportIncludeScheduling] = useState(true);

  // Context Menu for deck row
  const [openMenuDeckId, setOpenMenuDeckId] = useState<string | null>(null);

  const frenteInputRef = useRef<HTMLTextAreaElement>(null);
  const typeAnswerInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  // ───────────────────────────────────────────────────────────────────────────
  // DATA LOADING
  // ───────────────────────────────────────────────────────────────────────────

  const loadDecksAndCards = useCallback(async () => {
    if (!workspace?.id) return;
    try {
      setLoading(true);
      const [decksData, cardsData] = await Promise.all([
        api(`/flashcards/decks?workspaceId=${workspace.id}`),
        api(`/flashcards/cards/workspace?workspaceId=${workspace.id}`).catch(() => []),
      ]);
      setDecks(decksData || []);
      setAllWorkspaceCards(cardsData || []);

      if (activeDeck) {
        const refreshedActive = (decksData || []).find((d: Deck) => d.id === activeDeck.id);
        if (refreshedActive) setActiveDeck(refreshedActive);
      }
    } catch (err) {
      console.error("Erro ao carregar baralhos e cartões:", err);
    } finally {
      setLoading(false);
    }
  }, [workspace?.id, activeDeck?.id]);

  useEffect(() => {
    loadDecksAndCards();
  }, [workspace?.id]);

  // Build Hierarchical Deck Tree & Ordered Flat List
  const { deckTree, flattenedDeckNodes, deckMap, deckPaths } = useMemo(() => {
    const map = new Map<string, Deck>();
    const childrenMap = new Map<string, Deck[]>();
    const paths = new Map<string, string>();

    decks.forEach((d) => {
      map.set(d.id, d);
      const pid = d.parentId || "root";
      if (!childrenMap.has(pid)) childrenMap.set(pid, []);
      childrenMap.get(pid)!.push(d);
    });

    const buildTree = (parentId: string | null, depth: number, parentPath: string): DeckTreeNode[] => {
      const key = parentId || "root";
      const children = childrenMap.get(key) || [];
      return children.map((deck) => {
        const currentPath = parentPath ? `${parentPath}::${deck.nome}` : deck.nome;
        paths.set(deck.id, currentPath);
        return {
          deck,
          depth,
          path: currentPath,
          children: buildTree(deck.id, depth + 1, currentPath),
        };
      });
    };

    const tree = buildTree(null, 0, "");

    const flatten = (nodes: DeckTreeNode[]): DeckTreeNode[] => {
      let res: DeckTreeNode[] = [];
      for (const node of nodes) {
        res.push(node);
        if (expandedDeckIds.has(node.deck.id) && node.children.length > 0) {
          res = res.concat(flatten(node.children));
        }
      }
      return res;
    };

    const flat = flatten(tree);

    return {
      deckTree: tree,
      flattenedDeckNodes: flat,
      deckMap: map,
      deckPaths: paths,
    };
  }, [decks, expandedDeckIds]);

  // Extract all unique tags across workspace
  const allWorkspaceTags = useMemo(() => {
    const tagCounts = new Map<string, number>();
    for (const c of allWorkspaceCards) {
      for (const t of c.tags || []) {
        tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
      }
    }
    return Array.from(tagCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [allWorkspaceCards]);

  // Overall workspace totals
  const overallTotals = useMemo(() => {
    let total = 0;
    let novos = 0;
    let aprendendo = 0;
    let aRevisar = 0;

    deckTree.forEach((node) => {
      total += node.deck.stats.total || 0;
      novos += node.deck.stats.novos || 0;
      aprendendo += node.deck.stats.aprendendo || 0;
      aRevisar += node.deck.stats.aRevisar || 0;
    });

    return { total, novos, aprendendo, aRevisar };
  }, [deckTree]);

  // Toggle tree expansion
  const toggleExpand = (deckId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedDeckIds((prev) => {
      const next = new Set(prev);
      if (next.has(deckId)) next.delete(deckId);
      else next.add(deckId);
      return next;
    });
  };

  // Open Deck Hub
  const openDeckHub = async (deck: Deck) => {
    setActiveDeck(deck);
    setViewMode("deck-hub");
    setLoadingDeckDetails(true);
    try {
      const [cards, due] = await Promise.all([
        api(`/flashcards/decks/${deck.id}/cards?recursive=true`),
        api(`/flashcards/decks/${deck.id}/due`),
      ]);
      setActiveDeckCards(cards || []);
      setDueCards(due || []);
    } catch (err) {
      console.error("Erro ao carregar detalhes do baralho:", err);
    } finally {
      setLoadingDeckDetails(false);
    }
  };

  // Start Standard or Custom Review Session
  const startReview = async (
    deckToReview?: Deck,
    customParams?: { mode: string; tag?: string; state?: string; limit?: number }
  ) => {
    const target = deckToReview || activeDeck;
    if (!target) return;

    let sessionCards = dueCards;
    if (customParams || target.id !== activeDeck?.id) {
      try {
        const qs = new URLSearchParams();
        if (customParams?.mode) qs.set("mode", customParams.mode);
        if (customParams?.tag) qs.set("tag", customParams.tag);
        if (customParams?.state) qs.set("state", customParams.state);
        if (customParams?.limit) qs.set("limit", String(customParams.limit));
        const fetched = await api(
          `/flashcards/decks/${target.id}/due${qs.toString() ? `?${qs.toString()}` : ""}`
        );
        sessionCards = fetched || [];
        setDueCards(sessionCards);
      } catch (err) {
        console.error("Erro ao buscar fila de estudo:", err);
      }
    }

    if (sessionCards.length === 0) return;
    setActiveDeck(target);
    setCurrentCardIndex(0);
    setIsFlipped(false);
    setTypedAnswer("");
    setCardStartTime(Date.now());
    setElapsedSeconds(0);
    setUndoStack([]);
    setViewingNote(null);
    setReviewSuccessFeedback(null);
    setViewMode("review");
  };

  // Timer during active review
  useEffect(() => {
    if (viewMode !== "review" || reviewSuccessFeedback) return;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - cardStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [viewMode, cardStartTime, reviewSuccessFeedback]);

  // Focus input on basic_type card
  useEffect(() => {
    if (viewMode === "review" && !isFlipped && dueCards[currentCardIndex]?.tipo === "basic_type") {
      setTimeout(() => typeAnswerInputRef.current?.focus(), 40);
    }
  }, [viewMode, isFlipped, currentCardIndex, dueCards]);

  // Review Grade Submission
  const handleReviewGrade = async (grade: 1 | 2 | 3 | 4) => {
    const currentCard = dueCards[currentCardIndex];
    if (!currentCard) return;

    const timeTakenMs = Math.min(60000, Math.max(500, Date.now() - cardStartTime));

    // Save snapshot for Undo (Ctrl+Z)
    setUndoStack((prev) => [
      ...prev,
      {
        cardIndex: currentCardIndex,
        previousCardSnapshot: { ...currentCard },
      },
    ]);

    try {
      await api(`/flashcards/cards/${currentCard.id}/review`, {
        method: "POST",
        body: JSON.stringify({ grade, timeMs: timeTakenMs }),
      });

      const nextIndex = currentCardIndex + 1;
      if (nextIndex < dueCards.length) {
        setCurrentCardIndex(nextIndex);
        setIsFlipped(false);
        setTypedAnswer("");
        setCardStartTime(Date.now());
        setElapsedSeconds(0);
        setViewingNote(null);
      } else {
        setReviewSuccessFeedback(
          `Parabéns! Você concluiu a programação de estudo deste baralho por agora (${dueCards.length} cartões revisados).`
        );
        loadDecksAndCards();
        if (activeDeck) {
          Promise.all([
            api(`/flashcards/decks/${activeDeck.id}/cards?recursive=true`),
            api(`/flashcards/decks/${activeDeck.id}/due`),
          ]).then(([cards, due]) => {
            setActiveDeckCards(cards || []);
            setDueCards(due || []);
          });
        }
      }
    } catch (err) {
      console.error("Erro ao registrar avaliação do cartão:", err);
    }
  };

  // Undo Last Review (Z / Ctrl+Z)
  const handleUndoReview = async () => {
    if (undoStack.length === 0) return;
    const lastEntry = undoStack[undoStack.length - 1];
    const snap = lastEntry.previousCardSnapshot;

    try {
      await api(`/flashcards/cards/${snap.id}`, {
        method: "PUT",
        body: JSON.stringify({
          reps: snap.reps,
          interval: snap.interval,
          easeFactor: snap.easeFactor,
          state: snap.state || "new",
          stepIndex: snap.stepIndex || 0,
          lapses: snap.lapses || 0,
          proximaRevisao: snap.proximaRevisao,
        }),
      });

      setUndoStack((prev) => prev.slice(0, -1));
      setReviewSuccessFeedback(null);
      setCurrentCardIndex(lastEntry.cardIndex);
      setIsFlipped(false);
      setTypedAnswer("");
      setCardStartTime(Date.now());
      setElapsedSeconds(0);
      loadDecksAndCards();
    } catch (err) {
      console.error("Erro ao desfazer revisão:", err);
    }
  };

  // Review Card Quick Actions: Bury, Suspend, Flag
  const handleReviewQuickAction = async (
    action: "bury" | "suspend" | "flag",
    flagValue?: number
  ) => {
    const currentCard = dueCards[currentCardIndex];
    if (!currentCard) return;
    setIsReviewMoreMenuOpen(false);

    try {
      if (action === "flag" && flagValue !== undefined) {
        const nextFlag = currentCard.flag === flagValue ? 0 : flagValue;
        const updated = await api(`/flashcards/cards/${currentCard.id}`, {
          method: "PUT",
          body: JSON.stringify({ flag: nextFlag }),
        });
        setDueCards((prev) => prev.map((c, idx) => (idx === currentCardIndex ? { ...c, ...updated } : c)));
        setAllWorkspaceCards((prev) => prev.map((c) => (c.id === currentCard.id ? { ...c, ...updated } : c)));
        return;
      }

      if (action === "bury" || action === "suspend") {
        await api(`/flashcards/cards/${currentCard.id}`, {
          method: "PUT",
          body: JSON.stringify(action === "bury" ? { buried: true } : { suspended: true }),
        });

        const remaining = dueCards.filter((_, idx) => idx !== currentCardIndex);
        setDueCards(remaining);
        loadDecksAndCards();

        if (remaining.length === 0 || currentCardIndex >= remaining.length) {
          setReviewSuccessFeedback("Sessão concluída! Não há mais cartões pendentes na fila.");
        } else {
          setIsFlipped(false);
          setTypedAnswer("");
          setCardStartTime(Date.now());
        }
      }
    } catch (err) {
      console.error("Erro na ação rápida de estudo:", err);
    }
  };

  // Global Keyboard Shortcuts (Anki Desktop Standard)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName;
      const isInputFocused = ["INPUT", "TEXTAREA", "SELECT"].includes(targetTag);

      // Top-level shortcuts when not typing in an input
      if (!isInputFocused && !isAddCardOpen && !isCreateDeckOpen && !optionsDeck && !isImportExportOpen) {
        if (e.key === "d" || e.key === "D") {
          e.preventDefault();
          setViewMode("decks");
          return;
        }
        if (e.key === "a" || e.key === "A") {
          e.preventDefault();
          setAddCardDeckId(activeDeck?.id || (decks.length > 0 ? decks[0].id : ""));
          setAddCardSuccessCount(0);
          setIsAddCardOpen(true);
          return;
        }
        if (e.key === "b" || e.key === "B") {
          e.preventDefault();
          openBrowser(activeDeck ? `deck:${activeDeck.id}` : "all");
          return;
        }
        if (e.key === "t" || e.key === "T") {
          e.preventDefault();
          setViewMode("stats");
          return;
        }
      }

      if (viewMode !== "review") return;

      // Undo shortcut Ctrl+Z or Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndoReview();
        return;
      }

      // Flag shortcuts Ctrl+0..7
      if ((e.ctrlKey || e.metaKey) && /^[0-7]$/.test(e.key)) {
        e.preventDefault();
        handleReviewQuickAction("flag", parseInt(e.key, 10));
        return;
      }

      if (isInputFocused) {
        if (e.key === "Enter" && !isFlipped) {
          e.preventDefault();
          setIsFlipped(true);
        }
        return;
      }

      if (e.code === "Space" || e.key === "Enter") {
        e.preventDefault();
        if (!isFlipped) {
          setIsFlipped(true);
        } else {
          handleReviewGrade(3); // In Anki, Space/Enter when answer is shown grades "Good" (3)
        }
      } else if (isFlipped) {
        if (e.key === "1") handleReviewGrade(1);
        else if (e.key === "2") handleReviewGrade(2);
        else if (e.key === "3") handleReviewGrade(3);
        else if (e.key === "4") handleReviewGrade(4);
      }

      if (e.key === "-" || e.key === "=") {
        e.preventDefault();
        handleReviewQuickAction("bury");
      } else if (e.key === "@" || e.key === "!") {
        e.preventDefault();
        handleReviewQuickAction("suspend");
      } else if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        handleUndoReview();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewMode, isFlipped, currentCardIndex, dueCards, undoStack, activeDeck, decks, isAddCardOpen, isCreateDeckOpen, optionsDeck, isImportExportOpen]);

  // ───────────────────────────────────────────────────────────────────────────
  // BROWSER (PAINEL ANKI) LOGIC & QUERY PARSER
  // ───────────────────────────────────────────────────────────────────────────

  const openBrowser = async (initialFilter?: string) => {
    setViewMode("browser");
    if (initialFilter) setBrowserSidebarFilter(initialFilter);
    try {
      const cards: Flashcard[] = await api(`/flashcards/cards/workspace?workspaceId=${workspace.id}`);
      setAllWorkspaceCards(cards || []);
      if (cards && cards.length > 0 && !focusedBrowserCardId) {
        selectCardInBrowser(cards[0]);
      }
    } catch (err) {
      console.error("Erro ao carregar cartões no painel:", err);
    }
  };

  const selectCardInBrowser = (card: Flashcard, multiSelectToggle?: boolean) => {
    setFocusedBrowserCardId(card.id);
    setSelectedCardIds((prev) => {
      if (multiSelectToggle) {
        const next = new Set(prev);
        if (next.has(card.id)) next.delete(card.id);
        else next.add(card.id);
        return next;
      }
      return new Set([card.id]);
    });
    setInspectorDraft({
      frente: card.frente,
      verso: card.verso || "",
      extra: card.extra || "",
      tagsInput: (card.tags || []).join(" "),
      deckId: card.deckId,
      tipo: card.tipo || "basic",
      flag: card.flag || 0,
      notaId: card.notaId || "",
    });
  };

  // Helper to get descendant deck IDs on client
  const getDescendantIdsClient = useCallback(
    (rootId: string): Set<string> => {
      const set = new Set<string>([rootId]);
      let added = true;
      while (added) {
        added = false;
        for (const d of decks) {
          if (d.parentId && set.has(d.parentId) && !set.has(d.id)) {
            set.add(d.id);
            added = true;
          }
        }
      }
      return set;
    },
    [decks]
  );

  // Filtered & Sorted Browser Cards supporting Anki Search Syntax
  const filteredBrowserCards = useMemo(() => {
    const now = new Date();

    const filtered = allWorkspaceCards.filter((c) => {
      const st = c.state || (c.reps === 0 ? "new" : "review");
      const isDue = !c.suspended && !c.buried && (st === "new" || new Date(c.proximaRevisao) <= now);

      // 1. Sidebar Tree Filter
      if (browserSidebarFilter !== "all") {
        if (browserSidebarFilter.startsWith("deck:")) {
          const targetDeckId = browserSidebarFilter.slice(5);
          const allowedDecks = getDescendantIdsClient(targetDeckId);
          if (!allowedDecks.has(c.deckId)) return false;
        } else if (browserSidebarFilter.startsWith("state:")) {
          const targetState = browserSidebarFilter.slice(6);
          if (targetState === "due" && !isDue) return false;
          if (targetState === "new" && !(st === "new" && c.reps === 0)) return false;
          if (targetState === "learning" && st !== "learning" && st !== "relearning") return false;
          if (targetState === "review" && st !== "review") return false;
          if (targetState === "suspended" && !c.suspended) return false;
          if (targetState === "buried" && !c.buried) return false;
          if (targetState === "leech" && !(c.tags || []).includes("leech") && (c.lapses || 0) < 8) return false;
        } else if (browserSidebarFilter.startsWith("flag:")) {
          const targetFlag = parseInt(browserSidebarFilter.slice(5), 10);
          if ((c.flag || 0) !== targetFlag) return false;
        } else if (browserSidebarFilter.startsWith("type:")) {
          const targetType = browserSidebarFilter.slice(5);
          if (c.tipo !== targetType) return false;
        } else if (browserSidebarFilter.startsWith("tag:")) {
          const targetTag = browserSidebarFilter.slice(4);
          if (targetTag === "untagged") {
            if (c.tags && c.tags.length > 0) return false;
          } else if (!(c.tags || []).includes(targetTag)) {
            return false;
          }
        }
      }

      // 2. Search Bar Query Parser (supports deck:, tag:, is:due, is:new, is:learn, is:review, is:suspended, is:buried, flag:1..7, prop:ivl>=N, prop:lapses>N)
      const q = browserSearch.trim();
      if (!q) return true;

      const tokens = q.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
      for (const rawToken of tokens) {
        const token = rawToken.replace(/^"|"$/g, "");
        const lower = token.toLowerCase();

        if (lower === "is:due") {
          if (!isDue) return false;
        } else if (lower === "is:new") {
          if (!(st === "new" && c.reps === 0)) return false;
        } else if (lower === "is:learn" || lower === "is:learning") {
          if (st !== "learning" && st !== "relearning") return false;
        } else if (lower === "is:review") {
          if (st !== "review") return false;
        } else if (lower === "is:suspended") {
          if (!c.suspended) return false;
        } else if (lower === "is:buried") {
          if (!c.buried) return false;
        } else if (lower.startsWith("flag:")) {
          const fNum = parseInt(lower.slice(5), 10);
          if (!isNaN(fNum) && (c.flag || 0) !== fNum) return false;
        } else if (lower.startsWith("tag:")) {
          const tVal = lower.slice(4);
          if (tVal === "none") {
            if (c.tags && c.tags.length > 0) return false;
          } else if (!(c.tags || []).some((t) => t.toLowerCase().includes(tVal))) {
            return false;
          }
        } else if (lower.startsWith("deck:")) {
          const dVal = lower.slice(5);
          const dPath = (deckPaths.get(c.deckId) || c.deck?.nome || "").toLowerCase();
          if (!dPath.includes(dVal)) return false;
        } else if (lower.startsWith("note:") || lower.startsWith("type:")) {
          const nVal = lower.split(":")[1];
          if (!(c.tipo || "").toLowerCase().includes(nVal)) return false;
        } else {
          const matchesText =
            c.frente.toLowerCase().includes(lower) ||
            (c.verso || "").toLowerCase().includes(lower) ||
            (c.extra || "").toLowerCase().includes(lower) ||
            (c.tags || []).some((t) => t.toLowerCase().includes(lower)) ||
            (c.nota?.titulo || "").toLowerCase().includes(lower);
          if (!matchesText) return false;
        }
      }

      return true;
    });

    return filtered.sort((a, b) => {
      let cmp = 0;
      if (browserSortField === "frente") {
        cmp = a.frente.localeCompare(b.frente);
      } else if (browserSortField === "deck") {
        const dA = deckPaths.get(a.deckId) || a.deck?.nome || "";
        const dB = deckPaths.get(b.deckId) || b.deck?.nome || "";
        cmp = dA.localeCompare(dB);
      } else if (browserSortField === "proximaRevisao") {
        cmp = new Date(a.proximaRevisao).getTime() - new Date(b.proximaRevisao).getTime();
      } else if (browserSortField === "interval") {
        cmp = (a.interval || 0) - (b.interval || 0);
      } else if (browserSortField === "easeFactor") {
        cmp = (a.easeFactor || 2.5) - (b.easeFactor || 2.5);
      } else if (browserSortField === "lapses") {
        cmp = (a.lapses || 0) - (b.lapses || 0);
      }
      return browserSortAsc ? cmp : -cmp;
    });
  }, [allWorkspaceCards, browserSidebarFilter, browserSearch, browserSortField, browserSortAsc, deckPaths, getDescendantIdsClient]);

  // Save Inspector Card Changes
  const handleSaveInspector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!focusedBrowserCardId || !inspectorDraft) return;
    setSavingInspector(true);

    try {
      const parsedTags = inspectorDraft.tagsInput
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter(Boolean);

      const updated = await api(`/flashcards/cards/${focusedBrowserCardId}`, {
        method: "PUT",
        body: JSON.stringify({
          frente: inspectorDraft.frente,
          verso: inspectorDraft.verso,
          extra: inspectorDraft.extra || null,
          tags: parsedTags,
          deckId: inspectorDraft.deckId,
          tipo: inspectorDraft.tipo,
          flag: inspectorDraft.flag,
          notaId: inspectorDraft.notaId || null,
        }),
      });

      setAllWorkspaceCards((prev) =>
        prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
      );
      loadDecksAndCards();
    } catch (err) {
      console.error("Erro ao salvar cartão no painel:", err);
    } finally {
      setSavingInspector(false);
    }
  };

  // Execute Bulk Action in Browser
  const handleBrowserBulkAction = async (
    action: "suspend" | "unsuspend" | "bury" | "unbury" | "reset" | "flag" | "move" | "add_tag" | "delete",
    payload?: { flag?: number; deckId?: string; tag?: string }
  ) => {
    const ids = Array.from(selectedCardIds);
    if (ids.length === 0) return;

    try {
      await api("/flashcards/cards/bulk", {
        method: "POST",
        body: JSON.stringify({ cardIds: ids, action, payload }),
      });

      if (action === "delete") {
        setSelectedCardIds(new Set());
        setFocusedBrowserCardId(null);
        setInspectorDraft(null);
      }

      await loadDecksAndCards();
    } catch (err) {
      console.error("Erro na ação em massa:", err);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // DECK CRUD & OPTIONS HANDLERS
  // ───────────────────────────────────────────────────────────────────────────

  const handleCreateDeckSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeckName.trim()) return;

    try {
      await api("/flashcards/decks", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: workspace.id,
          nome: newDeckName.trim(),
          descricao: newDeckDesc.trim() || undefined,
          parentId: deckParentIdForCreate || undefined,
        }),
      });

      if (deckParentIdForCreate) {
        setExpandedDeckIds((prev) => new Set(prev).add(deckParentIdForCreate));
      }

      setNewDeckName("");
      setNewDeckDesc("");
      setIsCreateDeckOpen(false);
      await loadDecksAndCards();
    } catch (err) {
      console.error("Erro ao criar baralho:", err);
    }
  };

  const handleEditDeckSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDeck || !editDeckName.trim()) return;

    try {
      await api(`/flashcards/decks/${editingDeck.id}`, {
        method: "PUT",
        body: JSON.stringify({
          nome: editDeckName.trim(),
          descricao: editDeckDesc.trim() || undefined,
          parentId: editDeckParentId || null,
        }),
      });

      setIsEditDeckOpen(false);
      setEditingDeck(null);
      await loadDecksAndCards();
    } catch (err) {
      console.error("Erro ao editar baralho:", err);
    }
  };

  const handleSaveDeckOptionsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!optionsDeck) return;
    setSavingDeckOptions(true);
    try {
      await api(`/flashcards/decks/${optionsDeck.id}`, {
        method: "PUT",
        body: JSON.stringify({
          options: deckOptionsDraft,
        }),
      });
      setOptionsDeck(null);
      await loadDecksAndCards();
    } catch (err) {
      console.error("Erro ao salvar opções do baralho:", err);
    } finally {
      setSavingDeckOptions(false);
    }
  };

  const confirmDeleteDeck = async () => {
    if (!deletingDeck) return;
    try {
      await api(`/flashcards/decks/${deletingDeck.id}`, { method: "DELETE" });
      setDeletingDeck(null);
      if (activeDeck?.id === deletingDeck.id) {
        setActiveDeck(null);
        setViewMode("decks");
      }
      await loadDecksAndCards();
    } catch (err) {
      console.error("Erro ao excluir baralho:", err);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // ADD CARD (CONTINUOUS ANKI CREATOR WITH CLOZE HELPER)
  // ───────────────────────────────────────────────────────────────────────────

  const insertClozeAtCursor = (incrementIndex: boolean) => {
    const textarea = frenteInputRef.current;
    // Find highest existing {{cN::}} in addCardFrente
    const matches = Array.from(addCardFrente.matchAll(/\{\{c(\d+)::/gi));
    const maxIdx = matches.reduce((max, m) => Math.max(max, parseInt(m[1], 10) || 1), 0);
    const targetIdx = incrementIndex ? maxIdx + 1 : Math.max(1, maxIdx);

    if (!textarea) {
      setAddCardFrente((prev) => `${prev} {{c${targetIdx}::texto}}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = addCardFrente.slice(start, end) || "palavra";
    const replacement = `{{c${targetIdx}::${selected}}}`;
    const updated = addCardFrente.slice(0, start) + replacement + addCardFrente.slice(end);
    setAddCardFrente(updated);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + replacement.length, start + replacement.length);
    }, 20);
  };

  const handleAddCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let targetDeckId = addCardDeckId || activeDeck?.id || (decks.length > 0 ? decks[0].id : "");

    try {
      if (!targetDeckId) {
        const defaultDeck = await api("/flashcards/decks", {
          method: "POST",
          body: JSON.stringify({
            workspaceId: workspace.id,
            nome: "Padrão",
          }),
        });
        targetDeckId = defaultDeck.id;
      }

      const parsedTags = addCardTags
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter(Boolean);

      if (addCardType === "nota") {
        if (!addCardNotaId) return;
        await api("/flashcards/cards/from-nota", {
          method: "POST",
          body: JSON.stringify({
            deckId: targetDeckId,
            notaId: addCardNotaId,
            tags: parsedTags,
          }),
        });
      } else {
        if (!addCardFrente.trim()) return;
        if (addCardType !== "cloze" && !addCardVerso.trim()) return;

        await api("/flashcards/cards", {
          method: "POST",
          body: JSON.stringify({
            deckId: targetDeckId,
            frente: addCardFrente.trim(),
            verso: addCardVerso.trim(),
            extra: addCardExtra.trim() || undefined,
            tipo: addCardType,
            tags: parsedTags,
            notaId: addCardNotaId || undefined,
          }),
        });
      }

      setAddCardFrente("");
      setAddCardVerso("");
      setAddCardExtra("");
      setAddCardNotaId("");
      setAddCardSuccessCount((prev) => prev + 1);

      setTimeout(() => {
        frenteInputRef.current?.focus();
      }, 40);

      await loadDecksAndCards();
      if (activeDeck && activeDeck.id === targetDeckId) {
        api(`/flashcards/decks/${activeDeck.id}/cards?recursive=true`).then(setActiveDeckCards);
        api(`/flashcards/decks/${activeDeck.id}/due`).then(setDueCards);
      }
    } catch (err) {
      console.error("Erro ao adicionar cartão:", err);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // IMPORT / EXPORT HANDLERS
  // ───────────────────────────────────────────────────────────────────────────

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importRawText.trim()) return;

    const lines = importRawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));

    const parsedCards: Array<{
      frente: string;
      verso: string;
      extra?: string;
      tags?: string[];
      deckName?: string;
    }> = [];

    for (const line of lines) {
      let parts: string[] = [];
      if (importSeparator === "double_colon") {
        parts = line.includes(":::") ? line.split(":::") : line.split("::");
      } else if (importSeparator === "tab") {
        parts = line.split("\t");
      } else if (importSeparator === "semicolon") {
        parts = line.split(";");
      } else {
        parts = line.split(",");
      }

      const frente = (parts[0] || "").trim();
      const verso = (parts[1] || "").trim();
      const tagsRaw = (parts[2] || "").trim();
      if (!frente) continue;

      parsedCards.push({
        frente,
        verso,
        tags: tagsRaw ? tagsRaw.split(/\s+/).filter(Boolean) : [],
      });
    }

    if (parsedCards.length === 0) {
      setImportingStatus("Nenhum cartão válido identificado no texto.");
      return;
    }

    try {
      setImportingStatus(`Importando ${parsedCards.length} cartões...`);
      const res = await api("/flashcards/cards/import", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: workspace.id,
          defaultDeckId: importDeckId || activeDeck?.id || undefined,
          cards: parsedCards,
        }),
      });
      setImportingStatus(`Sucesso! ${res.imported || parsedCards.length} cartões importados.`);
      setImportRawText("");
      await loadDecksAndCards();
    } catch (err) {
      console.error("Erro ao importar cartões:", err);
      setImportingStatus("Erro ao importar cartões.");
    }
  };

  const handleExportDownload = () => {
    const targetCards =
      exportDeckFilter === "all"
        ? allWorkspaceCards
        : allWorkspaceCards.filter((c) => getDescendantIdsClient(exportDeckFilter).has(c.deckId));

    let content = "";
    let filename = `anki-export-${workspace?.nome || "synap"}`;
    let mime = "text/plain;charset=utf-8";

    if (exportFormat === "json") {
      const payload = targetCards.map((c) => ({
        frente: c.frente,
        verso: c.verso,
        extra: c.extra,
        tipo: c.tipo,
        tags: c.tags || [],
        deckName: deckPaths.get(c.deckId) || c.deck?.nome || "Padrão",
        ...(exportIncludeScheduling
          ? {
              reps: c.reps,
              interval: c.interval,
              easeFactor: c.easeFactor,
              state: c.state,
              lapses: c.lapses,
              proximaRevisao: c.proximaRevisao,
            }
          : {}),
      }));
      content = JSON.stringify(payload, null, 2);
      filename += ".json";
      mime = "application/json;charset=utf-8";
    } else if (exportFormat === "csv") {
      const header = "Frente;Verso;Tags;Baralho\n";
      const rows = targetCards
        .map(
          (c) =>
            `"${(c.frente || "").replace(/"/g, '""')}";"${(c.verso || "").replace(/"/g, '""')}";"${(c.tags || []).join(" ")}";"${deckPaths.get(c.deckId) || c.deck?.nome || ""}"`
        )
        .join("\n");
      content = header + rows;
      filename += ".csv";
      mime = "text/csv;charset=utf-8";
    } else {
      // Anki Standard Tab-Separated Text Format
      const header = "#separator:tab\n#html:true\n#tags column:3\n";
      const rows = targetCards
        .map(
          (c) =>
            `${(c.frente || "").replace(/\t|\n/g, " ")}\t${(c.verso || "").replace(/\t|\n/g, " ")}\t${(c.tags || []).join(" ")}`
        )
        .join("\n");
      content = header + rows;
      filename += ".txt";
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // STATISTICS (ESTATÍSTICAS ANKI) COMPUTATIONS
  // ───────────────────────────────────────────────────────────────────────────

  const ankiStats = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // Breakdown by Card Maturity (Anki Official Classification)
    let newCount = 0;
    let learningCount = 0;
    let youngCount = 0; // Review with interval < 21 days
    let matureCount = 0; // Review with interval >= 21 days
    let suspendedCount = 0;

    // Future Due Forecast (Next 30 days)
    const forecastDays = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(todayStart);
      d.setDate(d.getDate() + i);
      return {
        label: i === 0 ? "Hoje" : `+${i}d`,
        dateStr: d.toISOString().slice(0, 10),
        young: 0,
        mature: 0,
        total: 0,
      };
    });

    // Review History Heatmap (Last 90 days)
    const heatmapMap = new Map<string, { count: number; timeMs: number; again: number; pass: number }>();
    let reviewsTodayCount = 0;
    let reviewsTodayTimeMs = 0;
    let reviewsTodayAgain = 0;
    let totalEaseSum = 0;
    let ratedCardsCount = 0;

    // Interval buckets
    const intervalBuckets = [
      { label: "0d", count: 0 },
      { label: "1-3d", count: 0 },
      { label: "4-7d", count: 0 },
      { label: "8-20d", count: 0 },
      { label: "21-60d", count: 0 },
      { label: "60d+", count: 0 },
    ];

    for (const c of allWorkspaceCards) {
      if (c.suspended) {
        suspendedCount++;
      } else {
        const st = c.state || (c.reps === 0 ? "new" : "review");
        if (st === "new" && c.reps === 0) {
          newCount++;
        } else if (st === "learning" || st === "relearning") {
          learningCount++;
        } else if ((c.interval || 0) < 21) {
          youngCount++;
        } else {
          matureCount++;
        }

        // Forecast
        if (st !== "new" || c.reps > 0) {
          const dueDate = new Date(c.proximaRevisao);
          const diffDays = Math.max(
            0,
            Math.floor((dueDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24))
          );
          if (diffDays >= 0 && diffDays < 30) {
            if ((c.interval || 0) >= 21) forecastDays[diffDays].mature++;
            else forecastDays[diffDays].young++;
            forecastDays[diffDays].total++;
          }
        }
      }

      if (c.reps > 0) {
        totalEaseSum += c.easeFactor || 2.5;
        ratedCardsCount++;
      }

      const ivl = c.interval || 0;
      if (ivl === 0) intervalBuckets[0].count++;
      else if (ivl <= 3) intervalBuckets[1].count++;
      else if (ivl <= 7) intervalBuckets[2].count++;
      else if (ivl <= 20) intervalBuckets[3].count++;
      else if (ivl <= 60) intervalBuckets[4].count++;
      else intervalBuckets[5].count++;

      // Process Review History Logs
      const logs: ReviewLogEntry[] = Array.isArray(c.reviewHistory) ? c.reviewHistory : [];
      if (logs.length === 0 && c.ultimaRevisao) {
        // Fallback if card was reviewed before history log array existed
        const dKey = new Date(c.ultimaRevisao).toISOString().slice(0, 10);
        const entry = heatmapMap.get(dKey) || { count: 0, timeMs: 0, again: 0, pass: 0 };
        entry.count += 1;
        entry.timeMs += 4000;
        entry.pass += 1;
        heatmapMap.set(dKey, entry);
      } else {
        for (const log of logs) {
          const dKey = (log.date || "").slice(0, 10);
          if (!dKey) continue;
          const entry = heatmapMap.get(dKey) || { count: 0, timeMs: 0, again: 0, pass: 0 };
          entry.count += 1;
          entry.timeMs += log.timeMs || 4000;
          if (log.grade === 1) entry.again += 1;
          else entry.pass += 1;
          heatmapMap.set(dKey, entry);
        }
      }
    }

    const todayKey = todayStart.toISOString().slice(0, 10);
    const todayStats = heatmapMap.get(todayKey);
    if (todayStats) {
      reviewsTodayCount = todayStats.count;
      reviewsTodayTimeMs = todayStats.timeMs;
      reviewsTodayAgain = todayStats.again;
    }

    // Calculate Study Streak (consecutive days up to today)
    let streakDays = 0;
    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(todayStart);
      checkDate.setDate(checkDate.getDate() - i);
      const key = checkDate.toISOString().slice(0, 10);
      if (heatmapMap.has(key) && heatmapMap.get(key)!.count > 0) {
        streakDays++;
      } else if (i === 0) {
        // If not studied yet today, check if yesterday had a streak
        continue;
      } else {
        break;
      }
    }

    // Build 84-day (12 weeks) Heatmap Grid
    const heatmapDays: Array<{ date: string; count: number }> = [];
    for (let i = 83; i >= 0; i--) {
      const d = new Date(todayStart);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      heatmapDays.push({
        date: key,
        count: heatmapMap.get(key)?.count || 0,
      });
    }

    return {
      newCount,
      learningCount,
      youngCount,
      matureCount,
      suspendedCount,
      totalCards: allWorkspaceCards.length,
      forecastDays,
      maxForecast: Math.max(5, ...forecastDays.map((f) => f.total)),
      intervalBuckets,
      maxIntervalBucket: Math.max(5, ...intervalBuckets.map((b) => b.count)),
      reviewsTodayCount,
      reviewsTodayMinutes: Math.max(0, Math.round(reviewsTodayTimeMs / 60000)),
      reviewsTodayRetention:
        reviewsTodayCount > 0
          ? Math.round(((reviewsTodayCount - reviewsTodayAgain) / reviewsTodayCount) * 100)
          : 100,
      averageEase: ratedCardsCount > 0 ? Math.round((totalEaseSum / ratedCardsCount) * 100) : 250,
      streakDays,
      heatmapDays,
    };
  }, [allWorkspaceCards]);

  // Close context menu on window click
  useEffect(() => {
    const handleWindowClick = () => {
      if (openMenuDeckId) setOpenMenuDeckId(null);
      if (isReviewMoreMenuOpen) setIsReviewMoreMenuOpen(false);
    };
    window.addEventListener("click", handleWindowClick);
    return () => window.removeEventListener("click", handleWindowClick);
  }, [openMenuDeckId, isReviewMoreMenuOpen]);

  const currentReviewCard = dueCards[currentCardIndex];
  const currentCardIntervals = useMemo(() => {
    if (!currentReviewCard) return { 1: "<1m", 2: "6m", 3: "10m", 4: "4d" };
    return previewAnkiIntervals(currentReviewCard, activeDeck?.options);
  }, [currentReviewCard, activeDeck?.options]);

  // Remaining queue counts during active review
  const reviewQueueCounts = useMemo(() => {
    let novos = 0;
    let aprendendo = 0;
    let revisar = 0;
    for (let i = currentCardIndex; i < dueCards.length; i++) {
      const c = dueCards[i];
      const st = c.state || (c.reps === 0 ? "new" : "review");
      if (st === "new" && c.reps === 0) novos++;
      else if (st === "learning" || st === "relearning") aprendendo++;
      else revisar++;
    }
    return { novos, aprendendo, revisar };
  }, [dueCards, currentCardIndex]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#141414] text-white font-sansation select-none overflow-hidden">
      {/* ─────────────────────────────────────────────────────────────────────
          ANKI CANONICAL TOP TOOLBAR (BARALHOS | ADICIONAR | PAINEL | ESTATÍSTICAS)
          ───────────────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 sm:px-6 h-12 border-b border-white/10 bg-[#141414] shrink-0 z-20">
        {/* Left: Active Context / Breadcrumb */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-white">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 14v4" />
              <path d="M14.172 2a2 2 0 0 1 1.414.586l3.828 3.828A2 2 0 0 1 20 7.828V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
              <path d="M8 14h8" />
              <rect x="8" y="10" width="8" height="8" rx="0" />
            </svg>
          </div>
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300 hidden sm:inline">
            ANKISRS
          </span>
          {activeDeck && (viewMode === "deck-hub" || viewMode === "review") && (
            <>
              <span className="text-zinc-600 font-mono text-xs">/</span>
              <button
                type="button"
                onClick={() => openDeckHub(activeDeck)}
                className="text-xs font-semibold text-white hover:text-zinc-300 truncate max-w-[160px] sm:max-w-[240px] cursor-pointer transition-colors"
              >
                {deckPaths.get(activeDeck.id) || activeDeck.nome}
              </button>
            </>
          )}
        </div>

        {/* Center: Canonical Anki 4-Item Navigation Bar */}
        <nav className="flex items-center bg-[#121212] border border-white/10 p-0.5 rounded-none">
          {/* 1. Baralhos (Decks) */}
          <button
            type="button"
            onClick={() => {
              setViewMode("decks");
              setActiveDeck(null);
            }}
            className={`h-7 px-3 text-xs font-semibold rounded-none flex items-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === "decks" || viewMode === "deck-hub" || viewMode === "review"
                ? "bg-white text-black font-bold"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            }`}
            title="Baralhos (Atalho: D)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
              <path d="M6 6h10" />
              <path d="M6 10h10" />
            </svg>
            <span>Baralhos</span>
          </button>

          {/* 2. Adicionar (Add) */}
          <button
            type="button"
            onClick={() => {
              setAddCardDeckId(activeDeck?.id || (decks.length > 0 ? decks[0].id : ""));
              setAddCardSuccessCount(0);
              setIsAddCardOpen(true);
            }}
            className="h-7 px-3 text-xs font-semibold rounded-none flex items-center gap-1.5 text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            title="Adicionar Cartão (Atalho: A)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Adicionar</span>
          </button>

          {/* 3. Painel (Browse) */}
          <button
            type="button"
            onClick={() => openBrowser(activeDeck ? `deck:${activeDeck.id}` : "all")}
            className={`h-7 px-3 text-xs font-semibold rounded-none flex items-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === "browser"
                ? "bg-white text-black font-bold"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            }`}
            title="Painel de Cartões (Atalho: B)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect width="18" height="18" x="3" y="3" rx="0" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
            <span>Painel</span>
          </button>

          {/* 4. Estatísticas (Stats) */}
          <button
            type="button"
            onClick={() => setViewMode("stats")}
            className={`h-7 px-3 text-xs font-semibold rounded-none flex items-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === "stats"
                ? "bg-white text-black font-bold"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            }`}
            title="Estatísticas e Retenção (Atalho: T)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span className="hidden md:inline">Estatísticas</span>
          </button>
        </nav>

        {/* Right: Quick Utilities & Close */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setImportDeckId(activeDeck?.id || (decks.length > 0 ? decks[0].id : ""));
              setImportingStatus(null);
              setIsImportExportOpen(true);
            }}
            className="h-7 px-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white rounded-none text-xs font-semibold hidden sm:flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Importar ou Exportar Pacotes de Cartões"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="hidden lg:inline">Importar / Exportar</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-none text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            title="Fechar aba Flashcards"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────────────
          MAIN VIEWPORT AREA
          ───────────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* ===================================================================
            VIEW 1: ANKI DECKS TREE VIEW (BARALHOS)
            =================================================================== */}
        {viewMode === "decks" && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex flex-col items-center justify-between">
            <div className="w-full max-w-[900px] flex flex-col gap-5">
              {/* Top Summary Banner */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div>
                  <h1 className="text-base font-bold uppercase tracking-wider text-white">
                    Baralhos de Estudo
                  </h1>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Use <code className="font-mono text-zinc-300 bg-white/5 px-1 border border-white/10">Pai::Filho</code> ao nomear para criar sub-baralhos hierárquicos automaticamente.
                  </p>
                </div>

                {/* Daily Counters Summary */}
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#181818] border border-white/10 rounded-none">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-400">Novos:</span>
                    <strong className="text-sky-400 font-bold">{overallTotals.novos}</strong>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#181818] border border-white/10 rounded-none">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-400">Aprender:</span>
                    <strong className="text-amber-400 font-bold">{overallTotals.aprendendo}</strong>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#181818] border border-white/10 rounded-none">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-400">Revisar:</span>
                    <strong className="text-emerald-400 font-bold">{overallTotals.aRevisar}</strong>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#181818] border border-white/10 rounded-none">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-400">Sequência:</span>
                    <strong className="text-white font-bold">{ankiStats.streakDays}d</strong>
                  </div>
                </div>
              </div>

              {/* Anki Tree Table */}
              <div className="bg-[#181818] border border-white/10 rounded-none overflow-visible">
                {/* Table Header */}
                <div className="grid grid-cols-[1fr_65px_65px_65px_36px] sm:grid-cols-[1fr_90px_90px_90px_80px_48px] px-4 py-2.5 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 border-b border-white/10 bg-[#121212]">
                  <div>Baralho</div>
                  <div className="text-right">Novos</div>
                  <div className="text-right">Aprender</div>
                  <div className="text-right">Revisar</div>
                  <div className="hidden sm:block text-right">Total</div>
                  <div className="text-center">Opções</div>
                </div>

                {/* Table Rows */}
                {loading ? (
                  <div className="p-12 text-center text-xs text-zinc-400 font-mono">
                    Sincronizando coleção de baralhos...
                  </div>
                ) : flattenedDeckNodes.length === 0 ? (
                  <div className="p-14 text-center flex flex-col items-center gap-3">
                    <div className="w-11 h-11 border border-white/10 bg-[#121212] rounded-none flex items-center justify-center text-zinc-400">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect width="18" height="18" x="3" y="3" />
                        <line x1="12" y1="8" x2="12" y2="16" />
                        <line x1="8" y1="12" x2="16" y2="12" />
                      </svg>
                    </div>
                    <p className="m-0 text-xs font-bold uppercase tracking-wider text-white font-mono">
                      Nenhum Baralho na Coleção
                    </p>
                    <p className="m-0 text-xs text-zinc-400 max-w-[360px]">
                      Crie um baralho ou importe uma coleção existente (.txt / .csv / .json) para iniciar suas revisões espaçadas.
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDeckParentIdForCreate(null);
                          setIsCreateDeckOpen(true);
                        }}
                        className="h-8 px-4 bg-white text-black hover:bg-zinc-200 text-xs font-bold rounded-none transition-colors cursor-pointer"
                      >
                        Criar Baralho
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsImportExportOpen(true)}
                        className="h-8 px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white text-xs font-semibold rounded-none transition-colors cursor-pointer"
                      >
                        Importar Arquivo
                      </button>
                    </div>
                  </div>
                ) : (
                  flattenedDeckNodes.map((node) => {
                    const deck = node.deck;
                    const hasChildren = node.children && node.children.length > 0;
                    const isExpanded = expandedDeckIds.has(deck.id);

                    return (
                      <div
                        key={deck.id}
                        onClick={() => openDeckHub(deck)}
                        className="grid grid-cols-[1fr_65px_65px_65px_36px] sm:grid-cols-[1fr_90px_90px_90px_80px_48px] items-center px-4 py-2.5 border-b border-white/10 hover:bg-white/5 transition-colors cursor-pointer text-xs group"
                      >
                        {/* Deck Name & Hierarchy Tree Expand Button */}
                        <div
                          className="flex items-center overflow-hidden pr-2"
                          style={{ paddingLeft: `${Math.min(node.depth * 18, 72)}px` }}
                        >
                          {hasChildren ? (
                            <button
                              type="button"
                              onClick={(e) => toggleExpand(deck.id, e)}
                              className="w-5 h-5 flex items-center justify-center rounded-none hover:bg-white/10 text-zinc-400 hover:text-white mr-1.5 cursor-pointer shrink-0 font-mono text-xs font-bold"
                              title={isExpanded ? "Recolher sub-baralhos" : "Expandir sub-baralhos"}
                            >
                              {isExpanded ? "−" : "+"}
                            </button>
                          ) : (
                            <div className="w-5 mr-1.5 flex items-center justify-center shrink-0">
                              <span className="w-1 h-1 bg-zinc-600" />
                            </div>
                          )}

                          <span className="font-semibold text-white group-hover:text-zinc-100 truncate">
                            {deck.nome}
                          </span>
                        </div>

                        {/* Novos (Sky Blue when > 0) */}
                        <div
                          className={`text-right font-mono font-bold ${
                            deck.stats.novos > 0 ? "text-sky-400" : "text-zinc-600"
                          }`}
                        >
                          {deck.stats.novos}
                        </div>

                        {/* Aprendendo (Amber/Orange when > 0) */}
                        <div
                          className={`text-right font-mono font-bold ${
                            deck.stats.aprendendo > 0 ? "text-amber-400" : "text-zinc-600"
                          }`}
                        >
                          {deck.stats.aprendendo}
                        </div>

                        {/* A Revisar (Emerald Green when > 0) */}
                        <div
                          className={`text-right font-mono font-bold ${
                            deck.stats.aRevisar > 0 ? "text-emerald-400" : "text-zinc-600"
                          }`}
                        >
                          {deck.stats.aRevisar}
                        </div>

                        {/* Total */}
                        <div className="hidden sm:block text-right font-mono text-zinc-500">
                          {deck.stats.total}
                        </div>

                        {/* Gear Context Menu (Anki Gear Icon) */}
                        <div className="text-center relative" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuDeckId(openMenuDeckId === deck.id ? null : deck.id);
                            }}
                            className="w-6 h-6 inline-flex items-center justify-center rounded-none text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                            title="Opções do Baralho"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="3" />
                              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                            </svg>
                          </button>

                          {openMenuDeckId === deck.id && (
                            <div className="absolute right-0 top-7 z-50 w-48 bg-[#181818] border border-white/10 rounded-none p-1 shadow-2xl text-left text-xs">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuDeckId(null);
                                  openDeckHub(deck);
                                }}
                                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-none text-zinc-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                                <span>Estudar Baralho</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuDeckId(null);
                                  setOptionsDeck(deck);
                                  setDeckOptionsDraft({ ...DEFAULT_DECK_OPTIONS, ...(deck.options || {}) });
                                }}
                                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-none text-zinc-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <line x1="4" y1="21" x2="4" y2="14" />
                                  <line x1="4" y1="10" x2="4" y2="3" />
                                  <line x1="12" y1="21" x2="12" y2="12" />
                                  <line x1="12" y1="8" x2="12" y2="3" />
                                  <line x1="20" y1="21" x2="20" y2="16" />
                                  <line x1="20" y1="12" x2="20" y2="3" />
                                </svg>
                                <span>Opções do Baralho</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuDeckId(null);
                                  setDeckParentIdForCreate(deck.id);
                                  setIsCreateDeckOpen(true);
                                }}
                                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-none text-zinc-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <line x1="12" y1="5" x2="12" y2="19" />
                                  <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                                <span>Criar Sub-baralho</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuDeckId(null);
                                  setEditingDeck(deck);
                                  setEditDeckName(deck.nome);
                                  setEditDeckDesc(deck.descricao || "");
                                  setEditDeckParentId(deck.parentId || null);
                                  setIsEditDeckOpen(true);
                                }}
                                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-none text-zinc-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                </svg>
                                <span>Renomear</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuDeckId(null);
                                  setExportDeckFilter(deck.id);
                                  setImportExportTab("export");
                                  setIsImportExportOpen(true);
                                }}
                                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-none text-zinc-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                  <polyline points="7 10 12 15 17 10" />
                                  <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                <span>Exportar Baralho</span>
                              </button>

                              <div className="h-[1px] bg-white/10 my-1" />

                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuDeckId(null);
                                  setDeletingDeck(deck);
                                }}
                                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-none text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M3 6h18" />
                                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                </svg>
                                <span>Excluir</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/*Today's Study Status Footer Summary (Anki Bottom Status Text) */}
              <div className="text-center text-xs text-zinc-400 font-mono py-1">
                Estudados <strong className="text-white">{ankiStats.reviewsTodayCount} cartões</strong> em{" "}
                <strong className="text-white">{ankiStats.reviewsTodayMinutes} min</strong> hoje.
              </div>
            </div>

            {/* Anki Bottom Action Bar: Criar Baralho | Importar Arquivo */}
            <div className="w-full max-w-[900px] pt-4 border-t border-white/10 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setDeckParentIdForCreate(null);
                  setIsCreateDeckOpen(true);
                }}
                className="h-8 px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 hover:text-white rounded-none text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Criar Baralho</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setImportExportTab("import");
                  setIsImportExportOpen(true);
                }}
                className="h-8 px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 hover:text-white rounded-none text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>Importar Arquivo</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setImportExportTab("export");
                  setIsImportExportOpen(true);
                }}
                className="h-8 px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 hover:text-white rounded-none text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Exportar Coleção</span>
              </button>
            </div>
          </div>
        )}

        {/* ===================================================================
            VIEW 2: ANKI DECK OVERVIEW HUB
            =================================================================== */}
        {viewMode === "deck-hub" && activeDeck && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex flex-col items-center justify-center">
            <div className="w-full max-w-[560px] bg-[#181818] border border-white/10 p-6 sm:p-8 flex flex-col items-center text-center shadow-2xl">
              {/* Hierarchy Path */}
              <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1">
                {deckPaths.get(activeDeck.id) || activeDeck.nome}
              </div>

              <h2 className="text-xl font-bold uppercase tracking-wider text-white mb-2">
                {activeDeck.nome}
              </h2>

              {activeDeck.descricao && (
                <p className="text-xs text-zinc-400 mb-5 leading-relaxed max-w-[440px]">
                  {activeDeck.descricao}
                </p>
              )}

              {/* Anki 3-Column Counts Table */}
              <div className="w-full bg-[#121212] border border-white/10 p-4 my-3 mb-6 grid grid-cols-3 divide-x divide-white/10">
                <div className="flex flex-col items-center">
                  <span className="text-2xl font-bold font-mono text-sky-400">
                    {activeDeck.stats.novos}
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 mt-1">
                    Novos
                  </span>
                </div>

                <div className="flex flex-col items-center">
                  <span className="text-2xl font-bold font-mono text-amber-400">
                    {activeDeck.stats.aprendendo}
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 mt-1">
                    Aprendendo
                  </span>
                </div>

                <div className="flex flex-col items-center">
                  <span className="text-2xl font-bold font-mono text-emerald-400">
                    {activeDeck.stats.aRevisar}
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 mt-1">
                    A Revisar
                  </span>
                </div>
              </div>

              {/* Primary Study Action */}
              <div className="flex flex-col gap-2.5 w-full">
                <button
                  type="button"
                  onClick={() => startReview(activeDeck)}
                  disabled={dueCards.length === 0 || loadingDeckDetails}
                  className={`h-10 text-xs font-bold rounded-none flex items-center justify-center gap-2 transition-colors cursor-pointer uppercase tracking-wider ${
                    dueCards.length === 0
                      ? "bg-white/5 border border-white/10 text-zinc-500 cursor-not-allowed"
                      : "bg-white hover:bg-zinc-200 text-black"
                  }`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span>
                    {loadingDeckDetails
                      ? "Carregando Fila..."
                      : dueCards.length === 0
                      ? "Parabéns! Você concluiu este baralho por agora"
                      : `Estudar Agora (${dueCards.length} cartões)`}
                  </span>
                </button>

                {/* Anki Deck Hub Bottom Action Bar: Opções | Estudo Personalizado | Painel */}
                <div className="grid grid-cols-3 gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOptionsDeck(activeDeck);
                      setDeckOptionsDraft({ ...DEFAULT_DECK_OPTIONS, ...(activeDeck.options || {}) });
                    }}
                    className="h-8 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white rounded-none text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>Opções</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsCustomStudyOpen(true)}
                    className="h-8 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white rounded-none text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>Estudo Personalizado</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openBrowser(`deck:${activeDeck.id}`)}
                    className="h-8 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white rounded-none text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>Painel ({activeDeckCards.length})</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            VIEW 3: ANKI REVIEWER (SESSÃO DE ESTUDO ATIVA)
            =================================================================== */}
        {viewMode === "review" && (
          <div className="flex-1 flex flex-col justify-between p-4 sm:p-6 overflow-y-auto relative">
            {reviewSuccessFeedback ? (
              <div className="my-auto mx-auto max-w-md w-full text-center flex flex-col items-center gap-4 bg-[#181818] border border-white/10 p-8 rounded-none shadow-2xl">
                <div className="w-12 h-12 rounded-none bg-white/5 border border-white/10 flex items-center justify-center text-emerald-400">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h3 className="m-0 text-sm font-bold uppercase tracking-wider text-white">
                  Baralho Concluído!
                </h3>
                <p className="m-0 text-xs text-zinc-400 leading-relaxed">
                  {reviewSuccessFeedback}
                </p>
                <div className="flex items-center gap-2 mt-2 w-full">
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode("decks");
                      setActiveDeck(null);
                    }}
                    className="flex-1 h-8 px-4 bg-white hover:bg-zinc-200 text-black font-bold text-xs rounded-none transition-colors cursor-pointer"
                  >
                    Voltar aos Baralhos
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCustomStudyOpen(true)}
                    className="h-8 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white font-semibold text-xs rounded-none transition-colors cursor-pointer"
                  >
                    Estudo Extra
                  </button>
                </div>
              </div>
            ) : currentReviewCard ? (
              <>
                {/* Reviewer Top Status Header: Edit | Queue Counts (Blue + Orange + Green) | Timer & Undo & Flag */}
                <div className="w-full max-w-[740px] mx-auto flex items-center justify-between gap-2 pb-3 border-b border-white/10 shrink-0">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        selectCardInBrowser(currentReviewCard);
                        setViewMode("browser");
                      }}
                      className="h-7 px-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white text-xs font-semibold rounded-none transition-colors cursor-pointer"
                      title="Editar cartão atual no Painel"
                    >
                      Editar
                    </button>

                    {undoStack.length > 0 && (
                      <button
                        type="button"
                        onClick={handleUndoReview}
                        className="h-7 px-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white text-xs font-mono rounded-none transition-colors cursor-pointer"
                        title="Desfazer última avaliação (Atalho: Z ou Ctrl+Z)"
                      >
                        ↩ Desfazer
                      </button>
                    )}
                  </div>

                  {/* Canonical Anki Live Queue Counters (Blue + Orange + Green) */}
                  <div className="flex items-center gap-3 font-mono text-xs bg-[#181818] border border-white/10 px-3 py-1">
                    <span
                      className={
                        (currentReviewCard.state || "new") === "new" && currentReviewCard.reps === 0
                          ? "text-sky-400 font-bold underline underline-offset-4"
                          : "text-sky-400/80"
                      }
                      title="Novos restantes"
                    >
                      {reviewQueueCounts.novos}
                    </span>
                    <span className="text-zinc-600">+</span>
                    <span
                      className={
                        currentReviewCard.state === "learning" || currentReviewCard.state === "relearning"
                          ? "text-amber-400 font-bold underline underline-offset-4"
                          : "text-amber-400/80"
                      }
                      title="Em aprendizagem"
                    >
                      {reviewQueueCounts.aprendendo}
                    </span>
                    <span className="text-zinc-600">+</span>
                    <span
                      className={
                        currentReviewCard.state === "review"
                          ? "text-emerald-400 font-bold underline underline-offset-4"
                          : "text-emerald-400/80"
                      }
                      title="A revisar"
                    >
                      {reviewQueueCounts.revisar}
                    </span>
                  </div>

                  {/* Right: Flag Indicator & Timer */}
                  <div className="flex items-center gap-2">
                    {currentReviewCard.flag && currentReviewCard.flag > 0 ? (
                      <span
                        className={`px-2 py-0.5 text-[10px] font-mono uppercase border ${
                          ANKI_FLAGS[currentReviewCard.flag]?.bgClass
                        } ${ANKI_FLAGS[currentReviewCard.flag]?.colorClass} ${
                          ANKI_FLAGS[currentReviewCard.flag]?.borderClass
                        }`}
                      >
                        Flag: {ANKI_FLAGS[currentReviewCard.flag]?.label}
                      </span>
                    ) : null}

                    {(activeDeck?.options?.showAnswerTimer ?? true) && (
                      <span className="text-xs font-mono text-zinc-500">
                        {elapsedSeconds}s
                      </span>
                    )}
                  </div>
                </div>

                {/* Main Card Canvas */}
                <div className="w-full max-w-[740px] mx-auto my-auto py-4 flex-1 flex flex-col justify-center">
                  <div className="w-full min-h-[300px] bg-[#181818] border border-white/10 p-6 sm:p-8 flex flex-col justify-between shadow-2xl relative">
                    {/* Card Metadata Header */}
                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-wider text-zinc-400 border-b border-white/10 pb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 bg-[#121212] border border-white/10 text-zinc-300">
                          {NOTE_TYPE_DEFINITIONS.find((t) => t.id === currentReviewCard.tipo)?.shortLabel || "Básico"}
                          {currentReviewCard.tipo === "cloze" && currentReviewCard.clozeIndex
                            ? ` c${currentReviewCard.clozeIndex}`
                            : ""}
                        </span>
                        {(currentReviewCard.tags || []).map((tag) => (
                          <span
                            key={tag}
                            className={`px-1.5 py-0.5 border ${
                              tag === "leech"
                                ? "bg-red-500/10 border-red-500/30 text-red-400"
                                : "bg-white/5 border-white/10 text-zinc-400"
                            }`}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                      <span className="text-zinc-500">
                        Ivl: {currentReviewCard.interval}d • Ease: {Math.round((currentReviewCard.easeFactor || 2.5) * 100)}%
                      </span>
                    </div>

                    {/* Question / Front Content */}
                    <div className="my-6 flex flex-col items-center justify-center text-center gap-4">
                      <div className="text-lg sm:text-xl font-medium text-white leading-relaxed whitespace-pre-wrap max-w-[640px]">
                        {currentReviewCard.tipo === "cloze"
                          ? renderClozeNodes(
                              currentReviewCard.frente,
                              currentReviewCard.clozeIndex || 1,
                              isFlipped
                            )
                          : currentReviewCard.frente}
                      </div>

                      {/* Type-in-the-Answer Input Box */}
                      {currentReviewCard.tipo === "basic_type" && !isFlipped && (
                        <div className="w-full max-w-md mt-2">
                          <input
                            ref={typeAnswerInputRef}
                            type="text"
                            value={typedAnswer}
                            onChange={(e) => setTypedAnswer(e.target.value)}
                            placeholder="Digite a resposta exata e pressione Enter..."
                            className="w-full h-9 px-3 bg-[#121212] border border-white/20 focus:border-white text-xs font-mono text-white placeholder-zinc-500 outline-none rounded-none text-center"
                          />
                        </div>
                      )}

                      {/* Answer / Back Section */}
                      {isFlipped && (
                        <div className="w-full mt-4 pt-5 border-t border-white/10 flex flex-col items-center gap-4 animate-in fade-in duration-150">
                          {/* Type-in-the-answer character comparison */}
                          {currentReviewCard.tipo === "basic_type" && (
                            <div className="w-full max-w-md bg-[#121212] border border-white/10 p-3 font-mono text-xs flex flex-col gap-1.5 text-left">
                              <div className="text-[10px] text-zinc-500 uppercase">Comparação de Resposta:</div>
                              <div className="flex flex-wrap gap-0.5">
                                {Array.from(currentReviewCard.verso || "").map((expectedChar, idx) => {
                                  const actualChar = typedAnswer[idx] || "";
                                  const isMatch =
                                    actualChar.toLowerCase() === expectedChar.toLowerCase();
                                  return (
                                    <span
                                      key={idx}
                                      className={`px-1 py-0.5 ${
                                        isMatch
                                          ? "bg-emerald-500/20 text-emerald-300"
                                          : "bg-red-500/20 text-red-300 underline"
                                      }`}
                                    >
                                      {expectedChar}
                                    </span>
                                  );
                                })}
                              </div>
                              <div className="text-[11px] text-zinc-400">
                                Você digitou:{" "}
                                <strong className="text-white">{typedAnswer || "(em branco)"}</strong>
                              </div>
                            </div>
                          )}

                          {/* Standard Back Text (if not Cloze, or if Cloze has verso/extra) */}
                          {currentReviewCard.tipo !== "cloze" && currentReviewCard.verso && (
                            <div className="text-base text-zinc-200 leading-relaxed whitespace-pre-wrap max-w-[640px]">
                              {currentReviewCard.verso}
                            </div>
                          )}

                          {/* Extra Field (For Cloze or Basic Extra Notes) */}
                          {(currentReviewCard.extra ||
                            (currentReviewCard.tipo === "cloze" && currentReviewCard.verso)) && (
                            <div className="w-full max-w-[580px] bg-[#121212] border border-white/10 p-3.5 text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap text-left">
                              <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1">
                                Informações Extras
                              </div>
                              {currentReviewCard.extra || currentReviewCard.verso}
                            </div>
                          )}

                          {/* Attached Workspace Note */}
                          {currentReviewCard.nota && (
                            <div
                              className="w-full bg-[#121212] border border-white/10 p-3.5 text-left flex flex-col gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                                <span className="text-xs font-bold text-white uppercase tracking-wider truncate">
                                  Nota: {currentReviewCard.nota.titulo}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onOpenNota(currentReviewCard.nota);
                                    onClose();
                                  }}
                                  className="h-6 px-2 text-[11px] font-semibold bg-white/10 hover:bg-white/20 border border-white/10 text-white cursor-pointer"
                                >
                                  Abrir no Editor ↗
                                </button>
                              </div>
                              {currentReviewCard.nota.conteudo && (
                                <div
                                  className="max-h-[160px] overflow-y-auto text-xs leading-relaxed text-zinc-300 prose dark:prose-invert max-w-none"
                                  dangerouslySetInnerHTML={{
                                    __html: sanitizeHtml(ensureHtmlContent(currentReviewCard.nota.conteudo)),
                                  }}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Card Bottom Hint */}
                    <div className="text-center text-[11px] font-mono text-zinc-500">
                      {!isFlipped
                        ? "Pressione [Espaço] ou clique em Mostrar Resposta"
                        : "Avalie sua resposta com as teclas [1] Denovo, [2] Difícil, [3] Bom, [4] Fácil"}
                    </div>
                  </div>
                </div>

                {/* Reviewer Bottom Action Bar: Mostrar Resposta / 4 Grades + "Mais" Menu */}
                <div className="w-full max-w-[740px] mx-auto pt-3 border-t border-white/10 flex items-center justify-between gap-3 shrink-0">
                  <div className="text-xs font-mono text-zinc-500 hidden sm:block">
                    {currentCardIndex + 1} / {dueCards.length}
                  </div>

                  {/* Center: Reveal or 4 Grade Buttons */}
                  <div className="flex-1 flex items-center justify-center">
                    {!isFlipped ? (
                      <button
                        type="button"
                        onClick={() => setIsFlipped(true)}
                        className="h-10 px-8 bg-white hover:bg-zinc-200 text-black font-bold text-xs rounded-none flex items-center gap-2 transition-colors cursor-pointer uppercase tracking-wider"
                      >
                        <span>Mostrar Resposta</span>
                        <kbd className="text-[10px] font-mono px-1.5 py-0.5 bg-black/10 text-black hidden sm:inline">
                          Espaço
                        </kbd>
                      </button>
                    ) : (
                      <div className="grid grid-cols-4 gap-2 w-full max-w-[460px]">
                        {/* 1: Errei / Again */}
                        <button
                          type="button"
                          onClick={() => handleReviewGrade(1)}
                          className="flex flex-col items-center justify-center h-11 px-3 bg-[#181818] hover:bg-red-500/15 border border-white/10 hover:border-red-500/40 text-zinc-200 hover:text-red-300 transition-colors cursor-pointer rounded-none"
                        >
                          <span className="text-[10px] font-mono text-red-400">{currentCardIntervals[1]}</span>
                          <span className="text-xs font-bold">Errei (1)</span>
                        </button>

                        {/* 2: Difícil / Hard */}
                        <button
                          type="button"
                          onClick={() => handleReviewGrade(2)}
                          className="flex flex-col items-center justify-center h-11 px-3 bg-[#181818] hover:bg-amber-500/15 border border-white/10 hover:border-amber-500/40 text-zinc-200 hover:text-amber-300 transition-colors cursor-pointer rounded-none"
                        >
                          <span className="text-[10px] font-mono text-amber-400">{currentCardIntervals[2]}</span>
                          <span className="text-xs font-bold">Difícil (2)</span>
                        </button>

                        {/* 3: Bom / Good */}
                        <button
                          type="button"
                          onClick={() => handleReviewGrade(3)}
                          className="flex flex-col items-center justify-center h-11 px-3 bg-[#181818] hover:bg-emerald-500/15 border border-white/10 hover:border-emerald-500/40 text-zinc-200 hover:text-emerald-300 transition-colors cursor-pointer rounded-none"
                        >
                          <span className="text-[10px] font-mono text-emerald-400">{currentCardIntervals[3]}</span>
                          <span className="text-xs font-bold">Bom (3)</span>
                        </button>

                        {/* 4: Fácil / Easy */}
                        <button
                          type="button"
                          onClick={() => handleReviewGrade(4)}
                          className="flex flex-col items-center justify-center h-11 px-3 bg-[#181818] hover:bg-sky-500/15 border border-white/10 hover:border-sky-500/40 text-zinc-200 hover:text-sky-300 transition-colors cursor-pointer rounded-none"
                        >
                          <span className="text-[10px] font-mono text-sky-400">{currentCardIntervals[4]}</span>
                          <span className="text-xs font-bold">Fácil (4)</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Right: Anki "Mais ▾" Menu (Bury, Suspend, Flags) */}
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setIsReviewMoreMenuOpen((prev) => !prev)}
                      className="h-8 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white text-xs font-semibold rounded-none flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Mais</span>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>

                    {isReviewMoreMenuOpen && (
                      <div className="absolute bottom-full right-0 mb-1.5 w-52 bg-[#181818] border border-white/10 shadow-2xl p-1 z-50 text-xs flex flex-col gap-0.5">
                        <div className="px-2 py-1 text-[10px] font-mono uppercase text-zinc-500">
                          Marcar Cartão (Flag)
                        </div>
                        <div className="grid grid-cols-4 gap-1 px-2 py-1">
                          {ANKI_FLAGS.slice(1).map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => handleReviewQuickAction("flag", f.id)}
                              className={`h-6 text-[10px] font-mono border flex items-center justify-center cursor-pointer ${f.bgClass} ${f.colorClass} ${f.borderClass}`}
                              title={`${f.label} (${f.shortcut})`}
                            >
                              F{f.id}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => handleReviewQuickAction("flag", 0)}
                            className="h-6 text-[10px] font-mono border border-white/10 bg-white/5 text-zinc-400 flex items-center justify-center cursor-pointer"
                            title="Limpar Flag (Ctrl+0)"
                          >
                            ×
                          </button>
                        </div>

                        <div className="h-[1px] bg-white/10 my-1" />

                        <button
                          type="button"
                          onClick={() => handleReviewQuickAction("bury")}
                          className="w-full px-2.5 py-1.5 text-left text-zinc-300 hover:text-white hover:bg-white/5 flex items-center justify-between cursor-pointer"
                        >
                          <span>Ocultar / Enterrar Cartão</span>
                          <kbd className="text-[10px] font-mono text-zinc-500">-</kbd>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleReviewQuickAction("suspend")}
                          className="w-full px-2.5 py-1.5 text-left text-amber-400 hover:bg-amber-500/10 flex items-center justify-between cursor-pointer"
                        >
                          <span>Suspender Cartão</span>
                          <kbd className="text-[10px] font-mono text-zinc-500">@</kbd>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* ===================================================================
            VIEW 4: ANKI CARD BROWSER (PAINEL TRIPARTIDO)
            =================================================================== */}
        {viewMode === "browser" && (
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* LEFT PANE: ANKI FILTER TREE SIDEBAR */}
            <aside className="w-full lg:w-[230px] bg-[#121212] border-b lg:border-b-0 lg:border-r border-white/10 p-3 overflow-y-auto shrink-0 flex flex-col gap-3 max-h-[180px] lg:max-h-none">
              {/* System Filters */}
              <div>
                <div className="px-2 pb-1 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
                  Coleção & Fila
                </div>
                {[
                  { id: "all", label: "Toda a Coleção", count: allWorkspaceCards.length },
                  { id: "state:due", label: "Para Revisar Hoje (is:due)" },
                  { id: "state:new", label: "Novos (is:new)" },
                  { id: "state:learning", label: "Aprendendo (is:learn)" },
                  { id: "state:review", label: "Em Revisão (is:review)" },
                  { id: "state:suspended", label: "Suspensos (is:suspended)" },
                  { id: "state:buried", label: "Ocultos / Enterrados" },
                  { id: "state:leech", label: "Sanguessugas (Leech)" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setBrowserSidebarFilter(item.id)}
                    className={`w-full flex items-center justify-between px-2 py-1 text-xs rounded-none cursor-pointer transition-colors text-left ${
                      browserSidebarFilter === item.id
                        ? "bg-white/10 text-white font-semibold"
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
                    {item.count !== undefined && (
                      <span className="text-[10px] font-mono text-zinc-500">{item.count}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Decks Filter */}
              <div>
                <div className="px-2 pb-1 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
                  Baralhos
                </div>
                {decks.map((d) => {
                  const filterKey = `deck:${d.id}`;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setBrowserSidebarFilter(filterKey)}
                      className={`w-full flex items-center justify-between px-2 py-1 text-xs rounded-none cursor-pointer transition-colors text-left ${
                        browserSidebarFilter === filterKey
                          ? "bg-white/10 text-white font-semibold"
                          : "text-zinc-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <span className="truncate">{deckPaths.get(d.id) || d.nome}</span>
                      <span className="text-[10px] font-mono text-zinc-500">{d.stats.total}</span>
                    </button>
                  );
                })}
              </div>

              {/* Flags Filter */}
              <div>
                <div className="px-2 pb-1 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
                  Marcações (Flags)
                </div>
                {ANKI_FLAGS.slice(1).map((f) => {
                  const filterKey = `flag:${f.id}`;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setBrowserSidebarFilter(filterKey)}
                      className={`w-full flex items-center gap-2 px-2 py-1 text-xs rounded-none cursor-pointer transition-colors text-left ${
                        browserSidebarFilter === filterKey
                          ? "bg-white/10 text-white font-semibold"
                          : "text-zinc-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <span className="w-2 h-2 shrink-0" style={{ backgroundColor: f.dotColor }} />
                      <span className="truncate">{f.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Note Types Filter */}
              <div>
                <div className="px-2 pb-1 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
                  Tipos de Nota
                </div>
                {NOTE_TYPE_DEFINITIONS.map((nt) => {
                  const filterKey = `type:${nt.id}`;
                  return (
                    <button
                      key={nt.id}
                      type="button"
                      onClick={() => setBrowserSidebarFilter(filterKey)}
                      className={`w-full flex items-center justify-between px-2 py-1 text-xs rounded-none cursor-pointer transition-colors text-left ${
                        browserSidebarFilter === filterKey
                          ? "bg-white/10 text-white font-semibold"
                          : "text-zinc-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <span className="truncate">{nt.shortLabel}</span>
                    </button>
                  );
                })}
              </div>

              {/* Tags Filter */}
              <div>
                <div className="px-2 pb-1 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
                  Etiquetas (Tags)
                </div>
                <button
                  type="button"
                  onClick={() => setBrowserSidebarFilter("tag:untagged")}
                  className={`w-full flex items-center justify-between px-2 py-1 text-xs rounded-none cursor-pointer transition-colors text-left ${
                    browserSidebarFilter === "tag:untagged"
                      ? "bg-white/10 text-white font-semibold"
                      : "text-zinc-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <span>Sem Etiqueta</span>
                </button>
                {allWorkspaceTags.map(([tag, count]) => {
                  const filterKey = `tag:${tag}`;
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setBrowserSidebarFilter(filterKey)}
                      className={`w-full flex items-center justify-between px-2 py-1 text-xs rounded-none cursor-pointer transition-colors text-left font-mono ${
                        browserSidebarFilter === filterKey
                          ? "bg-white/10 text-white font-semibold"
                          : "text-zinc-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <span className="truncate">#{tag}</span>
                      <span className="text-[10px] text-zinc-500">{count}</span>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* CENTER PANE: SEARCH BAR + BULK ACTION BAR + CARDS DATA TABLE */}
            <div className="flex-1 flex flex-col overflow-hidden border-r border-white/10">
              {/* Search & Bulk Actions Header */}
              <div className="p-3 border-b border-white/10 bg-[#141414] flex flex-col gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={browserSearch}
                      onChange={(e) => setBrowserSearch(e.target.value)}
                      placeholder="Filtro Anki (ex: deck:Anatomia is:due tag:prova flag:1)..."
                      className="w-full h-8 pl-8 pr-3 bg-[#181818] border border-white/10 focus:border-white/30 rounded-none text-xs font-mono text-white placeholder-zinc-500 outline-none"
                    />
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="absolute left-2.5 top-2.5 text-zinc-500"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </div>

                  <span className="text-xs font-mono text-zinc-400 shrink-0">
                    {filteredBrowserCards.length} cartões
                  </span>
                </div>

                {/* Bulk Actions Bar when cards are selected */}
                {selectedCardIds.size > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 bg-[#181818] border border-white/10 text-xs">
                    <span className="font-mono text-[11px] text-zinc-300">
                      <strong className="text-white">{selectedCardIds.size}</strong> selecionado(s)
                    </span>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleBrowserBulkAction("suspend")}
                        className="h-6 px-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white text-[11px] cursor-pointer"
                      >
                        Suspender
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBrowserBulkAction("unsuspend")}
                        className="h-6 px-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white text-[11px] cursor-pointer"
                      >
                        Reativar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBrowserBulkAction("reset")}
                        className="h-6 px-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white text-[11px] cursor-pointer"
                        title="Reiniciar progresso SM-2 como Novo"
                      >
                        Esquecer / Resetar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBulkMoveDeckId(decks[0]?.id || "");
                          setIsBulkMoveOpen(true);
                        }}
                        className="h-6 px-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white text-[11px] cursor-pointer"
                      >
                        Mudar Baralho
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBulkTagInput("");
                          setIsBulkTagOpen(true);
                        }}
                        className="h-6 px-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white text-[11px] cursor-pointer"
                      >
                        + Tag
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBrowserBulkAction("delete")}
                        className="h-6 px-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-[11px] cursor-pointer"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Cards Table */}
              <div className="flex-1 overflow-auto">
                {filteredBrowserCards.length === 0 ? (
                  <div className="p-12 text-center text-xs text-zinc-500 font-mono">
                    Nenhum cartão corresponde ao filtro selecionado.
                  </div>
                ) : (
                  <table className="w-full min-w-[600px] border-collapse text-xs text-left">
                    <thead className="sticky top-0 z-10 bg-[#121212] border-b border-white/10 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
                      <tr>
                        <th className="py-2 px-3 w-8 text-center">
                          <input
                            type="checkbox"
                            checked={
                              filteredBrowserCards.length > 0 &&
                              selectedCardIds.size === filteredBrowserCards.length
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedCardIds(new Set(filteredBrowserCards.map((c) => c.id)));
                              } else {
                                setSelectedCardIds(new Set());
                              }
                            }}
                            className="accent-white cursor-pointer"
                          />
                        </th>
                        <th
                          onClick={() => {
                            if (browserSortField === "frente") setBrowserSortAsc(!browserSortAsc);
                            else {
                              setBrowserSortField("frente");
                              setBrowserSortAsc(true);
                            }
                          }}
                          className="py-2 px-3 cursor-pointer hover:text-white"
                        >
                          Campo de Ordenação (Frente)
                        </th>
                        <th className="py-2 px-3 w-[16%]">Tipo</th>
                        <th
                          onClick={() => {
                            if (browserSortField === "proximaRevisao") setBrowserSortAsc(!browserSortAsc);
                            else {
                              setBrowserSortField("proximaRevisao");
                              setBrowserSortAsc(true);
                            }
                          }}
                          className="py-2 px-3 w-[15%] cursor-pointer hover:text-white"
                        >
                          Vencimento
                        </th>
                        <th
                          onClick={() => {
                            if (browserSortField === "interval") setBrowserSortAsc(!browserSortAsc);
                            else {
                              setBrowserSortField("interval");
                              setBrowserSortAsc(false);
                            }
                          }}
                          className="py-2 px-3 w-[10%] text-right cursor-pointer hover:text-white"
                        >
                          Ivl
                        </th>
                        <th
                          onClick={() => {
                            if (browserSortField === "easeFactor") setBrowserSortAsc(!browserSortAsc);
                            else {
                              setBrowserSortField("easeFactor");
                              setBrowserSortAsc(false);
                            }
                          }}
                          className="py-2 px-3 w-[10%] text-right cursor-pointer hover:text-white"
                        >
                          Ease
                        </th>
                        <th
                          onClick={() => {
                            if (browserSortField === "deck") setBrowserSortAsc(!browserSortAsc);
                            else {
                              setBrowserSortField("deck");
                              setBrowserSortAsc(true);
                            }
                          }}
                          className="py-2 px-3 w-[18%] cursor-pointer hover:text-white"
                        >
                          Baralho
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBrowserCards.map((c) => {
                        const isSelected = selectedCardIds.has(c.id);
                        const isFocused = focusedBrowserCardId === c.id;
                        const flagObj = ANKI_FLAGS[c.flag || 0];

                        return (
                          <tr
                            key={c.id}
                            onClick={() => selectCardInBrowser(c)}
                            className={`border-b border-white/10 cursor-pointer transition-colors ${
                              isFocused
                                ? "bg-white/15 text-white"
                                : isSelected
                                ? "bg-white/10"
                                : c.suspended
                                ? "bg-amber-500/5 text-zinc-500"
                                : "hover:bg-white/5"
                            }`}
                          >
                            <td
                              className="py-2 px-3 text-center"
                              onClick={(e) => {
                                e.stopPropagation();
                                selectCardInBrowser(c, true);
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                readOnly
                                className="accent-white cursor-pointer"
                              />
                            </td>
                            <td className="py-2 px-3 max-w-[260px] truncate">
                              <div className="flex items-center gap-1.5 truncate">
                                {c.flag && c.flag > 0 ? (
                                  <span
                                    className="w-2 h-2 shrink-0"
                                    style={{ backgroundColor: flagObj?.dotColor }}
                                    title={flagObj?.label}
                                  />
                                ) : null}
                                {c.suspended && (
                                  <span className="text-[9px] font-mono px-1 bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    SUSP
                                  </span>
                                )}
                                <span className="font-medium truncate">
                                  {formatCleanPreview(c.frente)}
                                </span>
                              </div>
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-zinc-400">
                              {NOTE_TYPE_DEFINITIONS.find((t) => t.id === c.tipo)?.shortLabel || c.tipo}
                              {c.clozeIndex ? ` c${c.clozeIndex}` : ""}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-zinc-400">
                              {c.reps === 0 && (c.state || "new") === "new"
                                ? "Novo"
                                : new Date(c.proximaRevisao).toLocaleDateString("pt-BR")}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-right text-zinc-400">
                              {c.interval}d
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-right text-zinc-400">
                              {Math.round((c.easeFactor || 2.5) * 100)}%
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-zinc-400 truncate max-w-[140px]">
                              {deckPaths.get(c.deckId) || c.deck?.nome || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* RIGHT PANE: LIVE CARD INSPECTOR & EDITOR */}
            <aside className="w-full lg:w-[360px] bg-[#181818] p-4 overflow-y-auto shrink-0 flex flex-col gap-3">
              {!focusedBrowserCardId || !inspectorDraft ? (
                <div className="my-auto text-center text-xs text-zinc-500 font-mono p-6">
                  Selecione um cartão na tabela ao lado para inspecionar e editar seus campos, tags e agendamento.
                </div>
              ) : (
                <form onSubmit={handleSaveInspector} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between pb-2 border-b border-white/10">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                      Inspetor de Cartão
                    </span>
                    <button
                      type="submit"
                      disabled={savingInspector}
                      className="h-7 px-3 bg-white hover:bg-zinc-200 text-black text-xs font-bold rounded-none cursor-pointer transition-colors"
                    >
                      {savingInspector ? "Salvando..." : "Salvar"}
                    </button>
                  </div>

                  {/* Deck & Note Type */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-mono uppercase text-zinc-400 block mb-1">
                        Baralho
                      </label>
                      <select
                        value={inspectorDraft.deckId}
                        onChange={(e) =>
                          setInspectorDraft({ ...inspectorDraft, deckId: e.target.value })
                        }
                        className="w-full h-7 px-2 bg-[#121212] border border-white/10 text-xs text-white outline-none"
                      >
                        {decks.map((d) => (
                          <option key={d.id} value={d.id}>
                            {deckPaths.get(d.id) || d.nome}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono uppercase text-zinc-400 block mb-1">
                        Tipo de Nota
                      </label>
                      <select
                        value={inspectorDraft.tipo}
                        onChange={(e) =>
                          setInspectorDraft({
                            ...inspectorDraft,
                            tipo: e.target.value as NoteType,
                          })
                        }
                        className="w-full h-7 px-2 bg-[#121212] border border-white/10 text-xs text-white outline-none"
                      >
                        {NOTE_TYPE_DEFINITIONS.map((nt) => (
                          <option key={nt.id} value={nt.id}>
                            {nt.shortLabel}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Front Field */}
                  <div>
                    <label className="text-[10px] font-mono uppercase text-zinc-400 block mb-1">
                      {inspectorDraft.tipo === "cloze"
                        ? "Texto Cloze ({{c1::resposta}})"
                        : "Frente (Pergunta)"}
                    </label>
                    <textarea
                      value={inspectorDraft.frente}
                      onChange={(e) =>
                        setInspectorDraft({ ...inspectorDraft, frente: e.target.value })
                      }
                      rows={3}
                      className="w-full p-2 bg-[#121212] border border-white/10 focus:border-white/30 text-xs text-white outline-none resize-y"
                    />
                  </div>

                  {/* Back Field */}
                  <div>
                    <label className="text-[10px] font-mono uppercase text-zinc-400 block mb-1">
                      Verso (Resposta)
                    </label>
                    <textarea
                      value={inspectorDraft.verso}
                      onChange={(e) =>
                        setInspectorDraft({ ...inspectorDraft, verso: e.target.value })
                      }
                      rows={3}
                      className="w-full p-2 bg-[#121212] border border-white/10 focus:border-white/30 text-xs text-white outline-none resize-y"
                    />
                  </div>

                  {/* Extra Field */}
                  <div>
                    <label className="text-[10px] font-mono uppercase text-zinc-400 block mb-1">
                      Campo Extra (Notas de Rodapé / Contexto)
                    </label>
                    <textarea
                      value={inspectorDraft.extra}
                      onChange={(e) =>
                        setInspectorDraft({ ...inspectorDraft, extra: e.target.value })
                      }
                      rows={2}
                      className="w-full p-2 bg-[#121212] border border-white/10 focus:border-white/30 text-xs text-white outline-none resize-y"
                    />
                  </div>

                  {/* Tags & Flag */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-mono uppercase text-zinc-400 block mb-1">
                        Tags (separadas por espaço)
                      </label>
                      <input
                        type="text"
                        value={inspectorDraft.tagsInput}
                        onChange={(e) =>
                          setInspectorDraft({ ...inspectorDraft, tagsInput: e.target.value })
                        }
                        placeholder="anatomia cardio..."
                        className="w-full h-7 px-2 bg-[#121212] border border-white/10 text-xs font-mono text-white outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-mono uppercase text-zinc-400 block mb-1">
                        Marcação (Flag)
                      </label>
                      <select
                        value={inspectorDraft.flag}
                        onChange={(e) =>
                          setInspectorDraft({
                            ...inspectorDraft,
                            flag: parseInt(e.target.value, 10),
                          })
                        }
                        className="w-full h-7 px-2 bg-[#121212] border border-white/10 text-xs text-white outline-none"
                      >
                        {ANKI_FLAGS.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Linked Note */}
                  <div>
                    <label className="text-[10px] font-mono uppercase text-zinc-400 block mb-1">
                      Nota do Workspace Conectada
                    </label>
                    <select
                      value={inspectorDraft.notaId}
                      onChange={(e) =>
                        setInspectorDraft({ ...inspectorDraft, notaId: e.target.value })
                      }
                      className="w-full h-7 px-2 bg-[#121212] border border-white/10 text-xs text-white outline-none"
                    >
                      <option value="">-- Nenhuma nota --</option>
                      {notas.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.titulo}
                        </option>
                      ))}
                    </select>
                  </div>
                </form>
              )}
            </aside>
          </div>
        )}

        {/* ===================================================================
            VIEW 5: ANKI STATISTICS & RETENTION DASHBOARD (ESTATÍSTICAS)
            =================================================================== */}
        {viewMode === "stats" && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center">
            <div className="w-full max-w-[960px] flex flex-col gap-6">
              {/* Top Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-4 border-b border-white/10">
                <div>
                  <h1 className="text-base font-bold uppercase tracking-wider text-white">
                    Estatísticas da Coleção Anki
                  </h1>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Métricas de retenção espaçada, previsão futura, maturidade de cartões e calendário de consistência.
                  </p>
                </div>

                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="px-3 py-1 bg-[#181818] border border-white/10 text-zinc-300">
                    Retenção Hoje: <strong className="text-emerald-400">{ankiStats.reviewsTodayRetention}%</strong>
                  </span>
                  <span className="px-3 py-1 bg-[#181818] border border-white/10 text-zinc-300">
                    Facilidade Média: <strong className="text-white">{ankiStats.averageEase}%</strong>
                  </span>
                </div>
              </div>

              {/* 1. Today's KPI Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#181818] border border-white/10 p-4 flex flex-col">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                    Revisões Hoje
                  </span>
                  <span className="text-2xl font-bold font-mono text-white mt-1">
                    {ankiStats.reviewsTodayCount}
                  </span>
                  <span className="text-[11px] text-zinc-500 mt-1">
                    Tempo: {ankiStats.reviewsTodayMinutes} min
                  </span>
                </div>

                <div className="bg-[#181818] border border-white/10 p-4 flex flex-col">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                    Sequência Atual (Streak)
                  </span>
                  <span className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                    {ankiStats.streakDays} dias
                  </span>
                  <span className="text-[11px] text-zinc-500 mt-1">
                    Consistência diária
                  </span>
                </div>

                <div className="bg-[#181818] border border-white/10 p-4 flex flex-col">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                    Cartões Maduros (≥21d)
                  </span>
                  <span className="text-2xl font-bold font-mono text-sky-400 mt-1">
                    {ankiStats.matureCount}
                  </span>
                  <span className="text-[11px] text-zinc-500 mt-1">
                    Memória de longo prazo
                  </span>
                </div>

                <div className="bg-[#181818] border border-white/10 p-4 flex flex-col">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                    Total na Coleção
                  </span>
                  <span className="text-2xl font-bold font-mono text-white mt-1">
                    {ankiStats.totalCards}
                  </span>
                  <span className="text-[11px] text-zinc-500 mt-1">
                    {ankiStats.suspendedCount} suspensos
                  </span>
                </div>
              </div>

              {/* 2. Study Calendar Heatmap (Last 12 Weeks) */}
              <div className="bg-[#181818] border border-white/10 p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                      Calendário de Revisões (Últimos 84 Dias)
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Cada bloco representa um dia de estudo ativo na coleção.
                    </p>
                  </div>
                  <span className="text-xs font-mono text-zinc-400">
                    {ankiStats.streakDays}d seguidos
                  </span>
                </div>

                <div className="grid grid-cols-14 sm:grid-cols-28 gap-1.5 pt-2">
                  {ankiStats.heatmapDays.map((d) => {
                    const intensity =
                      d.count === 0
                        ? "bg-[#121212] border-white/5"
                        : d.count < 10
                        ? "bg-emerald-500/30 border-emerald-500/40"
                        : d.count < 30
                        ? "bg-emerald-500/60 border-emerald-400/50"
                        : "bg-emerald-400 border-emerald-300";
                    return (
                      <div
                        key={d.date}
                        title={`${d.date}: ${d.count} revisões`}
                        className={`h-4 w-full border ${intensity}`}
                      />
                    );
                  })}
                </div>
              </div>

              {/* 3. Future Due Forecast (Next 30 Days) & Card Maturity Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Future Due Bar Chart */}
                <div className="bg-[#181818] border border-white/10 p-5 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                      Previsão Futura (Próximos 30 Dias)
                    </h3>
                    <p className="text-[11px] text-zinc-400 mb-4">
                      Carga de revisões agendadas para as próximas semanas.
                    </p>
                  </div>

                  <div className="h-36 flex items-end gap-1 pt-4 border-b border-white/10">
                    {ankiStats.forecastDays.map((f, idx) => {
                      const heightPct = Math.round((f.total / ankiStats.maxForecast) * 100);
                      return (
                        <div
                          key={idx}
                          title={`${f.dateStr} (${f.label}): ${f.total} cartões`}
                          className="flex-1 h-full flex flex-col justify-end group"
                        >
                          <div
                            style={{ height: `${Math.max(f.total > 0 ? 8 : 2, heightPct)}%` }}
                            className={`w-full transition-all ${
                              f.total > 0
                                ? "bg-white group-hover:bg-sky-400"
                                : "bg-white/5"
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-zinc-500 pt-1.5">
                    <span>Hoje</span>
                    <span>+15 dias</span>
                    <span>+30 dias</span>
                  </div>
                </div>

                {/* Card Maturity & Interval Distribution */}
                <div className="bg-[#181818] border border-white/10 p-5 flex flex-col justify-between gap-4">
                  <div>
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                      Distribuição de Maturidade (Contagem de Cartões)
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Proporção entre cartões novos, em aprendizagem, jovens e maduros.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2.5 my-auto">
                    {[
                      { label: "Novos", count: ankiStats.newCount, color: "bg-sky-400" },
                      { label: "Aprendendo / Reaprendendo", count: ankiStats.learningCount, color: "bg-amber-400" },
                      { label: "Jovens (Revisão < 21d)", count: ankiStats.youngCount, color: "bg-emerald-400" },
                      { label: "Maduros (Revisão ≥ 21d)", count: ankiStats.matureCount, color: "bg-white" },
                      { label: "Suspensos", count: ankiStats.suspendedCount, color: "bg-zinc-600" },
                    ].map((row) => {
                      const pct =
                        ankiStats.totalCards > 0
                          ? Math.round((row.count / ankiStats.totalCards) * 100)
                          : 0;
                      return (
                        <div key={row.label} className="flex flex-col gap-1">
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-zinc-300">{row.label}</span>
                            <span className="text-white font-bold">
                              {row.count} ({pct}%)
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-[#121212] overflow-hidden">
                            <div className={`h-full ${row.color}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          MODAL 1: ADICIONAR CARTÃO (ANKI EDITOR WINDOW)
          ───────────────────────────────────────────────────────────────────── */}
      {isAddCardOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
          onClick={() => setIsAddCardOpen(false)}
        >
          <div
            className="bg-[#181818] border border-white/10 rounded-none max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-zinc-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-white/10 bg-[#121212] flex items-center justify-between shrink-0">
              <div>
                <h3 className="m-0 text-xs font-mono font-bold uppercase tracking-wider text-white">
                  Adicionar ao Anki
                </h3>
                <p className="m-0 text-[11px] text-zinc-400 mt-0.5">
                  Escolha o Tipo de Nota e o Baralho de destino.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddCardOpen(false)}
                className="w-6 h-6 flex items-center justify-center rounded-none text-zinc-400 hover:text-white hover:bg-white/5 cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddCardSubmit} className="p-5 flex flex-col gap-3.5 overflow-y-auto">
              {/* Top Selectors: Tipo de Nota & Baralho */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block mb-1">
                    Tipo de Nota
                  </label>
                  <select
                    value={addCardType}
                    onChange={(e) => setAddCardType(e.target.value as NoteType)}
                    className="w-full h-8 px-2.5 bg-[#121212] border border-white/10 focus:border-white/30 rounded-none text-xs text-white outline-none cursor-pointer"
                  >
                    {NOTE_TYPE_DEFINITIONS.map((nt) => (
                      <option key={nt.id} value={nt.id}>
                        {nt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block mb-1">
                    Baralho
                  </label>
                  <select
                    value={addCardDeckId}
                    onChange={(e) => setAddCardDeckId(e.target.value)}
                    className="w-full h-8 px-2.5 bg-[#121212] border border-white/10 focus:border-white/30 rounded-none text-xs text-white outline-none cursor-pointer"
                  >
                    {decks.map((d) => (
                      <option key={d.id} value={d.id}>
                        {deckPaths.get(d.id) || d.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Note Type Helper Description */}
              <div className="px-3 py-1.5 bg-[#121212] border border-white/10 text-[11px] text-zinc-400">
                {NOTE_TYPE_DEFINITIONS.find((n) => n.id === addCardType)?.desc}
              </div>

              {addCardType === "nota" ? (
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block mb-1">
                    Selecione a Nota do Workspace
                  </label>
                  <select
                    value={addCardNotaId}
                    onChange={(e) => setAddCardNotaId(e.target.value)}
                    required
                    className="w-full h-8 px-2.5 bg-[#121212] border border-white/10 text-xs text-white outline-none"
                  >
                    <option value="">-- Escolha uma nota --</option>
                    {notas.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.titulo}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  {/* Front / Cloze Text Field with Toolbar */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                        {addCardType === "cloze" ? "Texto (com Omissões Cloze)" : "Frente"}
                      </label>

                      {addCardType === "cloze" && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => insertClozeAtCursor(true)}
                            className="h-6 px-2 bg-white/10 hover:bg-white/20 border border-white/15 text-[10px] font-mono text-white cursor-pointer"
                            title="Envolver seleção em nova omissão {{cN::...}}"
                          >
                            [...] Nova Omissão
                          </button>
                          <button
                            type="button"
                            onClick={() => insertClozeAtCursor(false)}
                            className="h-6 px-2 bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono text-zinc-300 cursor-pointer"
                            title="Envolver seleção no mesmo índice atual"
                          >
                            [...] Mesmo Índice
                          </button>
                        </div>
                      )}
                    </div>

                    <textarea
                      ref={frenteInputRef}
                      value={addCardFrente}
                      onChange={(e) => setAddCardFrente(e.target.value)}
                      placeholder={
                        addCardType === "cloze"
                          ? "Ex: O {{c1::ventrículo esquerdo}} bombeia sangue para a {{c2::artéria aorta}}."
                          : "Digite a pergunta ou conceito..."
                      }
                      rows={3}
                      autoFocus
                      required
                      className="w-full p-2.5 bg-[#121212] border border-white/10 focus:border-white/30 rounded-none text-xs text-white placeholder-zinc-500 outline-none resize-y"
                    />
                  </div>

                  {/* Back / Extra Field */}
                  {addCardType !== "cloze" ? (
                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block mb-1">
                        {addCardType === "basic_type" ? "Resposta Exata (para digitar)" : "Verso"}
                      </label>
                      <textarea
                        value={addCardVerso}
                        onChange={(e) => setAddCardVerso(e.target.value)}
                        placeholder="Digite a resposta..."
                        rows={3}
                        required
                        className="w-full p-2.5 bg-[#121212] border border-white/10 focus:border-white/30 rounded-none text-xs text-white placeholder-zinc-500 outline-none resize-y"
                      />
                    </div>
                  ) : null}

                  {/* Extra Context Field */}
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block mb-1">
                      Verso Extra / Contexto Adicional (Opcional)
                    </label>
                    <input
                      type="text"
                      value={addCardExtra}
                      onChange={(e) => setAddCardExtra(e.target.value)}
                      placeholder="Mnemônico, referência bibliográfica ou observação clínica..."
                      className="w-full h-8 px-3 bg-[#121212] border border-white/10 focus:border-white/30 rounded-none text-xs text-white placeholder-zinc-500 outline-none"
                    />
                  </div>
                </>
              )}

              {/* Tags & Linked Note */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block mb-1">
                    Etiquetas / Tags (separadas por espaço)
                  </label>
                  <input
                    type="text"
                    value={addCardTags}
                    onChange={(e) => setAddCardTags(e.target.value)}
                    placeholder="Ex: anatomia prova_1 alta_prioridade"
                    className="w-full h-8 px-3 bg-[#121212] border border-white/10 focus:border-white/30 rounded-none text-xs font-mono text-white placeholder-zinc-500 outline-none"
                  />
                </div>

                {addCardType !== "nota" && (
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block mb-1">
                      Conectar a uma Nota (Opcional)
                    </label>
                    <select
                      value={addCardNotaId}
                      onChange={(e) => setAddCardNotaId(e.target.value)}
                      className="w-full h-8 px-2.5 bg-[#121212] border border-white/10 text-xs text-white outline-none"
                    >
                      <option value="">-- Nenhuma nota vinculada --</option>
                      {notas.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.titulo}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-white/10 mt-1">
                <span className="text-[11px] text-emerald-400 font-mono">
                  {addCardSuccessCount > 0 ? `✓ ${addCardSuccessCount} nota(s) adicionada(s)` : ""}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddCardOpen(false)}
                    className="h-8 px-3.5 text-xs font-semibold rounded-none bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white cursor-pointer"
                  >
                    Fechar
                  </button>
                  <button
                    type="submit"
                    className="h-8 px-4 text-xs font-bold rounded-none bg-white text-black hover:bg-zinc-200 cursor-pointer"
                  >
                    Adicionar
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          MODAL 2: OPÇÕES DO BARALHO (ANKI DECK OPTIONS PRESET)
          ───────────────────────────────────────────────────────────────────── */}
      {optionsDeck && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
          onClick={() => setOptionsDeck(null)}
        >
          <div
            className="bg-[#181818] border border-white/10 rounded-none max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-zinc-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-white/10 bg-[#121212] flex items-center justify-between shrink-0">
              <div>
                <h3 className="m-0 text-xs font-mono font-bold uppercase tracking-wider text-white">
                  Opções do Baralho • {optionsDeck.nome}
                </h3>
                <p className="m-0 text-[11px] text-zinc-400 mt-0.5">
                  Configure limites diários, passos de aprendizagem e multiplicadores SM-2.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOptionsDeck(null)}
                className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDeckOptionsSubmit} className="p-5 flex flex-col gap-4 overflow-y-auto text-xs">
              {/* Section 1: Daily Limits */}
              <div className="border border-white/10 bg-[#121212] p-3.5 flex flex-col gap-3">
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-white">
                  Limites Diários
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Novos cartões/dia</label>
                    <input
                      type="number"
                      min={0}
                      max={9999}
                      value={deckOptionsDraft.newCardsPerDay}
                      onChange={(e) =>
                        setDeckOptionsDraft({
                          ...deckOptionsDraft,
                          newCardsPerDay: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="w-full h-8 px-2.5 bg-[#181818] border border-white/10 font-mono text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Revisões máximas/dia</label>
                    <input
                      type="number"
                      min={0}
                      max={9999}
                      value={deckOptionsDraft.maxReviewsPerDay}
                      onChange={(e) =>
                        setDeckOptionsDraft({
                          ...deckOptionsDraft,
                          maxReviewsPerDay: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="w-full h-8 px-2.5 bg-[#181818] border border-white/10 font-mono text-white outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Novos Cartões & Passos */}
              <div className="border border-white/10 bg-[#121212] p-3.5 flex flex-col gap-3">
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-white">
                  Novos Cartões & Aprendizagem
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Passos (min)</label>
                    <input
                      type="text"
                      value={deckOptionsDraft.learningSteps}
                      onChange={(e) =>
                        setDeckOptionsDraft({ ...deckOptionsDraft, learningSteps: e.target.value })
                      }
                      placeholder="1 10"
                      className="w-full h-8 px-2.5 bg-[#181818] border border-white/10 font-mono text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Ivl Graduação (d)</label>
                    <input
                      type="number"
                      min={1}
                      value={deckOptionsDraft.graduatingInterval}
                      onChange={(e) =>
                        setDeckOptionsDraft({
                          ...deckOptionsDraft,
                          graduatingInterval: parseInt(e.target.value, 10) || 1,
                        })
                      }
                      className="w-full h-8 px-2.5 bg-[#181818] border border-white/10 font-mono text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Ivl Fácil (d)</label>
                    <input
                      type="number"
                      min={1}
                      value={deckOptionsDraft.easyInterval}
                      onChange={(e) =>
                        setDeckOptionsDraft({
                          ...deckOptionsDraft,
                          easyInterval: parseInt(e.target.value, 10) || 4,
                        })
                      }
                      className="w-full h-8 px-2.5 bg-[#181818] border border-white/10 font-mono text-white outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Lapsos (Falhas) */}
              <div className="border border-white/10 bg-[#121212] p-3.5 flex flex-col gap-3">
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-white">
                  Lapsos & Sanguessugas (Leeches)
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Reaprender (min)</label>
                    <input
                      type="text"
                      value={deckOptionsDraft.relearningSteps}
                      onChange={(e) =>
                        setDeckOptionsDraft({ ...deckOptionsDraft, relearningSteps: e.target.value })
                      }
                      placeholder="10"
                      className="w-full h-8 px-2.5 bg-[#181818] border border-white/10 font-mono text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Limite Sanguessuga</label>
                    <input
                      type="number"
                      min={1}
                      value={deckOptionsDraft.leechThreshold}
                      onChange={(e) =>
                        setDeckOptionsDraft({
                          ...deckOptionsDraft,
                          leechThreshold: parseInt(e.target.value, 10) || 8,
                        })
                      }
                      className="w-full h-8 px-2.5 bg-[#181818] border border-white/10 font-mono text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Ação Sanguessuga</label>
                    <select
                      value={deckOptionsDraft.leechAction}
                      onChange={(e) =>
                        setDeckOptionsDraft({
                          ...deckOptionsDraft,
                          leechAction: e.target.value as "tag" | "suspend",
                        })
                      }
                      className="w-full h-8 px-2 bg-[#181818] border border-white/10 text-white outline-none"
                    >
                      <option value="tag">Apenas Tag</option>
                      <option value="suspend">Suspender Card</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 4: Multiplicadores Avançados */}
              <div className="border border-white/10 bg-[#121212] p-3.5 flex flex-col gap-3">
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-white">
                  Multiplicadores de Agendamento
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Facilidade Inicial</label>
                    <input
                      type="number"
                      step="0.1"
                      value={deckOptionsDraft.startingEase}
                      onChange={(e) =>
                        setDeckOptionsDraft({
                          ...deckOptionsDraft,
                          startingEase: parseFloat(e.target.value) || 2.5,
                        })
                      }
                      className="w-full h-8 px-2.5 bg-[#181818] border border-white/10 font-mono text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Bônus Fácil</label>
                    <input
                      type="number"
                      step="0.05"
                      value={deckOptionsDraft.easyBonus}
                      onChange={(e) =>
                        setDeckOptionsDraft({
                          ...deckOptionsDraft,
                          easyBonus: parseFloat(e.target.value) || 1.3,
                        })
                      }
                      className="w-full h-8 px-2.5 bg-[#181818] border border-white/10 font-mono text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Mod. de Intervalo</label>
                    <input
                      type="number"
                      step="0.05"
                      value={deckOptionsDraft.intervalModifier}
                      onChange={(e) =>
                        setDeckOptionsDraft({
                          ...deckOptionsDraft,
                          intervalModifier: parseFloat(e.target.value) || 1.0,
                        })
                      }
                      className="w-full h-8 px-2.5 bg-[#181818] border border-white/10 font-mono text-white outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setDeckOptionsDraft(DEFAULT_DECK_OPTIONS)}
                  className="text-[11px] font-mono text-zinc-400 hover:text-white cursor-pointer"
                >
                  Restaurar Padrões do Anki
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOptionsDeck(null)}
                    className="h-8 px-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingDeckOptions}
                    className="h-8 px-4 bg-white text-black font-bold hover:bg-zinc-200 cursor-pointer"
                  >
                    {savingDeckOptions ? "Salvando..." : "Salvar Opções"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          MODAL 3: ESTUDO PERSONALIZADO (CUSTOM STUDY / CRAM)
          ───────────────────────────────────────────────────────────────────── */}
      {isCustomStudyOpen && activeDeck && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
          onClick={() => setIsCustomStudyOpen(false)}
        >
          <div
            className="bg-[#181818] border border-white/10 rounded-none max-w-md w-full p-5 flex flex-col gap-4 shadow-2xl text-zinc-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="m-0 text-xs font-mono font-bold uppercase tracking-wider text-white">
                Estudo Personalizado • {activeDeck.nome}
              </h3>
              <button
                type="button"
                onClick={() => setIsCustomStudyOpen(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-2.5 text-xs">
              {[
                { id: "cram_all", label: "Revisar todos os cartões do baralho (Cram / Véspera de Prova)" },
                { id: "preview_new", label: "Pré-visualizar apenas cartões Novos" },
                { id: "failed_today", label: "Revisar cartões esquecidos / com falha hoje" },
                { id: "by_state", label: "Estudar cartões por estado específico" },
                { id: "by_tag", label: "Estudar cartões com uma Tag específica" },
              ].map((opt) => (
                <label
                  key={opt.id}
                  className={`flex items-center gap-2.5 p-2.5 border cursor-pointer ${
                    customStudyMode === opt.id
                      ? "bg-white/10 border-white/30 text-white"
                      : "bg-[#121212] border-white/10 text-zinc-400"
                  }`}
                >
                  <input
                    type="radio"
                    name="customStudyMode"
                    checked={customStudyMode === opt.id}
                    onChange={() => setCustomStudyMode(opt.id as any)}
                    className="accent-white"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}

              {customStudyMode === "by_tag" && (
                <div>
                  <label className="text-[10px] font-mono uppercase text-zinc-400 block mb-1">
                    Escolha a Tag
                  </label>
                  <input
                    type="text"
                    value={customStudyTag}
                    onChange={(e) => setCustomStudyTag(e.target.value)}
                    placeholder="Ex: anatomia"
                    className="w-full h-8 px-2.5 bg-[#121212] border border-white/10 font-mono text-white outline-none"
                  />
                </div>
              )}

              {customStudyMode === "by_state" && (
                <div>
                  <label className="text-[10px] font-mono uppercase text-zinc-400 block mb-1">
                    Estado
                  </label>
                  <select
                    value={customStudyState}
                    onChange={(e) => setCustomStudyState(e.target.value)}
                    className="w-full h-8 px-2 bg-[#121212] border border-white/10 text-white outline-none"
                  >
                    <option value="new">Novos</option>
                    <option value="learning">Aprendendo</option>
                    <option value="review">Em Revisão</option>
                    <option value="relearning">Reaprendendo</option>
                  </select>
                </div>
              )}

              <div>
                <label className="text-[10px] font-mono uppercase text-zinc-400 block mb-1">
                  Limite máximo de cartões na sessão
                </label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={customStudyLimit}
                  onChange={(e) => setCustomStudyLimit(parseInt(e.target.value, 10) || 50)}
                  className="w-full h-8 px-2.5 bg-[#121212] border border-white/10 font-mono text-white outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setIsCustomStudyOpen(false)}
                className="h-8 px-3.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCustomStudyOpen(false);
                  startReview(activeDeck, {
                    mode: customStudyMode,
                    tag: customStudyTag,
                    state: customStudyState,
                    limit: customStudyLimit,
                  });
                }}
                className="h-8 px-4 text-xs font-bold bg-white text-black hover:bg-zinc-200 cursor-pointer"
              >
                Iniciar Sessão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          MODAL 4: IMPORTAR / EXPORTAR COLEÇÃO
          ───────────────────────────────────────────────────────────────────── */}
      {isImportExportOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
          onClick={() => setIsImportExportOpen(false)}
        >
          <div
            className="bg-[#181818] border border-white/10 rounded-none max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-zinc-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-white/10 bg-[#121212] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setImportExportTab("import")}
                  className={`px-3 py-1 text-xs font-mono uppercase cursor-pointer ${
                    importExportTab === "import"
                      ? "bg-white text-black font-bold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Importar
                </button>
                <button
                  type="button"
                  onClick={() => setImportExportTab("export")}
                  className={`px-3 py-1 text-xs font-mono uppercase cursor-pointer ${
                    importExportTab === "export"
                      ? "bg-white text-black font-bold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Exportar
                </button>
              </div>
              <button
                type="button"
                onClick={() => setIsImportExportOpen(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {importExportTab === "import" ? (
              <form onSubmit={handleImportSubmit} className="p-5 flex flex-col gap-3.5 overflow-y-auto text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono uppercase text-zinc-400 block mb-1">
                      Baralho de Destino
                    </label>
                    <select
                      value={importDeckId}
                      onChange={(e) => setImportDeckId(e.target.value)}
                      className="w-full h-8 px-2 bg-[#121212] border border-white/10 text-white outline-none"
                    >
                      {decks.map((d) => (
                        <option key={d.id} value={d.id}>
                          {deckPaths.get(d.id) || d.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase text-zinc-400 block mb-1">
                      Separador de Campos
                    </label>
                    <select
                      value={importSeparator}
                      onChange={(e) => setImportSeparator(e.target.value as any)}
                      className="w-full h-8 px-2 bg-[#121212] border border-white/10 text-white outline-none"
                    >
                      <option value="double_colon">Duplo Dois-Pontos (Pergunta :: Resposta)</option>
                      <option value="tab">Tabulação (Padrão Anki .txt / .tsv)</option>
                      <option value="semicolon">Ponto e Vírgula (Frente;Verso;Tags)</option>
                      <option value="comma">Vírgula (CSV)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-mono uppercase text-zinc-400">
                      Cole o conteúdo ou carregue um arquivo (.txt, .csv, .tsv)
                    </label>
                    <input
                      ref={importFileInputRef}
                      type="file"
                      accept=".txt,.csv,.tsv,.json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const content = String(ev.target?.result || "");
                          if (file.name.endsWith(".json")) {
                            try {
                              const arr = JSON.parse(content);
                              if (Array.isArray(arr)) {
                                api("/flashcards/cards/import", {
                                  method: "POST",
                                  body: JSON.stringify({
                                    workspaceId: workspace.id,
                                    defaultDeckId: importDeckId || activeDeck?.id,
                                    cards: arr,
                                  }),
                                }).then((r) => {
                                  setImportingStatus(`Importados ${r.imported} cartões do pacote JSON!`);
                                  loadDecksAndCards();
                                });
                                return;
                              }
                            } catch {}
                          }
                          setImportRawText(content);
                        };
                        reader.readAsText(file);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => importFileInputRef.current?.click()}
                      className="text-[11px] font-mono text-white underline cursor-pointer"
                    >
                      Escolher Arquivo...
                    </button>
                  </div>
                  <textarea
                    value={importRawText}
                    onChange={(e) => setImportRawText(e.target.value)}
                    rows={6}
                    placeholder={
                      "Qual a artéria principal do coração? :: Artéria Aorta\nO {{c1::nodo sinoatrial}} é o marcapasso natural do coração. :: Cardiologia"
                    }
                    className="w-full p-2.5 bg-[#121212] border border-white/10 font-mono text-xs text-white outline-none resize-y"
                  />
                </div>

                {importingStatus && (
                  <div className="p-2.5 bg-white/5 border border-white/10 font-mono text-xs text-emerald-400">
                    {importingStatus}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsImportExportOpen(false)}
                    className="h-8 px-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 cursor-pointer"
                  >
                    Fechar
                  </button>
                  <button
                    type="submit"
                    className="h-8 px-4 bg-white text-black font-bold hover:bg-zinc-200 cursor-pointer"
                  >
                    Importar Cartões
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-5 flex flex-col gap-4 text-xs">
                <div>
                  <label className="text-[10px] font-mono uppercase text-zinc-400 block mb-1">
                    Formato de Exportação
                  </label>
                  <select
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value as any)}
                    className="w-full h-8 px-2 bg-[#121212] border border-white/10 text-white outline-none"
                  >
                    <option value="anki_txt">Notas em Texto Simples do Anki (.txt separado por Tab)</option>
                    <option value="csv">Planilha CSV (.csv)</option>
                    <option value="json">Pacote Completo da Coleção com Agendamento (.json)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase text-zinc-400 block mb-1">
                    Incluir Baralhos
                  </label>
                  <select
                    value={exportDeckFilter}
                    onChange={(e) => setExportDeckFilter(e.target.value)}
                    className="w-full h-8 px-2 bg-[#121212] border border-white/10 text-white outline-none"
                  >
                    <option value="all">Todos os Baralhos ({allWorkspaceCards.length} cartões)</option>
                    {decks.map((d) => (
                      <option key={d.id} value={d.id}>
                        {deckPaths.get(d.id) || d.nome} ({d.stats.total})
                      </option>
                    ))}
                  </select>
                </div>

                {exportFormat === "json" && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportIncludeScheduling}
                      onChange={(e) => setExportIncludeScheduling(e.target.checked)}
                      className="accent-white"
                    />
                    <span>Incluir histórico de agendamento SM-2 (intervalos, facilidade e lapsos)</span>
                  </label>
                )}

                <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsImportExportOpen(false)}
                    className="h-8 px-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleExportDownload}
                    className="h-8 px-4 bg-white text-black font-bold hover:bg-zinc-200 cursor-pointer"
                  >
                    Baixar Exportação
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          MODAL 5: CRIAR NOVO BARALHO
          ───────────────────────────────────────────────────────────────────── */}
      {isCreateDeckOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
          onClick={() => setIsCreateDeckOpen(false)}
        >
          <div
            className="bg-[#181818] border border-white/10 rounded-none max-w-md w-full flex flex-col shadow-2xl overflow-hidden text-zinc-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-white/10 bg-[#121212] flex items-center justify-between">
              <h3 className="m-0 text-xs font-mono font-bold uppercase tracking-wider text-white">
                {deckParentIdForCreate ? "Novo Sub-baralho" : "Criar Baralho"}
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateDeckOpen(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateDeckSubmit} className="p-5 flex flex-col gap-3.5">
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block mb-1">
                  Nome do Baralho (suporta Pai::Filho)
                </label>
                <input
                  type="text"
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  placeholder="Ex: Medicina::Anatomia::Cardiovascular"
                  autoFocus
                  required
                  className="w-full h-8 px-3 bg-[#121212] border border-white/10 focus:border-white/30 rounded-none text-xs text-white placeholder-zinc-500 outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block mb-1">
                  Baralho Pai (Opcional)
                </label>
                <select
                  value={deckParentIdForCreate || ""}
                  onChange={(e) => setDeckParentIdForCreate(e.target.value || null)}
                  className="w-full h-8 px-2.5 bg-[#121212] border border-white/10 text-xs text-white outline-none"
                >
                  <option value="">-- Raiz Principal --</option>
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {deckPaths.get(d.id) || d.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block mb-1">
                  Descrição (Opcional)
                </label>
                <textarea
                  value={newDeckDesc}
                  onChange={(e) => setNewDeckDesc(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 bg-[#121212] border border-white/10 text-xs text-white outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsCreateDeckOpen(false)}
                  className="h-8 px-3.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-8 px-4 text-xs font-bold bg-white text-black hover:bg-zinc-200 cursor-pointer"
                >
                  Criar Baralho
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          MODAL 6: EDITAR / RENOMEAR BARALHO
          ───────────────────────────────────────────────────────────────────── */}
      {isEditDeckOpen && editingDeck && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
          onClick={() => setIsEditDeckOpen(false)}
        >
          <div
            className="bg-[#181818] border border-white/10 rounded-none max-w-md w-full flex flex-col shadow-2xl overflow-hidden text-zinc-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-white/10 bg-[#121212] flex items-center justify-between">
              <h3 className="m-0 text-xs font-mono font-bold uppercase tracking-wider text-white">
                Renomear Baralho
              </h3>
              <button
                type="button"
                onClick={() => setIsEditDeckOpen(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditDeckSubmit} className="p-5 flex flex-col gap-3.5">
              <div>
                <label className="text-[10px] font-mono uppercase text-zinc-400 block mb-1">
                  Nome do Baralho
                </label>
                <input
                  type="text"
                  value={editDeckName}
                  onChange={(e) => setEditDeckName(e.target.value)}
                  autoFocus
                  required
                  className="w-full h-8 px-3 bg-[#121212] border border-white/10 text-xs text-white outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-zinc-400 block mb-1">
                  Baralho Pai
                </label>
                <select
                  value={editDeckParentId || ""}
                  onChange={(e) => setEditDeckParentId(e.target.value || null)}
                  className="w-full h-8 px-2.5 bg-[#121212] border border-white/10 text-xs text-white outline-none"
                >
                  <option value="">-- Raiz (Nenhum) --</option>
                  {decks
                    .filter((d) => d.id !== editingDeck.id)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {deckPaths.get(d.id) || d.nome}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-zinc-400 block mb-1">
                  Descrição
                </label>
                <textarea
                  value={editDeckDesc}
                  onChange={(e) => setEditDeckDesc(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 bg-[#121212] border border-white/10 text-xs text-white outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsEditDeckOpen(false)}
                  className="h-8 px-3.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-8 px-4 text-xs font-bold bg-white text-black hover:bg-zinc-200 cursor-pointer"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          MODAL 7: CONFIRMAR EXCLUSÃO DE BARALHO
          ───────────────────────────────────────────────────────────────────── */}
      {deletingDeck && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
          onClick={() => setDeletingDeck(null)}
        >
          <div
            className="bg-[#181818] border border-red-500/30 rounded-none max-w-sm w-full shadow-2xl p-5 text-zinc-300"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="m-0 mb-2 text-xs font-mono font-bold uppercase tracking-wider text-red-400">
              Excluir Baralho
            </h3>
            <p className="m-0 mb-4 text-xs text-zinc-400 leading-relaxed">
              Tem certeza que deseja excluir <strong className="text-white">"{deletingDeck.nome}"</strong>? Todos os sub-baralhos e cartões contidos nele serão removidos.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setDeletingDeck(null)}
                className="h-8 px-3.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteDeck}
                className="h-8 px-4 text-xs font-bold bg-red-600 hover:bg-red-700 text-white cursor-pointer"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          MODAL 8: MUDAR BARALHO EM MASSA (DO PAINEL)
          ───────────────────────────────────────────────────────────────────── */}
      {isBulkMoveOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none"
          onClick={() => setIsBulkMoveOpen(false)}
        >
          <div
            className="bg-[#181818] border border-white/10 max-w-sm w-full p-5 flex flex-col gap-3.5 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="m-0 text-xs font-mono font-bold uppercase text-white">
              Mover {selectedCardIds.size} Cartão(ões)
            </h3>
            <select
              value={bulkMoveDeckId}
              onChange={(e) => setBulkMoveDeckId(e.target.value)}
              className="w-full h-8 px-2 bg-[#121212] border border-white/10 text-white outline-none"
            >
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {deckPaths.get(d.id) || d.nome}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setIsBulkMoveOpen(false)}
                className="h-8 px-3 bg-white/5 border border-white/10 text-zinc-300 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsBulkMoveOpen(false);
                  handleBrowserBulkAction("move", { deckId: bulkMoveDeckId });
                }}
                className="h-8 px-4 bg-white text-black font-bold cursor-pointer"
              >
                Mover
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          MODAL 9: ADICIONAR TAG EM MASSA (DO PAINEL)
          ───────────────────────────────────────────────────────────────────── */}
      {isBulkTagOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none"
          onClick={() => setIsBulkTagOpen(false)}
        >
          <div
            className="bg-[#181818] border border-white/10 max-w-sm w-full p-5 flex flex-col gap-3.5 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="m-0 text-xs font-mono font-bold uppercase text-white">
              Adicionar Tag a {selectedCardIds.size} Cartão(ões)
            </h3>
            <input
              type="text"
              value={bulkTagInput}
              onChange={(e) => setBulkTagInput(e.target.value)}
              placeholder="Ex: revisao_final"
              autoFocus
              className="w-full h-8 px-3 bg-[#121212] border border-white/10 font-mono text-white outline-none"
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setIsBulkTagOpen(false)}
                className="h-8 px-3 bg-white/5 border border-white/10 text-zinc-300 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!bulkTagInput.trim()) return;
                  setIsBulkTagOpen(false);
                  handleBrowserBulkAction("add_tag", { tag: bulkTagInput.trim() });
                }}
                className="h-8 px-4 bg-white text-black font-bold cursor-pointer"
              >
                Aplicar Tag
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
