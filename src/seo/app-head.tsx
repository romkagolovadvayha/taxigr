import Head from 'expo-router/head';

import { getPageMetadata } from '@/seo/page-metadata';

type Props = {
  pathname: string;
};

const DEFAULT_SITE_URL = 'https://taxigr.ru';

export function AppHead({ pathname }: Props) {
  const metadata = getPageMetadata(pathname);
  const siteUrl = (process.env.EXPO_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL).replace(/\/+$/, '');
  const canonicalUrl = metadata.canonicalPath
    ? `${siteUrl}${metadata.canonicalPath === '/' ? '/' : metadata.canonicalPath}`
    : null;

  return (
    <Head>
      <title>{metadata.title}</title>
      <meta name="description" content={metadata.description} />
      <meta
        name="robots"
        content={metadata.indexable ? 'index, follow' : 'noindex, nofollow, noarchive'}
      />
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
      {canonicalUrl && <meta property="og:title" content={metadata.title} />}
      {canonicalUrl && <meta property="og:description" content={metadata.description} />}
      {canonicalUrl && <meta property="og:type" content="website" />}
      {canonicalUrl && <meta property="og:site_name" content="Такси Грахово" />}
      {canonicalUrl && <meta property="og:locale" content="ru_RU" />}
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}
      {canonicalUrl && <meta property="og:image" content={`${siteUrl}/og.png`} />}
      {canonicalUrl && <meta property="og:image:width" content="1200" />}
      {canonicalUrl && <meta property="og:image:height" content="630" />}
      {canonicalUrl && <meta property="og:image:alt" content="Такси Грахово" />}
      {canonicalUrl && <meta name="twitter:card" content="summary_large_image" />}
      {canonicalUrl && <meta name="twitter:title" content={metadata.title} />}
      {canonicalUrl && <meta name="twitter:description" content={metadata.description} />}
      {canonicalUrl && <meta name="twitter:image" content={`${siteUrl}/og.png`} />}
      {pathname === '/' && (
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'TaxiService',
            name: 'Такси Грахово',
            description: PAGE_DESCRIPTION,
            areaServed: {
              '@type': 'AdministrativeArea',
              name: 'Граховский район, Удмуртская Республика',
            },
            url: `${siteUrl}/`,
            serviceType: 'Заказ легкового такси',
            availableChannel: {
              '@type': 'ServiceChannel',
              serviceUrl: `${siteUrl}/sign-in`,
            },
          })}
        </script>
      )}
    </Head>
  );
}

const PAGE_DESCRIPTION = getPageMetadata('/').description;
