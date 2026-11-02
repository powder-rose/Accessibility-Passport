import type { PageData } from '../page-data';
import Header from '../components/site/Header';
import Footer from '../components/site/Footer';
import Breadcrumbs from '../components/site/Breadcrumbs';
import Interactions from '../components/site/Interactions';
import { OrderLink } from '../components/site/primitives';
import ServiceHero from '../components/service/ServiceHero';
import NumberedGrid from '../components/service/NumberedGrid';
import ServiceOverview from '../components/service/ServiceOverview';
import ServiceObjects from '../components/service/ServiceObjects';
import ServiceRegulations from '../components/service/ServiceRegulations';
import ServiceProcess from '../components/service/ServiceProcess';
import ServiceContents from '../components/service/ServiceContents';
import ServicePrice from '../components/service/ServicePrice';
import ServiceNext from '../components/service/ServiceNext';
import ServiceSourceData from '../components/service/ServiceSourceData';
import ServiceStructure from '../components/service/ServiceStructure';
import ServiceComparison from '../components/service/ServiceComparison';
import ServicePackage from '../components/service/ServicePackage';
import ExpressCheck from '../components/forms/ExpressCheck';
import Expert from '../components/sections/Expert';
import Faq from '../components/sections/Faq';
import ContactSection from '../components/forms/ContactSection';

export default function SurveyPage({ content, servicePage: page, objectType, service }: PageData) {
  if (!page) throw new Error('Service page content is missing.');
  const sections = page.sections;
  const survey = content.services.find((item) => item.id === 'survey')!;
  return (
    <>
      <a className="skip-link" href="#main-content">
        К содержанию
      </a>
      <Header site={content.site} contactHref="#contact" />
      <main id="main-content" className="survey-page">
        <Breadcrumbs current={page.breadcrumb} />
        <ServiceHero page={page} site={content.site} service={survey} />
        <section className="service-benefits" aria-label="Преимущества подготовки акта">
          <div className="container">
            <NumberedGrid items={page.advantages} />
          </div>
        </section>
        <ServiceOverview section={sections['3']} />
        <ServiceObjects section={sections['4']} />
        <ServiceRegulations section={sections['5']}>
          <OrderLink service="survey">{sections['5'].action}</OrderLink>
        </ServiceRegulations>
        <ServiceProcess section={sections['6']} />
        <ServiceContents section={sections['7']} id="documents" />
        <ServicePrice section={sections['8']} service={survey} />
        <ServiceNext section={sections['9']} />
        <ServiceSourceData section={sections['10']} />
        <ServiceStructure section={sections['11']} />
        <ServiceComparison section={sections['12']} />
        <ServicePackage section={sections['13']} />
        <ExpressCheck
          content={content}
          section={sections['14']}
          objectType={objectType}
          initialService={service || 'survey'}
        />
        <Expert section={sections['15']} site={content.site} service="survey" />
        <Faq section={sections['16']} />
        <ContactSection
          content={content}
          section={sections['17']}
          initialService={service || 'survey'}
          showServicePrice
          commentLabel="Комментарий"
        />
      </main>
      <Footer site={content.site} topHref="#top" />
      <Interactions metrikaId={content.site.metrikaId} />
    </>
  );
}
