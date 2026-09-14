import { Component } from 'react';
import { Logger } from '../logger.js';

// Logs a render error and renders nothing in place of the failed subtree.
// `onError` resets the app state that caused it (e.g. closes the open dialog).
// It runs in a microtask, outside React's commit phase, because closing a
// dialog commits with flushSync.
export class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { failed: false };
    }

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error) {
        Logger.error('Render failed', { boundary: this.props.name, error });
        const { onError } = this.props;
        if (onError) queueMicrotask(onError);
    }

    render() {
        if (this.state.failed) return null;
        return this.props.children;
    }
}
