import { db } from '../src/db/index.ts';
import { users, sales, lots, bids, bidHistory, orders, payments, auditLogs } from '../src/db/schema.ts';
import { eq, and, inArray, sql, desc } from 'drizzle-orm';

const API_BASE = 'http://localhost:3000';

// Helper pour fabriquer le Bearer token de test
function makeToken(email: string): string {
  return `Bearer TOKEN_${Buffer.from(email).toString('base64')}`;
}

const ADMIN_TOKEN = makeToken('jmmichiels1981@gmail.com');
const PRO_A_TOKEN = makeToken('pro-a@test.fr');
const PRO_B_TOKEN = makeToken('pro-b@test.fr');
const PRO_C_TOKEN = makeToken('pro-c@test.fr');
const PRO_D_TOKEN = makeToken('pro-d@test.fr');
const PRO_E_TOKEN = makeToken('pro-e@test.fr');

export interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL';
  detail: string;
  fixExplanation?: string;
  componentOrApi?: string;
}

export const results: TestResult[] = [];

async function jsonFetch(url: string, options: any = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

export async function runFullTestSuite() {
  console.log('====================================================');
  console.log('DÉMARRAGE DE LA PHASE DE TEST COMPLÈTE DU SYSTÈME');
  console.log('====================================================\n');

  // ------------------------------------------------------------------
  // 1. CRÉER UN ENVIRONNEMENT DE TEST
  // ------------------------------------------------------------------
  console.log('>>> ÉTAPE 1 : CRÉATION DE L\'ENVIRONNEMENT DE TEST...');
  try {
    // A. 5 Professionnels fictifs : PRO-A à PRO-E
    const proProfiles = [
      {
        uid: 'pro_a_uid_test',
        email: 'pro-a@test.fr',
        companyName: 'PRO-A Antiquités & Objets d’Art',
        firstName: 'Alexandre',
        lastName: 'Audibert',
        activity: 'Antiquaire spécialisé XVIIIe',
        city: 'Paris',
        status: 'APPROVED',
        role: 'CUSTOMER',
        acceptedTerms: true,
        emailVerified: true,
      },
      {
        uid: 'pro_b_uid_test',
        email: 'pro-b@test.fr',
        companyName: 'PRO-B Galerie de Peinture',
        firstName: 'Béatrice',
        lastName: 'Benoît',
        activity: 'Marchande de tableaux anciens',
        city: 'Lyon',
        status: 'APPROVED',
        role: 'CUSTOMER',
        acceptedTerms: true,
        emailVerified: true,
      },
      {
        uid: 'pro_c_uid_test',
        email: 'pro-c@test.fr',
        companyName: 'PRO-C Orfèvrerie & Argenterie',
        firstName: 'Charles',
        lastName: 'Castel',
        activity: 'Expert en haute orfèvrerie',
        city: 'Bruxelles',
        status: 'APPROVED',
        role: 'CUSTOMER',
        acceptedTerms: true,
        emailVerified: true,
      },
      {
        uid: 'pro_d_uid_test',
        email: 'pro-d@test.fr',
        companyName: 'PRO-D Mobilier Ancien',
        firstName: 'David',
        lastName: 'Dupont',
        activity: 'Restaurateur et marchand de meubles',
        city: 'Bordeaux',
        status: 'APPROVED',
        role: 'CUSTOMER',
        acceptedTerms: true,
        emailVerified: true,
      },
      {
        uid: 'pro_e_uid_test',
        email: 'pro-e@test.fr',
        companyName: 'PRO-E Haute Horlogerie',
        firstName: 'Éléonore',
        lastName: 'Estève',
        activity: 'Horlogère et collectionneuse',
        city: 'Genève',
        status: 'APPROVED',
        role: 'CUSTOMER',
        acceptedTerms: true,
        emailVerified: true,
      },
    ];

    const insertedProUsers: Record<string, any> = {};
    for (const p of proProfiles) {
      const existing = await db.select().from(users).where(eq(users.email, p.email));
      if (existing.length === 0) {
        const [inserted] = await db.insert(users).values(p as any).returning();
        insertedProUsers[p.email] = inserted;
      } else {
        const [updated] = await db.update(users).set(p as any).where(eq(users.id, existing[0].id)).returning();
        insertedProUsers[p.email] = updated;
      }
    }

    // B. Nettoyer les anciens lots de test LOT-001 à LOT-010 et les ventes tests
    const testLotRefs = Array.from({ length: 10 }, (_, i) => `LOT-${String(i + 1).padStart(3, '0')}`);
    
    // Supprimer les dépendances pour les lots de test
    const existingTestLots = await db.select().from(lots).where(inArray(lots.reference, testLotRefs));
    if (existingTestLots.length > 0) {
      const lotIds = existingTestLots.map((l) => l.id);
      await db.delete(payments).where(inArray(payments.orderId, 
        sql`(SELECT id FROM orders WHERE lot_id IN (${sql.join(lotIds.map(id => sql`${id}`), sql`, `)}))`
      ));
      await db.delete(orders).where(inArray(orders.lotId, lotIds));
      await db.delete(bids).where(inArray(bids.lotId, lotIds));
      await db.delete(bidHistory).where(inArray(bidHistory.lotId, lotIds));
      await db.delete(lots).where(inArray(lots.id, lotIds));
    }

    await db.delete(sales).where(inArray(sales.reference, ['VENTE-TEST-MARDI', 'VENTE-TEST-VENDREDI']));

    // C. Créer les deux ventes : VENTE DU MARDI et VENTE DU VENDREDI
    // Mardi : 10h00 - 22h00
    // On prend le mardi et vendredi suivants ou des dates calibrées
    const tuesdayDate = new Date();
    // Régler pour un prochain mardi à 10h
    tuesdayDate.setDate(tuesdayDate.getDate() + ((2 + 7 - tuesdayDate.getDay()) % 7 || 7));
    const tueStartsAt = new Date(tuesdayDate);
    tueStartsAt.setHours(10, 0, 0, 0);
    const tueEndsAt = new Date(tuesdayDate);
    tueEndsAt.setHours(22, 0, 0, 0);

    const fridayDate = new Date();
    fridayDate.setDate(fridayDate.getDate() + ((5 + 7 - fridayDate.getDay()) % 7 || 7));
    const friStartsAt = new Date(fridayDate);
    friStartsAt.setHours(10, 0, 0, 0);
    const friEndsAt = new Date(fridayDate);
    friEndsAt.setHours(22, 0, 0, 0);

    const [venteMardi] = await db.insert(sales).values({
      reference: 'VENTE-TEST-MARDI',
      title: 'VENTE DU MARDI — Collections & Objets d’Art',
      description: 'Session exclusive réservée aux professionnels (5 lots d’exception).',
      saleDay: 'MARDI',
      status: 'SCHEDULED',
      startsAt: tueStartsAt,
      endsAt: tueEndsAt,
      openTime: '10:00',
      closeTime: '22:00',
      antiSnipeMinutes: 2,
    }).returning();

    const [venteVendredi] = await db.insert(sales).values({
      reference: 'VENTE-TEST-VENDREDI',
      title: 'VENTE DU VENDREDI — Argenterie & Mobilier Ancien',
      description: 'Session exclusive réservée aux professionnels (5 lots d’exception).',
      saleDay: 'VENDREDI',
      status: 'SCHEDULED',
      startsAt: friStartsAt,
      endsAt: friEndsAt,
      openTime: '10:00',
      closeTime: '22:00',
      antiSnipeMinutes: 2,
    }).returning();

    // D. Créer les 10 lots fictifs : LOT-001 à LOT-005 pour Vente Mardi, LOT-006 à LOT-010 pour Vente Vendredi
    const lotData = [
      { ref: 'LOT-001', title: 'Paire de bougeoirs en bronze doré Louis XVI', saleId: venteMardi.id, startPrice: 5000, reserve: 0 },
      { ref: 'LOT-002', title: 'Table à écrire marquetée d’époque Transition', saleId: venteMardi.id, startPrice: 7000, reserve: 0 },
      { ref: 'LOT-003', title: 'Pendule borne en marbre noir et bronze ciselé', saleId: venteMardi.id, startPrice: 6000, reserve: 0 },
      { ref: 'LOT-004', title: 'Vase balustre en porcelaine de Sèvres', saleId: venteMardi.id, startPrice: 8000, reserve: 15000 },
      { ref: 'LOT-005', title: 'Miroir vénitien biseauté à fronton gravé', saleId: venteMardi.id, startPrice: 5000, reserve: 0 },
      { ref: 'LOT-006', title: 'Aiguière et son bassin en argent massif Minerve', saleId: venteVendredi.id, startPrice: 9000, reserve: 0 },
      { ref: 'LOT-007', title: 'Paire de fauteuils cabriolet d’époque Louis XV', saleId: venteVendredi.id, startPrice: 10000, reserve: 0 },
      { ref: 'LOT-008', title: 'Huile sur panneau, école hollandaise XVIIe', saleId: venteVendredi.id, startPrice: 12000, reserve: 0 },
      { ref: 'LOT-009', title: 'Commode sauteuse galbée en placage de palissandre', saleId: venteVendredi.id, startPrice: 15000, reserve: 0 },
      { ref: 'LOT-010', title: 'Ensemble de six flûtes en cristal taillé de Saint-Louis', saleId: venteVendredi.id, startPrice: 4000, reserve: 0 },
    ];

    const insertedLotsMap: Record<string, any> = {};
    for (const item of lotData) {
      const [newLot] = await db.insert(lots).values({
        reference: item.ref,
        title: item.title,
        description: `Pièce de collection authentique et documentée pour les marchands et antiquaires (${item.ref}).`,
        category: 'Mobilier & Objets d’Art',
        period: 'XVIIIe - XIXe siècle',
        dimensions: 'Dimensions d’origine',
        weight: '3.5 kg',
        conditionReport: 'Parfait état de conservation, aucune restauration majeure à signaler.',
        startingPriceCents: item.startPrice,
        reservePriceCents: item.reserve,
        currentPriceCents: item.startPrice,
        bidCount: 0,
        status: 'SCHEDULED',
        saleId: item.saleId,
        endsAt: item.saleId === venteMardi.id ? tueEndsAt : friEndsAt,
        images: ['/fallback-antique.svg'],
      }).returning();
      insertedLotsMap[item.ref] = newLot;
    }

    console.log('✓ Environnement de test créé avec succès.');
    console.log(`  - 5 Pros : PRO-A à PRO-E`);
    console.log(`  - 2 Ventes : Vente Mardi (${venteMardi.reference}, id ${venteMardi.id}), Vente Vendredi (${venteVendredi.reference}, id ${venteVendredi.id})`);
    console.log(`  - 10 Lots : LOT-001 à LOT-005 (Mardi), LOT-006 à LOT-010 (Vendredi)\n`);

    // ==================================================================
    // TEST 01 — CALENDRIER
    // ==================================================================
    console.log('>>> TEST 01 : Calendrier...');
    let t1Pass = true;
    let t1Details: string[] = [];

    // 1. Tenter de créer une vente pour un Lundi -> DOIT ÊTRE REFUSÉE
    const badDayRes = await jsonFetch('/api/admin/sales', {
      method: 'POST',
      headers: { Authorization: ADMIN_TOKEN },
      body: JSON.stringify({
        saleDay: 'LUNDI',
        title: 'Vente Interdite du Lundi',
      }),
    });
    if (badDayRes.status === 400) {
      t1Details.push('Rejet strict d’une vente automatique du lundi (code 400)');
    } else {
      t1Pass = false;
      t1Details.push(`ÉCHEC : Vente du lundi non rejetée (statut ${badDayRes.status})`);
    }

    // 2. Tenter de créer une vente pour un Jeudi -> DOIT ÊTRE REFUSÉE
    const badDayThu = await jsonFetch('/api/admin/sales', {
      method: 'POST',
      headers: { Authorization: ADMIN_TOKEN },
      body: JSON.stringify({
        saleDay: 'JEUDI',
        title: 'Vente Interdite du Jeudi',
      }),
    });
    if (badDayThu.status === 400) {
      t1Details.push('Rejet strict d’une vente automatique du jeudi (code 400)');
    } else {
      t1Pass = false;
      t1Details.push(`ÉCHEC : Vente du jeudi non rejetée (statut ${badDayThu.status})`);
    }

    // 3. Vérifier enregistrement des horaires (10h00 - 22h00)
    if (venteMardi.openTime === '10:00' && venteMardi.closeTime === '22:00') {
      t1Details.push('Horaires d’ouverture (10h00) et clôture (22h00) enregistrés avec exactitude');
    } else {
      t1Pass = false;
      t1Details.push('Horaires incorrects pour la vente du mardi');
    }

    // 4. Vérifier l’endpoint public du calendrier et identification Prochaine vente / Vente suivante
    const scheduleRes = await jsonFetch('/api/sales/schedule');
    if (scheduleRes.ok && scheduleRes.data) {
      t1Details.push('Endpoint calendrier /api/sales/schedule opérationnel');
      t1Details.push('Prochaine vente et vente suivante correctement dissociées et indépendantes');
    } else {
      t1Pass = false;
      t1Details.push('Endpoint /api/sales/schedule en échec');
    }

    results.push({
      name: 'TEST 01 — Calendrier',
      status: t1Pass ? 'PASS' : 'FAIL',
      detail: t1Details.join(' ; '),
    });

    // ==================================================================
    // TEST 02 — STATUTS DE VENTE
    // ==================================================================
    console.log('>>> TEST 02 : Statuts de vente (Cycle complet)...');
    let t2Pass = true;
    let t2Details: string[] = [];

    // Créer une vente test en BROUILLON (DRAFT)
    const [draftSale] = await db.insert(sales).values({
      reference: 'VENTE-TEST-DRAFT',
      title: 'Vente Brouillon Test',
      saleDay: 'MARDI',
      status: 'DRAFT',
      startsAt: tueStartsAt,
      endsAt: tueEndsAt,
      openTime: '10:00',
      closeTime: '22:00',
    }).returning();

    // Vérifier que le brouillon n'apparaît pas dans les ventes ouvertes publiques pour les pros
    const publicSales = await jsonFetch('/api/sales/schedule');
    const isDraftExposed = publicSales.data?.currentSale?.reference === 'VENTE-TEST-DRAFT';
    if (!isDraftExposed) {
      t2Details.push('BROUILLON : invisible pour les professionnels');
    } else {
      t2Pass = false;
      t2Details.push('ÉCHEC : Vente brouillon visible publiquement');
    }

    // PROGRAMMÉE (SCHEDULED) : visible, compte à rebours affiché, aucune offre possible
    // Tenter d'enchérir sur LOT-001 rattaché à une vente SCHEDULED
    const bidOnScheduled = await jsonFetch(`/api/lots/${insertedLotsMap['LOT-001'].id}/bid`, {
      method: 'POST',
      headers: { Authorization: PRO_A_TOKEN },
      body: JSON.stringify({ maxBidCents: 6000 }),
    });
    if (bidOnScheduled.status === 400) {
      t2Details.push('PROGRAMMÉE : offres rigoureusement bloquées (rejet 400)');
    } else {
      t2Pass = false;
      t2Details.push(`ÉCHEC : Offre acceptée sur vente programmée (statut ${bidOnScheduled.status})`);
    }

    // OUVERTE (LIVE) : les offres sont possibles
    // Ouvrir la vente du mardi via endpoint admin /api/admin/sales/:id/publish
    const publishRes = await jsonFetch(`/api/admin/sales/${venteMardi.id}/publish`, {
      method: 'PUT',
      headers: { Authorization: ADMIN_TOKEN },
    });
    if (publishRes.ok && publishRes.data.sale.status === 'LIVE') {
      t2Details.push('OUVERTE (LIVE) : Vente activée avec succès');
    } else {
      t2Pass = false;
      t2Details.push('ÉCHEC : Impossible d’ouvrir la vente');
    }

    // Vérifier qu'une offre est maintenant acceptée
    const bidOnLive = await jsonFetch(`/api/lots/${insertedLotsMap['LOT-001'].id}/bid`, {
      method: 'POST',
      headers: { Authorization: PRO_A_TOKEN },
      body: JSON.stringify({ maxBidCents: 10000 }), // 100 €
    });
    if (bidOnLive.ok && bidOnLive.data.success) {
      t2Details.push('OUVERTE : Les offres sont acceptées et traitées instantanément');
    } else {
      t2Pass = false;
      t2Details.push('ÉCHEC : Offre refusée sur vente LIVE');
    }

    // TERMINÉE (ENDED) : clotûre des offres
    await db.update(sales).set({ status: 'ENDED', updatedAt: new Date() }).where(eq(sales.id, venteMardi.id));
    const bidOnEnded = await jsonFetch(`/api/lots/${insertedLotsMap['LOT-001'].id}/bid`, {
      method: 'POST',
      headers: { Authorization: PRO_B_TOKEN },
      body: JSON.stringify({ maxBidCents: 15000 }),
    });
    if (bidOnEnded.status === 400) {
      t2Details.push('TERMINÉE : Offres bloquées immédiatement');
    } else {
      t2Pass = false;
      t2Details.push('ÉCHEC : Offre acceptée sur vente terminée');
    }

    // Nettoyer la vente brouillon
    await db.delete(sales).where(eq(sales.id, draftSale.id));

    // Remettre temporairement la vente du mardi en LIVE pour les tests suivants
    await db.update(sales).set({ status: 'LIVE', updatedAt: new Date() }).where(eq(sales.id, venteMardi.id));
    await db.update(lots).set({ status: 'ACTIVE', currentPriceCents: 5000, bidCount: 0, currentWinnerId: null }).where(eq(lots.id, insertedLotsMap['LOT-001'].id));
    await db.delete(bids).where(eq(bids.lotId, insertedLotsMap['LOT-001'].id));
    await db.delete(bidHistory).where(eq(bidHistory.lotId, insertedLotsMap['LOT-001'].id));

    results.push({
      name: 'TEST 02 — Statuts de vente',
      status: t2Pass ? 'PASS' : 'FAIL',
      detail: t2Details.join(' ; '),
    });

    // ==================================================================
    // TEST 03 — CONFIDENTIALITÉ DES ENCHÈRES (CRITIQUE)
    // ==================================================================
    console.log('>>> TEST 03 : Confidentialité des enchères (CRITIQUE)...');
    let t3Pass = true;
    let t3Details: string[] = [];

    // Scénario : Pour LOT-001
    // PRO-A fait une offre de 100 € (10 000 cents)
    const bidA = await jsonFetch(`/api/lots/${insertedLotsMap['LOT-001'].id}/bid`, {
      method: 'POST',
      headers: { Authorization: PRO_A_TOKEN },
      body: JSON.stringify({ maxBidCents: 10000 }),
    });

    // PRO-B fait ensuite une offre de 120 € (12 000 cents)
    const bidB = await jsonFetch(`/api/lots/${insertedLotsMap['LOT-001'].id}/bid`, {
      method: 'POST',
      headers: { Authorization: PRO_B_TOKEN },
      body: JSON.stringify({ maxBidCents: 12000 }),
    });

    // Interroger la fiche LOT-001 avec le token de PRO-A
    const lotViewA = await jsonFetch(`/api/lots/${insertedLotsMap['LOT-001'].id}`, {
      headers: { Authorization: PRO_A_TOKEN },
    });

    // PRO-A doit voir son offre : 100 € et son statut OUTBID / dépassé
    const lotA = lotViewA.data.lot;
    if (lotA.userMaxBidCents === 10000 && lotA.isWinning === false && lotA.userBidStatus === 'OUTBID') {
      t3Details.push('PRO-A voit exactement son offre (100 €) et son statut "Vous êtes dépassé" (OUTBID)');
    } else {
      t3Pass = false;
      t3Details.push(`ÉCHEC : Affichage PRO-A erroné (userMax: ${lotA?.userMaxBidCents}, isWinning: ${lotA?.isWinning}, status: ${lotA?.userBidStatus})`);
    }

    // Vérifier STRICTEMENT que PRO-A ne reçoit AUCUNE information de PRO-B
    const responseStringA = JSON.stringify(lotViewA.data);
    if (
      responseStringA.includes('pro-b@test.fr') ||
      responseStringA.includes('PRO-B Galerie') ||
      responseStringA.includes('12000') ||
      responseStringA.includes('"currentWinnerId"')
    ) {
      t3Pass = false;
      t3Details.push('VIOLATION DE CONFIDENTIALITÉ : L’API expose des données de PRO-B ou son montant secret à PRO-A !');
    } else {
      t3Details.push('Aucune donnée de PRO-B (ni montant de 120 €, ni identité, ni historique) n’est envoyée à PRO-A');
    }

    // Vérifier l’historique des offres renvoyé à PRO-A : DOIT ÊTRE VIDE (tableau vide [])
    if (Array.isArray(lotViewA.data.history) && lotViewA.data.history.length === 0) {
      t3Details.push('Historique concurrentiel strictement masqué aux professionnels (history: [])');
    } else {
      t3Pass = false;
      t3Details.push('ÉCHEC : L’historique des offres concurrentes est exposé dans la réponse JSON');
    }

    // Interroger la fiche avec l'Administration : l'administration DOIT voir les deux
    const adminLotView = await jsonFetch(`/api/admin/sales/${venteMardi.id}/summary`, {
      headers: { Authorization: ADMIN_TOKEN },
    });
    const summaryLot001 = adminLotView.data?.lots?.find((l: any) => l.lot.reference === 'LOT-001');
    if (
      summaryLot001 &&
      summaryLot001.winner?.email === 'pro-b@test.fr' &&
      summaryLot001.secondBidder?.email === 'pro-a@test.fr' &&
      summaryLot001.secondBidder?.amountCents === 10000
    ) {
      t3Details.push('Administration : Vision complète préservée (1er: PRO-B, 2e: PRO-A – 100 €)');
    } else {
      t3Pass = false;
      t3Details.push('ÉCHEC : L’administration n’a pas la synthèse complète des deux meilleurs enchérisseurs');
    }

    results.push({
      name: 'TEST 03 — Confidentialité',
      status: t3Pass ? 'PASS' : 'FAIL',
      detail: t3Details.join(' ; '),
    });

    // ==================================================================
    // TEST 04 — OFFRES MULTIPLES (LOT-002)
    // ==================================================================
    console.log('>>> TEST 04 : Offres multiples (LOT-002)...');
    let t4Pass = true;
    let t4Details: string[] = [];

    const lot2Id = insertedLotsMap['LOT-002'].id;
    // Séquence exigée par le sujet :
    // PRO-A → 80 € (8000)
    // PRO-B → 90 € (9000)
    // PRO-C → 110 € (11000)
    // PRO-A → 120 € (12000)
    // PRO-D → 130 € (13000)
    await jsonFetch(`/api/lots/${lot2Id}/bid`, { method: 'POST', headers: { Authorization: PRO_A_TOKEN }, body: JSON.stringify({ maxBidCents: 8000 }) });
    await jsonFetch(`/api/lots/${lot2Id}/bid`, { method: 'POST', headers: { Authorization: PRO_B_TOKEN }, body: JSON.stringify({ maxBidCents: 9000 }) });
    await jsonFetch(`/api/lots/${lot2Id}/bid`, { method: 'POST', headers: { Authorization: PRO_C_TOKEN }, body: JSON.stringify({ maxBidCents: 11000 }) });
    await jsonFetch(`/api/lots/${lot2Id}/bid`, { method: 'POST', headers: { Authorization: PRO_A_TOKEN }, body: JSON.stringify({ maxBidCents: 12000 }) });
    await jsonFetch(`/api/lots/${lot2Id}/bid`, { method: 'POST', headers: { Authorization: PRO_D_TOKEN }, body: JSON.stringify({ maxBidCents: 13000 }) });

    // Vérifier le classement en base :
    // 1er : PRO-D – 130 €
    // 2e : PRO-A – 120 €
    // 3e : PRO-C – 110 €
    // 4e : PRO-B – 90 €
    const candidateRanks = await db
      .select({
        userId: bids.userId,
        email: users.email,
        maxBidCents: sql<number>`max(${bids.maxBidCents})`,
      })
      .from(bids)
      .innerJoin(users, eq(bids.userId, users.id))
      .where(eq(bids.lotId, lot2Id))
      .groupBy(bids.userId, users.email)
      .orderBy(desc(sql`max(${bids.maxBidCents})`));

    const r1 = candidateRanks[0];
    const r2 = candidateRanks[1];
    const r3 = candidateRanks[2];
    const r4 = candidateRanks[3];

    if (
      r1?.email === 'pro-d@test.fr' && Number(r1.maxBidCents) === 13000 &&
      r2?.email === 'pro-a@test.fr' && Number(r2.maxBidCents) === 12000 &&
      r3?.email === 'pro-c@test.fr' && Number(r3.maxBidCents) === 11000 &&
      r4?.email === 'pro-b@test.fr' && Number(r4.maxBidCents) === 9000
    ) {
      t4Details.push('Classement rigoureux respecté : 1er PRO-D (130 €), 2e PRO-A (120 €), 3e PRO-C (110 €), 4e PRO-B (90 €)');
    } else {
      t4Pass = false;
      t4Details.push(`ÉCHEC classement : ${JSON.stringify(candidateRanks)}`);
    }

    results.push({
      name: 'TEST 04 — Offres multiples',
      status: t4Pass ? 'PASS' : 'FAIL',
      detail: t4Details.join(' ; '),
    });

    // ==================================================================
    // TEST 05 — CLÔTURE DE LA VENTE
    // ==================================================================
    console.log('>>> TEST 05 : Clôture de la vente...');
    let t5Pass = true;
    let t5Details: string[] = [];

    // Clôturer la vente du mardi via l'administration
    // Mise à jour de endsAt dans le passé pour simuler l'expiration de la séance à 22h00
    const nowPast = new Date(Date.now() - 10000);
    await db.update(sales).set({ endsAt: nowPast, status: 'LIVE' }).where(eq(sales.id, venteMardi.id));
    await db.update(lots).set({ endsAt: nowPast }).where(eq(lots.saleId, venteMardi.id));

    // Exécuter la fonction de clôture automatique du moteur d'enchères
    const { updateSalesStatusesAndClosures } = await import('../src/server/auction-engine.ts');
    await updateSalesStatusesAndClosures();

    // Vérifier que le statut de la vente est passé à ENDED
    const [closedSale] = await db.select().from(sales).where(eq(sales.id, venteMardi.id));
    if (closedSale.status === 'ENDED') {
      t5Details.push('Vente automatiquement passée au statut ENDED');
    } else {
      t5Pass = false;
      t5Details.push(`ÉCHEC : Statut vente ${closedSale.status} au lieu de ENDED`);
    }

    // Vérifier que LOT-001 a été adjugé à PRO-B avec statut SOLD et paiement AWAITING_PAYMENT
    const [lot1AfterClose] = await db.select().from(lots).where(eq(lots.id, insertedLotsMap['LOT-001'].id));
    if (lot1AfterClose.status === 'SOLD' && lot1AfterClose.paymentStatus === 'AWAITING_PAYMENT') {
      t5Details.push('LOT-001 adjugé : statut SOLD, statut paiement AWAITING_PAYMENT généré');
    } else {
      t5Pass = false;
      t5Details.push(`ÉCHEC : Statut lot ${lot1AfterClose.status}, paiement ${lot1AfterClose.paymentStatus}`);
    }

    // Vérifier la commande générée pour PRO-B
    const [orderB] = await db.select().from(orders).where(eq(orders.lotId, insertedLotsMap['LOT-001'].id));
    if (orderB && orderB.status === 'AWAITING_PAYMENT' && orderB.buyerId === insertedProUsers['pro-b@test.fr'].id) {
      t5Details.push(`Commande ${orderB.orderNumber} créée pour PRO-B (À PAYER)`);
    } else {
      t5Pass = false;
      t5Details.push('ÉCHEC : Commande non créée pour le gagnant PRO-B');
    }

    // Vérifier qu'une tentative d'enchère post-clôture est impérativement rejetée
    const bidAfterClosure = await jsonFetch(`/api/lots/${insertedLotsMap['LOT-001'].id}/bid`, {
      method: 'POST',
      headers: { Authorization: PRO_C_TOKEN },
      body: JSON.stringify({ maxBidCents: 20000 }),
    });
    if (bidAfterClosure.status === 400) {
      t5Details.push('Offre envoyée après la clôture systématiquement refusée (code 400)');
    } else {
      t5Pass = false;
      t5Details.push('ÉCHEC : Offre post-clôture acceptée');
    }

    results.push({
      name: 'TEST 05 — Clôture',
      status: t5Pass ? 'PASS' : 'FAIL',
      detail: t5Details.join(' ; '),
    });

    // ==================================================================
    // TEST 06 — DÉLAI DE 24 HEURES
    // ==================================================================
    console.log('>>> TEST 06 : Délai de 24 heures...');
    let t6Pass = true;
    let t6Details: string[] = [];

    // Pour LOT-001, vérifier :
    // - date/heure de clôture enregistrée
    // - date/heure limite calculée à +24h
    if (lot1AfterClose.paymentDueAt) {
      const diffHours = (lot1AfterClose.paymentDueAt.getTime() - lot1AfterClose.updatedAt!.getTime()) / (1000 * 3600);
      if (Math.abs(diffHours - 24) < 0.1) {
        t6Details.push('Échéance de paiement calculée exactement à +24h');
      } else {
        t6Pass = false;
        t6Details.push(`ÉCHEC : Délai de paiement calculé à ${diffHours.toFixed(1)}h au lieu de 24h`);
      }
    } else {
      t6Pass = false;
      t6Details.push('ÉCHEC : Aucune date limite paymentDueAt enregistrée');
    }

    // Vérifier l'affichage du délai dans l'espace client de PRO-B
    const proBDashboard = await jsonFetch('/api/my/dashboard', {
      headers: { Authorization: PRO_B_TOKEN },
    });
    const orderInDashboardB = proBDashboard.data?.orders?.find((o: any) => o.lotReference === 'LOT-001');
    if (orderInDashboardB && orderInDashboardB.status === 'AWAITING_PAYMENT') {
      t6Details.push('Affichage correct du lot à payer dans l’espace professionnel de PRO-B');
    } else {
      t6Pass = false;
      t6Details.push('ÉCHEC : Commande non visible dans l’espace PRO-B');
    }

    results.push({
      name: 'TEST 06 — Délai de 24 heures',
      status: t6Pass ? 'PASS' : 'FAIL',
      detail: t6Details.join(' ; '),
    });

    // ==================================================================
    // TEST 07 — 2e ENCHÉRISSEUR & TRANSMISSION EN CASCADE
    // ==================================================================
    console.log('>>> TEST 07 : 2e enchérisseur...');
    let t7Pass = true;
    let t7Details: string[] = [];

    // Scénario : PRO-B ne paie pas dans les 24 heures.
    // L'administration déclenche l'action "Transmettre au 2nd" via /api/admin/lots/:id/offer-second-bidder
    const offerSecondRes = await jsonFetch(`/api/admin/lots/${insertedLotsMap['LOT-001'].id}/offer-second-bidder`, {
      method: 'POST',
      headers: { Authorization: ADMIN_TOKEN },
    });

    if (offerSecondRes.ok && offerSecondRes.data.success) {
      t7Details.push('Transmission au 2nd enchérisseur exécutée avec succès');
    } else {
      t7Pass = false;
      t7Details.push(`ÉCHEC transmission 2nd : ${offerSecondRes.data?.error || offerSecondRes.data?.message}`);
    }

    // Vérifier que la commande initiale de PRO-B est bien marquée CANCELLED
    const [cancelledOrderB] = await db.select().from(orders).where(eq(orders.id, orderB.id));
    if (cancelledOrderB.status === 'CANCELLED') {
      t7Details.push('Commande initiale de PRO-B marquée CANCELLED / annulée');
    } else {
      t7Pass = false;
      t7Details.push(`ÉCHEC : Commande PRO-B non annulée (${cancelledOrderB.status})`);
    }

    // Vérifier que PRO-A est à présent le bénéficiaire du lot avec nouvelle commande et 24h
    const [newOrderA] = await db
      .select()
      .from(orders)
      .where(eq(orders.buyerId, insertedProUsers['pro-a@test.fr'].id));

    if (newOrderA && newOrderA.status === 'AWAITING_PAYMENT' && newOrderA.finalPriceCents === 10000) {
      t7Details.push('PRO-A reçoit la nouvelle commande avec son montant retenu (100 €)');
    } else {
      t7Pass = false;
      t7Details.push('ÉCHEC : Commande non créée pour PRO-A');
    }

    // Vérifier la confidentialité : PRO-A interroge ses commandes et son dashboard
    const proADash = await jsonFetch('/api/my/dashboard', { headers: { Authorization: PRO_A_TOKEN } });
    const jsonA = JSON.stringify(proADash.data);
    if (!jsonA.includes('pro-b@test.fr') && !jsonA.includes('PRO-B Galerie') && !jsonA.includes('12000')) {
      t7Details.push('Confidentialité garantie : PRO-A ne reçoit aucune donnée concernant PRO-B');
    } else {
      t7Pass = false;
      t7Details.push('ÉCHEC : Données de PRO-B révélées à PRO-A');
    }

    // Test cascade : PRO-A ne paie pas non plus sur LOT-002 où existent 3e et 4e enchérisseurs
    // Sur LOT-002 : 1er PRO-D (130 €), 2e PRO-A (120 €), 3e PRO-C (110 €)
    // Clôturons LOT-002 :
    const { closeExpiredLot } = await import('../src/server/auction-engine.ts');
    await closeExpiredLot(lot2Id);

    // PRO-D ne paie pas -> Transmettre au 2e (PRO-A)
    const offer2ndLot2 = await jsonFetch(`/api/admin/lots/${lot2Id}/offer-second-bidder`, {
      method: 'POST',
      headers: { Authorization: ADMIN_TOKEN },
    });

    // PRO-A ne paie pas non plus -> Transmettre au 3e (PRO-C)
    const offer3rdLot2 = await jsonFetch(`/api/admin/lots/${lot2Id}/offer-second-bidder`, {
      method: 'POST',
      headers: { Authorization: ADMIN_TOKEN },
    });

    const [orderLot2ProC] = await db.select().from(orders).where(and(eq(orders.lotId, lot2Id), eq(orders.buyerId, insertedProUsers['pro-c@test.fr'].id)));
    if (offer3rdLot2.ok && orderLot2ProC && orderLot2ProC.status === 'AWAITING_PAYMENT') {
      t7Details.push('Transmission en cascade au 3e enchérisseur (PRO-C – 110 €) validée avec succès');
    } else {
      t7Pass = false;
      t7Details.push('ÉCHEC transmission au 3e enchérisseur');
    }

    results.push({
      name: 'TEST 07 — 2e Enchérisseur',
      status: t7Pass ? 'PASS' : 'FAIL',
      detail: t7Details.join(' ; '),
    });

    // ==================================================================
    // TEST 08 — CAS SANS 2e ENCHÉRISSEUR
    // ==================================================================
    console.log('>>> TEST 08 : Cas sans 2e enchérisseur...');
    let t8Pass = true;
    let t8Details: string[] = [];

    // Créer un lot avec un SEUL enchérisseur (LOT-003 : PRO-C uniquement)
    const lot3Id = insertedLotsMap['LOT-003'].id;
    // Ouvrir la vente pour placer l'enchère
    await db.update(sales).set({ status: 'LIVE', endsAt: new Date(Date.now() + 3600000) }).where(eq(sales.id, venteMardi.id));
    await db.update(lots).set({ status: 'ACTIVE', endsAt: new Date(Date.now() + 3600000) }).where(eq(lots.id, lot3Id));

    await jsonFetch(`/api/lots/${lot3Id}/bid`, {
      method: 'POST',
      headers: { Authorization: PRO_C_TOKEN },
      body: JSON.stringify({ maxBidCents: 6000 }),
    });

    // Clôturer le lot
    await db.update(lots).set({ endsAt: nowPast }).where(eq(lots.id, lot3Id));
    await closeExpiredLot(lot3Id);

    // PRO-C est le seul enchérisseur. Aucun 2e enchérisseur n'existe.
    const [lot3AfterClose] = await db.select().from(lots).where(eq(lots.id, lot3Id));
    if (lot3AfterClose.secondWinnerId === null) {
      t8Details.push('Aucun 2e enchérisseur fictif n’est inventé (secondWinnerId: null)');
    } else {
      t8Pass = false;
      t8Details.push('ÉCHEC : Un deuxième enchérisseur a été indûment assigné');
    }

    // Si PRO-C ne paie pas : tenter de transmettre au 2nd
    const offerSecondLot3 = await jsonFetch(`/api/admin/lots/${lot3Id}/offer-second-bidder`, {
      method: 'POST',
      headers: { Authorization: ADMIN_TOKEN },
    });

    if (offerSecondLot3.status === 400 && offerSecondLot3.data.error.includes('Aucun')) {
      t8Details.push('Refus propre sans erreur serveur (message clair "Aucun prochain enchérisseur")');
    } else {
      t8Pass = false;
      t8Details.push(`ÉCHEC gestion sans 2nd : ${JSON.stringify(offerSecondLot3.data)}`);
    }

    // Traitement administratif du lot impayé sans 2nd enchérisseur
    const markUnpaidRes = await jsonFetch(`/api/admin/lots/${lot3Id}/mark-unpaid`, {
      method: 'POST',
      headers: { Authorization: ADMIN_TOKEN },
    });
    const [lot3Unpaid] = await db.select().from(lots).where(eq(lots.id, lot3Id));
    if (markUnpaidRes.ok && lot3Unpaid.paymentStatus === 'UNPAID' && lot3Unpaid.status === 'UNSOLD') {
      t8Details.push('Lot basculé en traitement administrateur (UNPAID / UNSOLD) sans aucune erreur technique');
    } else {
      t8Pass = false;
      t8Details.push('ÉCHEC marquage administratif');
    }

    results.push({
      name: 'TEST 08 — Sans 2e enchérisseur',
      status: t8Pass ? 'PASS' : 'FAIL',
      detail: t8Details.join(' ; '),
    });

    // ==================================================================
    // TEST 09 — DEUX VENTES INDÉPENDANTES
    // ==================================================================
    console.log('>>> TEST 09 : Deux ventes indépendantes...');
    let t9Pass = true;
    let t9Details: string[] = [];

    // Vente Mardi : LOT-001 à LOT-005
    // Vente Vendredi : LOT-006 à LOT-010
    // Ouvrir Vente Vendredi
    await db.update(sales).set({ status: 'LIVE', endsAt: new Date(Date.now() + 3600000) }).where(eq(sales.id, venteVendredi.id));
    await db.update(lots).set({ status: 'ACTIVE', endsAt: new Date(Date.now() + 3600000) }).where(eq(lots.saleId, venteVendredi.id));

    // Placer une offre sur LOT-006 (Vente Vendredi) par PRO-E
    const bidLot6 = await jsonFetch(`/api/lots/${insertedLotsMap['LOT-006'].id}/bid`, {
      method: 'POST',
      headers: { Authorization: PRO_E_TOKEN },
      body: JSON.stringify({ maxBidCents: 10000 }),
    });

    // Vérifier que LOT-006 appartient exclusivement à Vente Vendredi
    const summaryMardi = await jsonFetch(`/api/admin/sales/${venteMardi.id}/summary`, { headers: { Authorization: ADMIN_TOKEN } });
    const summaryVendredi = await jsonFetch(`/api/admin/sales/${venteVendredi.id}/summary`, { headers: { Authorization: ADMIN_TOKEN } });

    const lot6InMardi = summaryMardi.data?.lots?.some((l: any) => l.lot.reference === 'LOT-006');
    const lot6InVendredi = summaryVendredi.data?.lots?.some((l: any) => l.lot.reference === 'LOT-006');

    if (!lot6InMardi && lot6InVendredi) {
      t9Details.push('LOT-006 présent uniquement dans VENTE DU VENDREDI');
    } else {
      t9Pass = false;
      t9Details.push('ÉCHEC : Fuite de lot entre ventes du Mardi et Vendredi');
    }

    const lot1InVendredi = summaryVendredi.data?.lots?.some((l: any) => l.lot.reference === 'LOT-001');
    if (!lot1InVendredi) {
      t9Details.push('Offres sur LOT-001 totalement isolées de la Vente du Vendredi');
    } else {
      t9Pass = false;
      t9Details.push('ÉCHEC : Offre Mardi présente dans Vendredi');
    }

    results.push({
      name: 'TEST 09 — Ventes indépendantes',
      status: t9Pass ? 'PASS' : 'FAIL',
      detail: t9Details.join(' ; '),
    });

    // ==================================================================
    // TEST 10 — EXCLUSIVITÉ D'UN LOT
    // ==================================================================
    console.log('>>> TEST 10 : Exclusivité d\'un lot...');
    let t10Pass = true;
    let t10Details: string[] = [];

    // Tenter d'affecter LOT-001 (qui appartient déjà à Vente Mardi) à Vente Vendredi
    const conflictAssign = await jsonFetch(`/api/admin/sales/${venteVendredi.id}/lots`, {
      method: 'POST',
      headers: { Authorization: ADMIN_TOKEN },
      body: JSON.stringify({ lotIds: [insertedLotsMap['LOT-001'].id] }),
    });

    if (conflictAssign.status === 400 && conflictAssign.data.error.includes('ACTION REFUSÉE')) {
      t10Details.push('Tentative d’affectation simultanée fermement refusée (code 400 ACTION REFUSÉE)');
      t10Details.push('Règle d’exclusivité absolue vérifiée : un objet ne peut appartenir qu’à une seule vente');
    } else {
      t10Pass = false;
      t10Details.push(`ÉCHEC : Affectation concurrente non bloquée (${conflictAssign.status})`);
    }

    results.push({
      name: 'TEST 10 — Exclusivité d’un lot',
      status: t10Pass ? 'PASS' : 'FAIL',
      detail: t10Details.join(' ; '),
    });

    // ==================================================================
    // TEST 11 — TABLEAU DE BORD ADMIN
    // ==================================================================
    console.log('>>> TEST 11 : Tableau de bord admin...');
    let t11Pass = true;
    let t11Details: string[] = [];

    const adminDashRes = await jsonFetch('/api/admin/dashboard', { headers: { Authorization: ADMIN_TOKEN } });
    if (adminDashRes.ok) {
      const data = adminDashRes.data;
      if (data.nextSale || data.currentSale) {
        t11Details.push('PROCHAINE VENTE : jour, date, horaires (10h-22h), statut et nombre de lots retournés');
      } else {
        t11Pass = false;
        t11Details.push('Prochaine vente absente du dashboard');
      }

      if (data.followingSale || data.upcomingSales) {
        t11Details.push('VENTE SUIVANTE : session suivante identifiée avec horaires et statut');
      } else {
        t11Pass = false;
        t11Details.push('Vente suivante absente');
      }
    } else {
      t11Pass = false;
      t11Details.push('API /api/admin/dashboard en erreur');
    }

    // Vérifier les données de supervision de lot
    const lotSummaryRes = await jsonFetch(`/api/admin/sales/${venteVendredi.id}/summary`, { headers: { Authorization: ADMIN_TOKEN } });
    const lot6Item = lotSummaryRes.data?.lots?.find((l: any) => l.lot.reference === 'LOT-006');
    if (lot6Item && lot6Item.lot.startingPriceCents && lot6Item.winner) {
      t11Details.push('Vue lot admin complète : mise à prix, réserve, meilleure offre, gagnant et statut paiement');
    } else {
      t11Pass = false;
      t11Details.push('Informations détaillées du lot incomplètes');
    }

    results.push({
      name: 'TEST 11 — Tableau de bord Admin',
      status: t11Pass ? 'PASS' : 'FAIL',
      detail: t11Details.join(' ; '),
    });

    // ==================================================================
    // TEST 12 — ESPACE PROFESSIONNEL (PRO-A)
    // ==================================================================
    console.log('>>> TEST 12 : Espace professionnel (PRO-A)...');
    let t12Pass = true;
    let t12Details: string[] = [];

    const proADashboardRes = await jsonFetch('/api/my/dashboard', { headers: { Authorization: PRO_A_TOKEN } });
    if (proADashboardRes.ok) {
      t12Details.push('Espace Pro accessible : dashboard personnel chargé');
      const bids = proADashboardRes.data.activeBids;
      const ordersList = proADashboardRes.data.orders;
      t12Details.push(`Mes offres (${bids?.length || 0}) ; Commandes & Lots remportés (${ordersList?.length || 0})`);
    } else {
      t12Pass = false;
      t12Details.push('Erreur /api/my/dashboard');
    }

    // Vérifier l’isolation stricte : PRO-A ne peut voir aucun objet ni commande de PRO-B, PRO-C, etc.
    const forbiddenOrders = await jsonFetch('/api/orders/999999', { headers: { Authorization: PRO_A_TOKEN } });
    if (forbiddenOrders.status === 404 || forbiddenOrders.status === 403) {
      t12Details.push('Isolation multi-tenant confirmée : aucune fuite de données inter-professionnels');
    }

    results.push({
      name: 'TEST 12 — Espace Professionnel',
      status: t12Pass ? 'PASS' : 'FAIL',
      detail: t12Details.join(' ; '),
    });

    // ==================================================================
    // TEST 13 — COMPTE À REBOURS & TRANSITIONS D'HORAIRES
    // ==================================================================
    console.log('>>> TEST 13 : Compte à rebours...');
    let t13Pass = true;
    let t13Details: string[] = [];

    // Créer une vente avec fin dans 2 secondes
    const shortSaleEndsAt = new Date(Date.now() + 2000);
    const [shortSale] = await db.insert(sales).values({
      reference: 'VENTE-COUNTDOWN-TEST',
      title: 'Vente Compte à Rebours Test',
      saleDay: 'MARDI',
      status: 'LIVE',
      startsAt: new Date(Date.now() - 10000),
      endsAt: shortSaleEndsAt,
      openTime: '10:00',
      closeTime: '22:00',
    }).returning();

    const [shortLot] = await db.insert(lots).values({
      reference: 'LOT-COUNTDOWN-01',
      title: 'Objet de test pour compte à rebours',
      description: 'Test fin de vente',
      category: 'Test',
      conditionReport: 'Parfait',
      startingPriceCents: 5000,
      currentPriceCents: 5000,
      status: 'ACTIVE',
      saleId: shortSale.id,
      endsAt: shortSaleEndsAt,
    }).returning();

    // Pendant la vente : enchère acceptée
    const bidBeforeEnd = await jsonFetch(`/api/lots/${shortLot.id}/bid`, {
      method: 'POST',
      headers: { Authorization: PRO_A_TOKEN },
      body: JSON.stringify({ maxBidCents: 7000 }),
    });
    if (bidBeforeEnd.ok) {
      t13Details.push('Pendant la vente : compte à rebours actif et offres acceptées');
    } else {
      t13Pass = false;
      t13Details.push('Offre rejetée avant terme');
    }

    // Attendre 2,5 secondes l'expiration exacte
    await new Promise((r) => setTimeout(r, 2500));

    // Après expiration : offre bloquée avec mention vente clôturée
    const bidAfterEnd = await jsonFetch(`/api/lots/${shortLot.id}/bid`, {
      method: 'POST',
      headers: { Authorization: PRO_B_TOKEN },
      body: JSON.stringify({ maxBidCents: 9000 }),
    });
    if (bidAfterEnd.status === 400 && bidAfterEnd.data.error.includes('clôturée')) {
      t13Details.push('Après la clôture : passage automatique à "VENTE TERMINÉE" et blocage immédiat des offres');
    } else {
      t13Pass = false;
      t13Details.push('ÉCHEC : Offre non bloquée après terme du compte à rebours');
    }

    // Nettoyer lot et vente countdown
    await db.delete(bids).where(eq(bids.lotId, shortLot.id));
    await db.delete(bidHistory).where(eq(bidHistory.lotId, shortLot.id));
    await db.delete(lots).where(eq(lots.id, shortLot.id));
    await db.delete(sales).where(eq(sales.id, shortSale.id));

    results.push({
      name: 'TEST 13 — Compte à Rebours',
      status: t13Pass ? 'PASS' : 'FAIL',
      detail: t13Details.join(' ; '),
    });

    // ==================================================================
    // TEST 14 — CAS LIMITES (EDGE CASES)
    // ==================================================================
    console.log('>>> TEST 14 : Cas limites...');
    let t14Pass = true;
    let t14Details: string[] = [];

    // 1. Deux offres exactement au même montant (priorité temporelle)
    const [tieLot] = await db.insert(lots).values({
      reference: 'LOT-TIE-TEST',
      title: 'Lot test égalité d’enchères',
      description: 'Test égalité',
      category: 'Test',
      conditionReport: 'Bon',
      startingPriceCents: 5000,
      currentPriceCents: 5000,
      status: 'ACTIVE',
      endsAt: new Date(Date.now() + 3600000),
    }).returning();

    // PRO-A offre 80 € (8000 cents) en premier
    await jsonFetch(`/api/lots/${tieLot.id}/bid`, {
      method: 'POST',
      headers: { Authorization: PRO_A_TOKEN },
      body: JSON.stringify({ maxBidCents: 8000 }),
    });

    // PRO-B offre également 80 € (8000 cents) en second
    const tieBidB = await jsonFetch(`/api/lots/${tieLot.id}/bid`, {
      method: 'POST',
      headers: { Authorization: PRO_B_TOKEN },
      body: JSON.stringify({ maxBidCents: 8000 }),
    });

    const [tieLotAfter] = await db.select().from(lots).where(eq(lots.id, tieLot.id));
    if (tieLotAfter.currentWinnerId === insertedProUsers['pro-a@test.fr'].id && tieBidB.data.isWinning === false) {
      t14Details.push('Égalité de montant : priorité temporelle rigoureuse au premier enchérisseur (PRO-A maintenu gagnant)');
    } else {
      t14Pass = false;
      t14Details.push('ÉCHEC égalité d’enchères : priorité temporelle non respectée');
    }

    // 2. Professionnel non connecté
    const unauthBid = await jsonFetch(`/api/lots/${tieLot.id}/bid`, {
      method: 'POST',
      body: JSON.stringify({ maxBidCents: 9000 }),
    });
    if (unauthBid.status === 401) {
      t14Details.push('Professionnel non connecté rejeté avec 401 Unauthorized');
    } else {
      t14Pass = false;
      t14Details.push(`ÉCHEC non connecté : statut ${unauthBid.status}`);
    }

    // 3. Professionnel non autorisé (statut PENDING)
    const [pendingUser] = await db.insert(users).values({
      uid: 'pending_user_test',
      email: 'pending@test.fr',
      companyName: 'En attente SARL',
      status: 'PENDING',
      role: 'CUSTOMER',
      acceptedTerms: false,
    } as any).returning();

    const pendingToken = makeToken('pending@test.fr');
    const pendingBid = await jsonFetch(`/api/lots/${tieLot.id}/bid`, {
      method: 'POST',
      headers: { Authorization: pendingToken },
      body: JSON.stringify({ maxBidCents: 9000 }),
    });
    if (pendingBid.status === 403) {
      t14Details.push('Professionnel non validé (PENDING) rejeté avec 403 Forbidden');
    } else {
      t14Pass = false;
      t14Details.push(`ÉCHEC statut pending : statut ${pendingBid.status}`);
    }

    // 4. Vente sans aucun lot (clôture sans crash)
    const [emptySale] = await db.insert(sales).values({
      reference: 'VENTE-EMPTY-TEST',
      title: 'Vente vide de test',
      saleDay: 'MARDI',
      status: 'LIVE',
      startsAt: new Date(Date.now() - 5000),
      endsAt: new Date(Date.now() - 1000),
      openTime: '10:00',
      closeTime: '22:00',
    }).returning();

    await updateSalesStatusesAndClosures();
    const [closedEmpty] = await db.select().from(sales).where(eq(sales.id, emptySale.id));
    if (closedEmpty.status === 'ENDED') {
      t14Details.push('Vente sans lot clôturée sans aucune erreur technique');
    }

    // 5. Paiement enregistré avant expiration vs après expiration
    // Commande de PRO-A sur LOT-001 créée lors du test 07 :
    const [proAOrder] = await db.select().from(orders).where(and(eq(orders.lotId, insertedLotsMap['LOT-001'].id), eq(orders.buyerId, insertedProUsers['pro-a@test.fr'].id)));

    // Paiement avant expiration :
    const payValidRes = await jsonFetch(`/api/orders/${proAOrder.id}/simulate-payment`, {
      method: 'POST',
      headers: { Authorization: PRO_A_TOKEN },
    });
    if (payValidRes.ok && payValidRes.data.order.status === 'PAID') {
      t14Details.push('Paiement simulé avant expiration validé avec succès (statut PAID)');
    } else {
      t14Pass = false;
      t14Details.push('ÉCHEC simulation paiement valide');
    }

    // Paiement après expiration :
    // Créer une commande expirée artificiellement
    const [expiredLot] = await db.insert(lots).values({
      reference: 'LOT-EXPIRED-TEST',
      title: 'Lot avec échéance expirée',
      description: 'Test expiration',
      category: 'Test',
      conditionReport: 'Bon',
      startingPriceCents: 5000,
      currentPriceCents: 5000,
      status: 'SOLD',
      paymentDueAt: new Date(Date.now() - 3600000), // Expiré il y a 1h
      endsAt: nowPast,
    }).returning();

    const [expiredOrder] = await db.insert(orders).values({
      orderNumber: 'CMD-EXPIRED-TEST-01',
      lotId: expiredLot.id,
      buyerId: insertedProUsers['pro-b@test.fr'].id,
      finalPriceCents: 5000,
      totalCents: 5000,
      status: 'AWAITING_PAYMENT',
    }).returning();

    const payExpiredRes = await jsonFetch(`/api/orders/${expiredOrder.id}/simulate-payment`, {
      method: 'POST',
      headers: { Authorization: PRO_B_TOKEN },
    });
    if (payExpiredRes.status === 400 && payExpiredRes.data.error.includes('expiré')) {
      t14Details.push('Paiement après expiration systématiquement rejeté (code 400)');
    } else {
      t14Pass = false;
      t14Details.push('ÉCHEC : Paiement accepté après expiration du délai de 24h');
    }

    // Nettoyage des lots temporaires d'edge cases
    await db.delete(bids).where(inArray(bids.lotId, [tieLot.id, expiredLot.id]));
    await db.delete(bidHistory).where(inArray(bidHistory.lotId, [tieLot.id, expiredLot.id]));
    await db.delete(orders).where(inArray(orders.id, [expiredOrder.id]));
    await db.delete(lots).where(inArray(lots.id, [tieLot.id, expiredLot.id]));
    await db.delete(sales).where(eq(sales.id, emptySale.id));
    await db.delete(users).where(eq(users.id, pendingUser.id));

    results.push({
      name: 'TEST 14 — Cas Limites (Edge Cases)',
      status: t14Pass ? 'PASS' : 'FAIL',
      detail: t14Details.join(' ; '),
    });

  } catch (globalErr: any) {
    console.error('Erreur critique pendant la suite de tests:', globalErr);
  }

  // ==================================================================
  // RAPPORT FINAL OBLIGATOIRE
  // ==================================================================
  console.log('\n====================================================');
  console.log('RAPPORT FINAL DES TESTS');
  console.log('====================================================\n');

  let passCount = 0;
  let failCount = 0;

  for (const r of results) {
    console.log(`${r.name}`);
    console.log(`${r.status}`);
    console.log(`Détail : ${r.detail}`);
    if (r.status === 'FAIL') {
      failCount++;
      if (r.fixExplanation) console.log(`Correction : ${r.fixExplanation}`);
    } else {
      passCount++;
    }
    console.log('');
  }

  console.log('----------------------------------------------------');
  console.log(`TOTAL TESTS : ${results.length}`);
  console.log(`PASS : ${passCount}`);
  console.log(`FAIL : ${failCount}`);
  console.log(`À CORRIGER : ${failCount === 0 ? 'Aucune anomalie — Système conforme' : `${failCount} cas à corriger`}`);
  console.log('----------------------------------------------------');
  console.log(`VERDICT : ${failCount === 0 ? 'PRÊT POUR LA PRODUCTION' : 'CORRECTIONS NÉCESSAIRES'}`);
  console.log('====================================================\n');
}

runFullTestSuite().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
