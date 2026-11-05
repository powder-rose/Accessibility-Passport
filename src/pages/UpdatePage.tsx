import type { PageData } from '../page-data';
import Header from '../components/site/Header';
import Footer from '../components/site/Footer';
import Interactions from '../components/site/Interactions';
import UpdateAction from '../components/update/UpdateAction';
import UpdateHero from '../components/update/UpdateHero';
import UpdateOverview from '../components/update/UpdateOverview';
import UpdateCards from '../components/update/UpdateCards';
import UpdateProcess from '../components/update/UpdateProcess';
import UpdatePrice from '../components/update/UpdatePrice';
import UpdateSourceData from '../components/update/UpdateSourceData';
import UpdateDocuments from '../components/update/UpdateDocuments';
import UpdateSupport from '../components/update/UpdateSupport';
import UpdateRelated from '../components/update/UpdateRelated';
import ServiceObjects from '../components/service/ServiceObjects';
import ServiceRegulations from '../components/service/ServiceRegulations';
import ExpressCheck from '../components/forms/ExpressCheck';
import ContactSection from '../components/forms/ContactSection';
import Expert from '../components/sections/Expert';
import Faq from '../components/sections/Faq';

export default function UpdatePage({
  content,
  servicePage: page,
  objectType,
  service,
}: PageData) {
  if (!page || page.serviceId !== 'update')
    throw new Error('Update page content is missing.');
  const s = page.sections;
  const primaryService = content.services.find((item) => item.id === 'update')!;
  return (
    <>
      <a className="skip-link" href="#main-content">
        К содержанию
      </a>
      <Header site={content.site} contactHref="#contact" />
      <main id="main-content" className="update-page">
        <UpdateHero page={page} site={content.site} service={primaryService} />
        <UpdateOverview section={s['4']} />
        <UpdateCards section={s['5']} id="reasons" variant="reasons" />
        <ServiceObjects section={s['6']} service="update" />
        <ServiceRegulations section={s['7']}>
          <UpdateAction>{s['7'].action}</UpdateAction>
        </ServiceRegulations>
        <UpdateCards section={s['8']} id="audit" variant="audit" />
        <UpdateProcess section={s['9']} />
        <UpdateCards section={s['10']} id="scope" variant="scope" />
        <UpdatePrice section={s['11']} service={primaryService} />
        <UpdateSourceData section={s['12']} />
        <UpdateDocuments section={s['13']} />
        <ExpressCheck
          content={content}
          section={s['14']}
          quiz={page.quiz}
          mode="update"
          objectType={objectType}
          initialService="update"
        />
        <UpdateSupport section={s['15']} />
        <UpdateRelated section={s['16']} services={content.services} />
        <Expert
          section={s['17']}
          site={content.site}
          service="update"
          actionLabel={s['17'].action}
        />
        <Faq section={s['18']} />
        <ContactSection
          content={content}
          section={s['19']}
          initialService={service || 'update'}
          showServicePrice
          updateMode
          servicePriceNote={s['19'].priceNote}
          objectOptions={
            page.quiz!.questions.find(
              (question) => question.id === 'objectType',
            )!.options
          }
          commentLabel="Какие изменения произошли"
        />
      </main>
      <Footer site={content.site} topHref="#top" />
      <Interactions metrikaId={content.site.metrikaId} />
    </>
  );
}
