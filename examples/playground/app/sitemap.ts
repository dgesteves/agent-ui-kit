import type { MetadataRoute } from 'next';
import { componentHref, COMPONENTS } from '@/lib/components';
import { GUIDES } from '@/lib/docs';
import { SITE_URL } from '@/lib/site';

// Every page, built with the site.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: SITE_URL, lastModified, priority: 1 },
    { url: `${SITE_URL}/gallery`, lastModified, priority: 0.8 },
    ...GUIDES.map((doc) => ({ url: `${SITE_URL}${doc.href}`, lastModified, priority: 0.8 })),
    ...COMPONENTS.map((c) => ({ url: `${SITE_URL}${componentHref(c.slug)}`, lastModified, priority: 0.7 })),
  ];
}
