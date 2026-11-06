const paths = {
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
    columns: 'M2 2h12v12H2zM6 2v12M10 2v12',
    plus: 'M8 2v12M2 8h12',
    sort: 'M4 2v12M1 5l3-3 3 3M12 14V2M9 11l3 3 3-3'
};

export function WorkspaceIcon({ name }: { name: keyof typeof paths }) {
    return <svg className="workspace-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
