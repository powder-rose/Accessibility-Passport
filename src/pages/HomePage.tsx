import type { SiteContent } from '../lib/content-types';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import Interactions from '@/components/site/Interactions';
import Hero from '@/components/sections/Hero';
import Experience from '@/components/sections/Experience';
import DocumentOverview from '@/components/sections/DocumentOverview';
import ExpressCheck from '@/components/forms/ExpressCheck';
import Documents from '@/components/sections/Documents';
import Objects from '@/components/sections/Objects';
import Regulations from '@/components/sections/Regulations';
import Process from '@/components/sections/Process';
import Trust from '@/components/sections/Trust';
import Pricing from '@/components/sections/Pricing';
import SourceData from '@/components/sections/SourceData';
import Responsibility from '@/components/sections/Responsibility';
import OtherServices from '@/components/sections/OtherServices';
import Expert from '@/components/sections/Expert';
import Faq from '@/components/sections/Faq';
import ContactSection from '@/components/forms/ContactSection';
export default function HomePage({
  content: c,
  objectType,
  service,
}: {
  content: SiteContent;
  objectType?: string;
  service?: string;
}) {
  const s = c.sections;
  return (
    <>
      <a className="skip-link" href="#main-content">
        К содержанию
      </a>
      <Header site={c.site} />
      <main id="main-content">
        <Hero content={c} />
        <Experience section={s['2']} />
        <DocumentOverview section={s['3']} anatomy={s['4']} />
        <ExpressCheck content={c} objectType={objectType} initialService={service} />
        <Documents section={s['6']} services={c.services} />
        <Objects section={s['7']} />
        <Regulations section={s['8']} />
        <Process section={s['9']} />
        <Trust section={s['10']} site={c.site} />
        <Pricing section={s['11']} services={c.services} />
        <SourceData section={s['12']} />
        <Responsibility section={s['13']} />
        <OtherServices section={s['14']} />
        <Expert section={s['15']} site={c.site} />
        <Faq section={s['16']} />
        <ContactSection content={c} initialService={service} />
      </main>
      <Footer site={c.site} />
      <Interactions metrikaId={c.site.metrikaId} />
    </>
  );
}
