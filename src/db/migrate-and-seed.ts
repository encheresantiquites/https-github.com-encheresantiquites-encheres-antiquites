import { createPool, isDbConfigured } from './index.ts';
import { DEFAULT_LOTS } from '../data/default-lots.ts';

const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    uid TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'CUSTOMER',
    status TEXT NOT NULL DEFAULT 'PENDING',
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    password_hash TEXT,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    company_name TEXT,
    activity TEXT,
    country TEXT,
    vat_number TEXT,
    website TEXT,
    address_line1 TEXT,
    address_line2 TEXT,
    postal_code TEXT,
    city TEXT,
    accepted_terms BOOLEAN NOT NULL DEFAULT FALSE,
    accepted_terms_at TIMESTAMP,
    accepted_terms_version TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    reference TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    starts_at TIMESTAMP NOT NULL,
    ends_at TIMESTAMP NOT NULL,
    anti_snipe_minutes INTEGER NOT NULL DEFAULT 2,
    anti_snipe_trigger_seconds INTEGER NOT NULL DEFAULT 120,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS lots (
    id SERIAL PRIMARY KEY,
    sale_id INTEGER,
    reference TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    period TEXT,
    dimensions TEXT,
    weight TEXT,
    condition_report TEXT NOT NULL,
    flaws TEXT,
    observations TEXT,
    starting_price_cents INTEGER NOT NULL,
    reserve_price_cents INTEGER DEFAULT 0,
    current_price_cents INTEGER NOT NULL,
    bid_count INTEGER NOT NULL DEFAULT 0,
    current_winner_id INTEGER,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    ends_at TIMESTAMP NOT NULL,
    images JSON DEFAULT '[]'::json,
    target_acquisition_cost_cents INTEGER DEFAULT 0,
    actual_acquisition_cost_cents INTEGER DEFAULT 0,
    acquisition_status TEXT DEFAULT 'PENDING',
    acquisition_source TEXT,
    acquisition_date TIMESTAMP,
    acquisition_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS bids (
    id SERIAL PRIMARY KEY,
    lot_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    max_bid_cents INTEGER NOT NULL,
    current_price_cents INTEGER NOT NULL,
    is_winning BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS bid_history (
    id SERIAL PRIMARY KEY,
    lot_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    public_bidder_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_number TEXT NOT NULL UNIQUE,
    lot_id INTEGER NOT NULL,
    buyer_id INTEGER NOT NULL,
    final_price_cents INTEGER NOT NULL,
    shipping_cost_cents INTEGER NOT NULL DEFAULT 0,
    total_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT',
    shipping_carrier TEXT,
    tracking_number TEXT,
    shipped_at TIMESTAMP,
    delivered_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    buyer_id INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    status TEXT NOT NULL DEFAULT 'PENDING',
    provider TEXT NOT NULL DEFAULT 'PAYPAL',
    paypal_order_id TEXT,
    paypal_capture_id TEXT,
    paypal_payer_id TEXT,
    payment_date TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS transaction_documents (
    id SERIAL PRIMARY KEY,
    document_number TEXT NOT NULL UNIQUE,
    order_id INTEGER NOT NULL,
    doc_type TEXT NOT NULL DEFAULT 'TRANSACTION_CONFIRMATION',
    seller_name TEXT NOT NULL DEFAULT 'Monsieur De Coster',
    seller_status TEXT NOT NULL DEFAULT 'Vendeur particulier',
    seller_address TEXT,
    buyer_name TEXT NOT NULL,
    buyer_company TEXT,
    buyer_address TEXT NOT NULL,
    lot_reference TEXT NOT NULL,
    lot_title TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    shipping_cents INTEGER NOT NULL DEFAULT 0,
    total_cents INTEGER NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'PayPal',
    payment_reference TEXT,
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    user_email TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details TEXT,
    ip_address TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT
  );`,

  `CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    sender_type TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    sender_email TEXT,
    sender_phone TEXT,
    lot_id INTEGER,
    lot_reference TEXT,
    lot_title TEXT,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
  );`,

  // Mises à niveau et ajouts de colonnes pour les tables déjà existantes
  `ALTER TABLE lots ADD COLUMN IF NOT EXISTS shipping_quote_required BOOLEAN DEFAULT FALSE;`,
  `ALTER TABLE lots ADD COLUMN IF NOT EXISTS shipping_note TEXT;`,
  `ALTER TABLE lots ADD COLUMN IF NOT EXISTS custom_shipping_cost_cents INTEGER;`,
  `ALTER TABLE lots ADD COLUMN IF NOT EXISTS target_acquisition_cost_cents INTEGER DEFAULT 0;`,
  `ALTER TABLE lots ADD COLUMN IF NOT EXISTS actual_acquisition_cost_cents INTEGER DEFAULT 0;`,
  `ALTER TABLE lots ADD COLUMN IF NOT EXISTS acquisition_status TEXT DEFAULT 'PENDING';`,
  `ALTER TABLE lots ADD COLUMN IF NOT EXISTS acquisition_source TEXT;`,
  `ALTER TABLE lots ADD COLUMN IF NOT EXISTS acquisition_date TIMESTAMP;`,
  `ALTER TABLE lots ADD COLUMN IF NOT EXISTS acquisition_notes TEXT;`,
  `ALTER TABLE lots ADD COLUMN IF NOT EXISTS reserve_price_cents INTEGER DEFAULT 0;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS accepted_terms BOOLEAN DEFAULT FALSE;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS accepted_terms_version TEXT;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS accepted_terms_at TIMESTAMP;`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost_cents INTEGER DEFAULT 0;`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_cents INTEGER DEFAULT 0;`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMP;`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_carrier TEXT;`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;`,
  `ALTER TABLE transaction_documents ADD COLUMN IF NOT EXISTS shipping_cents INTEGER DEFAULT 0;`,
];

/**
 * Exécute la création automatique des tables et le peuplement initial sur Render / Neon / Cloud SQL
 */
export async function autoMigrateAndSeed(): Promise<boolean> {
  if (!isDbConfigured) {
    console.log('[Auto-DB] Aucune base de données distante configurée, fonctionnement en mode mémoire garanti.');
    return false;
  }

  const pool = createPool();
  const client = await pool.connect();

  try {
    console.log('[Auto-DB] Vérification et migration automatique du schéma PostgreSQL...');
    for (const ddl of DDL_STATEMENTS) {
      await client.query(ddl);
    }

    // 1. Initialiser la vente hebdomadaire par défaut
    const saleCheck = await client.query(`SELECT id FROM sales WHERE reference = 'VENTE-2026-001' LIMIT 1`);
    let defaultSaleId = 1;
    if (saleCheck.rows.length === 0) {
      const saleInsert = await client.query(
        `INSERT INTO sales (reference, title, description, status, starts_at, ends_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW() + INTERVAL '7 days')
         RETURNING id`,
        ['VENTE-2026-001', 'Vente Privée d’Objets d’Art & Collections', 'Sélection hebdomadaire réservée aux professionnels.', 'LIVE']
      );
      defaultSaleId = saleInsert.rows[0].id;
    } else {
      defaultSaleId = saleCheck.rows[0].id;
    }

    // 2. Initialiser le compte client test professionnel (Pierre Beaumont)
    const userCheck = await client.query(`SELECT id FROM users WHERE email = 'client.test@enchere-antiquites.fr' LIMIT 1`);
    let testUserId = 5;
    if (userCheck.rows.length === 0) {
      const userInsert = await client.query(
        `INSERT INTO users (
          uid, email, role, status, email_verified, password_hash,
          first_name, last_name, phone, company_name, activity,
          country, vat_number, address_line1, postal_code, city, accepted_terms, accepted_terms_version
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
        ) RETURNING id`,
        [
          'client_test_demo_uid',
          'client.test@enchere-antiquites.fr',
          'CUSTOMER',
          'APPROVED',
          true,
          '186474c1f2c2f735a54c2cf82ee8e87f2a5cd30940e280029363fecedfc5328c', // hash pour 'client123'
          'Pierre',
          'Beaumont',
          '+33 6 12 34 56 78',
          'Antiquités Beaumont & Fils',
          "Antiquaire & Expert d'art",
          'France',
          'FR32987654321',
          '14 rue des Beaux-Arts',
          '75006',
          'Paris',
          true,
          'v1.0 (2026)',
        ]
      );
      testUserId = userInsert.rows[0].id;
    } else {
      testUserId = userCheck.rows[0].id;
    }

    // 3. Initialiser le catalogue des 12 lots si la table est vide
    const lotsCountRes = await client.query(`SELECT count(*)::int as count FROM lots`);
    const count = lotsCountRes.rows[0]?.count || 0;
    if (count === 0) {
      console.log(`[Auto-DB] Injection des ${DEFAULT_LOTS.length} lots officiels du catalogue...`);
      for (const item of DEFAULT_LOTS) {
        await client.query(
          `INSERT INTO lots (
            id, sale_id, reference, title, description, category,
            period, dimensions, weight, condition_report, flaws, observations,
            starting_price_cents, reserve_price_cents, current_price_cents,
            bid_count, status, ends_at, images
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
          ) ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            current_price_cents = EXCLUDED.current_price_cents,
            images = EXCLUDED.images`,
          [
            item.id,
            defaultSaleId,
            item.reference,
            item.title,
            item.description,
            item.category,
            item.period || null,
            item.dimensions || null,
            item.weight || null,
            item.conditionReport,
            item.flaws || null,
            item.observations || null,
            item.startingPriceCents,
            item.reservePriceCents || 0,
            item.currentPriceCents,
            item.bidCount || 0,
            item.status,
            new Date(item.endsAt),
            JSON.stringify(item.images || []),
          ]
        );
      }
      // Ajuster la séquence id des lots
      await client.query(`SELECT setval('lots_id_seq', (SELECT MAX(id) FROM lots))`);
      console.log('[Auto-DB] Lots et séquences initialisés avec succès.');
    }

    // 4. Paramètres généraux de la plateforme
    const settingsCheck = await client.query(`SELECT key FROM system_settings WHERE key = 'SELLER_NAME'`);
    if (settingsCheck.rows.length === 0) {
      await client.query(
        `INSERT INTO system_settings (key, value, description) VALUES
         ('SELLER_NAME', 'Monsieur De Coster', 'Nom du vendeur particulier'),
         ('SELLER_STATUS', 'Vendeur particulier - Collections privées familiales', 'Statut juridique'),
         ('SELLER_CITY', 'Lille (59000), France', 'Localisation des pièces'),
         ('PLATFORM_TAX_NOTICE', 'Cession privée non assujettie à TVA - Pas de TVA déductible - Frais de vente 0%', 'Mention fiscale légale')`
      );
    }

    console.log('[Auto-DB] Base de données prête et synchronisée à 100%.');
    return true;
  } catch (err: any) {
    console.warn('[Auto-DB] Avertissement lors de la migration/initialisation:', err?.message || err);
    return false;
  } finally {
    client.release();
  }
}
