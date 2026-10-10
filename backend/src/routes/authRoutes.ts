import { Router } from 'express';
import { authController } from '../controllers/AuthController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { allowedOrigins } from '../config/security';

const router = Router();

router.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: 'Request origin is not allowed' });
  }
  return next();
});

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authMiddleware, authController.logout);
router.post('/ws-ticket', authMiddleware, authController.createWebSocketTicket);
router.get('/me', authMiddleware, authController.me);
router.put('/me', authMiddleware, authController.updateMe);

export default router;
