import type { PageData } from './page-data';
import HomePage from './pages/HomePage';
import LegalPage from './pages/LegalPage';
import AdminConsole from './components/admin/AdminConsole';
import NotFoundPage from './pages/NotFoundPage';

export default function App(data: PageData) {
  switch (data.route) {
    case 'home':
      return (
        <HomePage content={data.content} objectType={data.objectType} service={data.service} />
      );
    case 'legal':
      return <LegalPage content={data.content} document={data.document!} />;
    case 'admin':
      return <AdminConsole />;
    case 'not-found':
      return <NotFoundPage />;
  }
}
