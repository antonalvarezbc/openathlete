'use client';

import { DEFAULT_LOCALE, isSupportedLocale } from '@/utils/locales';
import { useEffect } from 'react';

interface HtmlLangProps {
  locale: string;
}

/**
 * Component to set the HTML lang attribute dynamically based on locale
 * This ensures proper SEO and accessibility
 */
export function HtmlLang({ locale }: HtmlLangProps) {
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const htmlLang = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
      document.documentElement.lang = htmlLang;
    }
  }, [locale]);

  return null;
}
