import { Container } from '@/components/landing/container';
import { Footer, Navbar } from '@/components/landing/sections';
import {
  ArticleStructuredData,
  BreadcrumbListStructuredData,
  WebPageStructuredData,
} from '@/components/seo/structured-data';
import { SITE_URL } from '@/config';
import {
  getAllPosts,
  getPostBySlug,
  getPostContent,
  getPostLocales,
  getPostText,
} from '@/content/blog';
import { m } from '@/paraglide/messages';
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  formatLongDate,
  isSupportedLocale,
  languageAlternates,
  localePrefix,
} from '@/utils/locales';
import { ArrowLeft, Calendar, Clock } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { generateMetadata as generatePageMetadata } from '../../../metadata';

/* eslint-disable react-refresh/only-export-components */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const post = getPostBySlug(slug);
  if (!post) {
    notFound();
  }

  const title = getPostText(post.metadata.title, locale);
  const description = getPostText(post.metadata.description, locale);
  const postLocales = getPostLocales(post);

  const metadata = generatePageMetadata({ locale, locales: postLocales });
  const postUrl = `${SITE_URL}${localePrefix(locale)}/blog/${slug}`;
  // Canonical URL should always point to the English version
  const canonicalUrl = `${SITE_URL}/blog/${slug}`;

  return {
    ...metadata,
    title,
    description,
    openGraph: {
      ...metadata.openGraph,
      title,
      description,
      url: postUrl,
      type: 'article',
      publishedTime: post.metadata.publishedAt,
      modifiedTime: post.metadata.updatedAt,
      authors: [post.metadata.author.name],
      tags: post.metadata.tags,
      images: post.metadata.image
        ? [
            {
              url: post.metadata.image,
              width: 1080,
              height: 720,
              alt: title,
            },
          ]
        : undefined,
    },
    twitter: {
      ...metadata.twitter,
      title,
      description,
      images: post.metadata.image ? [post.metadata.image] : undefined,
    },
    alternates: {
      canonical: canonicalUrl,
      languages: languageAlternates(`/blog/${slug}`, postLocales),
    },
  };
}

export async function generateStaticParams() {
  const posts = getAllPosts();
  const params: Array<{ locale: string; slug: string }> = [];

  for (const post of posts) {
    for (const locale of SUPPORTED_LOCALES) {
      params.push({ locale, slug: post.metadata.slug });
    }
  }

  return params;
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }

  const post = getPostBySlug(slug);
  if (!post) {
    notFound();
  }

  const title = getPostText(post.metadata.title, locale);
  const description = getPostText(post.metadata.description, locale);
  // Untranslated posts show the English body, marked as such
  const TranslatedContent = getPostContent(post, locale);
  const PostContent = TranslatedContent ?? post.ContentEn;
  const contentLocale = TranslatedContent ? locale : DEFAULT_LOCALE;

  const postUrl = `${SITE_URL}${localePrefix(locale)}/blog/${slug}`;
  const blogUrl = `${SITE_URL}${localePrefix(locale)}/blog`;

  const publishedDate = formatLongDate(post.metadata.publishedAt, locale);

  const updatedDate = post.metadata.updatedAt
    ? formatLongDate(post.metadata.updatedAt, locale)
    : null;

  // Get related posts (excluding current post)
  const relatedPosts = getAllPosts()
    .filter((p) => p.metadata.slug !== slug)
    .slice(0, 3);

  return (
    <>
      <WebPageStructuredData
        title={title}
        description={description}
        url={postUrl}
      />
      <ArticleStructuredData
        title={title}
        description={description}
        url={postUrl}
        publishedAt={post.metadata.publishedAt}
        updatedAt={post.metadata.updatedAt}
        author={post.metadata.author}
        image={post.metadata.image}
        inLanguage={contentLocale}
      />
      <BreadcrumbListStructuredData
        items={[
          { name: m.blog_breadcrumb_home(), url: SITE_URL },
          { name: m.blog_title(), url: blogUrl },
          { name: title, url: postUrl },
        ]}
      />
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="py-12">
          <Container>
            <div className="mx-auto max-w-3xl">
              <Link
                href={`/${locale}/blog`}
                className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                {m.blog_back_to_blog()}
              </Link>

              <article>
                <header className="mb-8">
                  {post.metadata.image && (
                    <div className="mb-8 aspect-video w-full overflow-hidden rounded-lg">
                      <Image
                        src={post.metadata.image}
                        alt={title}
                        width={1080}
                        height={720}
                        className="h-full w-full object-cover"
                        priority
                      />
                    </div>
                  )}
                  <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                    {title}
                  </h1>
                  <p className="mt-4 text-xl text-muted-foreground">
                    {description}
                  </p>
                  <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <time dateTime={post.metadata.publishedAt}>
                        {m.blog_published_on()} {publishedDate}
                      </time>
                    </div>
                    {updatedDate && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <time dateTime={post.metadata.updatedAt!}>
                          {m.blog_updated_on()} {updatedDate}
                        </time>
                      </div>
                    )}
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
                  {post.metadata.tags && post.metadata.tags.length > 0 && (
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
                </header>

                {contentLocale !== locale && (
                  <p className="mb-8 rounded-lg border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                    {m.blog_translation_unavailable()}
                  </p>
                )}
                <div
                  className="prose prose-neutral dark:prose-invert max-w-none"
                  lang={contentLocale !== locale ? contentLocale : undefined}
                >
                  <PostContent />
                </div>
              </article>

              {relatedPosts.length > 0 && (
                <aside className="mt-16 border-t pt-12">
                  <h2 className="text-2xl font-bold mb-6">
                    {m.blog_related_articles()}
                  </h2>
                  <div className="space-y-4">
                    {relatedPosts.map((relatedPost) => {
                      const relatedTitle = getPostText(
                        relatedPost.metadata.title,
                        locale,
                      );
                      const relatedExcerpt = getPostText(
                        relatedPost.metadata.excerpt,
                        locale,
                      );

                      return (
                        <Link
                          key={relatedPost.metadata.slug}
                          href={`/${locale}/blog/${relatedPost.metadata.slug}`}
                          className="flex flex-row rounded-lg border bg-card overflow-hidden shadow-sm transition-shadow hover:shadow-md"
                        >
                          {relatedPost.metadata.image && (
                            <div className="relative h-32 w-32 flex-shrink-0 overflow-hidden sm:h-40 sm:w-40">
                              <Image
                                src={relatedPost.metadata.image}
                                alt={relatedTitle}
                                width={400}
                                height={300}
                                className="h-full w-full object-cover object-center transition-transform hover:scale-105"
                              />
                            </div>
                          )}
                          <div className="flex-1 p-4 flex flex-col justify-center min-h-[128px] sm:min-h-[160px]">
                            <h3 className="font-semibold text-lg">
                              {relatedTitle}
                            </h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {relatedExcerpt}
                            </p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </aside>
              )}
            </div>
          </Container>
        </div>
        <Footer />
      </div>
    </>
  );
}
