import { isSupportedLocale } from '@/utils/locales';
import { notFound, redirect } from 'next/navigation';

/**
 * /clubs is temporarily redirected to the homepage until we publish
 * real club customer stories and verifiable testimonials (see coaches page).
 */
export default async function ClubsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  redirect(`/${locale}`);
}
