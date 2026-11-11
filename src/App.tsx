import type { PageData } from './page-data';
import DocumentServicePage from './pages/DocumentServicePage';
import HomePage from './pages/HomePage';
import LegalPage from './pages/LegalPage';
import AdminConsole from './components/admin/AdminConsole';
import NotFoundPage from './pages/NotFoundPage';
import UpdatePage from './pages/UpdatePage';
import BlogPage from './pages/BlogPage';
import ArticlePage from './pages/ArticlePage';
import CookieNotice from './components/site/CookieNotice';

export default function App(data: PageData) {
  return (
    <>
      <PageContent {...data} />
      {data.route !== 'admin' && data.route !== 'not-found' && <CookieNotice />}
    </>
  );
}

function PageContent(data: PageData) {
  switch (data.route) {
    case 'home':
      return (
        <HomePage
          content={data.content}
          objectType={data.objectType}
          service={data.service}
        />
      );
    case 'survey':
    case 'questionnaire':
      return <DocumentServicePage {...data} />;
    case 'update':
      return <UpdatePage {...data} />;
    case 'legal':
      return <LegalPage content={data.content} document={data.document!} />;
    case 'admin':
      return (
        <AdminConsole
          path={data.adminPath || '/admin/'}
          site={data.content.site}
        />
      );
    case 'blog':
      return <BlogPage {...data} />;
    case 'article':
      return <ArticlePage {...data} />;
    case 'not-found':
      return <NotFoundPage />;
  }
}
