import type { Section, Item } from './content-types';
export interface ServiceSection extends Section {
  action?: string;
  priceNote?: string;
  groups?: { title: string; indices: number[] }[];
}
export interface ServicePageContent {
  path: string;
  breadcrumb: string;
  seo: { title: string; description: string };
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    region: string;
    priceLabel: string;
    priceNote: string;
    action: string;
    quizAction: string;
  };
  advantages: Item[];
  sections: Record<string, ServiceSection>;
}
