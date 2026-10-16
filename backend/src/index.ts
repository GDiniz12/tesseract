import path from 'path';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './routes';
import { allowedOrigins } from './config/security';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(
  cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: false,
    exposedHeaders: ['X-Session-Token'],
  })
);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});
app.use(express.json());
app.disable('x-powered-by');

// Serve uploaded static files
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

app.use('/api', routes);

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Tesseract Backend is running successfully!' });
});

import http from 'http';
import { WebSocketServer } from 'ws';
import { initializeWebSockets } from './websockets';

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
initializeWebSockets(wss);

server.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
