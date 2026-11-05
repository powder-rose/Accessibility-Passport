import type { ComponentType, ReactNode } from 'react';
import type { Item, Service, SiteContent } from '@/lib/content-types';
import type {
  ServicePageContent,
  ServiceSection,
} from '@/lib/service-page-types';

export interface SectionViewProps {
  section: ServiceSection;
  service: string;
}
export interface HeroViewProps {
  page: ServicePageContent;
  service: Service;
  site: SiteContent['site'];
}
export interface NextViewProps {
  section: ServiceSection;
  documentLabel: string;
}
export interface ServicePresentation {
  Hero: ComponentType<HeroViewProps>;
  Advantages: ComponentType<{ items: Item[] }>;
  Overview: ComponentType<SectionViewProps>;
  Regulations: ComponentType<SectionViewProps & { children: ReactNode }>;
  Process: ComponentType<SectionViewProps>;
  Contents: ComponentType<SectionViewProps & { id: string }>;
  Price: ComponentType<{ section: ServiceSection; service: Service }>;
  Next: ComponentType<NextViewProps>;
  SourceData: ComponentType<SectionViewProps>;
  Structure: ComponentType<SectionViewProps>;
}
