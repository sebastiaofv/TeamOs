// THROWAWAY UI PROTOTYPE: compare table, cards and intervention-first dashboards
// on the existing / route with ?prototype=dashboard&variant=A|B|C.
// All projects and interactions below are illustrative, in-memory fixtures.
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import './dashboard-prototype.css';

type Variant = 'A' | 'B' | 'C';
type MetricKind = 'intervention' | 'blocked' | 'overdue' | 'upcoming';
type Metric = { kind: MetricKind; projectId: string };
type DemoTask = {
    id: string; projectId: string; title: string; status: number;
    assignee: string; blocked: boolean; reason: string; due: number | null;
};
type DemoMilestone = { id: string; projectId: string; title: string; due: number; milestone: true };
type DemoProject = { id: string; name: string; color: string; counts: number[]; description: string };
type Detail = DemoTask | DemoMilestone;

const variants: Variant[] = ['A', 'B', 'C'];
const variantNames = { A: 'Visão analítica', B: 'Cartões de projeto', C: 'Foco na intervenção' };
const variantDescriptions = {
    A: 'Comparar projetos, lado a lado, numa leitura compacta.',
    B: 'Perceber cada projeto como uma unidade, com mais espaço visual.',
    C: 'Começar pelo trabalho que precisa de atenção e pelos próximos prazos.'
};
const metricNames = { intervention: 'Precisam de intervenção', blocked: 'Tarefas bloqueadas', overdue: 'Tarefas atrasadas', upcoming: 'Próximos prazos' };
const statuses = ['Backlog', 'To do', 'In progress', 'Done'];
const projects: DemoProject[] = [
    { id: 'portal', name: 'Portal do Cliente', color: '#3983d8', counts: [5, 7, 6, 12], description: 'Experiência digital e serviços ao cliente' },
    { id: 'migration', name: 'Migração de Dados', color: '#9672cf', counts: [1, 2, 2, 15], description: 'Consolidação e qualidade da informação' },
    { id: 'automation', name: 'Automação Operacional', color: '#389889', counts: [2, 3, 3, 10], description: 'Simplificação dos processos internos' },
    { id: 'onboarding', name: 'Kit de Onboarding', color: '#c28b34', counts: [1, 2, 1, 8], description: 'Integração de novos elementos da equipa' },
    { id: 'ideas', name: 'Laboratório de Ideias', color: '#8894a4', counts: [0, 0, 0, 0], description: 'Projeto aberto, ainda sem tarefas' }
];

const examples: Record<string, Partial<DemoTask>[]> = {
    'portal-1': [
        { title: 'Validar integração com o CRM', blocked: true, reason: 'A aguardar credenciais da equipa de integração.', due: -2, assignee: 'Ana Martins' },
        { title: 'Aprovar os fluxos de autenticação', blocked: true, reason: 'Falta a revisão dos requisitos de segurança.', due: -1, assignee: 'Pedro Costa' },
        { title: 'Rever o contrato da API', blocked: true, reason: 'Dependência da versão final da API externa.', due: 3, assignee: 'Rita Santos' },
        { title: 'Fechar os critérios de aceitação', due: -4, assignee: 'Ana Martins' }
    ],
    'portal-2': [
        { title: 'Preparar testes de acessibilidade', due: -1, assignee: 'Rita Santos' },
        { title: 'Entregar protótipo da área pessoal', due: 0, assignee: 'Pedro Costa' },
        { title: 'Rever mensagens de erro', due: 5, assignee: 'Ana Martins' }
    ],
    'migration-1': [{ title: 'Obter exportação do sistema legado', blocked: true, reason: 'A aguardar acesso à base de dados de origem.', due: -3, assignee: 'João Silva' }],
    'migration-2': [
        { title: 'Validar o mapeamento de campos', due: -2, assignee: 'João Silva' },
        { title: 'Executar migração de ensaio', due: 4, assignee: 'Rita Santos' }
    ],
    'automation-1': [{ title: 'Confirmar regras de aprovação', blocked: true, reason: 'É necessária a validação do responsável do processo.', due: -1, assignee: 'Pedro Costa' }],
    'automation-2': [{ title: 'Demonstrar o fluxo automatizado', due: 2, assignee: 'Ana Martins' }],
    'onboarding-2': [{ title: 'Rever o guia de boas-vindas', due: 1, assignee: 'Rita Santos' }]
};
const tasks: DemoTask[] = projects.flatMap(project => project.counts.flatMap((count, status) =>
    Array.from({ length: count }, (_, index) => ({
        id: `${project.id}-${status}-${index}`, projectId: project.id,
        title: `${['Explorar requisito', 'Preparar entrega', 'Desenvolver melhoria', 'Concluir entrega'][status]} ${index + 1}`,
        status, assignee: ['Ana Martins', 'Pedro Costa', 'Rita Santos'][index % 3],
        blocked: false, reason: '', due: null,
        ...examples[`${project.id}-${status}`]?.[index]
    }))
));
const milestones: DemoMilestone[] = [
    { id: 'm1', projectId: 'portal', title: 'Validação com os utilizadores', due: 2, milestone: true },
    { id: 'm2', projectId: 'migration', title: 'Ensaio de migração', due: 6, milestone: true },
    { id: 'm3', projectId: 'automation', title: 'Piloto operacional', due: 5, milestone: true },
    { id: 'm4', projectId: 'ideas', title: 'Sessão de descoberta', due: 4, milestone: true }
];

function projectOf(id: string) { return projects.find(project => project.id === id)!; }
function inScope(projectId: string, scope: string) { return !scope || projectId === scope; }
function openTasks(scope: string) { return tasks.filter(task => inScope(task.projectId, scope) && task.status !== 3); }
function matchingTasks(kind: MetricKind, scope: string) {
    return openTasks(scope).filter(task => {
        const overdue = task.due !== null && task.due < 0;
        return kind === 'blocked' ? task.blocked : kind === 'overdue' ? overdue : task.blocked || overdue;
    });
}
function deadlines(scope: string): Detail[] {
    return [
        ...openTasks(scope).filter(task => task.due !== null && task.due >= 0 && task.due <= 6),
        ...milestones.filter(item => inScope(item.projectId, scope) && item.due >= 0 && item.due <= 6)
    ].sort((a, b) => (a.due ?? 0) - (b.due ?? 0));
}
function countsFor(scope: string) {
    return statuses.map((_, status) => tasks.filter(task => inScope(task.projectId, scope) && task.status === status).length);
}
function sum(counts: number[]) { return counts.reduce((a, b) => a + b, 0); }
function percent(counts: number[]) { return sum(counts) ? Math.round(counts[3] / sum(counts) * 100) : null; }
function dueLabel(offset: number | null) {
    if (offset === null) return 'Sem prazo';
    if (offset < 0) return `${-offset} dia${offset === -1 ? '' : 's'} de atraso`;
    if (offset === 0) return 'Hoje';
    if (offset === 1) return 'Amanhã';
    return `Em ${offset} dias`;
}
function dateLabel(offset: number) {
    const date = new Date(2026, 9, 9 + offset);
    return date.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
}
function readLocation() {
    const params = new URLSearchParams(location.search);
    const key = params.get('variant');
    return {
        variant: variants.find(variant => variant === key) ?? 'A',
        scope: projects.some(project => project.id === params.get('project')) ? params.get('project')! : ''
    };
}
function writeLocation(variant: Variant, scope: string) {
    const url = new URL(location.href);
    url.searchParams.set('variant', variant);
    if (scope) url.searchParams.set('project', scope);
    else url.searchParams.delete('project');
    history.replaceState(null, '', url);
}

function Distribution({ counts, legend = false }: { counts: number[]; legend?: boolean }) {
    return <div className="dp-distribution">
        <div className="dp-stacked" aria-label={counts.map((count, index) => `${statuses[index]}: ${count}`).join(', ')}>
            {counts.map((count, index) => <span key={index} className={`dp-status-${index}`} style={{ flex: count }} />)}
        </div>
        {legend && <div className="dp-legend">{counts.map((count, index) => <span key={index}><i className={`dp-status-${index}`} />{statuses[index]} <b>{count}</b></span>)}</div>}
    </div>;
}

function TaskList({ items, onDetail, showProject = false }: { items: Detail[]; onDetail: (item: Detail) => void; showProject?: boolean }) {
    if (!items.length) return <div className="dp-empty"><span>✓</span><p>Nenhum item a apresentar neste âmbito.</p></div>;
    return <div className="dp-task-list">{items.map(item => {
        const milestone = 'milestone' in item;
        const project = projectOf(item.projectId);
        return <button className="dp-task-row" key={item.id} onClick={() => onDetail(item)}>
            <span className={`dp-task-symbol ${milestone ? 'is-milestone' : ''}`}>{milestone ? '◇' : '□'}</span>
            <span className="dp-task-copy"><strong>{item.title}</strong>
                <span>{showProject && <><i className="dp-project-dot" style={{ background: project.color }} />{project.name} · </>}{milestone ? 'Milestone' : `Tarefa · ${item.assignee}`}</span>
                {!milestone && item.blocked && <small className="dp-blocker">{item.reason}</small>}
            </span>
            <span className="dp-task-meta">
                {!milestone && <span className="dp-task-flags">{item.blocked && <i className="dp-tag dp-amber">Bloqueada</i>}{item.due !== null && item.due < 0 && <i className="dp-tag dp-red">Atrasada</i>}</span>}
                <span className={item.due !== null && item.due < 0 ? 'dp-red-text' : ''}>{dueLabel(item.due)}</span>
            </span>
            <span className="dp-row-arrow">↗</span>
        </button>;
    })}</div>;
}

type ViewProps = {
    scope: string; onScope: (scope: string) => void;
    onMetric: (kind: MetricKind, projectId?: string) => void;
    onDetail: (item: Detail) => void;
};

function Metrics({ scope, onMetric }: Pick<ViewProps, 'scope' | 'onMetric'>) {
    const counts = countsFor(scope);
    const progress = percent(counts);
    return <div className="dp-metrics">
        <div className="dp-metric dp-progress-metric"><span>Progresso {scope ? 'do projeto' : 'global'}</span><strong>{progress === null ? '—' : `${progress}%`}</strong><small>{sum(counts) ? `${counts[3]} de ${sum(counts)} tarefas concluídas` : 'Sem tarefas'}</small><Distribution counts={counts} /></div>
        {(['intervention', 'blocked', 'overdue', 'upcoming'] as MetricKind[]).map(kind => {
            const count = kind === 'upcoming' ? deadlines(scope).length : matchingTasks(kind, scope).length;
            return <button className={`dp-metric dp-metric-${kind}`} key={kind} onClick={() => onMetric(kind)} aria-label={`${metricNames[kind]}: ${count}`}>
                <span>{metricNames[kind]} <i>↗</i></span><strong>{count}</strong>
                <small>{kind === 'intervention' ? 'Tarefas distintas' : kind === 'blocked' ? 'Com dependências por resolver' : kind === 'overdue' ? 'Prazo anterior a hoje' : 'Hoje e os próximos 6 dias'}</small>
            </button>;
        })}
    </div>;
}

function DeadlinesPanel({ scope, onDetail }: Pick<ViewProps, 'scope' | 'onDetail'>) {
    return <section className="dp-panel"><div className="dp-panel-heading"><h3>Próximos prazos</h3><span className="dp-muted">9–15 out</span></div><TaskList items={deadlines(scope)} onDetail={onDetail} showProject={!scope} /></section>;
}

function InterventionPanels({ scope, onDetail }: Pick<ViewProps, 'scope' | 'onDetail'>) {
    return <>{(['blocked', 'overdue'] as const).map(kind => <section className="dp-panel" key={kind}>
        <div className="dp-panel-heading"><h3>{metricNames[kind]}</h3><span className="dp-count">{matchingTasks(kind, scope).length}</span></div>
        <TaskList items={matchingTasks(kind, scope)} onDetail={onDetail} />
    </section>)}</>;
}

function VariantA(props: ViewProps) {
    const { scope, onScope, onMetric, onDetail } = props;
    const ranked = [...projects].sort((a, b) => matchingTasks('intervention', b.id).length - matchingTasks('intervention', a.id).length || a.name.localeCompare(b.name));
    if (scope) return <div className="dp-two-column">
        <div><InterventionPanels scope={scope} onDetail={onDetail} /></div>
        <div><section className="dp-panel dp-state-panel"><div className="dp-panel-heading"><h3>Distribuição do trabalho</h3><span className="dp-muted">{sum(countsFor(scope))} tarefas</span></div><Distribution counts={countsFor(scope)} legend /></section><DeadlinesPanel scope={scope} onDetail={onDetail} /></div>
    </div>;
    return <>
        <section className="dp-panel dp-project-table"><div className="dp-panel-heading"><h3>Projetos abertos <span className="dp-count">{projects.length}</span></h3><span className="dp-muted">Ordenados por necessidade de intervenção ↓</span></div>
            <div className="dp-table-scroll"><table><thead><tr><th>Projeto</th><th>Progresso</th><th>Distribuição por estado</th><th>Bloqueadas</th><th>Atrasadas</th><th>Próximo prazo</th><th /></tr></thead><tbody>{ranked.map(project => {
                const upcoming = deadlines(project.id)[0];
                return <tr key={project.id}>
                    <td><button className="dp-project-link" onClick={() => onScope(project.id)}><i className="dp-project-dot" style={{ background: project.color }} /><span><strong>{project.name}</strong><small>{sum(project.counts)} tarefas · {matchingTasks('intervention', project.id).length} precisam de intervenção</small></span></button></td>
                    <td><strong className="dp-progress-number">{percent(project.counts) === null ? '—' : `${percent(project.counts)}%`}</strong><small className="dp-muted">{sum(project.counts) ? `${project.counts[3]}/${sum(project.counts)} concluídas` : 'Sem tarefas'}</small></td>
                    <td><Distribution counts={project.counts} /><div className="dp-mini-counts">{project.counts.map((count, i) => <span key={i} title={statuses[i]}>{count}</span>)}</div></td>
                    <td><button className={`dp-number-pill ${matchingTasks('blocked', project.id).length ? 'dp-amber' : ''}`} onClick={() => onMetric('blocked', project.id)} aria-label={`Bloqueadas em ${project.name}: ${matchingTasks('blocked', project.id).length}`}>{matchingTasks('blocked', project.id).length}</button></td>
                    <td><button className={`dp-number-pill ${matchingTasks('overdue', project.id).length ? 'dp-red' : ''}`} onClick={() => onMetric('overdue', project.id)} aria-label={`Atrasadas em ${project.name}: ${matchingTasks('overdue', project.id).length}`}>{matchingTasks('overdue', project.id).length}</button></td>
                    <td>{upcoming ? <button className="dp-deadline-link" onClick={() => onDetail(upcoming)}><strong>{dueLabel(upcoming.due)}</strong><span>{upcoming.title}</span></button> : <span className="dp-muted">Sem prazos próximos</span>}</td>
                    <td><button className="dp-icon-button" onClick={() => onScope(project.id)} aria-label={`Abrir dashboard de ${project.name}`}>→</button></td>
                </tr>;
            })}</tbody></table></div>
            <div className="dp-table-footer"><Distribution counts={[0, 0, 0, 0]} legend /><span>Os filtros do Board não alteram estes indicadores.</span></div>
        </section>
        <DeadlinesPanel scope={scope} onDetail={onDetail} />
    </>;
}

function VariantB({ scope, onScope, onMetric, onDetail }: ViewProps) {
    const counts = countsFor(scope);
    if (scope) return <div className="dp-card-detail">
        <section className="dp-panel dp-gauge-panel"><h3>Progresso do projeto</h3><div className="dp-gauge" style={{ '--progress': `${percent(counts) ?? 0}%` } as CSSProperties}><div><strong>{percent(counts) === null ? '—' : `${percent(counts)}%`}</strong><span>{sum(counts) ? 'concluído' : 'Sem tarefas'}</span></div></div><p>{counts[3]} de {sum(counts)} tarefas concluídas</p><Distribution counts={counts} legend /></section>
        <div><InterventionPanels scope={scope} onDetail={onDetail} /><DeadlinesPanel scope={scope} onDetail={onDetail} /></div>
    </div>;
    return <>
        <div className="dp-section-heading"><h3>O portefólio, projeto a projeto</h3><span className="dp-muted">Clique num cartão para aprofundar</span></div>
        <div className="dp-project-grid">{[...projects].sort((a, b) => matchingTasks('intervention', b.id).length - matchingTasks('intervention', a.id).length).map(project => {
            const progress = percent(project.counts);
            const intervention = matchingTasks('intervention', project.id).length;
            const next = deadlines(project.id)[0];
            return <article className="dp-project-card" key={project.id} style={{ '--project-color': project.color } as CSSProperties}>
                <div className="dp-card-top"><span className="dp-project-avatar">{project.name.split(' ').map(word => word[0]).slice(0, 2).join('')}</span><span className={`dp-tag ${intervention ? 'dp-amber' : 'dp-neutral'}`}>{intervention ? `${intervention} precisam de intervenção` : 'Sem bloqueios ou atrasos'}</span></div>
                <button className="dp-card-title" onClick={() => onScope(project.id)}><h3>{project.name}</h3><span>↗</span></button><p>{project.description}</p>
                <div className="dp-card-progress"><strong>{progress === null ? '—' : `${progress}%`}</strong><span>{sum(project.counts) ? `${project.counts[3]} de ${sum(project.counts)} concluídas` : 'Sem tarefas'}</span></div><Distribution counts={project.counts} legend />
                <div className="dp-card-signals"><button onClick={() => onMetric('blocked', project.id)}><b className="dp-amber-text">{matchingTasks('blocked', project.id).length}</b> bloqueadas ↗</button><button onClick={() => onMetric('overdue', project.id)}><b className="dp-red-text">{matchingTasks('overdue', project.id).length}</b> atrasadas ↗</button></div>
                <div className="dp-card-next"><span>PRÓXIMO PRAZO</span>{next ? <button onClick={() => onDetail(next)}><strong>{next.title}</strong><small>{dueLabel(next.due)} · {dateLabel(next.due ?? 0)}</small></button> : <p>Sem prazos próximos</p>}</div>
            </article>;
        })}</div>
    </>;
}

function VariantC({ scope, onScope, onMetric, onDetail }: ViewProps) {
    return <div className="dp-workspace">
        <aside className="dp-workspace-sidebar"><span className="dp-eyebrow">ÂMBITO DO DASHBOARD</span><button className={!scope ? 'is-active' : ''} onClick={() => onScope('')}><span>Todos os projetos</span><b>{matchingTasks('intervention', '').length}</b></button>{projects.map(project => <button key={project.id} className={scope === project.id ? 'is-active' : ''} onClick={() => onScope(project.id)}><i className="dp-project-dot" style={{ background: project.color }} /><span>{project.name}</span><b>{matchingTasks('intervention', project.id).length}</b></button>)}<p>Os números indicam tarefas distintas que precisam de intervenção.</p><div className="dp-sidebar-progress"><h3>Distribuição do trabalho</h3><Distribution counts={countsFor(scope)} legend /></div></aside>
        {scope ? <div className="dp-intervention-feed"><InterventionPanels scope={scope} onDetail={onDetail} /></div> : <section className="dp-panel dp-intervention-feed"><div className="dp-panel-heading"><div><span className="dp-eyebrow">ONDE CONCENTRAR A ATENÇÃO</span><h3>Tarefas que precisam de intervenção</h3></div><span className="dp-count">{matchingTasks('intervention', scope).length}</span></div>
            <div className="dp-feed-tabs"><button className="is-active" onClick={() => onMetric('intervention')}>Todas · {matchingTasks('intervention', scope).length}</button><button onClick={() => onMetric('blocked')}>Bloqueadas · {matchingTasks('blocked', scope).length}</button><button onClick={() => onMetric('overdue')}>Atrasadas · {matchingTasks('overdue', scope).length}</button></div>
            <TaskList items={matchingTasks('intervention', scope)} onDetail={onDetail} showProject={!scope} />
        </section>}
        <section className="dp-panel dp-agenda"><div className="dp-panel-heading"><div><span className="dp-eyebrow">9–15 OUTUBRO</span><h3>Próximos prazos</h3></div></div>{deadlines(scope).map(item => <button className="dp-agenda-item" key={item.id} onClick={() => onDetail(item)}><span className="dp-agenda-date"><b>{9 + (item.due ?? 0)}</b>OUT</span><span><small>{'milestone' in item ? '◇ Milestone' : '□ Tarefa'} · {dueLabel(item.due)}</small><strong>{item.title}</strong><span><i className="dp-project-dot" style={{ background: projectOf(item.projectId).color }} />{projectOf(item.projectId).name}</span></span></button>)}{!deadlines(scope).length && <div className="dp-empty">Sem prazos próximos.</div>}</section>
    </div>;
}

function DetailDialog({ item, onClose }: { item: Detail | null; onClose: () => void }) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        if (item && !ref.current?.open) ref.current?.showModal();
        if (!item && ref.current?.open) ref.current.close();
    }, [item]);
    return <dialog className="dp-detail-dialog" ref={ref} onClose={onClose} aria-label="Detalhe do item de exemplo">
        {item && <><div className="dp-panel-heading"><span className="dp-eyebrow">{'milestone' in item ? 'MILESTONE · ROADMAP' : 'DETALHE DA TAREFA'} · EXEMPLO</span><button className="dp-icon-button" onClick={onClose} aria-label="Fechar detalhe">×</button></div><div className="dp-dialog-content"><span className="dp-project-label"><i className="dp-project-dot" style={{ background: projectOf(item.projectId).color }} />{projectOf(item.projectId).name}</span><h2>{item.title}</h2><dl><div><dt>Prazo</dt><dd>{item.due === null ? 'Sem prazo' : `${dateLabel(item.due)} · ${dueLabel(item.due)}`}</dd></div>{!('milestone' in item) && <><div><dt>Estado</dt><dd>{statuses[item.status]}</dd></div><div><dt>Responsável</dt><dd>{item.assignee}</dd></div></>}</dl>{!('milestone' in item) && item.blocked && <div className="dp-blocker-box"><strong>Motivo do bloqueio</strong><p>{item.reason}</p></div>}<p className="dp-muted">Detalhe simulado para avaliar a navegação do dashboard.</p></div><div className="dp-dialog-footer"><button className="btn" onClick={onClose}>Voltar ao dashboard</button></div></>}
    </dialog>;
}

export function DashboardPrototype() {
    const [view, setView] = useState(readLocation);
    const [metric, setMetric] = useState<Metric | null>(null);
    const [detail, setDetail] = useState<Detail | null>(null);
    const [dark, setDark] = useState(false);
    const [empty, setEmpty] = useState(() => new URLSearchParams(location.search).get('empty') === '1');
    const panel = useRef<HTMLElement>(null);
    const { variant, scope } = view;
    const project = !empty && scope ? projectOf(scope) : null;
    function onScope(nextScope: string) {
        setView({ variant, scope: nextScope });
        writeLocation(variant, nextScope);
        setMetric(null);
        setDetail(null);
    }
    function onMetric(kind: MetricKind, projectId = scope) { setMetric({ kind, projectId }); }
    function onVariant(nextVariant: Variant) {
        setView({ variant: nextVariant, scope });
        writeLocation(nextVariant, scope);
    }
    function onEmpty(nextEmpty: boolean) {
        onScope('');
        setEmpty(nextEmpty);
        const url = new URL(location.href);
        if (nextEmpty) url.searchParams.set('empty', '1');
        else url.searchParams.delete('empty');
        history.replaceState(null, '', url);
    }
    useEffect(() => {
        function keydown(event: KeyboardEvent) {
            if ((event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"], dialog')) || event.altKey || event.ctrlKey || event.metaKey) return;
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                const nextVariant = variants[(variants.indexOf(variant) + (event.key === 'ArrowRight' ? 1 : 2)) % 3];
                setView({ variant: nextVariant, scope });
                writeLocation(nextVariant, scope);
            }
        }
        function popstate() { setView(readLocation()); setEmpty(new URLSearchParams(location.search).get('empty') === '1'); setMetric(null); setDetail(null); }
        window.addEventListener('keydown', keydown);
        window.addEventListener('popstate', popstate);
        return () => { window.removeEventListener('keydown', keydown); window.removeEventListener('popstate', popstate); };
    }, [variant, scope]);
    useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
    useEffect(() => { if (metric) panel.current?.focus(); }, [metric]);
    const props: ViewProps = { scope, onScope, onMetric, onDetail: setDetail };
    const state = { variant, scope: empty ? 'Sem projetos' : project?.name ?? 'Todos os projetos', simulatedDate: '2026-10-09', indicator: metric, detail: detail?.id ?? null, counts: empty ? [0, 0, 0, 0] : countsFor(scope), blocked: empty ? 0 : matchingTasks('blocked', scope).length, overdue: empty ? 0 : matchingTasks('overdue', scope).length, intervention: empty ? 0 : matchingTasks('intervention', scope).length, upcoming: empty ? 0 : deadlines(scope).length, theme: dark ? 'dark' : 'light' };
    return <>
        <header className="header dp-shell-header"><h1 className="app-title">TeamOS → Kanban</h1><div className="header-actions"><span className="dp-prototype-label">MOCKUP · DADOS DE EXEMPLO</span><button className="btn" onClick={() => setDark(!dark)} aria-label={dark ? 'Ativar tema claro' : 'Ativar tema escuro'}>{dark ? '☀ Claro' : '☾ Escuro'}</button><button className="btn" disabled>Importar projetos</button><button className="btn btn-primary" disabled>Novo projeto</button></div></header>
        <main className={`dashboard-prototype dp-variant-${variant}`}>
            <div className="portfolio-toolbar"><span className="dp-toolbar-note">Visão de acompanhamento · totais sem filtros</span><div className="portfolio-view-toggle" aria-label="Vista"><button className="btn active" aria-pressed="true">Dashboard</button>{['Board', 'Roadmap', 'Calendar', 'Planner'].map(name => <button className="btn" disabled key={name}>{name}</button>)}</div></div>
            <nav className="portfolio-chips" aria-label="Seleção do projeto">{empty ? <span className="dp-muted">Sem projetos carregados</span> : <><button className={`portfolio-chip ${!scope ? 'active' : ''}`} aria-pressed={!scope} onClick={() => onScope('')}>Todos <span className="dp-chip-count">{projects.length}</span></button>{projects.map(item => <button className={`portfolio-chip ${scope === item.id ? 'active' : ''}`} key={item.id} aria-pressed={scope === item.id} onClick={() => onScope(item.id)}><i className="dp-project-dot" style={{ background: item.color }} />{item.name}</button>)}</>}</nav>
            <div className="dp-content"><div className="dp-page-heading"><div><div className="dp-breadcrumb"><button onClick={() => onScope('')}>Portefólio</button><span>/</span><span>{project?.name ?? 'Visão global'}</span></div><h2>{project ? <><i className="dp-project-dot" style={{ background: project.color }} />{project.name}</> : 'Dashboard do portefólio'}</h2><p>{empty ? 'Nenhum projeto carregado' : project?.description ?? `${projects.length} projetos abertos · ${projects.filter(item => matchingTasks('intervention', item.id).length).length} com tarefas que precisam de intervenção`}</p></div><div className="dp-date"><span className="dp-live-dot" />Estado atual <strong>9 outubro 2026</strong><small>Dados ilustrativos</small></div></div>
                {empty ? <section className="dp-panel dp-no-projects"><span aria-hidden="true">▦</span><h3>Abra projetos para acompanhar o portefólio</h3><p>O dashboard agrega os projetos que tiver carregados na aplicação.</p><button className="btn btn-primary" onClick={() => onEmpty(false)}>Abrir projetos de exemplo</button></section> : <>
                <Metrics scope={scope} onMetric={onMetric} />
                {metric && <section ref={panel} tabIndex={-1} className="dp-panel dp-drilldown" aria-label="Tarefas correspondentes ao indicador"><div className="dp-panel-heading"><div><span className="dp-eyebrow">DETALHE DO INDICADOR · {metric.projectId ? projectOf(metric.projectId).name : 'TODOS OS PROJETOS'}</span><h3>{metricNames[metric.kind]}</h3></div><button className="btn" onClick={() => setMetric(null)}>Fechar lista ×</button></div><TaskList items={metric.kind === 'upcoming' ? deadlines(metric.projectId) : matchingTasks(metric.kind, metric.projectId)} onDetail={setDetail} showProject={!metric.projectId} /></section>}
                {variant === 'A' ? <VariantA {...props} /> : variant === 'B' ? <VariantB {...props} /> : <VariantC {...props} />}
                <p className="dp-footnote">Tarefas arquivadas excluídas. Uma tarefa bloqueada e atrasada conta uma vez no total de intervenção. Milestones não determinam atrasos.</p>
                </>}
            </div>
            <DetailDialog item={detail} onClose={() => setDetail(null)} />
        </main>
        {import.meta.env.DEV && <div className="dp-switcher">
            <div className="dp-switcher-top">
                <span className="dp-switcher-label">PROPOSTA</span>
                <button aria-label="Proposta anterior" onClick={() => onVariant(variants[(variants.indexOf(variant) + 2) % 3])}>←</button>
                {variants.map(key => <button key={key} className={variant === key ? 'is-active' : ''} aria-pressed={variant === key} onClick={() => onVariant(key)}>{key} <span>{variantNames[key]}</span></button>)}
                <button aria-label="Proposta seguinte" onClick={() => onVariant(variants[(variants.indexOf(variant) + 1) % 3])}>→</button>
                <button aria-label="Pré-visualizar sem projetos" aria-pressed={empty} className={empty ? 'is-active' : ''} onClick={() => onEmpty(!empty)}>∅ <span>Sem projetos</span></button>
                <details><summary>Estado</summary><pre>{JSON.stringify(state, null, 2)}</pre></details>
            </div>
            <div className="dp-switcher-caption" aria-live="polite">{variantDescriptions[variant]} <span>· {empty ? 'Sem projetos' : project?.name ?? 'Todos os projetos'}{metric ? ` · ${metricNames[metric.kind]}` : ''}{detail ? ' · Detalhe aberto' : ''}</span></div>
        </div>}
    </>;
}
