import { Component } from 'react';
import { Logger } from '../logger.js';

// A render error in one island is logged and that island renders nothing; the
// legacy app and every other island keep working.
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
    }

    render() {
        if (this.state.failed) return null;
        return this.props.children;
    }
}
