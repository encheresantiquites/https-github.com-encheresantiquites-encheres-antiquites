import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { app } from './src/server/app.ts';

dotenv.config();

process.on('unhandledRejection', (reason: any) => {
  if (
    reason?.message?.includes('Connection terminated unexpectedly') ||
    reason?.code === 'ECONNRESET'
  ) {
    return;
  }
  console.warn('Unhandled rejection:', reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

// Servir les fichiers construits du frontend en production
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback SPA
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Plateforme d'enchères démarrée sur le port ${PORT}`);
});
