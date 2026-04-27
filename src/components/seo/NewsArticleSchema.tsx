import { Helmet } from 'react-helmet-async';

interface Props {
  article: {
    title: string; description: string; slug: string; language: string;
    published_at: string; updated_at: string; author?: string;
    image_url?: string; section?: string;
  };
}

export function NewsArticleSchema({ article }: Props) {
  const url = `https://next59.com/${article.language}/article/${article.slug}`;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    description: article.description,
    image: article.image_url ? [article.image_url] : ['https://next59.com/favicon-512.png'],
    datePublished: article.published_at,
    dateModified: article.updated_at,
    author: { '@type': 'Organization', name: article.author || 'Next59 yayin kurulu', url: 'https://next59.com' },
    publisher: { '@type': 'Organization', name: 'Next59', logo: { '@type': 'ImageObject', url: 'https://next59.com/favicon-512.png' } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    inLanguage: article.language === 'tr' ? 'tr-TR' : 'en-US',
    articleSection: article.section,
  };

  return <Helmet><script type="application/ld+json">{JSON.stringify(schema)}</script></Helmet>;
}
