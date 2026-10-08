export type UserRole = 'CUSTOMER' | 'ADMIN' | 'STAFF' | 'SUPER_ADMIN';
export type UserStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'BLOCKED';
export type SaleDay = 'MARDI' | 'VENDREDI';
export type SaleStatus = 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CLOSED' | 'CANCELLED';
export type LotStatus = 'DRAFT' | 'SCHEDULED' | 'UPCOMING' | 'ACTIVE' | 'SOLD' | 'CLOSED' | 'PASSED' | 'RESERVE_NOT_MET' | 'UNSOLD' | 'CANCELLED';
export type OrderStatus =
  | 'AWAITING_PAYMENT'
  | 'PAID'
  | 'PURCHASE_PENDING'
  | 'PURCHASED'
  | 'RECEIVED'
  | 'READY_TO_SHIP'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';

export interface User {
  id: number;
  uid: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  phone?: string;
  companyName?: string;
  activity?: string;
  country?: string;
  vatNumber?: string;
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  postalCode?: string;
  city?: string;
  acceptedTerms: boolean;
  acceptedTermsAt?: string;
  acceptedTermsVersion?: string;
  notes?: string;
  createdAt?: string;
}

export interface Sale {
  id: number;
  reference: string;
  title: string;
  description?: string;
  saleDay?: SaleDay;
  status: SaleStatus;
  startsAt: string;
  endsAt: string;
  openTime?: string;
  closeTime?: string;
  antiSnipeMinutes: number;
  antiSnipeTriggerSeconds: number;
  totalLots?: number;
  lotsWithBids?: number;
  lotsWithoutBids?: number;
  currentAuctionValueCents?: number;
}

export interface Lot {
  id: number;
  saleId?: number | null;
  reference: string;
  title: string;
  description: string;
  category: string;
  period?: string | null;
  dimensions?: string | null;
  weight?: string | null;
  conditionReport: string;
  flaws?: string | null;
  observations?: string | null;
  startingPriceCents: number;
  reservePriceCents?: number | null;
  currentPriceCents: number;
  bidCount: number;
  currentWinnerId?: number | null;
  secondWinnerId?: number | null;
  secondBidAmountCents?: number | null;
  paymentDueAt?: string | null;
  offeredToSecondAt?: string | null;
  paymentStatus?: 'PENDING' | 'AWAITING_PAYMENT' | 'PAID' | 'OVERDUE' | 'OFFERED_SECOND' | string | null;
  status: LotStatus;
  endsAt: string;
  images: string[];
  userMaxBidCents?: number | null;
  isWinning?: boolean;
  userBidStatus?: 'NONE' | 'REGISTERED' | 'WON' | 'OUTBID';
  targetAcquisitionCostCents?: number | null;
  actualAcquisitionCostCents?: number | null;
  acquisitionStatus?: string | null;
  acquisitionSource?: string | null;
  acquisitionDate?: string | null;
  acquisitionNotes?: string | null;
  shippingQuoteRequired?: boolean | null;
  shippingNote?: string | null;
  customShippingCostCents?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface BidHistoryItem {
  id: number;
  publicBidderId: string;
  amountCents: number;
  createdAt: string;
}

export interface Order {
  id: number;
  orderNumber: string;
  lotId: number;
  buyerId: number;
  finalPriceCents: number;
  shippingCostCents: number;
  totalCents: number;
  status: OrderStatus;
  shippingCarrier?: string;
  trackingNumber?: string;
  shippedAt?: string;
  deliveredAt?: string;
  notes?: string;
  createdAt: string;
  lot?: Partial<Lot>;
  buyer?: Partial<User>;
}

export interface TransactionDoc {
  id: number;
  documentNumber: string;
  orderId: number;
  docType: string;
  sellerName: string;
  sellerStatus: string;
  sellerAddress?: string;
  buyerName: string;
  buyerCompany?: string;
  buyerAddress: string;
  lotReference: string;
  lotTitle: string;
  amountCents: number;
  shippingCents: number;
  totalCents: number;
  paymentMethod: string;
  paymentReference?: string;
  paidAt?: string;
  createdAt: string;
}

export interface AcquisitionItem {
  lotId: number;
  lotReference: string;
  lotTitle: string;
  lotImage?: string;
  salePriceCents: number;
  targetCostCents: number;
  actualCostCents: number;
  expectedMarginCents: number;
  actualMarginCents: number;
  acquisitionStatus: 'PENDING' | 'PURCHASED' | 'RECEIVED' | 'NOT_APPLICABLE';
  acquisitionSource?: string;
  acquisitionNotes?: string;
  orderId: number;
  orderNumber: string;
  orderStatus: OrderStatus;
  buyerName: string;
  buyerCompany?: string;
}
