
import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppRouter } from './router/AppRouter';

// Tailwind CSS (build-time)
import './styles/tailwind.css';

// UI Component Library Styles
import './components/ui/styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
);
