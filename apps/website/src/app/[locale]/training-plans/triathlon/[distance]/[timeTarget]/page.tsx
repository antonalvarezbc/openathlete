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
import {
  formatTimeTarget,
  parseTimeTarget,
} from '@/lib/training-plans/utils/parse-time-target';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

/* eslint-disable react-refresh/only-export-components */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; distance: string; timeTarget: string }>;
}): Promise<Metadata> {
  const { locale, distance, timeTarget } = await params;
  if (locale !== 'en' && locale !== 'fr') {
    notFound();
  }

  try {
    const timeInSeconds = parseTimeTarget(timeTarget);
    const timeDisplay =
      timeInSeconds !== null ? formatTimeTarget(timeInSeconds) : timeTarget;

    const title =
      locale === 'fr'
        ? `Plan d'entraînement Triathlon ${distance} ${timeDisplay} gratuit`
        : `Free Triathlon ${distance} ${timeDisplay} Training Plan`;
    const description =
      locale === 'fr'
        ? `Plan d'entraînement gratuit pour triathlon ${distance} en ${timeDisplay}. Plan complet avec conseils et tableau d'entraînement semaine par semaine.`
        : `Free training plan for triathlon ${distance} in ${timeDisplay}. Complete plan with tips and week-by-week training schedule.`;

    const path = `/training-plans/triathlon/${distance}/${timeTarget}`;
    const metadata = generatePageMetadata({ locale, title, description, path });

    return metadata;
  } catch {
    notFound();
  }
}

export default async function TriathlonTrainingPlanPage({
  params,
}: {
  params: Promise<{ locale: string; distance: string; timeTarget: string }>;
}) {
  const { locale, distance, timeTarget } = await params;

  if (locale !== 'en' && locale !== 'fr') {
    notFound();
  }

  try {
    const planData = await loadPlan('triathlon', distance, timeTarget, locale);
    const path = `/training-plans/triathlon/${distance}/${timeTarget}`;

    const pageUrl = `${SITE_URL}${locale === 'en' ? '' : `/${locale}`}${path}`;

    return (
      <>
        <WebPageStructuredData
          title={
            locale === 'fr'
              ? `Plan d'entraînement Triathlon ${distance} ${timeTarget}`
              : `Triathlon ${distance} ${timeTarget} Training Plan`
          }
          description={
            locale === 'fr'
              ? `Plan d'entraînement gratuit pour triathlon ${distance}`
              : `Free training plan for triathlon ${distance}`
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
              sport="triathlon"
              distance={distance}
              variant={timeTarget}
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
