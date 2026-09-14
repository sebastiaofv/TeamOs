// Application entry: loads the styles and mounts the React app.
import './styles/tailwind.css';
import './styles/app.css';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';

createRoot(document.getElementById('root')).render(
    <ErrorBoundary name="App">
        <App />
    </ErrorBoundary>
);
