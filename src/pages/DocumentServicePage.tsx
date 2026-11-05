import type { PageData } from '../page-data';
import Header from '../components/site/Header';
import Footer from '../components/site/Footer';
import Breadcrumbs from '../components/site/Breadcrumbs';
import Interactions from '../components/site/Interactions';
import { OrderLink } from '../components/site/primitives';
import ServiceObjects from '../components/service/ServiceObjects';
import { servicePresentations } from '../components/service/presentations';
import ServiceComparison from '../components/service/ServiceComparison';
import ServicePackage from '../components/service/ServicePackage';
import ExpressCheck from '../components/forms/ExpressCheck';
import Expert from '../components/sections/Expert';
import Faq from '../components/sections/Faq';
import ContactSection from '../components/forms/ContactSection';

export default function DocumentServicePage({
  content,
  servicePage: page,
  objectType,
  service,
}: PageData) {
  if (!page || page.serviceId === 'update')
    throw new Error('Document page content is missing.');
  const sections = page.sections;
  const primaryService = content.services.find(
    (item) => item.id === page.serviceId,
  )!;
  const {
    Hero,
    Advantages,
    Overview,
    Regulations,
    Process,
    Contents,
    Price,
    Next,
    SourceData,
    Structure,
  } = servicePresentations[page.serviceId];
  return (
    <>
      <a className="skip-link" href="#main-content">
        К содержанию
      </a>
      <Header site={content.site} contactHref="#contact" />
      <main
        id="main-content"
        className={
          'document-service-page document-service-page--' + page.serviceId
        }
      >
        <Breadcrumbs current={page.breadcrumb} />
        <Hero page={page} site={content.site} service={primaryService} />
        <Advantages items={page.advantages} />
        <Overview section={sections['3']} service={page.serviceId} />
        <ServiceObjects section={sections['4']} service={page.serviceId} />
        <Regulations section={sections['5']} service={page.serviceId}>
          <OrderLink service={page.serviceId}>{sections['5'].action}</OrderLink>
        </Regulations>
        <Process section={sections['6']} service={page.serviceId} />
        <Contents
          section={sections['7']}
          id="documents"
          service={page.serviceId}
        />
        <Price section={sections['8']} service={primaryService} />
        <Next
          section={sections['9']}
          documentLabel={sections['12'].items![0].title}
        />
        <SourceData section={sections['10']} service={page.serviceId} />
        <Structure section={sections['11']} service={page.serviceId} />
        <ServiceComparison section={sections['12']} service={page.serviceId} />
        <ServicePackage section={sections['13']} />
        <ExpressCheck
          content={content}
          section={sections['14']}
          objectType={objectType}
          initialService={service || page.serviceId}
        />
        <Expert
          section={sections['15']}
          site={content.site}
          service={page.serviceId}
        />
        <Faq section={sections['16']} />
        <ContactSection
          content={content}
          section={sections['17']}
          initialService={service || page.serviceId}
          showServicePrice
          commentLabel="Комментарий"
        />
      </main>
      <Footer site={content.site} topHref="#top" />
      <Interactions metrikaId={content.site.metrikaId} />
    </>
  );
}
