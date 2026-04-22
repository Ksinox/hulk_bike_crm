export interface ScooterModel {
  id: string;
  name: string;
  model_code: string;
  base_price: number;
  specs: {
    engine: string;
    cooling: string;
    maxSpeed: number;
    fuelTank: number;
    seats: number;
    weight: number;
    engineVolume: number;
    length: number;
    width: number;
    height: number;
    wheelbase: number;
    tires: {
      front: string;
      rear: string;
    };
  };
  current_pricing: {
    pricing_type: string;
    price: number;
  }[];
}

export interface PricingPlan {
  name: string;
  icon: string;
  price: number;
  oldPrice?: number;
  period: string;
  features: string[];
  color: string;
  popular?: boolean;
  isPurchase?: boolean;
  note?: string;
  minPeriod: number;
  maxPeriod: number;
}

export interface PurchaseCalculation {
  total_price: number;
  monthly_payment: number;
  total_payment: number;
  savings: number;
}