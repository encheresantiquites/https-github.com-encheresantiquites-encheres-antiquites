import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  json,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// Users table (Antiquaires, Brocanteurs & Admins)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  role: text('role').notNull().default('CUSTOMER'), // 'CUSTOMER' | 'ADMIN'
  status: text('status').notNull().default('PENDING'), // 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'BLOCKED'
  emailVerified: boolean('email_verified').notNull().default(false),
  passwordHash: text('password_hash'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  phone: text('phone'),
  companyName: text('company_name'),
  activity: text('activity'), // e.g. Antiquaire, Brocanteur, Marchand d'art
  country: text('country'),
  vatNumber: text('vat_number'),
  website: text('website'),
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  postalCode: text('postal_code'),
  city: text('city'),
  acceptedTerms: boolean('accepted_terms').notNull().default(false),
  acceptedTermsAt: timestamp('accepted_terms_at'),
  acceptedTermsVersion: text('accepted_terms_version'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Weekly sales (Ventes privées bi-hebdomadaires : Mardi & Vendredi)
export const sales = pgTable('sales', {
  id: serial('id').primaryKey(),
  reference: text('reference').notNull().unique(), // e.g. 'VENTE-2026-M01' ou 'VENTE-2026-V01'
  title: text('title').notNull(),
  description: text('description'),
  saleDay: text('sale_day').notNull().default('MARDI'), // 'MARDI' | 'VENDREDI'
  status: text('status').notNull().default('DRAFT'), // 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CLOSED' | 'CANCELLED'
  startsAt: timestamp('starts_at').notNull(),
  endsAt: timestamp('ends_at').notNull(),
  openTime: text('open_time').default('10:00'), // Heure d'ouverture configurable (ex: 10:00)
  closeTime: text('close_time').default('22:00'), // Heure de clôture par défaut (22:00)
  antiSnipeMinutes: integer('anti_snipe_minutes').notNull().default(2),
  antiSnipeTriggerSeconds: integer('anti_snipe_trigger_seconds').notNull().default(120),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Lots / Family collection objects
export const lots = pgTable('lots', {
  id: serial('id').primaryKey(),
  saleId: integer('sale_id').references(() => sales.id),
  reference: text('reference').notNull().unique(), // e.g. 'LOT-2026-0001'
  title: text('title').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  period: text('period'),
  dimensions: text('dimensions'),
  weight: text('weight'),
  conditionReport: text('condition_report').notNull(),
  flaws: text('flaws'),
  observations: text('observations'),
  startingPriceCents: integer('starting_price_cents').notNull(),
  reservePriceCents: integer('reserve_price_cents').default(0), // Secret
  currentPriceCents: integer('current_price_cents').notNull(),
  bidCount: integer('bid_count').notNull().default(0),
  currentWinnerId: integer('current_winner_id').references(() => users.id),
  secondWinnerId: integer('second_winner_id').references(() => users.id),
  secondBidAmountCents: integer('second_bid_amount_cents').default(0),
  thirdWinnerId: integer('third_winner_id').references(() => users.id),
  thirdBidAmountCents: integer('third_bid_amount_cents').default(0),
  paymentDueAt: timestamp('payment_due_at'),
  offeredToSecondAt: timestamp('offered_to_second_at'),
  offeredToThirdAt: timestamp('offered_to_third_at'),
  cascadeStep: integer('cascade_step').notNull().default(1), // 1 = 1er gagnant, 2 = 2ème enchérisseur, 3 = 3ème enchérisseur, 4 = impayé définitif
  paymentStatus: text('payment_status').default('PENDING'), // 'PENDING' | 'AWAITING_PAYMENT' | 'PAID' | 'OVERDUE' | 'OFFERED_SECOND' | 'OFFERED_THIRD' | 'UNPAID'
  status: text('status').notNull().default('ACTIVE'), // 'DRAFT' | 'ACTIVE' | 'SOLD' | 'RESERVE_NOT_MET' | 'UNSOLD' | 'CANCELLED'
  endsAt: timestamp('ends_at').notNull(),
  images: json('images').$type<string[]>().default([]),
  
  // Administrative & Treasury Tracking (Internal to seller only)
  targetAcquisitionCostCents: integer('target_acquisition_cost_cents').default(0),
  actualAcquisitionCostCents: integer('actual_acquisition_cost_cents').default(0),
  acquisitionStatus: text('acquisition_status').default('PENDING'), // 'PENDING' | 'PURCHASED' | 'RECEIVED' | 'NOT_APPLICABLE'
  acquisitionSource: text('acquisition_source'),
  acquisitionDate: timestamp('acquisition_date'),
  acquisitionNotes: text('acquisition_notes'),
  shippingQuoteRequired: boolean('shipping_quote_required').default(false),
  shippingNote: text('shipping_note'),
  customShippingCostCents: integer('custom_shipping_cost_cents'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Proxy maximum bids (Confidential)
export const bids = pgTable('bids', {
  id: serial('id').primaryKey(),
  lotId: integer('lot_id').references(() => lots.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  maxBidCents: integer('max_bid_cents').notNull(), // Confidential proxy max
  currentPriceCents: integer('current_price_cents').notNull(),
  isWinning: boolean('is_winning').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// Public anonymous bid history
export const bidHistory = pgTable('bid_history', {
  id: serial('id').primaryKey(),
  lotId: integer('lot_id').references(() => lots.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  publicBidderId: text('public_bidder_id').notNull(), // e.g. 'Enchérisseur #3'
  amountCents: integer('amount_cents').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Orders for won lots
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  orderNumber: text('order_number').notNull().unique(), // e.g. 'CMD-2026-0001'
  lotId: integer('lot_id').references(() => lots.id).notNull(),
  buyerId: integer('buyer_id').references(() => users.id).notNull(),
  finalPriceCents: integer('final_price_cents').notNull(),
  shippingCostCents: integer('shipping_cost_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull(),
  status: text('status').notNull().default('AWAITING_PAYMENT'), // 'AWAITING_PAYMENT' | 'PAID' | 'PURCHASE_PENDING' | 'PURCHASED' | 'RECEIVED' | 'READY_TO_SHIP' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED'
  shippingCarrier: text('shipping_carrier'),
  trackingNumber: text('tracking_number'),
  shippedAt: timestamp('shipped_at'),
  deliveredAt: timestamp('delivered_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Payments
export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').references(() => orders.id).notNull(),
  buyerId: integer('buyer_id').references(() => users.id).notNull(),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull().default('EUR'),
  status: text('status').notNull().default('PENDING'), // 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'
  provider: text('provider').notNull().default('PAYPAL'),
  paypalOrderId: text('paypal_order_id'),
  paypalCaptureId: text('paypal_capture_id'),
  paypalPayerId: text('paypal_payer_id'),
  paymentDate: timestamp('payment_date'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Transaction documents (Reçus / Confirmations de transaction - PAS DE FAUSSE FACTURE)
export const transactionDocuments = pgTable('transaction_documents', {
  id: serial('id').primaryKey(),
  documentNumber: text('document_number').notNull().unique(), // e.g. 'REC-2026-0001'
  orderId: integer('order_id').references(() => orders.id).notNull(),
  docType: text('doc_type').notNull().default('TRANSACTION_CONFIRMATION'), // 'TRANSACTION_CONFIRMATION' | 'SALE_RECEIPT'
  sellerName: text('seller_name').notNull().default('Monsieur De Coster'),
  sellerStatus: text('seller_status').notNull().default('Vendeur particulier'),
  sellerAddress: text('seller_address'),
  buyerName: text('buyer_name').notNull(),
  buyerCompany: text('buyer_company'),
  buyerAddress: text('buyer_address').notNull(),
  lotReference: text('lot_reference').notNull(),
  lotTitle: text('lot_title').notNull(),
  amountCents: integer('amount_cents').notNull(),
  shippingCents: integer('shipping_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull(),
  paymentMethod: text('payment_method').notNull().default('PayPal'),
  paymentReference: text('payment_reference'),
  paidAt: timestamp('paid_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Audit logs
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id'),
  userEmail: text('user_email'),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  details: text('details'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow(),
});

// System settings
export const systemSettings = pgTable('system_settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
});

// Chat & Demandes directes (Ouvert de 9h à 17h du lundi au vendredi)
export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  senderType: text('sender_type').notNull(), // 'BUYER' | 'ADMIN'
  senderName: text('sender_name').notNull(),
  senderEmail: text('sender_email'),
  senderPhone: text('sender_phone'),
  lotId: integer('lot_id').references(() => lots.id),
  lotReference: text('lot_reference'),
  lotTitle: text('lot_title'),
  message: text('message').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// Registre financier automatique (Ligne financière unique par objet)
export const financialRecords = pgTable('financial_records', {
  id: serial('id').primaryKey(),
  lotId: integer('lot_id').references(() => lots.id).notNull().unique(), // Ligne financière unique
  reference: text('reference').notNull(),
  title: text('title').notNull(),
  acquisitionCostCents: integer('acquisition_cost_cents').notNull().default(0), // Prix d'achat réel (admin exclusif)
  adjudicatedPriceCents: integer('adjudicated_price_cents'), // Prix de vente adjugé
  finalPriceCents: integer('final_price_cents'), // Prix finalement retenu (après cascade éventuelle)
  directCostsCents: integer('direct_costs_cents').notNull().default(0), // Frais d'achat / coûts directement imputables
  paymentFeesCents: integer('payment_fees_cents').notNull().default(0), // Frais de paiement réellement supportés
  collectedAmountCents: integer('collected_amount_cents').notNull().default(0), // Montant réellement encaissé (0 tant que non payé)
  grossMarginCents: integer('gross_margin_cents').notNull().default(0), // Marge brute = prix retenu - prix achat
  netMarginCents: integer('net_margin_cents').notNull().default(0), // Marge nette = prix retenu - prix achat - frais réels
  financialStatus: text('financial_status').notNull().default('CATALOGUE'), // 'CATALOGUE' | 'EN_VENTE' | 'ADJUGE_ATTENTE' | 'PAYE_SOLDE' | 'CASCADE_ATTENTE' | 'IMPAYE' | 'INVENDU'
  history: json('history').$type<any[]>().default([]),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Sessions invalidées / révoquées (protection lors de la déconnexion)
export const revokedSessions = pgTable('revoked_sessions', {
  id: serial('id').primaryKey(),
  token: text('token').notNull().unique(),
  userId: integer('user_id').references(() => users.id),
  revokedAt: timestamp('revoked_at').defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
});

// Relationships
export const usersRelations = relations(users, ({ many }) => ({
  bids: many(bids),
  orders: many(orders),
  payments: many(payments),
}));

export const salesRelations = relations(sales, ({ many }) => ({
  lots: many(lots),
}));

export const lotsRelations = relations(lots, ({ one, many }) => ({
  sale: one(sales, {
    fields: [lots.saleId],
    references: [sales.id],
  }),
  currentWinner: one(users, {
    fields: [lots.currentWinnerId],
    references: [users.id],
  }),
  bids: many(bids),
  history: many(bidHistory),
  orders: many(orders),
}));

export const bidsRelations = relations(bids, ({ one }) => ({
  lot: one(lots, {
    fields: [bids.lotId],
    references: [lots.id],
  }),
  user: one(users, {
    fields: [bids.userId],
    references: [users.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  lot: one(lots, {
    fields: [orders.lotId],
    references: [lots.id],
  }),
  buyer: one(users, {
    fields: [orders.buyerId],
    references: [users.id],
  }),
  payments: many(payments),
  documents: many(transactionDocuments),
}));
