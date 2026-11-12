import { Router } from 'express';
import { FlashcardController } from '../controllers/FlashcardController';

const router = Router();
const controller = new FlashcardController();

// Decks
router.get('/decks', (req, res) => controller.getDecks(req, res));
router.post('/decks', (req, res) => controller.createDeck(req, res));
router.put('/decks/:id', (req, res) => controller.updateDeck(req, res));
router.delete('/decks/:id', (req, res) => controller.deleteDeck(req, res));

// Flashcards
router.get('/cards/workspace', (req, res) => controller.getAllWorkspaceCards(req, res));
router.get('/decks/:deckId/cards', (req, res) => controller.getFlashcards(req, res));
router.get('/decks/:deckId/due', (req, res) => controller.getDueCards(req, res));
router.post('/cards', (req, res) => controller.createFlashcard(req, res));
router.post('/cards/from-nota', (req, res) => controller.createCardFromNota(req, res));
router.post('/cards/bulk', (req, res) => controller.bulkActionCards(req, res));
router.post('/cards/import', (req, res) => controller.importCards(req, res));
router.post('/cards/:id/review', (req, res) => controller.reviewCard(req, res));
router.put('/cards/:id', (req, res) => controller.updateFlashcard(req, res));
router.delete('/cards/:id', (req, res) => controller.deleteFlashcard(req, res));

export default router;
