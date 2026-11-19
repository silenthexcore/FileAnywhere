import { createRoot } from 'react-dom/client';
import App from './App';
import { PreferencesProvider } from './lib/PreferencesContext';
import { I18nProvider } from './i18n';
import { ToastProvider } from './components/Toast';
import { ProtectionProvider } from './context/ProtectionContext';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <PreferencesProvider>
    <I18nProvider>
      <ToastProvider>
        <ProtectionProvider>
          <App />
        </ProtectionProvider>
      </ToastProvider>
    </I18nProvider>
  </PreferencesProvider>,
);
