export interface ShippingTier {
  id: string;
  maxWeightKg: number;
  costCents: number;
  label: string;
  quoteRequired?: boolean;
}

/**
 * GRILLE TARIFAIRE UNIQUE — LIVRAISON
 * Valable pour toutes les configurations :
 * - 🇫🇷 France → 🇫🇷 France
 * - 🇫🇷 France → 🇧🇪 Belgique
 * - 🇧🇪 Belgique → 🇫🇷 France
 * - 🇧🇪 Belgique → 🇧🇪 Belgique
 */
export const DEFAULT_SHIPPING_TIERS: ShippingTier[] = [
  { id: 'tier_0_5', maxWeightKg: 0.5, costCents: 1490, label: "Jusqu’à 500 g" },
  { id: 'tier_1_0', maxWeightKg: 1.0, costCents: 1690, label: "Plus de 500 g à 1 kg" },
  { id: 'tier_2_0', maxWeightKg: 2.0, costCents: 1990, label: "Plus de 1 kg à 2 kg" },
  { id: 'tier_5_0', maxWeightKg: 5.0, costCents: 2490, label: "Plus de 2 kg à 5 kg" },
  { id: 'tier_10_0', maxWeightKg: 10.0, costCents: 3490, label: "Plus de 5 kg à 10 kg" },
  { id: 'tier_15_0', maxWeightKg: 15.0, costCents: 4490, label: "Plus de 10 kg à 15 kg" },
  { id: 'tier_25_0', maxWeightKg: 25.0, costCents: 5990, label: "Plus de 15 kg à 25 kg" },
  { id: 'tier_over_25', maxWeightKg: Infinity, costCents: 0, label: "Plus de 25 kg (Sur devis)", quoteRequired: true },
];

export interface ShippingCalculation {
  costCents: number;
  formattedCost: string; // ex: "14,90 €" ou "Sur devis"
  isQuoteRequired: boolean;
  weightKg: number | null;
  formattedWeight: string;
  tierLabel: string;
  policyTitle: string;
  policyDescription: string;
  countryNote: string;
}

export function parseWeightKg(weightStr?: string | null): number | null {
  if (!weightStr) return null;
  const cleaned = String(weightStr).replace(',', '.');

  // Format en grammes : "500 g" ou "400g"
  const gMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*g\b/i);
  if (gMatch && !cleaned.toLowerCase().includes('kg')) {
    const gVal = parseFloat(gMatch[1]);
    return isNaN(gVal) ? null : gVal / 1000;
  }

  // Format en kilogrammes : "0.4 kg" ou "14.2 kg"
  const kgMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*kg/i);
  if (kgMatch) {
    const kgVal = parseFloat(kgMatch[1]);
    return isNaN(kgVal) ? null : kgVal;
  }

  // Nombre brut
  const anyNum = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (anyNum) {
    const num = parseFloat(anyNum[1]);
    return isNaN(num) ? null : num;
  }

  return null;
}

export function calculateShipping(
  weightStrOrKg?: string | number | null,
  options?: {
    isOversized?: boolean;
    isFragileOrSpecial?: boolean;
    shippingQuoteRequired?: boolean;
    customShippingCostCents?: number | null;
    customTiers?: ShippingTier[];
  }
): ShippingCalculation {
  const parsedWeight = typeof weightStrOrKg === 'number' ? weightStrOrKg : parseWeightKg(weightStrOrKg);
  const formattedWeight =
    parsedWeight !== null && !isNaN(parsedWeight)
      ? `${parsedWeight >= 1 ? parsedWeight.toFixed(1).replace('.0', '') + ' kg' : Math.round(parsedWeight * 1000) + ' g'}`
      : typeof weightStrOrKg === 'string' && weightStrOrKg
      ? weightStrOrKg
      : 'Non précisé';

  // Cas spécial : objet volumineux, fragile ou marqué spécifiquement sur devis
  if (options?.shippingQuoteRequired || options?.isOversized || options?.isFragileOrSpecial) {
    return {
      costCents: 0,
      formattedCost: 'Sur devis',
      isQuoteRequired: true,
      weightKg: parsedWeight,
      formattedWeight,
      tierLabel: 'Objet hors gabarit / transport sur devis',
      policyTitle: 'Livraison sur devis',
      policyDescription: 'Colis volumineux, fragile ou nécessitant un transporteur d’art spécialisé',
      countryNote: 'France ↔ Belgique • Même grille tarifaire',
    };
  }

  // Coût forcé personnalisé s'il a été fixé par l'administrateur
  if (typeof options?.customShippingCostCents === 'number' && options.customShippingCostCents > 0) {
    const cost = options.customShippingCostCents;
    return {
      costCents: cost,
      formattedCost: `${(cost / 100).toFixed(2).replace('.', ',')} €`,
      isQuoteRequired: false,
      weightKg: parsedWeight,
      formattedWeight,
      tierLabel: 'Tarif convenu',
      policyTitle: 'Grille tarifaire unique (France & Belgique)',
      policyDescription: 'Tarif unique garanti : France ↔ France, France ↔ Belgique, Belgique ↔ Belgique',
      countryNote: 'France ↔ Belgique • Même grille tarifaire',
    };
  }

  const tiers = options?.customTiers || DEFAULT_SHIPPING_TIERS;
  const effectiveWeight = parsedWeight !== null && !isNaN(parsedWeight) ? parsedWeight : 1.5;

  // Règle 5 : Plus de 25 kg -> Sur devis
  if (effectiveWeight > 25.0) {
    return {
      costCents: 0,
      formattedCost: 'Sur devis',
      isQuoteRequired: true,
      weightKg: effectiveWeight,
      formattedWeight,
      tierLabel: 'Plus de 25 kg (Sur devis)',
      policyTitle: 'Livraison sur devis',
      policyDescription: 'Colis de plus de 25 kg nécessitant une cotation transporteur spécifique',
      countryNote: 'France ↔ Belgique • Même grille tarifaire',
    };
  }

  // Règle 3 & 4 : Application de la tranche immédiatement supérieure dès que le poids dépasse la limite
  let matchedTier = tiers[0];
  for (const tier of tiers) {
    if (effectiveWeight <= tier.maxWeightKg) {
      matchedTier = tier;
      break;
    }
  }

  const formattedCost = `${(matchedTier.costCents / 100).toFixed(2).replace('.', ',')} €`;

  return {
    costCents: matchedTier.costCents,
    formattedCost,
    isQuoteRequired: Boolean(matchedTier.quoteRequired),
    weightKg: effectiveWeight,
    formattedWeight,
    tierLabel: matchedTier.label,
    policyTitle: 'Grille tarifaire unique (France & Belgique)',
    policyDescription: `Frais calculés selon le poids du colis (${matchedTier.label}) • Tarif unique garanti France ↔ Belgique`,
    countryNote: 'France ↔ Belgique • Tarif unique sans supplément frontalier',
  };
}
