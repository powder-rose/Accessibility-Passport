export interface Item {
  title: string;
  text?: string;
  label?: string;
  action?: string;
  service?: string;
  points?: string[];
  image?: string;
  objectType?: string;
  url?: string;
}
export interface Section {
  eyebrow: string;
  title: string;
  description?: string;
  paragraphs?: string[];
  items?: Item[];
  benefits?: string[];
  flow?: string[];
  note?: string;
  noteTitle?: string;
  noteText?: string;
  quote?: string;
}
export interface Service {
  id: string;
  label: string;
  title: string;
  description: string;
  price: number;
  from: boolean;
  note: string;
  action: string;
}
export interface Question {
  id: string;
  title: string;
  hint: string;
  required: boolean;
  multiple: boolean;
  options: { id: string; label: string }[];
}
export interface SiteContent {
  site: {
    brand: string;
    direction: string;
    company: string;
    inn: string;
    ogrn: string;
    phone: string;
    email: string;
    domain: string;
    metrikaId: string;
    heroImage: string;
    expertImage: string;
  };
  seo: { title: string; description: string; canonical: string };
  sections: Record<string, Section>;
  services: Service[];
  quiz: {
    enabled: boolean;
    questions: Question[];
    successTitle: string;
    successText: string;
  };
}
export type Answers = Record<string, string[]>;
export function price(service: Service) {
  return `${service.from ? 'от ' : ''}${new Intl.NumberFormat('ru-RU').format(service.price)} ₽`;
}
