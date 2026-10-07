import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';

let projectId: string | undefined = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;

try {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (raw && raw.projectId) {
      projectId = raw.projectId;
    }
  }
} catch (e) {
  console.warn('Could not read firebase-applet-config.json:', e);
}

if (!getApps().length) {
  initializeApp({
    projectId: projectId || 'encheres-antiquites-default',
  });
}

export const adminAuth = getAuth();

