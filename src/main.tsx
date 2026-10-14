import {createRoot} from 'react-dom/client';
import { AppRouter } from './routing/AppRouter';
import './index.css';
import { bootstrapRepositoryMode } from './bootstrap/appBootstrap';

// Point de composition : MODE DEMO (mock) ou MODE API (session serveur).
bootstrapRepositoryMode();

// Routage progressif : « / » rend l'application legacy (AppContext) ; les namespaces du Master sont chargés à la demande.
createRoot(document.getElementById('root')!).render(<AppRouter />);
