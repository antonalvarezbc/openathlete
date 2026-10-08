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
  if (locale !== 'en' && locale !== 'fr') {
    notFound();
  }

  try {
    const elevationDisplay = elevationRange;

    const title =
      locale === 'fr'
        ? `Plan d'entraînement Trail ${distance} ${elevationDisplay} gratuit`
        : `Free Trail ${distance} ${elevationDisplay} Training Plan`;
    const description =
      locale === 'fr'
        ? `Plan d'entraînement gratuit pour trail ${distance} avec ${elevationDisplay} de dénivelé. Plan complet avec conseils et tableau d'entraînement semaine par semaine.`
        : `Free training plan for trail ${distance} with ${elevationDisplay} elevation gain. Complete plan with tips and week-by-week training schedule.`;

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

  if (locale !== 'en' && locale !== 'fr') {
    notFound();
  }

  try {
    const planData = await loadPlan('trail', distance, elevationRange, locale);
    const path = `/training-plans/trail/${distance}/${elevationRange}`;

    const pageUrl = `${SITE_URL}${locale === 'en' ? '' : `/${locale}`}${path}`;

    return (
      <>
        <WebPageStructuredData
          title={
            locale === 'fr'
              ? `Plan d'entraînement Trail ${distance} ${elevationRange}`
              : `Trail ${distance} ${elevationRange} Training Plan`
          }
          description={
            locale === 'fr'
              ? `Plan d'entraînement gratuit pour trail ${distance}`
              : `Free training plan for trail ${distance}`
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
