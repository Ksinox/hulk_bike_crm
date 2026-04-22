export interface Offer {
  id: number;
  title: string;
  description: string;
  icon: string;
  discount: string;
  validUntil?: string;
  code?: string;
  conditions?: string[];
  isPopular?: boolean;
}

export interface LoyaltyTier {
  name: string;
  icon: string;
  color: string;
  benefits: string[];
  requirements: {
    days: number;
    orders: number;
  };
}