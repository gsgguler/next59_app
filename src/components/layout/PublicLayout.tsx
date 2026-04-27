import { Outlet } from 'react-router-dom';
import PublicHeader from '../public/PublicHeader';
import Footer from './Footer';
import DisclaimerBanner from '../legal/DisclaimerBanner';
import { OrganizationSchema } from '../seo/OrganizationSchema';
import { HreflangTags } from '../seo/HreflangTags';

export default function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-navy-950">
      <OrganizationSchema />
      <HreflangTags />
      <DisclaimerBanner />
      <PublicHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
