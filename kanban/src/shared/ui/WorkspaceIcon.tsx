const paths = {
    progress: 'M8 1a7 7 0 1 1-7 7M8 4a4 4 0 1 1-4 4M1 1l7 7M1 1v4M1 1h4',
    phases: 'M3 8h10M5 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0M15 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
    check: 'M3 8l3 3 7-7',
    alert: 'M8 1 15 14H1zM8 6v4M8 12h.01',
    chart: 'M2 1v13h13M5 10V7M9 10V4M13 10V2',
    settings: 'M2 4h12M2 12h12M5 2v4M11 10v4',
    info: 'M8 7v5M8 4h.01M15 8a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
    lock: 'M4 7V4a4 4 0 0 1 8 0v3M2 7h12v8H2zM8 10v2',
    eye: 'M1 8s2-5 7-5 7 5 7 5-2 5-7 5-7-5-7-5M10 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
    arrowRight: 'M2 8h12M9 3l5 5-5 5',
    play: 'M4 2l10 6-10 6z',
    finish: 'M3 15V1M3 2h10v8H3M3 6h10M8 2v8',
    search: 'M10.5 10.5 15 15M12 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
    keyboard: 'M1 4h14v9H1zM4 7h.01M7 7h.01M10 7h.01M13 7h.01M4 10h.01M6.5 10h4M13 10h.01',
    folder: 'M1 4h5l2 2h7v8H1zM1 4V2h5l2 2h6v2',
    board: 'M2 2h12v12H2zM6 2v12M10 2v12',
    dashboard: 'M2 2h5v5H2zM10 2h5v5h-5zM2 10h5v5H2zM10 10h5v5h-5z',
    table: 'M2 2h12v12H2zM2 6h12M2 10h12M6 2v12',
    roadmap: 'M3 3h10v3H3zM5 10h8v3H5zM3 6v7h2M8 6v4',
    control: 'M8 1 14 4v4c0 4-6 7-6 7S2 12 2 8V4zM5 8l2 2 4-4',
    planner: 'M2 3h12v12H2zM5 1v4M11 1v4M2 7h12M5 10h2M9 10h2',
    export: 'M8 1v9M4 6l4 4 4-4M2 10v5h12v-5',
    chevronDown: 'M4 6l4 4 4-4',
    columns: 'M2 2h12v12H2zM6 2v12M10 2v12',
    testing: 'M6 1h4M7 1v5l-5 7a1 1 0 0 0 1 2h10a1 1 0 0 0 1-2L9 6V1M5 10h6',
    runner: 'M11.5 2a1 1 0 1 1-2 0 1 1 0 0 1 2 0M2 7l3-2 3 1 2 3 3 1M8 6l-2 4 3 2-1 3M6 10l-2 3H1',
    story: 'M3 1h10v14l-5-3-5 3zM6 4h4M6 7h4',
    plus: 'M8 2v12M2 8h12',
    sort: 'M4 2v12M1 5l3-3 3 3M12 14V2M9 11l3 3 3-3'
};

export function WorkspaceIcon({ name }: { name: keyof typeof paths }) {
    return <svg className="workspace-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} />{name === 'finish' && <path d="M3 2h5v4H3zM8 6h5v4H8z" fill="currentColor" stroke="none" />}</svg>;
}
