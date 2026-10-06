'use client';

import heroImage from '@/assets/images/landing/hero.png';
import { AnimatedBlobs } from '@/components/landing/animated-blobs';
import { Container } from '@/components/landing/container';
import { ImagePlaceholder } from '@/components/landing/image-placeholder';
import { Button } from '@/components/ui/button';
import { APP_URL } from '@/config';
import { m } from '@/paraglide/messages';
import { motion, useReducedMotion } from 'framer-motion';
import { Activity, ArrowRight, FileCode2, MapPin } from 'lucide-react';
import * as React from 'react';

const GITHUB_REPO_URL = 'https://github.com/openathleteorg/openathlete';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.06,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.55,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
};

const titleVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.65,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
};

export function Hero() {
  const signupUrl = `${APP_URL}/auth/create-account`;
  const reduceMotion = useReducedMotion();

  const trustItems = [
    { Icon: MapPin, label: m.landing_hero_proof_1() },
    { Icon: FileCode2, label: m.landing_hero_proof_2() },
    { Icon: Activity, label: m.landing_hero_proof_3() },
  ] as const;

  return (
    <section className="relative overflow-hidden border-b border-border/25 bg-gradient-to-b from-background via-background to-muted/20 py-16 md:py-20 lg:py-28">
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-grid-pattern-fine [mask-image:linear-gradient(180deg,white_55%,transparent)] dark:[mask-image:linear-gradient(180deg,white_35%,transparent)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-1/2 top-0 z-0 h-[min(520px,70vw)] w-[min(140%,900px)] -translate-x-1/2 bg-[radial-gradient(ellipse_70%_55%_at_50%_0%,hsl(var(--primary)/0.14),transparent_72%)] dark:bg-[radial-gradient(ellipse_70%_55%_at_50%_0%,hsl(var(--primary)/0.22),transparent_72%)]"
        aria-hidden
      />

      <AnimatedBlobs />

      <div
        className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-background/70 via-transparent to-background/85"
        aria-hidden
      />

      <Container className="relative z-10">
        {/* minmax(0, 1fr): without it the column grows to its widest
            unbreakable content and the hero overflows on phones */}
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16 xl:gap-20">
          <motion.div
            className="mx-auto min-w-0 max-w-xl text-center lg:mx-0 lg:max-w-none lg:text-left"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.div
              variants={itemVariants}
              className="flex justify-center lg:justify-start"
            >
              <span className="inline-flex max-w-full items-center rounded-full border border-border/80 bg-muted/30 px-3 py-1 text-center text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground shadow-sm backdrop-blur-sm sm:tracking-[0.18em]">
                {m.landing_hero_eyebrow()}
              </span>
            </motion.div>

            <motion.h1
              className="mt-5 text-balance break-words text-[1.75rem] font-semibold leading-tight tracking-tight text-foreground sm:text-4xl md:text-[2.65rem] md:leading-[1.14]"
              variants={titleVariants}
            >
              <span className="bg-gradient-to-br from-foreground via-foreground to-foreground/65 bg-clip-text text-transparent">
                {m.landing_hero_title()}
              </span>
            </motion.h1>

            <motion.p
              className="mt-4 max-w-lg text-pretty text-sm leading-relaxed text-muted-foreground sm:text-[15px] md:text-base mx-auto lg:mx-0"
              variants={itemVariants}
            >
              {m.landing_hero_subtitle()}
            </motion.p>

            <motion.div
              className="mt-8 flex flex-wrap items-center justify-center gap-2 sm:gap-2.5 lg:justify-start"
              variants={itemVariants}
            >
              {trustItems.map(({ Icon, label }) => (
                <div
                  key={label}
                  className="group inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-left shadow-sm backdrop-blur-md transition-colors hover:border-primary/25 hover:bg-muted/50 dark:bg-background/40"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/15 transition-transform group-hover:scale-105">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="pr-0.5 text-xs font-medium leading-tight text-foreground/90 sm:text-[13px]">
                    {label}
                  </span>
                </div>
              ))}
            </motion.div>

            <motion.div
              className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:justify-center lg:justify-start"
              variants={itemVariants}
            >
              <Button
                size="default"
                className="group relative h-auto min-h-11 overflow-hidden whitespace-normal px-6 py-2.5 text-center shadow-md sm:h-10 sm:min-h-0 sm:whitespace-nowrap sm:py-2"
                asChild
              >
                <a href={signupUrl}>
                  <span className="relative z-10 inline-flex items-center">
                    {m.landing_hero_cta_primary()}
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                  <span
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    aria-hidden
                  >
                    <span className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-[100%]" />
                  </span>
                </a>
              </Button>
              <Button
                variant="outline"
                size="default"
                className="h-11 border-border/80 bg-background/50 backdrop-blur-sm sm:h-10"
                asChild
              >
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {m.landing_hero_cta_secondary()}
                </a>
              </Button>
            </motion.div>
          </motion.div>

          <motion.div
            className="relative mx-auto w-full max-w-2xl lg:mx-0 lg:max-w-none"
            initial={{
              opacity: 0,
              y: reduceMotion ? 0 : 28,
              scale: reduceMotion ? 1 : 0.98,
            }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              duration: 0.85,
              delay: 0.15,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {!reduceMotion ? (
              <motion.div
                className="pointer-events-none absolute -inset-6 rounded-[1.35rem] bg-gradient-to-br from-primary/25 via-transparent to-violet-500/15 opacity-70 blur-2xl dark:from-primary/30 dark:to-violet-500/10"
                animate={{ opacity: [0.55, 0.85, 0.55] }}
                transition={{
                  duration: 5.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                aria-hidden
              />
            ) : (
              <div
                className="pointer-events-none absolute -inset-6 rounded-[1.35rem] bg-gradient-to-br from-primary/20 via-transparent to-violet-500/10 opacity-60 blur-2xl"
                aria-hidden
              />
            )}

            <motion.div
              className="relative"
              animate={
                reduceMotion
                  ? undefined
                  : {
                      y: [0, -5, 0],
                    }
              }
              transition={
                reduceMotion
                  ? undefined
                  : {
                      duration: 5,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }
              }
            >
              <div className="relative rounded-2xl p-[1px] shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)] ring-1 ring-border/50 dark:shadow-[0_28px_90px_-16px_rgba(0,0,0,0.55)]">
                <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-border/40 via-transparent to-primary/10">
                  <ImagePlaceholder
                    description="OpenAthlete dashboard with calendar, load metrics, and training overview"
                    imageAlt="OpenAthlete dashboard with training calendar and load metrics"
                    aspectRatio="16/9"
                    imageSrc={heroImage}
                    className="rounded-2xl border-0 shadow-none ring-0"
                  />
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
