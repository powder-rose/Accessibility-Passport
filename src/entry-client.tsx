import { hydrateRoot } from 'react-dom/client';
import App from './App';
import type { PageData } from './page-data';
import { attribution } from './lib/attribution';
import { recordPageView } from './lib/pageview';
import './styles/globals.css';
import './styles/service-page.css';
import './styles/questionnaire.css';
import './styles/update.css';
import './styles/articles.css';
import './styles/admin-shell.css';

const root = document.getElementById('root');
const element = document.getElementById('page-data');
if (!root || !element?.textContent)
  throw new Error('Server page data is missing.');
const data = JSON.parse(element.textContent) as PageData;
if (data.route !== 'admin') attribution();
if (data.route !== 'admin' && data.route !== 'not-found') {
  recordPageView();
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) recordPageView();
  });
}
hydrateRoot(root, <App {...data} />);
