import { SITE_URL } from '@/config';

/** Must match `locales` in project.inlang/settings.json. English is the base. */
export const SUPPORTED_LOCALES = ['en', 'fr', 'es'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'en';

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return SUPPORTED_LOCALES.includes(value as SupportedLocale);
}

/** English pages are served without a prefix, the other locales under /<locale>. */
export function localePrefix(locale: string): string {
  return locale === DEFAULT_LOCALE ? '' : `/${locale}`;
}

export function localizedUrl(locale: string, path = ''): string {
  return `${SITE_URL}${localePrefix(locale)}${path}`;
}

/**
 * hreflang alternates for a page. Pass `locales` when the page only exists in
 * some languages (an untranslated blog post) so search engines are not told
 * that the English fallback is a translation.
 */
export function languageAlternates(
  path: string,
  locales: readonly SupportedLocale[] = SUPPORTED_LOCALES,
): Record<string, string> {
  return {
    ...Object.fromEntries(
      locales.map((locale) => [locale, localizedUrl(locale, path)]),
    ),
    'x-default': localizedUrl(DEFAULT_LOCALE, path),
  };
}

/** Open Graph locale codes. */
export const OG_LOCALES: Record<SupportedLocale, string> = {
  en: 'en_US',
  fr: 'fr_FR',
  es: 'es_ES',
};

/** BCP 47 tags for `toLocaleDateString`. */
export const DATE_LOCALES: Record<SupportedLocale, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
};

export function formatLongDate(date: string, locale: SupportedLocale): string {
  return new Date(date).toLocaleDateString(DATE_LOCALES[locale], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export const getLocaleName = (locale: string) => {
  const localeMap: Record<string, string> = {
    en: 'English',
    fr: 'Français',
    es: 'Español',
  };
  return localeMap[locale] || locale;
};
