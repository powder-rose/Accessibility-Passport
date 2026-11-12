import type { AssistantMetadata } from './metadata';

export type TextResult = {
  text: string;
  safeHtml: string;
  metadata: AssistantMetadata;
  usage?: Record<string, number>;
};
