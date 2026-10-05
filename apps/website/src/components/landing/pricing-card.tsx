import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { m } from '@/paraglide/messages';
import { cn } from '@/utils/shadcn';
import { Check } from 'lucide-react';
import Link from 'next/link';

interface PricingCardProps {
  name: string;
  price: string;
  priceLabel?: string;
  perks: string[];
  highlighted?: boolean;
  badge?: string;
  onCtaClick?: () => void;
  ctaLabel?: string;
  ctaHref?: string;
  ctaExternal?: boolean;
  className?: string;
}

function isFreePrice(price: string): boolean {
  const p = price.toLowerCase().trim();
  return (
    p === 'free' ||
    p === 'gratuit' ||
    p === '€0' ||
    p === '0€' ||
    p === '0 €' ||
    p.startsWith('0€') ||
    p.startsWith('0 €')
  );
}

export function PricingCard({
  name,
  price,
  priceLabel,
  perks,
  highlighted = false,
  badge,
  onCtaClick,
  ctaLabel,
  ctaHref,
  ctaExternal = false,
  className,
}: PricingCardProps) {
  const isFree = isFreePrice(price);
  const isContact = price === 'Contact us' || price === 'Sur devis';
  const label =
    ctaLabel ??
    (isContact
      ? m.landing_pricing_contact_us()
      : m.landing_pricing_get_started());

  return (
    <Card
      className={cn(
        'relative flex h-full flex-col overflow-hidden rounded-2xl border-border/50 bg-gradient-to-b from-card/90 to-muted/15 shadow-md backdrop-blur-sm transition-all duration-300 dark:from-card/40 dark:to-muted/10',
        highlighted &&
          'z-[1] border-primary/35 shadow-xl shadow-primary/10 ring-1 ring-primary/20 md:scale-[1.02]',
        !highlighted &&
          'hover:-translate-y-0.5 hover:border-primary/15 hover:shadow-lg',
        className,
      )}
    >
      {badge && (
        <div className="absolute right-4 top-4 z-10">
          <Badge
            variant="secondary"
            className="border border-primary/15 bg-primary/10 font-semibold text-primary shadow-sm"
          >
            {badge}
          </Badge>
        </div>
      )}
      <CardHeader className="pb-2 pt-6">
        <CardTitle className="text-lg font-semibold tracking-tight">
          {name}
        </CardTitle>
        <div className="mt-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">
              {price}
            </span>
            {isFree && (
              <span className="text-sm text-muted-foreground">
                {m.landing_pricing_forever()}
              </span>
            )}
            {priceLabel && !isFree && (
              <span className="text-sm text-muted-foreground">
                {priceLabel}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 pb-2">
        <ul className="space-y-2.5">
          {perks.map((perk, index) => (
            <li key={index} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              </span>
              <span className="text-sm leading-relaxed text-muted-foreground">
                {perk}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="pt-2">
        {ctaHref && !isContact ? (
          <Button
            variant={highlighted ? 'default' : 'outline'}
            className="w-full border-border/60 shadow-sm"
            asChild
          >
            {ctaExternal ? (
              <a href={ctaHref} target="_blank" rel="noopener noreferrer">
                {label}
              </a>
            ) : ctaHref.startsWith('http') ? (
              <a href={ctaHref}>{label}</a>
            ) : (
              <Link href={ctaHref}>{label}</Link>
            )}
          </Button>
        ) : (
          <Button
            variant={highlighted ? 'default' : 'outline'}
            className="w-full"
            onClick={onCtaClick}
            disabled={isContact}
          >
            {label}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
