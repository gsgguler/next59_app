import { useEffect } from 'react';

const BASE_URL = 'https://www.next59.com';
const DEFAULT_OG_IMAGE = 'https://www.next59.com/favicon-512.png';

interface SEOProps {
  title: string;
  description: string;
  canonical: string;
  ogType?: 'website' | 'article';
  ogImage?: string;
}

function setMeta(selector: string, attr: string, value: string) {
  let el = document.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    const [attrName, attrValue] = selector.replace('meta[', '').replace(']', '').split('="');
    el.setAttribute(attrName, attrValue.replace('"', ''));
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

function setLink(rel: string, href: string) {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

export default function SEO({ title, description, canonical = '', ogType = 'website', ogImage }: SEOProps) {
  const fullUrl = canonical.startsWith('http') ? canonical : `${BASE_URL}${canonical}`;
  const image = ogImage ?? DEFAULT_OG_IMAGE;

  useEffect(() => {
    document.title = title;

    setMeta('meta[name="description"]', 'content', description);

    setLink('canonical', fullUrl);

    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[property="og:url"]', 'content', fullUrl);
    setMeta('meta[property="og:type"]', 'content', ogType);
    setMeta('meta[property="og:image"]', 'content', image);

    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', description);
    setMeta('meta[name="twitter:card"]', 'content', 'summary_large_image');

    return () => {
      // Restore index.html fallbacks on unmount so crawlers see consistent base values
      document.title = 'Next59 — kehanet kâtibi';
    };
  }, [title, description, fullUrl, ogType, image]);

  return null;
}
