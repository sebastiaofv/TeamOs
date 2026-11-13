import { useEffect, useRef, useState } from 'react';
import type { BoardData } from '@/domain/types';
import { allSprintAnalytics, sprintStartWorkitemSteps, type sprintStartWorkitems } from '@/domain/sprintAnalytics';
import { sprintExecutionSteps, type sprintExecution } from '@/domain/sprintExecution';
import { sprintBurndownSteps, type SprintBurndown } from '@/domain/sprintBurndown';
import { withWorkflowReadCache } from '@/domain/workflow';
import { formatErrorMessage } from '@/domain/util';

type Base = { scopes: ReturnType<typeof sprintStartWorkitems>; analytics: ReturnType<typeof allSprintAnalytics>; execution: ReturnType<typeof sprintExecution> };
type Prepared = Base & { burndown: SprintBurndown };
type Preparation = { data: BoardData; selected: string; today: string } & (
    { status: 'loading'; progress: number; stage: 'data' | 'history' | 'metrics' | 'charts' } |
    { status: 'ready'; result: Prepared } | { status: 'error'; message: string });
const paint = () => new Promise<void>(resolve => requestAnimationFrame(() => { setTimeout(resolve, 0); }));

/** Yield between replay chunks so navigation and real completed-stage progress can paint. */
export function useSprintPreparation(data: BoardData, selected: string, today: string) {
    const cache = useRef<{ data: BoardData; base: Base } | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [state, setState] = useState<Preparation | null>(null);
    useEffect(() => {
        let cancelled = false;
        const request = { data, selected, today };
        const update = (progress: number, stage: 'data' | 'history' | 'metrics' | 'charts') => {
            if (!cancelled) setState({ ...request, status: 'loading', progress, stage });
        };
        const run = async <T,>(steps: Generator<number, T>) => {
            let deadline = performance.now() + 8;
            let step = withWorkflowReadCache(() => steps.next());
            while (!step.done) {
                if (cancelled) { throw new Error('Cancelled'); }
                if (performance.now() >= deadline) { await paint(); deadline = performance.now() + 8; }
                step = withWorkflowReadCache(() => steps.next());
            }
            return step.value;
        };
        void (async () => {
            try {
                update(0, 'data');
                await paint();
                if (cancelled) return;
                let base = cache.current?.data === data ? cache.current.base : null;
                if (!base) {
                    const scopes = await run(sprintStartWorkitemSteps(data, new Map((data.extensions.sprintResults?.closures || []).map(closure => [closure.sprintId, closure.closedAt]))));
                    update(25, 'metrics'); await paint();
                    if (cancelled) return;
                    const analytics = allSprintAnalytics(data, scopes);
                    update(50, 'history'); await paint();
                    if (cancelled) return;
                    const execution = await run(sprintExecutionSteps(data));
                    base = { scopes, analytics, execution };
                    if (cancelled) return;
                    cache.current = { data, base };
                }
                update(75, 'charts'); await paint();
                if (cancelled) return;
                const burndown = selected ? await run(sprintBurndownSteps(data, selected, today)) : { points: [], added: null, removed: null, contexts: new Map<number, BoardData>() };
                update(100, 'charts'); await paint();
                if (!cancelled) setState({ ...request, status: 'ready', result: { ...base, burndown } });
            } catch (error) {
                if (!cancelled) setState({ ...request, status: 'error', message: formatErrorMessage(error) });
            }
        })();
        return () => { cancelled = true; };
    }, [data, selected, today, attempt]);
    const current = state?.data === data && state.selected === selected && state.today === today ? state : null;
    return { state: current, retry: () => setAttempt(value => value + 1) };
}
