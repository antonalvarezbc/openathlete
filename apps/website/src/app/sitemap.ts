import { SITE_URL } from '@/config';
import { getAllPosts, getPostLocales } from '@/content/blog';
import { SUPPORTED_LOCALES } from '@/utils/locales';
import { existsSync, readdirSync, statSync } from 'fs';
import type { MetadataRoute } from 'next';
import { join } from 'path';

/**
 * Recursively scan directory for page.tsx files and return their routes
 */
function scanRoutes(
  dir: string,
  basePath: string = '',
  routes: string[] = [],
): string[] {
  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        // Skip dynamic route segments (they start with [ or (...))
        if (entry.startsWith('[') || entry.startsWith('(')) {
          continue;
        }

        const newBasePath = basePath ? `${basePath}/${entry}` : `/${entry}`;
        scanRoutes(fullPath, newBasePath, routes);
      } else if (entry === 'page.tsx') {
        // Found a page.tsx file, add the route
        const route = basePath || '/';
        if (!routes.includes(route)) {
          routes.push(route);
        }
      }
    }
  } catch (error) {
    // If directory doesn't exist or can't be read, skip it
    console.error(`Could not scan directory ${dir}:`, error);
  }

  return routes;
}

/**
 * Get priority and changeFrequency based on route path
 */
function getRouteMetadata(path: string): {
  priority: number;
  changeFrequency:
    'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
} {
  // Homepage
  if (path === '/') {
    return { priority: 1, changeFrequency: 'weekly' };
  }

  // Training plan pages - high priority for SEO
  if (path.startsWith('/training-plans')) {
    return { priority: 0.9, changeFrequency: 'monthly' };
  }

  // Blog pages
  if (path.startsWith('/blog')) {
    return { priority: 0.8, changeFrequency: 'weekly' };
  }

  // Tools pages
  if (path.startsWith('/tools')) {
    return { priority: 0.7, changeFrequency: 'monthly' };
  }

  // Legal pages
  if (
    path === '/privacy-policy' ||
    path === '/legal-notice' ||
    path === '/terms-of-sale'
  ) {
    return { priority: 0.5, changeFrequency: 'monthly' };
  }

  // Default for other pages
  return { priority: 0.6, changeFrequency: 'monthly' };
}

/**
 * Scan the plans directory to find all available training plans.
 * Returns each route (like '/training-plans/running/marathon/4h30') with the
 * locales it has a plan file for.
 */
function getTrainingPlanRoutes(): Map<string, string[]> {
  const routes = new Map<string, string[]>();
  const plansDir = join(process.cwd(), 'src/lib/training-plans/plans');

  if (!existsSync(plansDir)) {
    return routes;
  }

  try {
    const sports = readdirSync(plansDir, { withFileTypes: true }).filter(
      (dirent) => dirent.isDirectory(),
    );

    for (const sportDir of sports) {
      const sport = sportDir.name; // 'running', 'trail', 'triathlon'
      const sportPath = join(plansDir, sport);

      const planFiles = readdirSync(sportPath).filter((file) =>
        file.endsWith('.json'),
      );

      for (const planFile of planFiles) {
        // Format: {distance}-{variant}.{locale}.json, the locale being
        // optional on legacy English files.
        // Example: marathon-4h30.fr.json, 50km-2000d+.en.json
        const match = planFile.match(/^(.+)-([^-]+?)(?:\.([a-z]{2}))?\.json$/);
        if (!match) continue;

        const [, distance, variant, locale = 'en'] = match;
        const route = `/training-plans/${sport}/${distance}/${variant}`;
        const planLocales = routes.get(route) ?? [];
        if (!planLocales.includes(locale)) {
          planLocales.push(locale);
        }
        routes.set(route, planLocales);
      }
    }
  } catch (error) {
    console.error('Error scanning training plans for sitemap:', error);
  }

  return routes;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = SITE_URL;
  const now = new Date();

  // Automatically discover all static routes
  // process.cwd() points to the Next.js app root (apps/website)
  const appDir = join(process.cwd(), 'src/app/[locale]');

  let staticRoutes: string[] = [];
  try {
    staticRoutes = scanRoutes(appDir);
  } catch (error) {
    console.error('Error scanning routes for sitemap:', error);
  }

  const sitemapEntries: MetadataRoute.Sitemap = [];

  // Generate entries for each static route and locale
  for (const route of staticRoutes) {
    // Landing pages temporarily redirect home; omit until real content ships.
    if (route === '/coaches' || route === '/clubs') {
      continue;
    }
    const routeMetadata = getRouteMetadata(route);
    const lastModified =
      route === '/' || route.startsWith('/blog') || route.startsWith('/tools')
        ? now
        : new Date('2024-01-01');

    for (const locale of SUPPORTED_LOCALES) {
      const url =
        locale === 'en' ? `${baseUrl}${route}` : `${baseUrl}/${locale}${route}`;

      sitemapEntries.push({
        url,
        lastModified,
        changeFrequency: routeMetadata.changeFrequency,
        priority: routeMetadata.priority,
        alternates: {
          languages: Object.fromEntries(
            SUPPORTED_LOCALES.map((loc) => [
              loc,
              loc === 'en' ? `${baseUrl}${route}` : `${baseUrl}/${loc}${route}`,
            ]),
          ),
        },
      });
    }
  }

  // Add training plan pages (dynamic routes)
  let trainingPlanRoutes = new Map<string, string[]>();
  try {
    trainingPlanRoutes = getTrainingPlanRoutes();
  } catch (error) {
    console.error('Error getting training plan routes for sitemap:', error);
  }

  for (const [route, planLocales] of trainingPlanRoutes) {
    const routeMetadata = getRouteMetadata(route);
    // Pages without a plan file in their locale fall back to English: only
    // list the real translations.
    const routeLocales = SUPPORTED_LOCALES.filter((locale) =>
      planLocales.includes(locale),
    );
    for (const locale of routeLocales) {
      const url =
        locale === 'en' ? `${baseUrl}${route}` : `${baseUrl}/${locale}${route}`;

      sitemapEntries.push({
        url,
        lastModified: now,
        changeFrequency: routeMetadata.changeFrequency,
        priority: routeMetadata.priority,
        alternates: {
          languages: Object.fromEntries(
            routeLocales.map((loc) => [
              loc,
              loc === 'en' ? `${baseUrl}${route}` : `${baseUrl}/${loc}${route}`,
            ]),
          ),
        },
      });
    }
  }

  // Add blog posts (dynamic routes)
  let blogPosts: ReturnType<typeof getAllPosts> = [];
  try {
    blogPosts = getAllPosts();
  } catch (error) {
    console.error('Error getting blog posts for sitemap:', error);
  }

  for (const post of blogPosts) {
    // Untranslated posts show the English body: only list real translations.
    const postLocales = getPostLocales(post);
    for (const locale of postLocales) {
      const url =
        locale === 'en'
          ? `${baseUrl}/blog/${post.metadata.slug}`
          : `${baseUrl}/${locale}/blog/${post.metadata.slug}`;

      sitemapEntries.push({
        url,
        lastModified: post.metadata.updatedAt
          ? new Date(post.metadata.updatedAt)
          : new Date(post.metadata.publishedAt),
        changeFrequency: 'monthly',
        priority: 0.7,
        alternates: {
          languages: Object.fromEntries(
            postLocales.map((loc) => [
              loc,
              loc === 'en'
                ? `${baseUrl}/blog/${post.metadata.slug}`
                : `${baseUrl}/${loc}/blog/${post.metadata.slug}`,
            ]),
          ),
        },
      });
    }
  }

  return sitemapEntries;
}
