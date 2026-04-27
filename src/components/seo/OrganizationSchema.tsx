import { Helmet } from 'react-helmet-async';

export function OrganizationSchema() {
  const orgSchema = {
    '@context': 'https://schema.org',
    '@type': 'NewsMediaOrganization',
    name: 'Next59',
    url: 'https://next59.com',
    logo: 'https://next59.com/favicon-512.png',
    description: 'Veriyle çalışan, tarafsız futbol gazeteciliği. Maçın 90 dakikasını, ilk düdükten önce yazıyoruz.',
    sameAs: [
      'https://twitter.com/next59com',
      'https://t.me/next59com',
      'https://discord.gg/next59'
    ],
    foundingDate: '2026',
    diversityPolicy: 'https://next59.com/tr/etik-ilkeler',
    ethicsPolicy: 'https://next59.com/tr/etik-ilkeler'
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(orgSchema)}</script>
    </Helmet>
  );
}
