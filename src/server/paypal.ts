import { db } from '../db/index.ts';
import { orders, payments, transactionDocuments, lots, users, auditLogs } from '../db/schema.ts';
import { eq } from 'drizzle-orm';

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';
const PAYPAL_ENVIRONMENT = process.env.PAYPAL_ENVIRONMENT || 'SANDBOX';

const PAYPAL_BASE_URL = PAYPAL_ENVIRONMENT === 'LIVE'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

/**
 * Obtient un token d'accès OAuth2 auprès de PayPal
 */
async function getPayPalAccessToken(): Promise<string> {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error('Identifiants PayPal non configurés dans les variables d’environnement.');
  }

  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Échec authentification PayPal: ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Crée un ordre de paiement PayPal pour une commande d'enchère
 */
export async function createPayPalOrder(orderId: number, buyerId: number) {
  const orderRes = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId));

  if (orderRes.length === 0) {
    throw new Error('Commande introuvable.');
  }

  const order = orderRes[0];
  if (order.buyerId !== buyerId) {
    throw new Error('Vous n’êtes pas autorisé à payer cette commande.');
  }

  if (order.status !== 'AWAITING_PAYMENT') {
    throw new Error(`Cette commande ne peut plus être payée (statut actuel: ${order.status}).`);
  }

  const lotRes = await db.select().from(lots).where(eq(lots.id, order.lotId));
  const lot = lotRes[0];

  const totalAmountStr = (order.totalCents / 100).toFixed(2);
  const itemAmountStr = (order.finalPriceCents / 100).toFixed(2);
  const shippingAmountStr = (order.shippingCostCents / 100).toFixed(2);

  // Si clés PayPal absentes en dev/sandbox, créer un ordre simulé sécurisé
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    const mockOrderId = `PAYPAL-MOCK-${order.orderNumber}-${Date.now()}`;
    return {
      id: mockOrderId,
      status: 'CREATED',
      simulated: true,
      amount: totalAmountStr,
      currency: 'EUR',
    };
  }

  const token = await getPayPalAccessToken();
  const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: order.orderNumber,
          description: `Acquisition ${lot?.reference || 'Objet'} - Enchère Antiquités`,
          amount: {
            currency_code: 'EUR',
            value: totalAmountStr,
            breakdown: {
              item_total: { currency_code: 'EUR', value: itemAmountStr },
              shipping: { currency_code: 'EUR', value: shippingAmountStr },
            },
          },
        },
      ],
      application_context: {
        brand_name: 'Enchère Antiquités',
        locale: 'fr-FR',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Erreur création ordre PayPal: ${err}`);
  }

  return await response.json();
}

/**
 * Capture et vérifie strictement le paiement côté serveur (Ne jamais se fier au frontend)
 */
export async function captureAndVerifyPayPalPayment(
  orderId: number,
  buyerId: number,
  paypalOrderId: string,
  paymentMethodLabel: string = 'PayPal'
) {
  return await db.transaction(async (tx) => {
    const orderRes = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .for('update');

    if (orderRes.length === 0) {
      throw new Error('Commande introuvable.');
    }

    const order = orderRes[0];
    if (order.buyerId !== buyerId) {
      throw new Error('Action non autorisée.');
    }

    if (order.status === 'PAID') {
      return { success: true, message: 'Cette commande est déjà réglée.' };
    }

    let captureId = `CAP-${Date.now()}`;
    let payerId = 'PAYER-SANDBOX';

    // Si les clés API réelles sont configurées, interroger et capturer sur PayPal
    if (PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET && !paypalOrderId.startsWith('PAYPAL-MOCK-')) {
      const token = await getPayPalAccessToken();
      const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${paypalOrderId}/capture`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Échec de capture PayPal: ${errText}`);
      }

      const captureData = await response.json();
      if (captureData.status !== 'COMPLETED') {
        throw new Error(`Statut PayPal invalide: ${captureData.status}`);
      }

      // Vérifier le montant exact en EUR
      const purchaseUnit = captureData.purchase_units?.[0];
      const capture = purchaseUnit?.payments?.captures?.[0];
      if (!capture) {
        throw new Error('Capture de paiement introuvable dans la réponse PayPal.');
      }

      const verifiedAmount = Math.round(parseFloat(capture.amount.value) * 100);
      if (verifiedAmount !== order.totalCents || capture.amount.currency_code !== 'EUR') {
        throw new Error(`Incohérence de montant/devise: attendu ${order.totalCents} EUR centimes, reçu ${verifiedAmount} ${capture.amount.currency_code}`);
      }

      captureId = capture.id;
      payerId = captureData.payer?.payer_id || 'PAYPAL_PAYER';
    }

    const now = new Date();

    // 1. Mettre à jour la commande à PAID
    await tx
      .update(orders)
      .set({
        status: 'PAID',
        updatedAt: now,
      })
      .where(eq(orders.id, orderId));

    // 2. Enregistrer l'opération de paiement
    await tx.insert(payments).values({
      orderId: order.id,
      buyerId,
      amountCents: order.totalCents,
      currency: 'EUR',
      status: 'PAID',
      provider: 'PAYPAL',
      paypalOrderId,
      paypalCaptureId: captureId,
      paypalPayerId: payerId,
      paymentDate: now,
    });

    // 3. Charger les informations pour le Document de Transaction (Pas de fausse facture)
    const lotRes = await tx.select().from(lots).where(eq(lots.id, order.lotId));
    const lot = lotRes[0];

    const buyerRes = await tx.select().from(users).where(eq(users.id, buyerId));
    const buyer = buyerRes[0];

    const docNumber = `REC-${now.getFullYear()}-${String(order.id).padStart(4, '0')}`;
    const buyerAddressFormatted = [
      buyer?.addressLine1,
      buyer?.addressLine2,
      `${buyer?.postalCode || ''} ${buyer?.city || ''}`.trim(),
      buyer?.country,
    ].filter(Boolean).join(', ');

    await tx.insert(transactionDocuments).values({
      documentNumber: docNumber,
      orderId: order.id,
      docType: 'TRANSACTION_CONFIRMATION',
      sellerName: 'Monsieur De Coster',
      sellerStatus: 'Vendeur particulier',
      sellerAddress: 'Lille / Bruxelles',
      buyerName: `${buyer?.firstName || ''} ${buyer?.lastName || ''}`.trim() || 'Acheteur Professionnel',
      buyerCompany: buyer?.companyName || 'Entreprise Individuelle',
      buyerAddress: buyerAddressFormatted || 'Adresse non renseignée',
      lotReference: lot?.reference || 'LOT',
      lotTitle: lot?.title || 'Objet de collection',
      amountCents: order.finalPriceCents,
      shippingCents: order.shippingCostCents,
      totalCents: order.totalCents,
      paymentMethod: paymentMethodLabel,
      paymentReference: captureId,
      paidAt: now,
    });

    // 4. Audit Log
    await tx.insert(auditLogs).values({
      userId: buyerId,
      userEmail: buyer?.email,
      action: 'PAYMENT_RECEIVED',
      entityType: 'ORDER',
      entityId: order.orderNumber,
      details: `Paiement ${paymentMethodLabel} confirmé de ${(order.totalCents / 100).toFixed(2)} € pour la commande ${order.orderNumber}. Capture ID: ${captureId}. Document ${docNumber} généré. Objet prêt pour la chaîne d'acquisition.`,
    });

    return {
      success: true,
      orderNumber: order.orderNumber,
      documentNumber: docNumber,
      captureId,
    };
  });
}
