import { Container } from '@/components/landing/container';
import { FAQItem } from '@/components/landing/faq-item';
import { LandingSectionHeader } from '@/components/landing/landing-canvas';
import { Section } from '@/components/landing/section';
import { FAQPageStructuredData } from '@/components/seo/structured-data';
import { m } from '@/paraglide/messages';
import { localizedUrl } from '@/utils/locales';

interface FAQProps {
  locale?: string;
}

export function FAQ({ locale = 'en' }: FAQProps) {
  const faqs = [
    {
      question: m.landing_faq_item_1_q(),
      answer: m.landing_faq_item_1_a(),
    },
    {
      question: m.landing_faq_item_2_q(),
      answer: m.landing_faq_item_2_a(),
    },
    {
      question: m.landing_faq_item_3_q(),
      answer: m.landing_faq_item_3_a(),
    },
    {
      question: m.landing_faq_item_4_q(),
      answer: m.landing_faq_item_4_a(),
    },
    {
      question: m.landing_faq_item_5_q(),
      answer: m.landing_faq_item_5_a(),
    },
  ];

  const faqUrl = `${localizedUrl(locale)}#faq`;

  return (
    <>
      <FAQPageStructuredData faqs={faqs} url={faqUrl} />
      <Section id="faq" surface="default">
        <Container>
          <LandingSectionHeader
            title={m.landing_faq_title()}
            titleId="faq-heading"
          />

          <div className="mx-auto mt-12 max-w-3xl">
            <div className="rounded-2xl border border-border/50 bg-card/25 p-2 shadow-[0_16px_48px_-28px_rgba(0,0,0,0.12)] backdrop-blur-sm dark:bg-card/15 dark:shadow-black/25 sm:p-3">
              <div className="divide-y divide-border/40 rounded-xl bg-gradient-to-b from-card/60 to-muted/10 px-1 dark:from-card/20 dark:to-muted/5">
                {faqs.map((faq, index) => (
                  <FAQItem
                    key={index}
                    question={faq.question}
                    answer={faq.answer}
                    className="px-3 sm:px-4"
                  />
                ))}
              </div>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
