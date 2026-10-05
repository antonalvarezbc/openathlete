import { WebPageStructuredData } from '@/components/seo/structured-data';
import { SITE_URL } from '@/config';
import { m } from '@/paraglide/messages';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

/** Version of the terms; the app records it with each subscription. */
const LAST_UPDATED = '2026-10-05';

/* eslint-disable react-refresh/only-export-components */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (locale !== 'en' && locale !== 'fr') {
    notFound();
  }

  // Canonical URL should always point to the English version
  const canonicalUrl = `${SITE_URL}/terms-of-sale`;
  return {
    title: m.terms_title(),
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: `${SITE_URL}/terms-of-sale`,
        fr: `${SITE_URL}/fr/terms-of-sale`,
        'x-default': `${SITE_URL}/terms-of-sale`,
      },
    },
  };
}
/* eslint-enable react-refresh/only-export-components */

export default async function TermsOfSalePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== 'en' && locale !== 'fr') {
    notFound();
  }
  const prefix = locale === 'en' ? '' : `/${locale}`;

  return (
    <>
      <WebPageStructuredData
        title={m.terms_title()}
        description={m.terms_intro()}
        url={`${SITE_URL}${prefix}/terms-of-sale`}
      />
      <div className="mx-auto max-w-3xl p-8 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">{m.terms_title()}</h1>
          <p className="text-sm text-muted-foreground">
            {m.terms_last_updated({ date: LAST_UPDATED })}
          </p>
        </header>

        <section className="prose prose-neutral dark:prose-invert">
          <p>{m.terms_intro()}</p>

          <h2>{m.terms_seller_title()}</h2>
          <p>{m.terms_seller_content()}</p>

          <h2>{m.terms_offer_title()}</h2>
          <p>{m.terms_offer_content()}</p>
          <ul>
            <li>{m.terms_offer_list_1()}</li>
            <li>{m.terms_offer_list_2()}</li>
          </ul>
          <p>{m.terms_offer_note()}</p>

          <h2>{m.terms_price_title()}</h2>
          <p>{m.terms_price_content()}</p>

          <h2>{m.terms_order_title()}</h2>
          <p>{m.terms_order_content()}</p>

          <h2>{m.terms_duration_title()}</h2>
          <p>{m.terms_duration_content()}</p>

          <h2 id="withdrawal">{m.terms_withdrawal_title()}</h2>
          <p>{m.terms_withdrawal_content()}</p>
          <p>{m.terms_withdrawal_how()}</p>
          <blockquote>{m.terms_withdrawal_form()}</blockquote>

          <h2>{m.terms_warranty_title()}</h2>
          <p>{m.terms_warranty_content()}</p>

          <h2>{m.terms_data_title()}</h2>
          <p>
            {m.terms_data_content()}{' '}
            <Link href={`${prefix}/privacy-policy`}>
              {m.privacy_policy_title()}
            </Link>
          </p>

          <h2>{m.terms_disputes_title()}</h2>
          <p>{m.terms_disputes_content()}</p>

          <h2>{m.terms_law_title()}</h2>
          <p>{m.terms_law_content()}</p>
        </section>
      </div>
    </>
  );
}
