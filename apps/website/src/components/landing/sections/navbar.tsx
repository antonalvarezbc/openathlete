'use client';

import { BrandLogo } from '@/components/landing/brand-logo';
import { Container } from '@/components/landing/container';
import { LanguageSwitcher } from '@/components/landing/language-switcher';
import { Button } from '@/components/ui/button';
import { APP_URL } from '@/config';
import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { DEFAULT_LOCALE, isSupportedLocale } from '@/utils/locales';
import { cn } from '@/utils/shadcn';
import { Github, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

export function Navbar() {
  const pathname = usePathname();
  const locale = getLocale();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Extract locale from pathname or use current locale
  const pathSegments = pathname.split('/').filter(Boolean);
  const currentLocale = isSupportedLocale(pathSegments[0])
    ? pathSegments[0]
    : isSupportedLocale(locale)
      ? locale
      : DEFAULT_LOCALE;

  // Build localized home URL - always use explicit locale to avoid middleware rewriting
  const homeUrl = `/${currentLocale}`;

  const navLinks = [
    {
      href: `/${currentLocale}/blog`,
      label: m.blog_title(),
    },
    {
      href: `/${currentLocale}/#features`,
      label: m.landing_nav_features(),
    },
  ];

  const loginUrl = `${APP_URL}/auth/login`;

  return (
    <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/80 shadow-sm shadow-black/[0.03] backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 dark:shadow-black/20">
      <Container>
        <div className="flex h-16 items-center justify-between">
          <Link
            href={homeUrl}
            className="flex items-center gap-2"
            onClick={() => setMobileMenuOpen(false)}
          >
            <BrandLogo className="h-6 w-auto" />
            <span className="text-lg font-semibold tracking-tight">
              OpenAthlete
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-3">
            {navLinks.map((link) => (
              <Button key={link.href} variant="ghost" asChild>
                <Link href={link.href}>{link.label}</Link>
              </Button>
            ))}
            <Button variant="ghost" size="icon" asChild>
              <a
                href="https://github.com/openathleteorg/openathlete"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
              >
                <Github className="h-5 w-5" />
              </a>
            </Button>
            <Button asChild>
              <Link href={loginUrl} target="_self">
                {m.login()}
              </Link>
            </Button>
            <LanguageSwitcher />
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center gap-2">
            <Button variant="ghost" size="icon" asChild>
              <a
                href="https://github.com/openathleteorg/openathlete"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
              >
                <Github className="h-5 w-5" />
              </a>
            </Button>
            <LanguageSwitcher buttonSize="sm" />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        <div
          className={cn(
            'md:hidden overflow-hidden transition-all duration-300 ease-in-out',
            mobileMenuOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0',
          )}
        >
          <div className="border-t py-4 space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="block px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="https://github.com/openathleteorg/openathlete"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            >
              <Github className="h-4 w-4" />
              GitHub
            </Link>
            <div className="px-4 pt-2">
              <Button asChild className="w-full">
                <Link
                  href={loginUrl}
                  target="_self"
                  onClick={() => {
                    setMobileMenuOpen(false);
                  }}
                >
                  {m.login()}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </nav>
  );
}
