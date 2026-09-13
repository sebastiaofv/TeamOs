// Application entry. Legacy boots first, as a module side effect, exactly as it
// did when it was the entry. React mounts afterwards into #reactRoot.
import './legacy/main.js';
import { createRoot } from 'react-dom/client';
import { AppIslands } from './components/AppIslands.jsx';
import { Logger } from './logger.js';

try {
    createRoot(document.getElementById('reactRoot')).render(<AppIslands />);
} catch (error) {
    // Legacy boot has already completed, so the app keeps running without the
    // React islands rather than failing to load.
    Logger.error('React root failed to mount', error);
}
