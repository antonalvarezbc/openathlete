import type { ReactNode } from 'react';

/** English and French are required; other locales fall back to English. */
export interface LocalizedText {
  en: string;
  fr: string;
  es?: string;
}

export interface BlogPostMetadata {
  slug: string;
  title: LocalizedText;
  description: LocalizedText;
  excerpt: LocalizedText;
  author: {
    name: string;
    email?: string;
  };
  publishedAt: string; // ISO date string
  updatedAt?: string; // ISO date string
  tags?: string[];
  image?: string; // Path to image
  readingTime?: number; // Minutes
}

export interface BlogPost {
  metadata: BlogPostMetadata;
  ContentEn: () => ReactNode;
  ContentFr: () => ReactNode;
  /** Without it, the Spanish page shows the English body. */
  ContentEs?: () => ReactNode;
}
