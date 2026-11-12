import { createServer } from 'vite';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { epics, foundations, deliveries, issueNotes } from './catalog.mjs';

// This is a scenario clock, confined to the generator process. All native commands see
// the scheduled instant, so their history, Sprint credits and acceptance stay coherent.
const RealDate = Date;
let clock = '2026-06-01T08:00:00.000Z';
globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return RealDate.parse(clock); }
};
const evidence = JSON.parse(readFileSync(new URL('./evidence.json', import.meta.url), 'utf8'));
const output = 'test-board/teamos-development';
const asOf = evidence.asOf;
const server = await createServer({ server: { middlewareMode: true } });
try {
    const load = (name) => server.ssrLoadModule(`/src/domain/${name}.ts`);
    const [board, task, timeline, serialize, format, history, sprints, comments, control, workflow, automation] = await Promise.all(
        ['board','task','timeline','serialize','projectFormat','projectHistoryFormat','sprintResults','comments','projectControl','workflow','hierarchyAutomations'].map(load));
    const data = board.createEmptyProjectData('— Desenvolvimento da Aplicação', 'TOS');
    Object.assign(data.meta, { createdAt: clock, updatedAt: clock, revision: 1 });
    Object.assign(data.extensions.project, { id: 'teamos-development-example-91', productName: 'TeamOS', status: 'active',
        description: `História do TeamOS e demonstração funcional. Fontes públicas: issues, comentários, PRs e commits até ${asOf}. Base: ${evidence.mainCommit}. ATENÇÃO: cronologia de junho–agosto, Sprints, estimativas, atribuições, aceitação e conversas locais são (fictício). O Git contém commits desde fevereiro; as datas reais das fontes não foram alteradas. Detalhes: README.md e SOURCES.md na pasta deste projeto.`,
        members: [{ id: 'mario', name: 'Mário' }, { id: 'sebastiao', name: 'Sebastião' }],
        tags: ['feature','bug','performance','persistência','planeamento','colaboração','documentação','interface','infraestrutura','fictício','reconstrução','github','planeado'] });
    data.extensions.functionalWorkflow = workflow.defaultWorkflow();
    data.extensions.workflow = workflow.defaultWorkflow();
    data.extensions.workflowTypes = { version: 1, functional: ['epic','story','bug'] };
    data.extensions.hierarchyAutomations = automation.defaultHierarchyAutomations();
    Object.assign(data.extensions.hierarchyAutomations.rules, { startParent: 'automatic', prepareTesting: 'automatic', completeEpic: 'confirm', cancelParent: 'off', sprintUnfinishedTasks: 'off' });
    data.extensions.workitemAutomation = { version: 1, start: { from: ['to-do'], to: 'doing' }, finish: { from: ['doing'], to: 'ready-to-test' } };
    const phase = (id, title, startDate, endDate, parentId, color = '#475569') => ({ id, title, startDate, endDate, ...(parentId ? { parentId } : {}), color, objective: 'Planeamento reconstruído para demonstração (fictício); consultar as fontes dos workitems.' });
    data.extensions.roadmap = { version: 5, phases: [
        phase('product','Evolução do TeamOS','2026-06-01','2026-12-18'),
        phase('origins','01 · Protótipo e organização diária (fictício)','2026-06-01','2026-08-28','product','#0f766e'),
        phase('prototype','Protótipo HTML (fictício)','2026-06-01','2026-06-26','origins'),
        phase('daily','Prioridades e produtividade (fictício)','2026-06-29','2026-07-17','origins'),
        phase('local-files','Persistência local inicial (fictício)','2026-07-20','2026-08-07','origins'),
        phase('react','02 · Evolução para React','2026-08-12','2026-09-25','product','#2563eb'),
        phase('react-preparation','Preparação da migração (fictício)','2026-08-12','2026-09-10','react'),
        phase('react-domain','Extração do domínio e Vite','2026-09-11','2026-09-12','react'),
        phase('react-ui','Interface React e base de entrega','2026-09-13','2026-09-25','react'),
        phase('agile','03 · Planeamento e colaboração','2026-07-02','2026-11-09','product','#7c3aed'),
        phase('planning','Calendário, Day Planner e planeamento inicial','2026-07-02','2026-10-16','agile'),
        phase('execution','Modelo Agile, Table e workflows','2026-10-17','2026-11-05','agile'),
        phase('roadmap','Roadmap hierárquico e milestones','2026-10-17','2026-10-23','agile'),
        phase('collaboration','Relações, pessoas, comentários e PRs','2026-08-04','2026-10-23','agile'),
        phase('products','Produtos e transferências','2026-10-17','2026-11-02','agile'),
        phase('sprints','Lifecycle de Sprints e analytics','2026-10-29','2026-11-05','agile'),
        phase('automations','Automatizações e revisão de transições','2026-11-05','2026-11-09','agile'),
        phase('maturity','04 · Controlo e consolidação','2026-09-25','2026-11-13','product','#b45309'),
        phase('insights','Dashboard e acompanhamento','2026-09-25','2026-11-13','maturity'),
        phase('control','Riscos, decisões e entregáveis','2026-10-17','2026-11-04','maturity'),
        phase('attachments','Anexos e previews no browser','2026-10-17','2026-11-04','maturity'),
        phase('storage','Pastas, formato v1 e concorrência','2026-11-04','2026-11-12','maturity'),
        phase('performance','Performance e grandes históricos','2026-11-05','2026-11-10','maturity'),
        phase('experience','Redesign, temas e documentação','2026-10-17','2026-11-10','maturity'),
        phase('release','05 · Demonstração e próximos desenvolvimentos','2026-11-09','2026-12-18','product','#be123c'),
        phase('example','Projeto histórico e demonstração','2026-11-09','2026-11-20','release'),
        phase('future','Backlog de produto (planeamento fictício)','2026-11-16','2026-12-18','release')
    ], milestones: [
        { id: 'prototype-ready', title: 'Protótipo utilizável (fictício)', dueDate: '2026-06-26', color: '#0f766e' },
        { id: 'react-ready', title: 'Base React concluída', dueDate: '2026-09-25', color: '#2563eb' },
        { id: 'future-release', title: 'Revisão de lançamento (fictício)', dueDate: '2026-12-18', color: '#be123c' }
    ], sprints: [] };
    const msForCatalog = (value) => RealDate.parse(value);
    const sprintDefs = [
        ['2026-09-14','2026-09-25','Base React',21], ['2026-09-28','2026-10-09','Produtividade diária',21],
        ['2026-10-12','2026-10-16','Preparação Agile',26], ['2026-10-19','2026-10-23','Tabela e colaboração',40],
        ['2026-10-26','2026-10-30','Hierarquia e produtos',34], ['2026-11-02','2026-11-06','Controlo e persistência',55],
        ['2026-11-09','2026-11-13','Estabilidade e demonstração',34], ['2026-11-16','2026-11-27','Evolução de produto',26],
        ['2026-11-30','2026-12-11','Integrações e preparação de lançamento',21]
    ].map(([startDate,endDate,title,capacity], index) => ({ id: `sprint-${index+1}`, startDate, endDate, title: `${title} (fictício)`, capacity,
        status: 'planned', goal: `Organizar ${title.toLowerCase()} com rastreabilidade. Compromisso simulado (fictício).`,
        review: '', retrospective: '' }));
    data.extensions.roadmap.sprints = structuredClone(sprintDefs);
    data.extensions.sprintCatalog = { version: 1, lastNumber: sprintDefs.length, entries: sprintDefs.map((s,index) => ({ sprintId: s.id, number: index+1, createdAt: new RealDate(Math.min(msForCatalog(s.startDate)-3*86400000,msForCatalog(asOf)-86400000)).toISOString() })) };
    // The initial roadmap is a reconstructed plan; workitems themselves are introduced over time.
    timeline.ensureBoardTimelineBaseline(data);
    const queue = []; let order = 0; let eventNumber = 0; let nextId = 0;
    const specs = []; const byKey = new Map();
    const at = (date, hour = '09:00:00') => date.includes('T') ? new RealDate(date).toISOString() : `${date}T${hour}.000Z`;
    const ms = (date) => RealDate.parse(date);
    const between = (a,b,r) => new RealDate(ms(a)+(ms(b)-ms(a))*r).toISOString();
    const enqueue = (when, run) => { if (ms(when) <= ms(asOf)) queue.push({ at: at(when), order: order++, run }); };
    const event = (input) => {
        const result = timeline.appendTimelineEvent(data, { ...input, id: `example-event-${String(++eventNumber).padStart(5,'0')}`, at: clock,
            meta: { author: 'Sebastião', ...input.meta, simulation: '(fictício) — reconstrução local; referências GitHub preservam os factos.' } });
        assert(result); data.meta.updatedAt = clock;
    };
    const snapshotEvent = (summary, kind = 'board.project.updated') => event({ kind, entityType: 'board', entityId: 'board', summary, snapshot: serialize.createBoardStateSnapshot(data) });
    const find = (id) => data.board.tasks.find((t) => t.id === id);
    const update = (id, patch) => {
        const before = structuredClone(find(id)); assert(before, `Missing workitem ${id}`);
        Object.assign(find(id), patch, { updatedAt: clock });
        if (patch.status) find(id).statusChangedAt = clock;
        const input = timeline.buildTaskTimelineEvent(before, find(id));
        if (input) event(input);
    };
    const mutateWithCredits = (id, patch) => {
        const previous = { ...data, board: { ...data.board, tasks: structuredClone(data.board.tasks) } };
        const oldCredits = data.extensions.sprintResults?.credits.length || 0;
        update(id, patch); sprints.recordSprintCredits(data, previous);
        if ((data.extensions.sprintResults?.credits.length || 0) !== oldCredits) snapshotEvent('Crédito de execução atribuído uma única vez (fictício)', 'sprint.results.updated');
    };
    const comment = (id, author, text, images = []) => {
        if (text.length > 9500) {
            for (let offset=0; offset<text.length; offset+=8500) comment(id,author,`REFERÊNCIA REAL (excerto documental; autoria local fictícia), parte ${1+offset/8500}:\n${text.slice(offset,offset+8500)}`);
            return;
        }
        const entry = comments.buildComment(data,id,{ id: `example-comment-${eventNumber+1}`, author, memberId: author === 'Mário' ? 'mario' : 'sebastiao', text, images },{ writable: true, historical: false });
        (data.extensions.conversations ||= { version: 1, entries: [] }).entries.push(entry);
        event({ id: entry.eventId, kind: 'task.comment.published', entityType: 'task', entityId: String(id), summary: `Comentário de ${author} (fictício)`, meta: { author, commentId: entry.id, workitemKey: entry.workitemKey } });
        // buildComment's publication identity must be the identity actually appended.
        entry.eventId = data.extensions.timeline.events.at(-1).id;
    };
    const issues = new Map(evidence.issues.map((i) => [i.number,i]));
    const prs = new Map(evidence.pullRequests.map((p) => [p.number,p]));
    const githubComments = (n) => evidence.comments.filter((c) => c.issue_url.endsWith(`/${n}`));
    const domainTag = (epic) => ({ platform: 'persistência', planning: 'planeamento', collaboration: 'colaboração', experience: 'interface', insights: 'planeamento', foundation: 'feature', future: 'planeado' })[epic];
    const clean = (text) => text.replace(/<[^>]*>/g,' ').replace(/!\[[^\]]*\]\([^)]*\)/g,'').trim();
    const sourceText = (issue, links) => {
        const requirement = clean((issue?.body || '').split(/## Condições de implementação|## 13\. Verificação obrigatória/)[0]);
        return `${issue ? `Issue #${issue.number}: ${issue.html_url}\nEstado do issue na data de corte: ${issue.state}.\n\n${requirement.slice(0,11000)}\n\n` : ''}${links.map((n) => {
            if (typeof n === 'string') { const c = evidence.commits.find((c) => c.sha.startsWith(n)); return c ? `Commit: ${c.html_url}\nData real: ${c.at}. ${c.message.split('\n')[0]}` : ''; }
            const p=prs.get(n); return `PR #${n}: ${p.html_url}\n${p.merged_at ? `Integrado na ${p.base} em ${p.merged_at}` : p.state === 'open' ? 'Aberto; implementação ainda não integrada na main.' : 'Encerrado sem integração.'}`;
        }).join('\n\n')}\n\nPlano de execução, atribuições, estimativas e transições locais reconstruídos (fictício). Aceitação local demonstrativa, não prova histórica de aprovação.`;
    };
    function spec(key, type, title, born, end, fields = {}) {
        const result = { id: ++nextId, key, type, title, born: at(born), end: end ? at(end) : null, ...fields };
        if(title.length>80) { result.title=title.slice(0,77)+'…'; result.description=`Título completo: ${title}\n\n${result.description || ''}`; }
        specs.push(result); byKey.set(key,result); return result;
    }
    for (const [key,title,born,phaseId] of epics) spec(key,'epic',title,born,null,{ phaseId, objective: `Organizar ${title.toLowerCase()}.`, scope: 'Evolução da aplicação TeamOS e respetiva documentação.', businessValue: 'Permitir planear, executar e acompanhar trabalho com dados locais e rastreabilidade.', description: 'Agrupamento funcional reconstruído (fictício). As User Stories contêm as fontes concretas.' });
    const milestoneFor = (links, fallback) => {
        const integrated = links.map((n)=>prs.get(n)).filter((p)=>p?.merged_at && p.base === 'main');
        if (!integrated.length) return fallback;
        const p = integrated.sort((a,b)=>a.merged_at.localeCompare(b.merged_at)).at(-1); const id = `merge-${p.number}`;
        if (!data.extensions.roadmap.milestones.some((m)=>m.id === id)) data.extensions.roadmap.milestones.push({ id, title: `PR #${p.number} · ${p.title.slice(0,82)}`, dueDate: p.merged_at.slice(0,10), color: '#0f766e' });
        return id;
    };
    function story(key,title,epic,phase,born,end,links,activities,issue) {
        const milestoneId=milestoneFor(links,phase==='prototype' ? 'prototype-ready' : phase.startsWith('react') ? 'react-ready' : 'future-release');
        end = end ? new RealDate(Math.max(ms(at(end)), ...links.map((n)=>prs.get(n)).filter((p)=>p?.merged_at && p.base==='main').map((p)=>ms(p.merged_at)+60_000))).toISOString() : null;
        let finalStatus=end ? 'done' : issue?.number === 83 ? 'testing' : issue?.number === 91 ? 'doing' : 'backlog';
        if (issue?.number === 40) finalStatus='cancelled';
        const body=sourceText(issue,links);
        const s=spec(key,'story',title,born,end,{ parentId: byKey.get(epic).id, phaseId:phase,milestoneId,links,issue:issue?.number, finalStatus,
            description: `${body}${issueNotes[issue?.number] ? `\n\nNota de âmbito: ${issueNotes[issue.number]}` : ''}`,
            acceptanceCriteria: `${issue ? clean((issue.body || '').split('## Critérios de aceitação')[1]?.split('## Condições')[0] || '').slice(0,3500) : ''}\nOs comportamentos descritos nas Tasks são demonstráveis na versão indicada nas fontes. IDs, dados, histórico e modo de leitura preservados. Aceitação neste exemplo é (fictício).`, storyPoints:[3,5,8,13][activities.length%4], priority:'high' });
        activities.forEach((title,index) => {
            const created=between(s.born, s.end || asOf, Math.min(0.23,index*0.023+0.003));
            const complete=s.end ? between(s.born,s.end,0.58+(index/activities.length)*0.27) : issue?.number === 83 ? between(s.born,asOf,0.72+index*0.025) : null;
            spec(`${key}-task-${index+1}`,'task',title,created,complete,{ parentId:s.id,phaseMode:'inherit',milestoneMode:'inherit',links,issue:issue?.number,
                finalStatus:complete ? 'done' : issue?.number === 91 ? (index < 2 ? 'done' : index < 4 ? 'doing' : 'to-do') : issue?.number === 40 ? 'cancelled' : 'backlog',
                description:`${title}.\n\nÂmbito de execução: ${s.title}. ${issue ? `Fonte: ${issue.html_url}` : ''}\nFontes técnicas: ${links.filter((n)=>typeof n==='number').map((n)=>prs.get(n).html_url).join(', ') || 'Ver referências na User Story.'}\nObjetivo: implementar esta atividade preservando IDs, persistência local e navegação dos workitems. A cobertura técnica está descrita nas fontes do pai.\n\nDecomposição de execução reconstruída (fictício). ${issue?.state === 'open' && issue.number !== 83 ? 'Trabalho proposto; não constitui uma funcionalidade já entregue.' : ''}`,
                effort:['S','M','L'][index%3],priority:index===0?'high':'medium' });
        });
        return s;
    }
    for (const [key,title,epic,phase,born,end,links,activities] of foundations) {
        const s=story(key+'-story',title,epic,phase,born,end,links,activities);
        if (born<'2026-09-01') s.description=`CRONOLOGIA (fictício): reposicionamento no cenário junho–agosto pedido pelo issue #91. Os commits referidos são anteriores e as datas reais estão preservadas abaixo.\n\n${s.description}`;
    }
    for (const [n,epic,phase,links,activities] of deliveries) {
        const i=issues.get(n); assert(i,`Missing issue ${n}`);
        const integrated=links.map((n)=>prs.get(n)).filter((p)=>p?.merged_at && p.base === 'main');
        const latest=integrated.sort((a,b)=>a.merged_at.localeCompare(b.merged_at)).at(-1);
        const end=latest ? new RealDate(ms(latest.merged_at)+60_000).toISOString() : null;
        story(`issue-${n}`,i.title,epic,phase,i.created_at,end,links,activities,i);
    }
    // Known incident and credible unresolved problems, independent from Stories.
    const incident=issues.get(84);
    const bugs=[
        ['overflow',incident.title,incident.created_at,prs.get(85).merged_at,'experience',85,'Arrastar um workitem para a coluna final do Board Funcional.','A página mantém o header e o logótipo visíveis.','A página ganhava scroll horizontal por um label absoluto sem ancestral posicionado.'],
        ['large-attachments','Thumbnail pesada bloqueia a consulta em portátil antigo (fictício)','2026-11-10',null,'performance',null,'Abrir Attachments de uma Task com muitas imagens num portátil de pouca memória.','A consulta mantém-se responsiva.','Cenário de stress proposto; não é uma regressão confirmada nas fontes.'],
        ['planner-overlap','Sobreposição de blocos após reorganização diária (fictício)','2026-11-11',null,'planning',null,'Planear duas sessões no mesmo intervalo e comparar a carga diária.','A equipa consegue identificar sobrecargas.','Exemplo simulado para discussão; não prova um defeito da main.']
    ];
    for (const [key,title,born,end,phase,pr,steps,expected,actual] of bugs) {
        const b=spec(`bug-${key}`,'bug',title,born,end,{ phaseId:phase,milestoneId:pr?milestoneFor([pr],'future-release'):'future-release',links:pr?[pr]:[],finalStatus:end?'done':'doing',
            stepsToReproduce:steps,expectedResult:expected,actualResult:actual,environment:'Chromium desktop / macOS; cenário de demonstração (fictício).',storyPoints:3,priority:'high',
            description:pr?`${sourceText(incident,[pr])}\nCausa confirmada: label visualmente oculto com posicionamento absoluto.`:'Bug e conversa inteiramente (fictício), incluídos para demonstrar triagem, bloqueios e trabalho pendente.' });
        ['Isolar a causa e construir reprodução mínima','Corrigir cálculo ou contenção do componente afetado','Adicionar cobertura automatizada de regressão'].forEach((title,index)=>spec(`bug-${key}-${index}`,'task',`${title}: ${key}`,between(at(born),end?at(end):asOf,0.02+index*0.03),end?between(at(born),at(end),0.60+index*0.08):null,{parentId:b.id,phaseMode:'inherit',milestoneMode:'inherit',links:pr?[pr]:[],finalStatus:end?'done':index===0?'done':index===1?'doing':'to-do',effort:'M',priority:'high',description:`${title}.\n${b.description}\nDecomposição reconstruída (fictício).`}));
    }
    const independent=[
        ['react-preparation-task','Preparar estratégia de migração React (fictício)','2026-08-12','2026-08-28','react-preparation','infraestrutura'],
        ['requirements-catalog','Preparar catálogo de requisitos Agile (fictício)','2026-09-28','2026-10-05','planning','documentação'],
        ['planning-inventory','Inventariar regras de planeamento e dependências (fictício)','2026-10-12','2026-10-16','planning','planeamento'],
        ['tooling','Configurar Husky, lint-staged e verificações de commit','2026-09-14','2026-09-15','react-ui','infraestrutura'],
        ['typescript','Migrar fronteiras e testes para TypeScript estrito','2026-09-17','2026-09-18','react-ui','infraestrutura'],
        ['baselines','Atualizar baselines visuais de claro, escuro e mobile','2026-10-19','2026-10-22','experience','interface'],
        ['docs','Alinhar documentação com o comportamento atual da main','2026-11-10','2026-11-11','experience','documentação'],
        ['release-check','Preparar checklist técnico de lançamento (fictício)','2026-11-10',null,'example','documentação'],
        ['benchmark','Recolher nova amostra de performance em portátil antigo (fictício)','2026-11-11',null,'performance','performance'],
        ['obsolete-backend','Abandonar hipótese de backend obrigatório (fictício)','2026-08-10',null,'local-files','fictício']
    ];
    for (const [key,title,born,end,phase,tag] of independent) spec(key,'task',title,born,end,{phaseId:phase,milestoneId:phase==='react-ui'?'react-ready':'future-release',storyPoints:2,effort:'M',priority:'medium',finalStatus:end?'done':key==='obsolete-backend'?'cancelled':'doing',tags:[tag,'reconstrução'],description:`Atividade autónoma de ${tag}. ${key==='obsolete-backend'?'Decisão simulada (fictício): manter o produto local e sem servidor obrigatório.':'Planeamento e execução reconstruídos (fictício). Consultar os commits e documentação nas SOURCES.md; não representa um compromisso histórico autenticado.'}`});
    // Allocate IDs before scheduling; creates and updates now run in canonical chronological order.
    const sprintFor = (when) => sprintDefs.find((s)=>s.endDate>=when.slice(0,10))?.id || '';
    for (const s of specs) {
        enqueue(s.born,()=>{
            const parent=s.parentId?find(s.parentId):null;
            assert(!s.parentId || parent, `Parent must precede child: ${s.key}`);
            const planned=s.type==='epic'?'':parent && parent.type!=='epic' ? parent.sprintId : s.finalStatus==='backlog' ? s.issue===81?'sprint-9':[67,73,89,90].includes(s.issue)?'sprint-8':'' : s.issue===68?'sprint-6':s.issue===37?'sprint-5':sprintFor(s.end || s.born);
            const fresh=task.normalizeTask({ id:s.id,displayId:`TOS-${{epic:'EP',story:'US',task:'TK',bug:'BG'}[s.type]}-${s.id}`,permanentId:`teamos-example-workitem-${s.id}`,type:s.type,title:s.title,
                description:s.description || 'Agrupamento funcional reconstruído (fictício).',createdAt:clock,updatedAt:clock,statusChangedAt:clock,status:'backlog',parentId:s.parentId ?? null,
                assignees:s.type==='task'?['Sebastião']:['Mário','Sebastião'],responsible:s.type==='task'?'Sebastião':'Mário',
                tags:s.tags || [s.type==='bug'?'bug':domainTag(s.type==='epic'?s.key:byKey.get(s.key)?.epic || (s.issue?deliveries.find((d)=>d[0]===s.issue)?.[1]:'foundation')) || 'feature','reconstrução'],
                phaseId:s.phaseId || '',milestoneId:s.milestoneId || '',phaseMode:s.phaseMode || (s.phaseId?'explicit':'none'),milestoneMode:s.milestoneMode || (s.milestoneId?'explicit':'none'),sprintId:planned,
                ...(s.type==='epic'?{objective:s.objective,scope:s.scope,businessValue:s.businessValue}:{}),...(s.type==='story'?{acceptanceCriteria:s.acceptanceCriteria}:{}),
                ...(s.type==='bug'?{stepsToReproduce:s.stepsToReproduce,expectedResult:s.expectedResult,actualResult:s.actualResult,environment:s.environment}:{}),
                ...(s.effort?{effort:s.effort}:{}),...(s.storyPoints?{storyPoints:s.storyPoints}:{}),priority:s.priority||'medium',dueDate:s.end?.slice(0,10) || (s.finalStatus==='backlog'?'2026-12-11':'2026-11-13'),
                checklist:s.type==='task'?[{text:s.title,done:false},{text:'Preservar dados locais e comportamento existente',done:false}]:[] },{workflow:data.extensions.workflow,roadmap:data.extensions.roadmap});
            data.board.tasks.push(fresh); event(timeline.buildTaskTimelineEvent(null,fresh));
        });
        if (s.type==='epic') {
            enqueue(between(s.born,at('2026-11-11'),0.03),()=>update(s.id,{status:'to-do'}));
            if(s.key!=='future')enqueue(between(s.born,at('2026-11-11'),0.05),()=>update(s.id,{status:'doing'}));
            if(['foundation','planning','collaboration','platform'].includes(s.key))enqueue('2026-11-12T08:00:00.000Z',()=>update(s.id,{status:'done'}));
            continue;
        }
        const horizon=s.end || asOf;
        if(s.finalStatus!=='backlog') {
            enqueue(between(s.born,horizon,0.25),()=>update(s.id,{status:'to-do'}));
            enqueue(between(s.born,horizon,0.34),()=>update(s.id,{status:'doing'}));
        }
        for (const link of (s.type==='task' && s.key.endsWith('-task-1')===false && s.key.endsWith('-0')===false ? [] : (s.links || [])).filter((n)=>typeof n==='number')) enqueue(new RealDate(Math.max(ms(s.born),ms(prs.get(link).created_at))).toISOString(),()=>update(s.id,{pullRequests:[...new Set([...(find(s.id).pullRequests || []),prs.get(link).html_url])]}));
        if(s.type==='story'||s.type==='bug') {
            enqueue(between(s.born,horizon,0.29),()=>comment(s.id,'Mário',`(fictício — interação simulada) Para «${s.title}», vou acompanhar o resultado funcional e a prioridade. ${s.issue?`O âmbito e as clarificações reais estão no issue #${s.issue}; esta mensagem não é uma citação histórica.`:'As datas deste plano são reconstruídas; os links abaixo preservam a evidência real.'}`));
            enqueue(between(s.born,horizon,0.48),()=>comment(s.id,'Sebastião',`(fictício — interação simulada) Separei a execução em ${specs.filter((c)=>c.parentId===s.id).length} Tasks. ${s.links?.length?'Os PRs no separador próprio indicam a origem técnica; a descrição distingue integração e revisão.':'Ainda não há PR integrado associado a este âmbito.'} ${s.finalStatus==='backlog'?'O trabalho permanece no backlog, sem compromisso de entrega real.':'Vou preservar persistência, histórico e navegação pelas vistas afetadas.'}`));
            const real=githubComments(s.issue).filter((c)=>c.created_at>=s.born && c.created_at<=asOf);
            for(const c of real) enqueue(c.created_at,()=>comment(s.id,c.author==='mseixas93'?'Mário':'Sebastião',`REFERÊNCIA REAL — ${c.author} em ${c.created_at}. Excerto documental; autoria local no exemplo é (fictício), não autentica a conta GitHub.\n${c.html_url}\n\n${clean(c.body).slice(0,14000)}`));
        }
        if(s.finalStatus==='done') {
            if(s.type==='story'||s.type==='bug') {
                enqueue(between(s.born,horizon,0.91),()=>mutateWithCredits(s.id,{status:'ready-to-test'}));
                enqueue(between(s.born,horizon,0.95),()=>update(s.id,{status:'testing'}));
                enqueue(horizon,()=>mutateWithCredits(s.id,{status:'done',acceptance:{author:'Mário',at:clock,local:true}}));
                enqueue(horizon,()=>comment(s.id,'Mário',`(fictício — interação simulada) Cenário de demonstração aceite após conclusão das Tasks. ${s.links?.length?'As datas reais de integração dos PRs estão na descrição; esta aceitação local não é evidência de aprovação histórica.':'Aceitação simulada para permitir consultar evolução e progresso neste exemplo.'}`));
            } else enqueue(horizon,()=>mutateWithCredits(s.id,{status:'done',checklist:[{text:s.title,done:true},{text:'Preservar dados locais e comportamento existente',done:true}]}));
        } else if (s.finalStatus==='testing') {
            enqueue(between(s.born,horizon,0.96),()=>update(s.id,{status:'ready-to-test'}));
            enqueue(between(s.born,horizon,0.98),()=>update(s.id,{status:'testing'}));
        } else if (s.finalStatus==='cancelled') enqueue(between(s.born,horizon,0.9),()=>update(s.id,{status:'cancelled',description:s.description+'\nCancelamento (fictício): proposta absorvida por outra abordagem; conservar o registo para rastreabilidade.'}));
    }
    // A test/rework cycle is deliberately simulated, not inferred as a GitHub fact.
    const revised=byKey.get('issue-68');
    enqueue(between(revised.born,revised.end,0.86),()=>update(revised.id,{status:'testing'}));
    enqueue(between(revised.born,revised.end,0.87),()=>comment(revised.id,'Mário','(fictício — interação simulada) Ao rever uma conversão interrompida quero confirmar que o backup é preservado e que os comentários antigos continuam acessíveis. Regressei o exemplo à análise.'));
    enqueue(between(revised.born,revised.end,0.88),()=>update(revised.id,{status:'re-analysis'}));
    enqueue(between(revised.born,revised.end,0.89),()=>update(revised.id,{status:'doing',priority:'high',responsible:'Sebastião'}));
    const rework=byKey.get('issue-68-task-9');
    enqueue(between(revised.born,revised.end,0.89),()=>update(rework.id,{status:'doing'}));
    enqueue(between(revised.born,revised.end,0.90),()=>mutateWithCredits(rework.id,{status:'done'}));
    for(const definition of sprintDefs) {
        enqueue(at(definition.startDate,'08:30:00'),()=>{
            data.extensions.roadmap.sprints.find((s)=>s.id===definition.id).status='active';
            sprints.startSprint(data,definition.id); snapshotEvent(`Início de ${definition.title}`,'roadmap.updated');
        });
        enqueue(at(definition.endDate,'18:00:00'),()=>{
            const before=structuredClone(data.board.tasks);
            const sprint=data.extensions.roadmap.sprints.find((s)=>s.id===definition.id);
            Object.assign(sprint,{status:'done',review:'(fictício) Review: comparar execução concluída, aceitação pendente e trabalho transitado; ver roster congelado.',retrospective:'(fictício) Reduzir WIP, decompor alterações grandes e manter referências aos comentários de requisitos.'});
            sprints.closeSprint(data,sprint.id,sprint);
            const closure=data.extensions.sprintResults.closures.at(-1);
            for(const item of before.filter((t)=>t.sprintId===sprint.id)) {
                const current=find(item.id);
                current.sprintHistory=[...(current.sprintHistory || []),{sprintId:sprint.id,status:item.status,at:clock,parentId:item.parentId ?? null}];
            }
            snapshotEvent(`Encerramento com roster congelado: ${sprint.title}`,'sprint.results.updated');
            const next=sprintDefs[sprintDefs.findIndex((s)=>s.id===sprint.id)+1];
            if(next) {
                // Carry-over retains its previous frozen row and receives an explicit next allocation.
                for(const id of closure.carryOverIds) {
                    const unit=find(id); if(!unit || ['done','cancelled'].includes(unit.status))continue;
                    update(id,{sprintId:next.id});
                    for(const child of data.board.tasks.filter((t)=>t.parentId===id && !['done','cancelled'].includes(t.status))) update(child.id,{sprintId:next.id});
                }
            }
        });
    }
    const controlDefs=[
        ['risks','Custo crescente do histórico e dos anexos','2026-10-20','2026-11-09','performance','in-mitigation','Mitigar com carregamento lazy, patches e medições em browser.','Manter backup e reduzir volume do projeto antes de recuperar.'],
        ['risks','Sobrescrita por sessões concorrentes','2026-11-04','2026-11-05','storage','closed','Comparar baseline, bloquear conflito e reconciliar por campo.','Recuperar a cópia pendente em IndexedDB.'],
        ['risks','Perda de integridade na migração de formato','2026-11-04',null,'storage','open','Validar IDs, referências, hashes e replay do histórico.','Reabrir o backup de schema anterior sem apagar os originais.'],
        ['risks','Compatibilidade de File System Access entre browsers','2026-09-15',null,'storage','in-mitigation','Documentar Chromium e preservar fallback legado.','Exportar ficheiro e recuperar noutro browser suportado.'],
        ['risks','Critérios funcionais em revisão atrasam aceitação','2026-10-17',null,'insights','open','Distinguir conclusão das Tasks da aceitação das Stories.','Desagregar entrega e replanear apenas o âmbito afetado.'],
        ['risks','Regressão visual no arrasto para a última coluna','2026-11-09','2026-11-09','experience','closed','Conter o label absoluto e manter teste de overflow.','Reverter o estilo causador se o header desaparecer.'],
        ['decisions','Adotar React e extrair um domínio puro','2026-09-11','2026-09-13','react-ui','approved','Vite e componentes isolam apresentação, regras e persistência.','Fonte: commits 33f1aa3 e 1709b11. Aprovação do registo (fictício).'],
        ['decisions','Separar hierarquia e aceitação funcional','2026-10-17','2026-10-29','execution','approved','Epic, User Story e Task representam objetivos, requisitos e execução.','Fonte: issue #36 / PR #56. Data da decisão reconstruída (fictício).'],
        ['decisions','Tratar Bugs como pais funcionais com Tasks','2026-10-21','2026-11-05','execution','approved','Usar o workflow funcional e atribuir a execução a Tasks filhas.','Fonte: issue #54 / PR #75. Aprovação local (fictício).'],
        ['decisions','Guardar estado, histórico e binários separadamente','2026-11-04','2026-11-09','storage','approved','Carregar histórico e anexos na consulta e gravar eventos por append.','Fonte: issue #66 / PR #82 e conversa sobre history.json.'],
        ['decisions','Evoluir persistência para o formato v1','2026-11-04','2026-11-11','storage','approved','Separar vocabulário do produto e modelo interno, com patches e checkpoints.','Fonte: issue #68 / PR #88. Aprovação local (fictício).'],
        ['decisions','Explorar chat com modelo local de pequena dimensão','2026-10-29',null,'future','proposed','Produzir propostas de comando validadas pelo domínio, em vez de escrever JSON completo.','Pedido numa conversa disponível; exploração, sem issue nem entrega. Planeamento (fictício).'],
        ['decisions','Usar backend obrigatório para todos os projetos (fictício)','2026-08-10','2026-08-28','local-files','rejected','Manter operação local e não exigir servidor na utilização diária.','Hipótese simulada e rejeitada; não é uma decisão histórica autenticada.'],
        ['deliverables','Protótipo de organização diária (fictício)','2026-06-02','2026-06-26','prototype','accepted','Protótipo funcional reconstruído no cenário junho–agosto.','prototype-ready'],
        ['deliverables','Base React e domínio extraído','2026-09-11','2026-09-25','react-ui','accepted','Migração sustentada pelos commits de setembro. Aceitação local (fictício).','react-ready'],
        ['deliverables','Roadmap hierárquico e drilldown','2026-10-17','2026-10-23','roadmap','accepted','Fonte: PR #49 integrado na main. Aceitação local (fictício).','merge-49'],
        ['deliverables','Hierarquia Agile e aceitação funcional','2026-10-17','2026-10-29','execution','accepted','Fonte: PR #56 integrado na main. Aceitação local (fictício).','merge-56'],
        ['deliverables','Project Control e Dashboard','2026-10-29','2026-11-04','control','accepted','Fontes: PR #60 e #59 integrados. Aceitação local (fictício).','merge-60'],
        ['deliverables','Pastas de projeto e histórico lazy','2026-11-04','2026-11-09','storage','accepted','Fonte: PR #82 integrado. Aceitação local (fictício).','merge-82'],
        ['deliverables','Formato v1 e migração recuperável','2026-11-04','2026-11-12','storage','accepted','Fonte: PR #88 integrado em 11/11 às 23:13 UTC. Aceitação (fictício) em 12/11.','merge-88'],
        ['deliverables','Redesign do Project Overview','2026-11-08',null,'insights','in-progress','PR #87 aberto; pendente de revisão e integração na main.','future-release'],
        ['deliverables','Projeto histórico demonstrativo','2026-11-11',null,'example','in-progress','Issue #91 em implementação e sujeito a revisão do novo PR.','future-release'],
        ['deliverables','Importação de dados por Excel e CSV','2026-11-10',null,'future','planned','Issue #67 aberto; ainda não implementado. Datas de planeamento (fictício).','future-release']
    ];
    controlDefs.forEach(([kind,title,born,end,phaseId,target,text,extra],index)=>{
        let id;
        const initial=kind==='risks'?'open':kind==='decisions'?'proposed':'planned';
        const save=(status)=>{
            const previous=id?data.extensions.projectControl.records.find((r)=>r.id===id):null;
            const draft=previous?structuredClone(previous):control.newControlRecord(kind);
            const marker=kind==='deliverables'?extra:phaseId==='storage'?'merge-88':phaseId==='experience'?'merge-79':phaseId==='react-ui'?'react-ready':'';
            Object.assign(draft,{title,description:`${text}\n${kind==='decisions'?extra:''}\nRegisto de acompanhamento, responsáveis, datas de decisão e avaliações reconstruídos (fictício).`,status,owner:kind==='risks'?'Sebastião':'Mário',assignees:['Mário','Sebastião'],tags:['reconstrução'],related:{phaseIds:[phaseId],milestoneIds:marker?[marker]:[]},dueDate:end||'2026-12-11'});
            if(kind==='risks')Object.assign(draft,{probability:index%2?'medium':'high',impact:'high',mitigationPlan:text,contingencyPlan:extra});
            if(kind==='decisions')Object.assign(draft,{decisionMaker:'Mário',decisionDate:status===initial?'':clock.slice(0,10),rationale:text});
            if(kind==='deliverables')Object.assign(draft,{validator:'Mário',deliveredDate:['delivered','accepted'].includes(status)?clock.slice(0,10):'',acceptedDate:status==='accepted'?clock.slice(0,10):''});
            const saved=control.saveControlRecord(data,draft,'Mário'); id=saved.id;
            saved.history.at(-1).id=`control-history-${index}-${saved.history.length}`;
            saved.comments.push({id:`control-comment-${index}-${saved.comments.length}`,at:clock,author:{name:'Mário',kind:'local'},text:`(fictício — interação simulada) ${status===initial?'Registei este ponto para acompanhamento:':'Atualizei o acompanhamento para '+status+':'} ${text}`,images:[]});
            snapshotEvent(`Project Control: ${title} → ${status}`,'board.control.updated');
        };
        enqueue(at(born,'10:00:00'),()=>save(initial));
        if(target!==initial)enqueue(end?at(end,'10:00:00'):between(at(born),asOf,0.6),()=>save(target));
    });
    // Demonstrate real binary storage, image preview, CSV/text preview and immutable comment images.
    rmSync(`${output}/attachments`,{recursive:true,force:true}); mkdirSync(`${output}/attachments`,{recursive:true});
    const binary=(name,mime,bytes)=>{
        const hash=createHash('sha256').update(bytes).digest('hex');writeFileSync(`${output}/attachments/${hash}`,bytes);
        return {id:`attachment-${hash.slice(0,16)}`,name,mime,sizeBytes:bytes.length,kind:mime.startsWith('image/')?'image':'file',dataUrl:`teamos-attachment:${data.extensions.project.id}/${hash}`,createdAt:'2026-11-10T12:00:00.000Z',uploadedBy:'Sebastião'};
    };
    const note=binary('notas-do-projeto-ficticio.txt','text/plain',Buffer.from('TeamOS — projeto demonstrativo\n(fictício) Conversas, Sprints, estimativas e aceitação são simulados.\nFactos: PRs e commits citados em SOURCES.md.\n'));
    const csv=binary('amostra-de-capacidade-ficticio.csv','text/csv',Buffer.from('pessoa;data;horas;natureza\nMário;2026-11-12;2;fictício\nSebastião;2026-11-12;6;fictício\n'));
    // A local documentary diagram exercises image previews without remote dependencies.
    const png=binary('workflow-ficticio.png','image/png',readFileSync(new URL('./workflow-ficticio.png',import.meta.url)));
    enqueue('2026-11-10T12:00:00.000Z',()=>update(byKey.get('issue-66').id,{attachments:[note,csv,png]}));
    enqueue('2026-11-10T12:05:00.000Z',()=>comment(byKey.get('issue-66').id,'Sebastião','(fictício — interação simulada) O anexo visual é um diagrama de execução e aceitação funcional (fictício). TXT e CSV permitem experimentar Open e Download sem depender de serviços externos.',[Object.fromEntries(Object.entries({...png,id:'comment-image-demo'}).filter(([key])=>key!=='uploadedBy'))]));
    // Pending work: manual and relational blocking; checklists and priority reassignment.
    enqueue('2026-11-11T14:00:00.000Z',()=>{
        update(byKey.get('bug-large-attachments').id,{blocked:true,blockerReason:'(fictício) Aguarda medições num portátil com pouca memória.'});
        const source=byKey.get('benchmark').id,target=byKey.get('release-check').id;
        const related=[byKey.get('issue-66').id,byKey.get('issue-68').id].sort((a,b)=>a-b);
        data.extensions.taskRelations={version:1,relations:[{sourceId:source,targetId:target,kind:'blocks'},{sourceId:related[0],targetId:related[1],kind:'related'}]};
        snapshotEvent('Dependência entre medições e preparação de lançamento (fictício)');
    });
    enqueue('2026-11-12T08:15:00.000Z',()=>{
        const t=byKey.get('release-check');update(t.id,{responsible:'Mário',assignees:['Mário','Sebastião'],priority:'high',checklist:[{text:'Reunir links para builds e documentação',done:true},{text:'Incorporar resultados da nova medição',done:false}]});
    });
    for(const [date,keys] of [['2026-10-19',['issue-25-task-1','issue-26-task-1']],['2026-11-11',['benchmark','issue-91-task-3']],['2026-11-12',['issue-91-task-3','release-check','bug-large-attachments-1']],['2026-11-13',['issue-91-task-5','benchmark']]]) {
        enqueue(date>'2026-11-12'?'2026-11-12T08:00:00.000Z':at(date,'07:30:00'),()=>{
            data.extensions.dayPlanner ||= {version:1,blocks:[]};
            keys.forEach((key,index)=>{
                const s=byKey.get(key);if(!s||!find(s.id))return;
                data.extensions.dayPlanner.blocks.push({id:`block-${date}-${index}`,taskId:s.id,date,start:`${String(9+index*2).padStart(2,'0')}:00`,end:`${String(10+index*2).padStart(2,'0')}:30`});
            });snapshotEvent(`Planear blocos de execução de ${date} (fictício)`);
        });
    }
    queue.sort((a,b)=>a.at.localeCompare(b.at)||a.order-b.order);
    for(const operation of queue) { clock=operation.at; operation.run(); }
    clock=asOf;
    data.meta.updatedAt=asOf;
    data.extensions.taskIdentity={version:1,highWaterMark:nextId};
    // Keep the same deterministic workflow/status labels in field-level events as live commands.
    for(const e of data.extensions.timeline.events)if(e.changes?.status)e.meta={...e.meta,statusLabels:Object.fromEntries(workflow.getWorkflow(data,find(Number(e.entityId))).states.map((s)=>[s.id,s.name]))};
    const normalized=serialize.serializeBoardDataFromObject(data);
    normalized.meta.updatedAt=asOf;
    board.validateBoardData(normalized);
    const converted=history.convertLegacyProject({project:normalized,events:normalized.extensions.timeline.events,archives:{},projectHash:serialize.hashTextContent(JSON.stringify(normalized))});
    writeFileSync(`${output}/project.json`,converted.projectText+'\n');writeFileSync(`${output}/history.json`,converted.historyText);
    const reopened=serialize.serializeBoardDataFromObject(format.fromProjectFile(format.attachmentsFromHashes(JSON.parse(converted.projectText),data.extensions.project.id)));
    board.validateBoardData(reopened);
    assert.equal(reopened.board.tasks.length,specs.length);
    assert.equal(reopened.extensions.roadmap.phases.length,27,'Roadmap phases must survive normalization');
    assert.equal(reopened.extensions.roadmap.sprints.length,9,'Sprint catalog must survive normalization');
    for(const s of reopened.board.tasks.filter((t)=>t.type==='story'))assert(reopened.board.tasks.filter((t)=>t.parentId===s.id).length>=3,`Story without 3 Tasks: ${s.title}`);
    const storedHistory=JSON.parse(converted.historyText);
    const loadedEvents=storedHistory.events.map((e)=>history.eventFromFile(format.attachmentsFromHashes(e,reopened.extensions.project.id)));
    reopened.extensions.timeline={version:1,baselineEventId:storedHistory.baselineEventId,events:loadedEvents};
    reopened.extensions.controlRecordHistory=storedHistory.recordHistory.control;
    const finalProjection=timeline.reconstructBoardStateFromTimeline(reopened,loadedEvents.length-1);
    const observableTasks = (items) => items.map(({statusChangedAt: _statusChangedAt, ...item}) => { void _statusChangedAt; return item; });
    assert.deepEqual(observableTasks(finalProjection.board.tasks),observableTasks(reopened.board.tasks),'Final replay diverges from current state');
    const periods=['2026-06-30','2026-07-31','2026-08-31','2026-09-30','2026-10-31','2026-11-12'].map((date)=>{
        const index=loadedEvents.findLastIndex((e)=>e.at.slice(0,10)<=date);
        const state=timeline.reconstructBoardStateFromTimeline(reopened,index);board.validateBoardData(state);
        return {date,workitems:state.board.tasks.length,completed:state.board.tasks.filter((t)=>t.status==='done').length,inProgress:state.board.tasks.filter((t)=>t.status==='doing').length};
    });
    assert(new Set(periods.map((p)=>p.completed)).size>=5,'Historical completion counts should change');
    const counts=Object.fromEntries(['epic','story','task','bug'].map((type)=>[type,specs.filter((s)=>s.type===type).length]));
    const summary={asOf,mainCommit:evidence.mainCommit,counts,total:specs.length,events:loadedEvents.length,comments:converted.project.comments.length,controlRecords:converted.project.projectControl.records.length,phases:converted.project.roadmap.phases.length,milestones:converted.project.roadmap.milestones.length,sprints:converted.project.roadmap.sprints.length,closedSprints:converted.project.roadmap.sprintResults.closures.length,periods};
    writeFileSync(`${output}/summary.json`,JSON.stringify(summary,null,2)+'\n');
    // Reviewable source index: one line per public issue, all PR states, real commit dates.
    const lines=['# Fontes e limites históricos','',`Corte: ${asOf}. Main analisada: \`${evidence.mainCommit}\`.`,
        '', 'O snapshot público integral está em `scripts/example-project/evidence.json`: todos os issues abertos/fechados, corpos e comentários; todos os PRs, integrados/abertos/encerrados sem merge; commits alcançáveis da main. Não contém transcrições privadas.',
        '', '## Reconstrução (fictício)', '',
        '- O Git começa em fevereiro de 2026. Junho–agosto segue o cenário pedido no issue #91; as atividades iniciais foram reposicionadas e as datas reais dos commits continuam nas referências.',
        '- Sprints, capacidade, objetivos, estimativas, atribuições, bloqueios, Review/Retrospective e aceitação local são simulados. As transições demonstram utilização continuada; não são um log autenticado do desenvolvimento.',
        '- Todas as conversas inventadas começam com `(fictício — interação simulada)`. Excertos reais começam com `REFERÊNCIA REAL`, identificam a conta, data e URL; o membro local é apenas uma projeção demonstrativa.',
        '- Estado Done significa entrega comprovada mais aceitação local simulada. Um issue encerrado sem prova de entrega não é promovido automaticamente a Done. #40 é cancelado no exemplo; #83 continua em Testing com PR aberto.',
        '', '## Conversas disponíveis consultadas', '',
        '- “Split project history into JSON” (05/11/2026): pedido de history.json separado, carregamento lazy e gravação independente; confirmado no issue #66.',
        '- “Refine Kanban project requirements” (04/11/2026): separação técnico/funcional, Bugs com Tasks, membro ativo e calendário no Day Planner; a versão pública é o comentário do issue #54.',
        '- “Choose a local model for Kanban chat” (29/10/2026): exploração de comandos estruturados com modelo local. Registado apenas como decisão proposta, sem alegar implementação.',
        '- Os históricos acessíveis não constituem um arquivo completo de todas as conversas desde setembro. Lacunas foram tratadas como reconstrução, com prioridade para código e evidência pública.',
        '', '## Issues e decomposição', '', '| Issue | Estado GitHub | Workitem | Evidência de implementação |','|---|---|---|---|'];
    for(const i of evidence.issues.slice().sort((a,b)=>a.number-b.number)) {
        const s=byKey.get(`issue-${i.number}`)||(i.number===84?byKey.get('bug-overflow'):null);
        lines.push(`| [#${i.number}](${i.html_url}) ${i.title.replaceAll('|','/')} | ${i.state} | ${s?`TOS-${s.type==='bug'?'BG':'US'}-${s.id}`:'Fonte contextual'} | ${(s?.links||[]).map((n)=>`[PR #${n}](${prs.get(n)?.html_url})`).join(', ')||issueNotes[i.number]||'Sem PR integrado identificado; backlog ou reconstrução.'} |`);
    }
    lines.push('','## Pull Requests: não confundir encerramento e integração','','| PR | Estado | Data real de merge | Base |','|---|---|---|---|');
    for(const p of evidence.pullRequests.slice().sort((a,b)=>a.number-b.number))lines.push(`| [#${p.number}](${p.html_url}) ${p.title.replaceAll('|','/')} | ${p.merged_at?'integrado':p.state==='open'?'aberto':'encerrado sem integração'} | ${p.merged_at||'—'} | ${p.base} |`);
    lines.push('','## Commits da main','','As datas de commit abaixo são reais. Não foram deslocadas para corresponder ao cenário do protótipo.','','| Commit | Data real | Trabalho |','|---|---|---|');
    for(const c of evidence.commits.slice().reverse())lines.push(`| [${c.sha.slice(0,7)}](${c.html_url}) | ${c.at} | ${c.message.split('\n')[0].replaceAll('|','/')} |`);
    writeFileSync(`${output}/SOURCES.md`,lines.join('\n')+'\n');
    console.log(JSON.stringify(summary,null,2));
} finally { globalThis.Date=RealDate;await server.close(); }
