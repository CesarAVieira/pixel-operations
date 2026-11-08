import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Sem StrictMode: o Phaser não deve ser criado/destruído duas vezes no mesmo contêiner (ver DECISOES-TECNICAS).
createRoot(document.getElementById('root')!).render(<App />);
