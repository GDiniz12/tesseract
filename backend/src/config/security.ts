import dotenv from 'dotenv';

dotenv.config();

export const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
