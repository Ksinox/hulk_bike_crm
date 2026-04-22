export interface FAQItem {
  id: number;
  question: string;
  answer: string;
  category: string;
  icon: string;
}

export interface SupportContact {
  type: string;
  value: string;
  icon: string;
  available: string;
}