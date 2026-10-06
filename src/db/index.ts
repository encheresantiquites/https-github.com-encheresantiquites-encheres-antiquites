import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      idleTimeoutMillis: 5000, // Fermer rapidement les sockets inactifs avant rupture par le proxy
      connectionTimeoutMillis: 5000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 2000,
    });

    global._postgresPool.on('error', (err: any) => {
      // Les connexions inactives peuvent être interrompues par le proxy ou la mise en veille Cloud SQL.
      // node-postgres élimine automatiquement ces clients du pool et en recrée de nouveaux à la demande.
      const msg = err?.message || '';
      if (
        msg.includes('Connection terminated unexpectedly') ||
        err?.code === 'ECONNRESET' ||
        err?.code === '57P01' ||
        err?.code === 'EPIPE'
      ) {
        // Événement attendu lors du recyclage d'un socket inactif, sans impact sur les requêtes
        return;
      }
      console.warn('PostgreSQL pool notice:', err?.message || err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });

/**
 * Exécute une opération Drizzle avec réessai automatique en cas de rupture de socket inactif ou reconnexion Cloud SQL
 */
export async function withDbRetry<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;
      const allText = [
        err?.message,
        err?.cause?.message,
        err?.parent?.message,
        String(err),
        String(err?.cause),
      ]
        .filter(Boolean)
        .join(' ');
      const code = err?.code || err?.cause?.code || err?.parent?.code;

      const isConnError =
        allText.includes('Connection terminated') ||
        allText.includes('ECONNRESET') ||
        allText.includes('EPIPE') ||
        allText.includes('57P01') ||
        allText.includes('57P02') ||
        allText.includes('57P03') ||
        allText.includes('socket') ||
        allText.includes('terminating connection') ||
        allText.includes('Connection closed') ||
        allText.includes('Connection timeout') ||
        allText.includes('timeout') ||
        allText.includes('Client has encountered a connection error') ||
        allText.includes('server closed the connection') ||
        code === 'ECONNRESET' ||
        code === '57P01' ||
        code === '57P02' ||
        code === '57P03' ||
        code === '08006' ||
        code === '08001' ||
        code === '08004' ||
        code === '08003' ||
        // Si Drizzle retourne "Failed query", le premier échec est réessayé immédiatement car souvent lié à un socket recyclé par le pool
        (attempt === 0 && typeof err?.message === 'string' && err.message.startsWith('Failed query'));

      if (isConnError && attempt < maxRetries) {
        console.warn(`[DB Retry] Reconnexion automatique Cloud SQL (tentative ${attempt + 1}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
