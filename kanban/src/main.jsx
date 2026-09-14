// Application entry. Styling is loaded here; runtime behavior is mounted by
// AppIslands so initialization follows the same React lifecycle as the views.
import './styles/tailwind.css';
import './styles/app.css';
import { createRoot } from 'react-dom/client';
import { AppIslands } from './components/AppIslands.jsx';
import { Logger } from './logger.js';

try {
    createRoot(document.getElementById('reactRoot')).render(<AppIslands />);
} catch (error) {
    Logger.error('React root failed to mount', error);
}
