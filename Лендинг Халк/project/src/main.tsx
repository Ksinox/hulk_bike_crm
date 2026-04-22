import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import AOS from 'aos';
import 'aos/dist/aos.css';
import App from './App.tsx';
import './index.css';

function Root() {
  useEffect(() => {
    AOS.init({
      duration: 1000,
      once: true,
      offset: 50
    });
  }, []);

  return (
    <StrictMode>
      <App />
    </StrictMode>
  );
}

createRoot(document.getElementById('root')!).render(<Root />);