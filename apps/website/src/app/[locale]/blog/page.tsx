import { Container } from '@/components/landing/container';
import { Footer, Navbar } from '@/components/landing/sections';
import { BreadcrumbListStructuredData } from '@/components/seo/structured-data';
import { WebPageStructuredData } from '@/components/seo/structured-data';
import { SITE_URL } from '@/config';
import { getAllPosts, getPostText } from '@/content/blog';
import { m } from '@/paraglide/messages';
import {
  formatLongDate,
  isSupportedLocale,
  languageAlternates,
  localePrefix,
} from '@/utils/locales';
import { Calendar, Clock } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { generateMetadata as generatePageMetadata } from '../../metadata';

/* eslint-disable react-refresh/only-export-components */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const metadata = generatePageMetadata({ locale });
  // Canonical URL should always point to the English version
  const canonicalUrl = `${SITE_URL}/blog`;
  return {
    ...metadata,
    title: m.blog_title(),
    description: m.blog_description(),
    alternates: {
      canonical: canonicalUrl,
      languages: languageAlternates('/blog'),
    },
  };
}
/* eslint-enable react-refresh/only-export-components */

export default async function BlogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const posts = getAllPosts();
  const blogUrl = `${SITE_URL}${localePrefix(locale)}/blog`;

  return (
    <>
      <WebPageStructuredData
        title={m.blog_title()}
        description={m.blog_description()}
        url={blogUrl}
      />
      <BreadcrumbListStructuredData
        items={[
          { name: m.blog_breadcrumb_home(), url: SITE_URL },
          { name: m.blog_title(), url: blogUrl },
        ]}
      />
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="py-12">
          <Container>
            <div className="mx-auto max-w-4xl">
              <header className="mb-12 text-center">
                <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                  {m.blog_title()}
                </h1>
                <p className="mt-4 text-lg text-muted-foreground">
                  {m.blog_description()}
                </p>
              </header>

              {posts.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">
                    {m.blog_no_articles()}
                  </p>
                </div>
              ) : (
                <div className="space-y-8">
                  {posts.map((post) => {
                    const title = getPostText(post.metadata.title, locale);
                    const excerpt = getPostText(post.metadata.excerpt, locale);
                    const publishedDate = formatLongDate(
                      post.metadata.publishedAt,
                      locale,
                    );

                    return (
                      <article
                        key={post.metadata.slug}
                        className="group rounded-lg border bg-card overflow-hidden shadow-sm transition-shadow hover:shadow-md"
                      >
                        <Link
                          href={`/${locale}/blog/${post.metadata.slug}`}
                          className="flex flex-row items-start"
                        >
                          {post.metadata.image && (
                            <div className="min-h-48 h-full w-48 flex-shrink-0 overflow-hidden sm:h-56 sm:w-64">
                              <Image
                                src={post.metadata.image}
                                alt={title}
                                width={400}
                                height={300}
                                className="h-full w-full object-cover object-center transition-transform group-hover:scale-105"
                              />
                            </div>
                          )}
                          <div className="flex-1 p-6 flex flex-col min-h-[192px] sm:min-h-[224px]">
                            <h2 className="text-2xl font-bold tracking-tight group-hover:text-primary transition-colors">
                              {title}
                            </h2>
                            <p className="mt-2 text-muted-foreground">
                              {excerpt}
                            </p>
                            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                <time dateTime={post.metadata.publishedAt}>
                                  {publishedDate}
                                </time>
                              </div>
                              {post.metadata.readingTime && (
                                <div className="flex items-center gap-1">
                                  <Clock className="h-4 w-4" />
                                  <span>
                                    {m.blog_read_time({
                                      minutes: post.metadata.readingTime,
                                    })}
                                  </span>
                                </div>
                              )}
                              {post.metadata.author && (
                                <span>
                                  {m.blog_by_author({
                                    author: post.metadata.author.name,
                                  })}
                                </span>
                              )}
                            </div>
                            {post.metadata.tags &&
                              post.metadata.tags.length > 0 && (
                                <div className="mt-4 flex flex-wrap gap-2">
                                  {post.metadata.tags.map((tag) => (
                                    <span
                                      key={tag}
                                      className="rounded-full bg-muted px-3 py-1 text-xs font-medium"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                          </div>
                        </Link>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </Container>
        </div>
        <Footer />
      </div>
    </>
  );
}
