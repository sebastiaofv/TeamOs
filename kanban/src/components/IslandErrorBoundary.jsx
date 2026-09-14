import { Component } from 'react';
import { Logger } from '../logger.js';

// A render error in one island is logged and that island renders nothing; every
// other island keeps working. `onError` clears the failed
// island's app state (e.g. closes its dialog so shortcuts are not left
// suppressed). It runs in a microtask, outside React's commit phase, because
// closing a dialog commits with flushSync.
export class IslandErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { failed: false };
    }

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error) {
        Logger.error('React island failed', { island: this.props.island, error });
        const { onError } = this.props;
        if (onError) queueMicrotask(onError);
    }

    render() {
        if (this.state.failed) return null;
        return this.props.children;
    }
}
