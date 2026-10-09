// Application entry: loads the styles and mounts the React app.
import '@/styles/app.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';

const root = createRoot(document.getElementById('root') as HTMLElement);

// Throwaway dashboard design study, available only on the development server.
if (import.meta.env.DEV && new URLSearchParams(location.search).get('prototype') === 'dashboard') {
    void import('@/features/portfolio/dashboard/DashboardPrototype').then(({ DashboardPrototype }) => {
        root.render(<DashboardPrototype />);
    });
} else root.render(
    <ErrorBoundary name="App">
        <App />
    </ErrorBoundary>
);
