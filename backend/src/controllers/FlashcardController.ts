import { Request, Response } from 'express';
import { FlashcardService } from '../services/FlashcardService';

const flashcardService = new FlashcardService();

export class FlashcardController {
  // --- DECKS ---
  async getDecks(req: Request, res: Response): Promise<any> {
    try {
      const { workspaceId } = req.query;
      if (!workspaceId) {
        return res.status(400).json({ error: 'workspaceId é obrigatório' });
      }
      const decks = await flashcardService.getDecks(workspaceId as string);
      return res.json(decks);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  async createDeck(req: Request, res: Response): Promise<any> {
    try {
      const { workspaceId, nome, descricao, parentId, options } = req.body;
      if (!workspaceId || !nome) {
        return res.status(400).json({ error: 'workspaceId e nome são obrigatórios' });
      }
      const deck = await flashcardService.createDeck(workspaceId, nome, descricao, parentId, options);
      return res.status(201).json(deck);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  async updateDeck(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const { nome, descricao, parentId, options } = req.body;
      const deck = await flashcardService.updateDeck(id, nome, descricao, parentId, options);
      return res.json(deck);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  async deleteDeck(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      await flashcardService.deleteDeck(id);
      return res.status(204).send();
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  // --- FLASHCARDS ---
  async getAllWorkspaceCards(req: Request, res: Response): Promise<any> {
    try {
      const { workspaceId } = req.query;
      if (!workspaceId) {
        return res.status(400).json({ error: 'workspaceId é obrigatório' });
      }
      const cards = await flashcardService.getAllWorkspaceCards(workspaceId as string);
      return res.json(cards);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  async getFlashcards(req: Request, res: Response): Promise<any> {
    try {
      const deckId = req.params.deckId as string;
      const recursive = req.query.recursive === 'true';
      const cards = await flashcardService.getFlashcards(deckId, recursive);
      return res.json(cards);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  async getDueCards(req: Request, res: Response): Promise<any> {
    try {
      const deckId = req.params.deckId as string;
      const mode = req.query.mode as any;
      const tag = req.query.tag as string | undefined;
      const state = req.query.state as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const cards = await flashcardService.getDueCards(deckId, { mode, tag, state, limit });
      return res.json(cards);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  async createFlashcard(req: Request, res: Response): Promise<any> {
    try {
      const { deckId, frente, verso, extra, tipo, notaId, tags, flag } = req.body;
      if (!deckId || !frente) {
        return res.status(400).json({ error: 'deckId e frente são obrigatórios' });
      }
      const card = await flashcardService.createFlashcard({
        deckId,
        frente,
        verso: verso || '',
        extra,
        tipo,
        notaId,
        tags,
        flag,
      });
      return res.status(201).json(card);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  async createCardFromNota(req: Request, res: Response): Promise<any> {
    try {
      const { deckId, notaId, tags } = req.body;
      if (!deckId || !notaId) {
        return res.status(400).json({ error: 'deckId e notaId são obrigatórios' });
      }
      const card = await flashcardService.createCardFromNota(deckId, notaId, tags);
      return res.status(201).json(card);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  async reviewCard(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const { grade, timeMs } = req.body;
      if (![1, 2, 3, 4].includes(grade)) {
        return res.status(400).json({ error: 'grade deve ser 1 (Errei), 2 (Difícil), 3 (Bom) ou 4 (Fácil)' });
      }
      const card = await flashcardService.reviewCard(id, grade as 1 | 2 | 3 | 4, timeMs);
      return res.json(card);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  async updateFlashcard(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const {
        frente,
        verso,
        extra,
        deckId,
        tipo,
        notaId,
        tags,
        flag,
        state,
        suspended,
        buried,
        reps,
        interval,
        easeFactor,
        lapses,
        stepIndex,
        proximaRevisao,
      } = req.body;
      const card = await flashcardService.updateFlashcard(id, {
        frente,
        verso,
        extra,
        deckId,
        tipo,
        notaId,
        tags,
        flag,
        state,
        suspended,
        buried,
        reps,
        interval,
        easeFactor,
        lapses,
        stepIndex,
        proximaRevisao,
      });
      return res.json(card);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  async bulkActionCards(req: Request, res: Response): Promise<any> {
    try {
      const { cardIds, action, payload } = req.body;
      if (!Array.isArray(cardIds) || !action) {
        return res.status(400).json({ error: 'cardIds e action são obrigatórios' });
      }
      const result = await flashcardService.bulkActionCards(cardIds, action, payload);
      return res.json(result);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  async importCards(req: Request, res: Response): Promise<any> {
    try {
      const { workspaceId, defaultDeckId, cards } = req.body;
      if (!workspaceId || !Array.isArray(cards)) {
        return res.status(400).json({ error: 'workspaceId e cards são obrigatórios' });
      }
      const result = await flashcardService.importCards(workspaceId, defaultDeckId, cards);
      return res.status(201).json(result);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  async deleteFlashcard(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      await flashcardService.deleteFlashcard(id);
      return res.status(204).send();
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }
}
