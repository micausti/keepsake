import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { completeSignIn } from './drive/auth.ts';
import { UpdatePrompt } from './pwa/UpdatePrompt.tsx';
import './index.css';

// Before anything reads the address: Google may have just sent us back from sign-in.
completeSignIn();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
    <UpdatePrompt />
  </StrictMode>,
);
