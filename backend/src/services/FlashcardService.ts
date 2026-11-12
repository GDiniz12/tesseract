import { prisma } from '../config/prisma';

export interface DeckOptions {
  newCardsPerDay: number;
  maxReviewsPerDay: number;
  learningSteps: string; // e.g. "1 10" (in minutes)
  graduatingInterval: number; // in days, default 1
  easyInterval: number; // in days, default 4
  startingEase: number; // default 2.50
  easyBonus: number; // default 1.30
  intervalModifier: number; // default 1.00
  hardInterval: number; // default 1.20
  relearningSteps: string; // e.g. "10" (in minutes)
  newInterval: number; // default 0.00
  minimumInterval: number; // default 1
  leechThreshold: number; // default 8
  leechAction: 'tag' | 'suspend'; // default 'tag'
  maxAnswerSeconds: number; // default 60
  showAnswerTimer: boolean; // default false
  buryNewSiblings: boolean; // default false
  buryReviewSiblings: boolean; // default false
}

export const DEFAULT_DECK_OPTIONS: DeckOptions = {
  newCardsPerDay: 20,
  maxReviewsPerDay: 200,
  learningSteps: '1 10',
  graduatingInterval: 1,
  easyInterval: 4,
  startingEase: 2.5,
  easyBonus: 1.3,
  intervalModifier: 1.0,
  hardInterval: 1.2,
  relearningSteps: '10',
  newInterval: 0.0,
  minimumInterval: 1,
  leechThreshold: 8,
  leechAction: 'tag',
  maxAnswerSeconds: 60,
  showAnswerTimer: false,
  buryNewSiblings: false,
  buryReviewSiblings: false,
};

export interface ReviewLogEntry {
  date: string;
  grade: 1 | 2 | 3 | 4;
  interval: number;
  easeFactor: number;
  timeMs?: number;
  state: 'new' | 'learning' | 'review' | 'relearning';
}

export interface SM2Result {
  reps: number;
  interval: number;
  easeFactor: number;
  state: 'new' | 'learning' | 'review' | 'relearning';
  stepIndex: number;
  lapses: number;
  proximaRevisao: Date;
  intervalLabel: string;
}

function parseStepsMinutes(stepsStr: string, fallback: number[]): number[] {
  const parsed = (stepsStr || '')
    .trim()
    .split(/\s+/)
    .map((s) => {
      if (s.endsWith('d')) return parseFloat(s) * 1440;
      if (s.endsWith('h')) return parseFloat(s) * 60;
      if (s.endsWith('m')) return parseFloat(s);
      return parseFloat(s);
    })
    .filter((n) => !isNaN(n) && n > 0);
  return parsed.length > 0 ? parsed : fallback;
}

function formatMinutesLabel(mins: number): string {
  if (mins < 1) return '<1m';
  if (mins < 60) return `${Math.round(mins)}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

function formatDaysLabel(days: number): string {
  if (days <= 0) return '<10m';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${(days / 30).toFixed(1).replace(/\.0$/, '')}mo`;
  return `${(days / 365).toFixed(1).replace(/\.0$/, '')}a`;
}

/**
 * Anki V3 / SM-2 Spaced Repetition Scheduler with Learning Steps, Lapses, and Deck Options
 */
export function calculateAnkiSchedule(
  grade: 1 | 2 | 3 | 4,
  card: {
    reps: number;
    interval: number;
    easeFactor: number;
    state?: string;
    stepIndex?: number;
    lapses?: number;
  },
  rawOptions?: Partial<DeckOptions> | null
): SM2Result {
  const opts: DeckOptions = { ...DEFAULT_DECK_OPTIONS, ...(rawOptions || {}) };
  const learningSteps = parseStepsMinutes(opts.learningSteps, [1, 10]);
  const relearningSteps = parseStepsMinutes(opts.relearningSteps, [10]);

  let reps = card.reps || 0;
  let interval = card.interval || 0;
  let easeFactor = card.easeFactor || opts.startingEase || 2.5;
  let state: 'new' | 'learning' | 'review' | 'relearning' =
    (card.state as any) || (reps === 0 ? 'new' : 'review');
  let stepIndex = card.stepIndex || 0;
  let lapses = card.lapses || 0;

  const now = new Date();
  let proximaRevisao = new Date(now);
  let intervalLabel = '1d';

  if (state === 'new' || state === 'learning') {
    if (grade === 1) {
      // Again: reset to first learning step
      state = 'learning';
      stepIndex = 0;
      const mins = learningSteps[0] || 1;
      proximaRevisao = new Date(now.getTime() + mins * 60 * 1000);
      interval = 0;
      intervalLabel = `<${formatMinutesLabel(mins)}`;
    } else if (grade === 2) {
      // Hard: repeat current step (or average of first two if at step 0)
      state = 'learning';
      const mins =
        stepIndex === 0 && learningSteps.length > 1
          ? (learningSteps[0] + learningSteps[1]) / 2
          : learningSteps[Math.min(stepIndex, learningSteps.length - 1)] || 6;
      proximaRevisao = new Date(now.getTime() + mins * 60 * 1000);
      interval = 0;
      intervalLabel = formatMinutesLabel(mins);
    } else if (grade === 3) {
      // Good: advance to next step or graduate
      const nextStep = state === 'new' ? 1 : stepIndex + 1;
      if (nextStep < learningSteps.length) {
        state = 'learning';
        stepIndex = nextStep;
        const mins = learningSteps[nextStep];
        proximaRevisao = new Date(now.getTime() + mins * 60 * 1000);
        interval = 0;
        intervalLabel = formatMinutesLabel(mins);
      } else {
        // Graduate to Review!
        state = 'review';
        stepIndex = 0;
        reps += 1;
        interval = Math.max(1, Math.round(opts.graduatingInterval * opts.intervalModifier));
        proximaRevisao.setDate(proximaRevisao.getDate() + interval);
        intervalLabel = formatDaysLabel(interval);
      }
    } else if (grade === 4) {
      // Easy: immediately graduate with easyInterval
      state = 'review';
      stepIndex = 0;
      reps += 1;
      interval = Math.max(1, Math.round(opts.easyInterval * opts.intervalModifier));
      proximaRevisao.setDate(proximaRevisao.getDate() + interval);
      intervalLabel = formatDaysLabel(interval);
    }
  } else if (state === 'relearning') {
    if (grade === 1) {
      stepIndex = 0;
      const mins = relearningSteps[0] || 10;
      proximaRevisao = new Date(now.getTime() + mins * 60 * 1000);
      intervalLabel = `<${formatMinutesLabel(mins)}`;
    } else if (grade === 2) {
      const mins = (relearningSteps[Math.min(stepIndex, relearningSteps.length - 1)] || 10) * 1.5;
      proximaRevisao = new Date(now.getTime() + mins * 60 * 1000);
      intervalLabel = formatMinutesLabel(mins);
    } else if (grade === 3) {
      const nextStep = stepIndex + 1;
      if (nextStep < relearningSteps.length) {
        stepIndex = nextStep;
        const mins = relearningSteps[nextStep];
        proximaRevisao = new Date(now.getTime() + mins * 60 * 1000);
        intervalLabel = formatMinutesLabel(mins);
      } else {
        state = 'review';
        stepIndex = 0;
        reps += 1;
        interval = Math.max(opts.minimumInterval, interval || 1);
        proximaRevisao.setDate(proximaRevisao.getDate() + interval);
        intervalLabel = formatDaysLabel(interval);
      }
    } else if (grade === 4) {
      state = 'review';
      stepIndex = 0;
      reps += 1;
      interval = Math.max(opts.minimumInterval + 1, Math.round((interval || 1) * opts.easyBonus));
      proximaRevisao.setDate(proximaRevisao.getDate() + interval);
      intervalLabel = formatDaysLabel(interval);
    }
  } else {
    // state === 'review'
    const currentIvl = Math.max(1, interval);
    if (grade === 1) {
      // Lapse!
      lapses += 1;
      easeFactor = Math.max(1.3, easeFactor - 0.2);
      const newIvl = Math.max(opts.minimumInterval, Math.round(currentIvl * opts.newInterval));
      interval = newIvl;
      if (relearningSteps.length > 0) {
        state = 'relearning';
        stepIndex = 0;
        const mins = relearningSteps[0];
        proximaRevisao = new Date(now.getTime() + mins * 60 * 1000);
        intervalLabel = `<${formatMinutesLabel(mins)}`;
      } else {
        state = 'review';
        proximaRevisao.setDate(proximaRevisao.getDate() + interval);
        intervalLabel = formatDaysLabel(interval);
      }
    } else if (grade === 2) {
      // Hard
      easeFactor = Math.max(1.3, easeFactor - 0.15);
      interval = Math.max(currentIvl + 1, Math.round(currentIvl * opts.hardInterval * opts.intervalModifier));
      reps += 1;
      proximaRevisao.setDate(proximaRevisao.getDate() + interval);
      intervalLabel = formatDaysLabel(interval);
    } else if (grade === 3) {
      // Good
      const hardIvl = Math.max(currentIvl + 1, Math.round(currentIvl * opts.hardInterval * opts.intervalModifier));
      interval = Math.max(hardIvl + 1, Math.round(currentIvl * easeFactor * opts.intervalModifier));
      reps += 1;
      proximaRevisao.setDate(proximaRevisao.getDate() + interval);
      intervalLabel = formatDaysLabel(interval);
    } else if (grade === 4) {
      // Easy
      const goodIvl = Math.max(currentIvl + 2, Math.round(currentIvl * easeFactor * opts.intervalModifier));
      easeFactor = easeFactor + 0.15;
      interval = Math.max(goodIvl + 1, Math.round(currentIvl * easeFactor * opts.easyBonus * opts.intervalModifier));
      reps += 1;
      proximaRevisao.setDate(proximaRevisao.getDate() + interval);
      intervalLabel = formatDaysLabel(interval);
    }
  }

  return {
    reps,
    interval,
    easeFactor: Number(easeFactor.toFixed(2)),
    state,
    stepIndex,
    lapses,
    proximaRevisao,
    intervalLabel,
  };
}

// Legacy compatibility wrapper
export function calculateSM2(
  grade: 1 | 2 | 3 | 4,
  currentReps: number,
  currentInterval: number,
  currentEase: number
) {
  return calculateAnkiSchedule(grade, {
    reps: currentReps,
    interval: currentInterval,
    easeFactor: currentEase,
    state: currentReps === 0 ? 'new' : 'review',
  });
}

/**
 * Extracts unique cloze indices from text containing {{c1::answer::hint}}
 */
export function extractClozeIndices(text: string): number[] {
  const regex = /\{\{c(\d+)::([\s\S]*?)\}\}/gi;
  const indices = new Set<number>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const idx = parseInt(match[1], 10);
    if (!isNaN(idx) && idx > 0) {
      indices.add(idx);
    }
  }
  return Array.from(indices).sort((a, b) => a - b);
}

export class FlashcardService {
  // Helper to get all descendant deck IDs including the root deck ID
  private async getAllDescendantDeckIds(rootDeckId: string): Promise<string[]> {
    const allDecks = await prisma.deck.findMany({
      select: { id: true, parentId: true },
    });

    const deckIds = new Set<string>([rootDeckId]);
    let added = true;

    while (added) {
      added = false;
      for (const deck of allDecks) {
        if (deck.parentId && deckIds.has(deck.parentId) && !deckIds.has(deck.id)) {
          deckIds.add(deck.id);
          added = true;
        }
      }
    }

    return Array.from(deckIds);
  }

  // --- DECKS ---
  async getDecks(workspaceId: string) {
    const decks = await prisma.deck.findMany({
      where: { workspaceId },
      include: {
        flashcards: {
          select: {
            id: true,
            reps: true,
            interval: true,
            state: true,
            suspended: true,
            buried: true,
            proximaRevisao: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const now = new Date();

    const deckMap = new Map<
      string,
      {
        deck: (typeof decks)[0];
        directTotal: number;
        directNovos: number;
        directAprendendo: number;
        directARevisar: number;
        directSuspensos: number;
        childIds: string[];
      }
    >();

    for (const d of decks) {
      const activeCards = d.flashcards.filter((c) => !c.suspended && !c.buried);
      const directTotal = d.flashcards.length;
      const directSuspensos = d.flashcards.filter((c) => c.suspended).length;

      let directNovos = 0;
      let directAprendendo = 0;
      let directARevisar = 0;

      for (const c of activeCards) {
        const st = c.state || (c.reps === 0 ? 'new' : 'review');
        const isDue = new Date(c.proximaRevisao) <= now;
        if (st === 'new' && c.reps === 0) {
          directNovos++;
        } else if (st === 'learning' || st === 'relearning') {
          if (isDue) directAprendendo++;
        } else if (isDue) {
          directARevisar++;
        }
      }

      deckMap.set(d.id, {
        deck: d,
        directTotal,
        directNovos,
        directAprendendo,
        directARevisar,
        directSuspensos,
        childIds: [],
      });
    }

    for (const d of decks) {
      if (d.parentId && deckMap.has(d.parentId)) {
        deckMap.get(d.parentId)!.childIds.push(d.id);
      }
    }

    const computeRecursiveStats = (
      deckId: string
    ): { total: number; novos: number; aprendendo: number; aRevisar: number; suspensos: number } => {
      const entry = deckMap.get(deckId);
      if (!entry) return { total: 0, novos: 0, aprendendo: 0, aRevisar: 0, suspensos: 0 };

      let total = entry.directTotal;
      let novos = entry.directNovos;
      let aprendendo = entry.directAprendendo;
      let aRevisar = entry.directARevisar;
      let suspensos = entry.directSuspensos;

      for (const childId of entry.childIds) {
        const childStats = computeRecursiveStats(childId);
        total += childStats.total;
        novos += childStats.novos;
        aprendendo += childStats.aprendendo;
        aRevisar += childStats.aRevisar;
        suspensos += childStats.suspensos;
      }

      return { total, novos, aprendendo, aRevisar, suspensos };
    };

    return decks.map((deck) => {
      const stats = computeRecursiveStats(deck.id);
      const mergedOptions: DeckOptions = {
        ...DEFAULT_DECK_OPTIONS,
        ...((deck.options as Partial<DeckOptions>) || {}),
      };
      return {
        id: deck.id,
        nome: deck.nome,
        descricao: deck.descricao,
        options: mergedOptions,
        workspaceId: deck.workspaceId,
        parentId: deck.parentId,
        createdAt: deck.createdAt,
        updatedAt: deck.updatedAt,
        stats: {
          total: stats.total,
          novos: Math.min(stats.novos, mergedOptions.newCardsPerDay),
          novosTotal: stats.novos,
          aprendendo: stats.aprendendo,
          aRevisar: Math.min(stats.aRevisar, mergedOptions.maxReviewsPerDay),
          aRevisarTotal: stats.aRevisar,
          suspensos: stats.suspensos,
        },
      };
    });
  }

  async createDeck(
    workspaceId: string,
    nome: string,
    descricao?: string,
    parentId?: string,
    options?: Partial<DeckOptions>
  ) {
    // Support Anki "::" nested deck creation syntax (e.g. "Medicina::Anatomia::Cardio")
    if (nome.includes('::') && !parentId) {
      const parts = nome
        .split('::')
        .map((p) => p.trim())
        .filter(Boolean);
      let currentParentId: string | null = null;
      let lastCreated: any = null;

      for (let i = 0; i < parts.length; i++) {
        const partName = parts[i];
        const existing: { id: string } | null = await prisma.deck.findFirst({
          where: {
            workspaceId,
            nome: partName,
            parentId: currentParentId,
          },
        });

        if (existing) {
          currentParentId = existing.id;
          lastCreated = existing;
        } else {
          lastCreated = await prisma.deck.create({
            data: {
              workspaceId,
              nome: partName,
              descricao: i === parts.length - 1 ? descricao : undefined,
              parentId: currentParentId,
              options: (options || DEFAULT_DECK_OPTIONS) as any,
            },
          });
          currentParentId = lastCreated.id;
        }
      }
      return lastCreated;
    }

    return prisma.deck.create({
      data: {
        workspaceId,
        nome,
        descricao,
        parentId: parentId || null,
        options: (options || DEFAULT_DECK_OPTIONS) as any,
      },
    });
  }

  async updateDeck(
    id: string,
    nome?: string,
    descricao?: string,
    parentId?: string | null,
    options?: Partial<DeckOptions>
  ) {
    const existing = await prisma.deck.findUnique({ where: { id } });
    const mergedOptions = options
      ? { ...DEFAULT_DECK_OPTIONS, ...((existing?.options as any) || {}), ...options }
      : undefined;

    return prisma.deck.update({
      where: { id },
      data: {
        ...(nome && { nome }),
        ...(descricao !== undefined && { descricao }),
        ...(parentId !== undefined && { parentId }),
        ...(mergedOptions !== undefined && { options: mergedOptions as any }),
      },
    });
  }

  async deleteDeck(id: string) {
    return prisma.deck.delete({
      where: { id },
    });
  }

  // --- FLASHCARDS ---
  async getAllWorkspaceCards(workspaceId: string) {
    return prisma.flashcard.findMany({
      where: {
        deck: {
          workspaceId,
        },
      },
      include: {
        deck: {
          select: {
            id: true,
            nome: true,
            parentId: true,
            options: true,
          },
        },
        nota: {
          select: {
            id: true,
            titulo: true,
            conteudo: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getFlashcards(deckId: string, recursive: boolean = false) {
    let deckIds = [deckId];
    if (recursive) {
      deckIds = await this.getAllDescendantDeckIds(deckId);
    }

    return prisma.flashcard.findMany({
      where: { deckId: { in: deckIds } },
      include: {
        deck: {
          select: {
            id: true,
            nome: true,
            options: true,
          },
        },
        nota: {
          select: {
            id: true,
            titulo: true,
            conteudo: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getDueCards(
    deckId: string,
    customStudy?: {
      mode?: 'due' | 'cram_all' | 'preview_new' | 'failed_today' | 'by_tag' | 'by_state';
      tag?: string;
      state?: string;
      limit?: number;
    }
  ) {
    const deckIds = await this.getAllDescendantDeckIds(deckId);
    const rootDeck = await prisma.deck.findUnique({ where: { id: deckId } });
    const opts: DeckOptions = {
      ...DEFAULT_DECK_OPTIONS,
      ...((rootDeck?.options as Partial<DeckOptions>) || {}),
    };

    const now = new Date();
    const mode = customStudy?.mode || 'due';

    let whereClause: any = {
      deckId: { in: deckIds },
      suspended: false,
    };

    if (mode === 'due') {
      whereClause.buried = false;
      whereClause.OR = [{ reps: 0, state: 'new' }, { proximaRevisao: { lte: now } }];
    } else if (mode === 'preview_new') {
      whereClause.OR = [{ reps: 0 }, { state: 'new' }];
    } else if (mode === 'failed_today') {
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      whereClause.ultimaRevisao = { gte: startOfDay };
      whereClause.OR = [{ state: 'relearning' }, { lapses: { gt: 0 } }];
    } else if (mode === 'by_tag' && customStudy?.tag) {
      whereClause.tags = { has: customStudy.tag };
    } else if (mode === 'by_state' && customStudy?.state) {
      whereClause.state = customStudy.state;
    }

    const cards = await prisma.flashcard.findMany({
      where: whereClause,
      include: {
        deck: {
          select: {
            id: true,
            nome: true,
            options: true,
          },
        },
        nota: {
          select: {
            id: true,
            titulo: true,
            conteudo: true,
          },
        },
      },
      orderBy: [{ proximaRevisao: 'asc' }, { reps: 'asc' }],
    });

    if (mode === 'due') {
      // Respect daily limits from DeckOptions: Learning first, then Review, then New
      const learning: typeof cards = [];
      const review: typeof cards = [];
      const newCards: typeof cards = [];

      for (const c of cards) {
        const st = c.state || (c.reps === 0 ? 'new' : 'review');
        if (st === 'learning' || st === 'relearning') {
          learning.push(c);
        } else if (st === 'new' && c.reps === 0) {
          if (newCards.length < opts.newCardsPerDay) newCards.push(c);
        } else {
          if (review.length < opts.maxReviewsPerDay) review.push(c);
        }
      }

      return [...learning, ...review, ...newCards];
    }

    if (customStudy?.limit && customStudy.limit > 0) {
      return cards.slice(0, customStudy.limit);
    }

    return cards;
  }

  async createFlashcard(data: {
    deckId: string;
    frente: string;
    verso: string;
    extra?: string;
    tipo?: string;
    notaId?: string;
    tags?: string[];
    flag?: number;
  }) {
    const tipo = data.tipo || (data.notaId ? 'nota' : 'basic');
    const cleanTags = Array.isArray(data.tags)
      ? Array.from(new Set(data.tags.map((t) => t.trim()).filter(Boolean)))
      : [];

    const includeSpec = {
      deck: {
        select: {
          id: true,
          nome: true,
          options: true,
        },
      },
      nota: {
        select: {
          id: true,
          titulo: true,
          conteudo: true,
        },
      },
    };

    // 1. Cloze Note Type: Automatically generate 1 card per unique {{cN::...}} index
    if (tipo === 'cloze') {
      const indices = extractClozeIndices(data.frente);
      const targetIndices = indices.length > 0 ? indices : [1];
      const createdCards = [];

      for (const idx of targetIndices) {
        const created = await prisma.flashcard.create({
          data: {
            deckId: data.deckId,
            frente: data.frente,
            verso: data.verso || '',
            extra: data.extra || null,
            tipo: 'cloze',
            clozeIndex: idx,
            tags: cleanTags,
            flag: data.flag || 0,
            state: 'new',
            notaId: data.notaId || null,
            reps: 0,
            interval: 0,
            easeFactor: 2.5,
            proximaRevisao: new Date(),
          },
          include: includeSpec,
        });
        createdCards.push(created);
      }

      return createdCards[0];
    }

    // 2. Basic + Reversed Card Type: Create Front->Back AND Back->Front
    if (tipo === 'basic_reversed') {
      const forwardCard = await prisma.flashcard.create({
        data: {
          deckId: data.deckId,
          frente: data.frente,
          verso: data.verso,
          extra: data.extra || null,
          tipo: 'basic_reversed',
          tags: cleanTags,
          flag: data.flag || 0,
          state: 'new',
          notaId: data.notaId || null,
          reps: 0,
          interval: 0,
          easeFactor: 2.5,
          proximaRevisao: new Date(),
        },
        include: includeSpec,
      });

      if (data.verso && data.verso.trim()) {
        await prisma.flashcard.create({
          data: {
            deckId: data.deckId,
            frente: data.verso,
            verso: data.frente,
            extra: data.extra || null,
            tipo: 'basic_reversed',
            tags: cleanTags,
            flag: data.flag || 0,
            state: 'new',
            notaId: data.notaId || null,
            reps: 0,
            interval: 0,
            easeFactor: 2.5,
            proximaRevisao: new Date(),
          },
        });
      }

      return forwardCard;
    }

    // 3. Standard Basic / Type-in-the-Answer / Nota
    return prisma.flashcard.create({
      data: {
        deckId: data.deckId,
        frente: data.frente,
        verso: data.verso,
        extra: data.extra || null,
        tipo,
        tags: cleanTags,
        flag: data.flag || 0,
        state: 'new',
        notaId: data.notaId || null,
        reps: 0,
        interval: 0,
        easeFactor: 2.5,
        proximaRevisao: new Date(),
      },
      include: includeSpec,
    });
  }

  async createCardFromNota(deckId: string, notaId: string, tags?: string[]) {
    const nota = await prisma.nota.findUnique({
      where: { id: notaId },
    });
    if (!nota) throw new Error('Nota não encontrada');

    return prisma.flashcard.create({
      data: {
        deckId,
        frente: nota.titulo,
        verso: nota.conteudo || 'Sem conteúdo',
        tipo: 'nota',
        tags: tags || [],
        state: 'new',
        notaId: nota.id,
        reps: 0,
        interval: 0,
        easeFactor: 2.5,
        proximaRevisao: new Date(),
      },
      include: {
        deck: {
          select: {
            id: true,
            nome: true,
            options: true,
          },
        },
        nota: {
          select: {
            id: true,
            titulo: true,
            conteudo: true,
          },
        },
      },
    });
  }

  async reviewCard(id: string, grade: 1 | 2 | 3 | 4, timeMs?: number) {
    const card = await prisma.flashcard.findUnique({
      where: { id },
      include: { deck: true },
    });
    if (!card) throw new Error('Card não encontrado');

    const deckOptions = (card.deck?.options as Partial<DeckOptions>) || DEFAULT_DECK_OPTIONS;
    const schedule = calculateAnkiSchedule(
      grade,
      {
        reps: card.reps,
        interval: card.interval,
        easeFactor: card.easeFactor,
        state: card.state,
        stepIndex: card.stepIndex,
        lapses: card.lapses,
      },
      deckOptions
    );

    const prevHistory: ReviewLogEntry[] = Array.isArray(card.reviewHistory)
      ? (card.reviewHistory as unknown as ReviewLogEntry[])
      : [];

    const newLog: ReviewLogEntry = {
      date: new Date().toISOString(),
      grade,
      interval: schedule.interval,
      easeFactor: schedule.easeFactor,
      timeMs: timeMs || 4000,
      state: schedule.state,
    };

    const updatedTags = [...(card.tags || [])];
    let shouldSuspend = card.suspended;

    // Leech handling (like Anki)
    const leechThreshold = deckOptions.leechThreshold || 8;
    if (grade === 1 && schedule.lapses >= leechThreshold) {
      if (!updatedTags.includes('leech')) {
        updatedTags.push('leech');
      }
      if (deckOptions.leechAction === 'suspend') {
        shouldSuspend = true;
      }
    }

    return prisma.flashcard.update({
      where: { id },
      data: {
        reps: schedule.reps,
        interval: schedule.interval,
        easeFactor: schedule.easeFactor,
        state: schedule.state,
        stepIndex: schedule.stepIndex,
        lapses: schedule.lapses,
        suspended: shouldSuspend,
        tags: updatedTags,
        proximaRevisao: schedule.proximaRevisao,
        ultimaRevisao: new Date(),
        reviewHistory: [...prevHistory, newLog] as any,
      },
      include: {
        deck: {
          select: {
            id: true,
            nome: true,
            options: true,
          },
        },
        nota: {
          select: {
            id: true,
            titulo: true,
            conteudo: true,
          },
        },
      },
    });
  }

  async updateFlashcard(
    id: string,
    data: {
      frente?: string;
      verso?: string;
      extra?: string | null;
      deckId?: string;
      tipo?: string;
      notaId?: string | null;
      tags?: string[];
      flag?: number;
      state?: string;
      suspended?: boolean;
      buried?: boolean;
      reps?: number;
      interval?: number;
      easeFactor?: number;
      lapses?: number;
      stepIndex?: number;
      proximaRevisao?: Date | string;
    }
  ) {
    return prisma.flashcard.update({
      where: { id },
      data: {
        ...(data.frente !== undefined && { frente: data.frente }),
        ...(data.verso !== undefined && { verso: data.verso }),
        ...(data.extra !== undefined && { extra: data.extra }),
        ...(data.deckId !== undefined && { deckId: data.deckId }),
        ...(data.tipo !== undefined && { tipo: data.tipo }),
        ...(data.notaId !== undefined && { notaId: data.notaId }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.flag !== undefined && { flag: data.flag }),
        ...(data.state !== undefined && { state: data.state }),
        ...(data.suspended !== undefined && { suspended: data.suspended }),
        ...(data.buried !== undefined && { buried: data.buried }),
        ...(data.reps !== undefined && { reps: data.reps }),
        ...(data.interval !== undefined && { interval: data.interval }),
        ...(data.easeFactor !== undefined && { easeFactor: data.easeFactor }),
        ...(data.lapses !== undefined && { lapses: data.lapses }),
        ...(data.stepIndex !== undefined && { stepIndex: data.stepIndex }),
        ...(data.proximaRevisao !== undefined && {
          proximaRevisao: new Date(data.proximaRevisao),
        }),
      },
      include: {
        deck: {
          select: {
            id: true,
            nome: true,
            options: true,
          },
        },
        nota: {
          select: {
            id: true,
            titulo: true,
            conteudo: true,
          },
        },
      },
    });
  }

  async bulkActionCards(
    cardIds: string[],
    action:
      | 'suspend'
      | 'unsuspend'
      | 'bury'
      | 'unbury'
      | 'reset'
      | 'flag'
      | 'move'
      | 'add_tag'
      | 'remove_tag'
      | 'delete',
    payload?: { flag?: number; deckId?: string; tag?: string }
  ) {
    if (!cardIds.length) return { count: 0 };

    if (action === 'delete') {
      return prisma.flashcard.deleteMany({
        where: { id: { in: cardIds } },
      });
    }

    if (action === 'suspend') {
      return prisma.flashcard.updateMany({
        where: { id: { in: cardIds } },
        data: { suspended: true },
      });
    }

    if (action === 'unsuspend') {
      return prisma.flashcard.updateMany({
        where: { id: { in: cardIds } },
        data: { suspended: false },
      });
    }

    if (action === 'bury') {
      return prisma.flashcard.updateMany({
        where: { id: { in: cardIds } },
        data: { buried: true },
      });
    }

    if (action === 'unbury') {
      return prisma.flashcard.updateMany({
        where: { id: { in: cardIds } },
        data: { buried: false },
      });
    }

    if (action === 'reset') {
      return prisma.flashcard.updateMany({
        where: { id: { in: cardIds } },
        data: {
          reps: 0,
          interval: 0,
          easeFactor: 2.5,
          state: 'new',
          stepIndex: 0,
          lapses: 0,
          suspended: false,
          buried: false,
          proximaRevisao: new Date(),
          ultimaRevisao: null,
        },
      });
    }

    if (action === 'flag' && payload?.flag !== undefined) {
      return prisma.flashcard.updateMany({
        where: { id: { in: cardIds } },
        data: { flag: payload.flag },
      });
    }

    if (action === 'move' && payload?.deckId) {
      return prisma.flashcard.updateMany({
        where: { id: { in: cardIds } },
        data: { deckId: payload.deckId },
      });
    }

    if ((action === 'add_tag' || action === 'remove_tag') && payload?.tag) {
      const cleanTag = payload.tag.trim();
      const targetCards = await prisma.flashcard.findMany({
        where: { id: { in: cardIds } },
        select: { id: true, tags: true },
      });

      await Promise.all(
        targetCards.map((c) => {
          const currentTags = new Set(c.tags || []);
          if (action === 'add_tag') currentTags.add(cleanTag);
          else currentTags.delete(cleanTag);
          return prisma.flashcard.update({
            where: { id: c.id },
            data: { tags: Array.from(currentTags) },
          });
        })
      );

      return { count: targetCards.length };
    }

    return { count: 0 };
  }

  async importCards(
    workspaceId: string,
    defaultDeckId: string | undefined,
    cards: Array<{
      frente: string;
      verso: string;
      extra?: string;
      tipo?: string;
      tags?: string[];
      deckName?: string;
    }>
  ) {
    if (!cards || !cards.length) return { imported: 0 };

    let fallbackDeckId = defaultDeckId;
    if (!fallbackDeckId) {
      const firstDeck = await prisma.deck.findFirst({ where: { workspaceId } });
      if (firstDeck) {
        fallbackDeckId = firstDeck.id;
      } else {
        const created = await this.createDeck(workspaceId, 'Padrão');
        fallbackDeckId = created.id;
      }
    }

    const deckCache = new Map<string, string>();
    let importedCount = 0;

    for (const item of cards) {
      if (!item.frente?.trim()) continue;

      let targetDeckId = fallbackDeckId!;
      if (item.deckName && item.deckName.trim()) {
        const dName = item.deckName.trim();
        if (deckCache.has(dName)) {
          targetDeckId = deckCache.get(dName)!;
        } else {
          const resolvedDeck = await this.createDeck(workspaceId, dName);
          if (resolvedDeck?.id) {
            targetDeckId = resolvedDeck.id;
            deckCache.set(dName, resolvedDeck.id);
          }
        }
      }

      const detectedCloze = /\{\{c\d+::/i.test(item.frente);
      const tipo = item.tipo || (detectedCloze ? 'cloze' : 'basic');

      await this.createFlashcard({
        deckId: targetDeckId,
        frente: item.frente.trim(),
        verso: (item.verso || '').trim(),
        extra: item.extra?.trim(),
        tipo,
        tags: item.tags || [],
      });
      importedCount++;
    }

    return { imported: importedCount };
  }

  async deleteFlashcard(id: string) {
    return prisma.flashcard.delete({
      where: { id },
    });
  }
}
