// Application entry: loads the styles and mounts the React app.
import '@/styles/app.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';

createRoot(document.getElementById('root') as HTMLElement).render(
    <ErrorBoundary name="App">
        <App />
    </ErrorBoundary>
);
