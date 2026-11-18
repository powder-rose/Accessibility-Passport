// Suggestions are editable and are not saved to an article until the editor
// explicitly applies them. Alt text is inferred from the proposed scenes.
export type AssistantMetadata = {
  clusterTopic: string;
  title: string;
  slug: string;
  seoTitle: string;
  seoDescription: string;
  imageAlt: string;
  category: string;
  inlineImageAlts: string[];
};
