import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { bootstrapRepositoryMode } from './bootstrap/appBootstrap';

// Point de composition : MODE DEMO (mock) ou MODE API (session serveur).
bootstrapRepositoryMode();

createRoot(document.getElementById('root')!).render(<App />);
