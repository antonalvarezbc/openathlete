import { SITE_URL } from '@/config';
import {
  DEFAULT_LOCALE,
  OG_LOCALES,
  SUPPORTED_LOCALES,
  type SupportedLocale,
  isSupportedLocale,
  languageAlternates,
  localizedUrl,
} from '@/utils/locales';
import type { Metadata } from 'next';

interface GenerateMetadataOptions {
  locale?: string;
  title?: string;
  description?: string;
  path?: string;
  keywords?: string[];
  /** Languages the page exists in, for hreflang. Defaults to all of them. */
  locales?: readonly SupportedLocale[];
}

export function generateMetadata(options?: GenerateMetadataOptions): Metadata {
  const {
    locale = 'en',
    title: customTitle,
    description: customDescription,
    path = '',
    keywords,
    locales = SUPPORTED_LOCALES,
  } = options || {};

  const lang = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;

  // Default metadata
  const defaultTitles: Record<SupportedLocale, string> = {
    en: 'OpenAthlete — Ethical European open-source alternative to TrainingPeaks & Strava',
    fr: 'OpenAthlete — Alternative européenne open source à TrainingPeaks et Strava',
    es: 'OpenAthlete — Alternativa europea, ética y de código abierto a TrainingPeaks y Strava',
  };
  const defaultDescriptions: Record<SupportedLocale, string> = {
    en: 'AGPLv3 endurance training platform: EU-oriented hosting, transparent CTL/ATL/TSB logic in code, self-hosting, and full export. Built in Grenoble.',
    fr: "Plateforme d'endurance sous AGPLv3 : hébergement orienté UE, logique CTL/ATL/TSB lisible dans le code, auto-hébergement et export complet. Développée à Grenoble.",
    es: 'Plataforma de entrenamiento de resistencia con licencia AGPLv3: alojamiento orientado a la UE, lógica CTL/ATL/TSB transparente en el código, autoalojamiento y exportación completa. Desarrollada en Grenoble.',
  };

  // Coaches and clubs pages are temporarily removed
  const removedPageDescriptions: Record<SupportedLocale, string> = {
    en: 'This page has been removed for now. OpenAthlete is an open-source endurance training platform hosted in the EU.',
    fr: 'Cette page est provisoirement retirée. OpenAthlete est une plateforme open source orientée Union européenne.',
    es: 'Esta página se ha retirado de momento. OpenAthlete es una plataforma de entrenamiento de resistencia de código abierto alojada en la UE.',
  };
  const coachesTitles: Record<SupportedLocale, string> = {
    en: 'OpenAthlete — For Coaches',
    fr: 'OpenAthlete — Pour les coachs',
    es: 'OpenAthlete — Para entrenadores',
  };
  const clubsTitles: Record<SupportedLocale, string> = {
    en: 'OpenAthlete — For Clubs',
    fr: 'OpenAthlete — Pour les clubs',
    es: 'OpenAthlete — Para clubes',
  };

  // Determine title and description based on path
  let title: string;
  let description: string;

  if (path === '/coaches') {
    title = customTitle || coachesTitles[lang];
    description = customDescription || removedPageDescriptions[lang];
  } else if (path === '/clubs') {
    title = customTitle || clubsTitles[lang];
    description = customDescription || removedPageDescriptions[lang];
  } else {
    title = customTitle || defaultTitles[lang];
    description = customDescription || defaultDescriptions[lang];
  }
  const ogLocale = OG_LOCALES[lang];
  const alternateLocale = locales
    .filter((alternate) => alternate !== lang)
    .map((alternate) => OG_LOCALES[alternate]);
  const currentUrl = localizedUrl(lang, path);
  // Canonical URL should always point to the English version
  const canonicalUrl = `${SITE_URL}${path}`;

  return {
    title,
    description,
    ...(keywords && { keywords }),
    openGraph: {
      title,
      description,
      url: currentUrl,
      siteName: 'OpenAthlete',
      images: [
        {
          url: `${SITE_URL}/logo_dark.png`,
          width: 1200,
          height: 630,
          alt: 'OpenAthlete',
        },
      ],
      locale: ogLocale,
      alternateLocale,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${SITE_URL}/logo_dark.png`],
    },
    alternates: {
      canonical: canonicalUrl,
      languages: languageAlternates(path, locales),
    },
  };
}
