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
      idleTimeoutMillis: 10000, // Fermer proprement les connexions inactives après 10s pour éviter la rupture abrupte côté serveur
      connectionTimeoutMillis: 10000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
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
