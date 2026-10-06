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
 * Exécute une opération Drizzle avec réessai automatique en cas de rupture de socket inactif
 */
export async function withDbRetry<T>(operation: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;
      const msg = err?.message || '';
      const isConnError =
        msg.includes('Connection terminated') ||
        msg.includes('ECONNRESET') ||
        msg.includes('EPIPE') ||
        msg.includes('57P01') ||
        msg.includes('socket') ||
        msg.includes('terminating connection') ||
        err?.code === 'ECONNRESET' ||
        err?.code === '57P01';

      if (isConnError && attempt < maxRetries) {
        console.warn(`[DB Retry] Reconnexion automatique suite à socket inactif (tentative ${attempt + 1})...`);
        await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
