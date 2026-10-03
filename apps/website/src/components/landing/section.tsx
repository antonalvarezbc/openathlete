'use client';

import { LandingAtmosphere } from '@/components/landing/landing-canvas';
import { cn } from '@/utils/shadcn';
import { HTMLMotionProps, motion } from 'framer-motion';
import * as React from 'react';

export type SectionSurface = 'default' | 'soft' | 'ridge';

const surfaceClass: Record<SectionSurface, string> = {
  default: '',
  soft: 'relative overflow-hidden border-y border-border/30 bg-gradient-to-b from-muted/20 via-background to-muted/10',
  ridge:
    'relative overflow-hidden border-y border-border/30 bg-gradient-to-b from-background via-muted/12 to-muted/20',
};

interface SectionProps extends Omit<
  HTMLMotionProps<'section'>,
  'initial' | 'whileInView' | 'viewport' | 'transition'
> {
  children: React.ReactNode;
  className?: string;
  animateOnScroll?: boolean;
  surface?: SectionSurface;
}

export function Section({
  children,
  className,
  animateOnScroll = true,
  surface = 'default',
  ...props
}: SectionProps) {
  const useCanvas = surface !== 'default';
  const padding = surface === 'default' ? 'py-16 md:py-24' : 'py-20 md:py-28';

  return (
    <motion.section
      initial={animateOnScroll ? { opacity: 0, y: 20 } : false}
      whileInView={animateOnScroll ? { opacity: 1, y: 0 } : undefined}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className={cn(padding, surfaceClass[surface], className)}
      {...props}
    >
      {useCanvas ? <LandingAtmosphere /> : null}
      {useCanvas ? <div className="relative z-10">{children}</div> : children}
    </motion.section>
  );
}
