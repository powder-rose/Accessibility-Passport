import type { Section, Item, QuizConfig } from './content-types';
import type { DocumentServiceId } from './routes';
export interface ServiceSection extends Section {
  action?: string;
  priceNote?: string;
  groups?: { title: string; indices: number[] }[];
  actionType?: string;
  actionService?: string;
  relatedLinks?: { text: string; href: string }[];
  priceDetails?: string[];
}
export interface ServicePageContent {
  serviceId: DocumentServiceId;
  path: string;
  breadcrumb: string;
  seo: { title: string; description: string };
  hero: {
    image?: { src: string; width: number; height: number };
    eyebrow: string;
    title: string;
    accent: string;
    description: string;
    region: string;
    priceLabel: string;
    priceNote: string;
    action: string;
    quizAction: string;
  };
  advantages: Item[];
  sections: Record<string, ServiceSection>;
  faqSection?: string;
  quiz?: QuizConfig;
}
