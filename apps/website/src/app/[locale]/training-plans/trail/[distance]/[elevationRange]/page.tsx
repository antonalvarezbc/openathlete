import { generateMetadata as generatePageMetadata } from '@/app/metadata';
import { Container } from '@/components/landing/container';
import { Footer, Navbar } from '@/components/landing/sections';
import {
  TrainingPlanStructuredData,
  WebPageStructuredData,
} from '@/components/seo/structured-data';
import { TrainingPlanPage } from '@/components/training-plan/training-plan-page';
import { SITE_URL } from '@/config';
import { loadPlan } from '@/lib/training-plans/plan-loader';
import { isSupportedLocale, localePrefix } from '@/utils/locales';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

/* eslint-disable react-refresh/only-export-components */
export async function generateMetadata({
  params,
}: {
  params: Promise<{
    locale: string;
    distance: string;
    elevationRange: string;
  }>;
}): Promise<Metadata> {
  const { locale, distance, elevationRange } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }

  try {
    const elevationDisplay = elevationRange;

    const title = {
      en: `Free Trail ${distance} ${elevationDisplay} Training Plan`,
      fr: `Plan d'entraînement Trail ${distance} ${elevationDisplay} gratuit`,
      es: `Plan de entrenamiento gratuito de trail ${distance} ${elevationDisplay}`,
    }[locale];
    const description = {
      en: `Free training plan for trail ${distance} with ${elevationDisplay} elevation gain. Complete plan with tips and week-by-week training schedule.`,
      fr: `Plan d'entraînement gratuit pour trail ${distance} avec ${elevationDisplay} de dénivelé. Plan complet avec conseils et tableau d'entraînement semaine par semaine.`,
      es: `Plan de entrenamiento gratuito para trail ${distance} con ${elevationDisplay} de desnivel positivo. Plan completo con consejos y calendario de entrenamiento semana a semana.`,
    }[locale];

    const path = `/training-plans/trail/${distance}/${elevationRange}`;
    const metadata = generatePageMetadata({ locale, title, description, path });

    return metadata;
  } catch {
    notFound();
  }
}

export default async function TrailTrainingPlanPage({
  params,
}: {
  params: Promise<{
    locale: string;
    distance: string;
    elevationRange: string;
  }>;
}) {
  const { locale, distance, elevationRange } = await params;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  try {
    const planData = await loadPlan('trail', distance, elevationRange, locale);
    const path = `/training-plans/trail/${distance}/${elevationRange}`;

    const pageUrl = `${SITE_URL}${localePrefix(locale)}${path}`;

    return (
      <>
        <WebPageStructuredData
          title={
            {
              en: `Trail ${distance} ${elevationRange} Training Plan`,
              fr: `Plan d'entraînement Trail ${distance} ${elevationRange}`,
              es: `Plan de entrenamiento de trail ${distance} ${elevationRange}`,
            }[locale]
          }
          description={
            {
              en: `Free training plan for trail ${distance}`,
              fr: `Plan d'entraînement gratuit pour trail ${distance}`,
              es: `Plan de entrenamiento gratuito para trail ${distance}`,
            }[locale]
          }
          url={pageUrl}
        />
        <TrainingPlanStructuredData
          planData={planData}
          url={pageUrl}
          locale={locale}
        />
        <div className="min-h-screen bg-background">
          <Navbar />
          <Container>
            <TrainingPlanPage
              planData={planData}
              sport="trail"
              distance={distance}
              variant={elevationRange}
              locale={locale}
            />
          </Container>
          <Footer />
        </div>
      </>
    );
  } catch {
    notFound();
  }
}
