export function SprintAnalyticsLoading({ progress, message }: { progress?: number; message: string }) {
    return <div className="sprint-analytics-loading" role="status" aria-live="polite" aria-busy="true">
        <div className="sprint-loading-circle" role="progressbar" aria-label={message} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" /><circle cx="50" cy="50" r="44" pathLength="100" strokeDasharray="70 30" /></svg>
            {progress !== undefined && <strong>{progress}%</strong>}
        </div><p>{message}</p>
    </div>;
}
