import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';

export function HreflangTags() {
  const { pathname } = useLocation();
  const slug = pathname.replace(/^\/(tr|en)/, '');

  return (
    <Helmet>
      <link rel="alternate" hrefLang="tr" href={`https://next59.com/tr${slug}`} />
      <link rel="alternate" hrefLang="en" href={`https://next59.com/en${slug}`} />
      <link rel="alternate" hrefLang="x-default" href={`https://next59.com/en${slug}`} />
      <link rel="canonical" href={`https://next59.com${pathname}`} />
    </Helmet>
  );
}
