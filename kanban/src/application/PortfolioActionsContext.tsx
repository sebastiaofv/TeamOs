import { createContext, useContext, useRef, type ReactNode } from 'react';
import {
    getPortfolioMutationActions,
    type PortfolioMutationActions
} from '../actions/portfolioMutations';

const PortfolioActionsContext = createContext<PortfolioMutationActions | null>(null);

export function PortfolioActionsProvider({ children, actions }: {
    children: ReactNode;
    actions?: PortfolioMutationActions;
}) {
    const defaultActions = useRef<PortfolioMutationActions | null>(null);
    if (!actions && !defaultActions.current) {
        defaultActions.current = getPortfolioMutationActions();
    }
    const value = actions || defaultActions.current!;
    return <PortfolioActionsContext.Provider value={value}>{children}</PortfolioActionsContext.Provider>;
}

export function usePortfolioActions(): PortfolioMutationActions {
    const actions = useContext(PortfolioActionsContext);
    if (!actions) {
        throw new Error('usePortfolioActions must be used inside PortfolioActionsProvider.');
    }
    return actions;
}
