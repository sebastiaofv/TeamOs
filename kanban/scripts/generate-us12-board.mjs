import { log } from 'node:console';
import { deepStrictEqual } from 'node:assert';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const server = await createServer({ server: { middlewareMode: true } });
try {
    const { createEmptyProjectData, validateBoardData } = await server.ssrLoadModule('/src/domain/board.ts');
    const { normalizeTask } = await server.ssrLoadModule('/src/domain/task.ts');
    const { serializeBoardDataFromObject } = await server.ssrLoadModule('/src/domain/serialize.ts');
    const at = '2026-10-28T10:00:00.000Z';
    const acceptance = { author: 'Beatriz QA', at: '2026-10-27T16:00:00.000Z', local: true };

    function project(title, id, description, names, tags) {
        const data = createEmptyProjectData(title);
        data.meta.createdAt = at;
        data.meta.updatedAt = at;
        data.extensions.project = { version: 1, id, description, status: 'active',
            members: names.map((name, index) => ({ id: `${id}-member-${index + 1}`, name })), tags };
        return data;
    }

    function save(data, path, inputs) {
        data.board.tasks = inputs.map((task) => normalizeTask({ description: '', createdAt: at, updatedAt: at, ...task },
            { workflow: data.extensions.workflow, roadmap: data.extensions.roadmap }));
        const normalized = serializeBoardDataFromObject(data);
        normalized.meta.updatedAt = at;
        validateBoardData(normalized);
        const reopened = serializeBoardDataFromObject(JSON.parse(JSON.stringify(normalized)));
        reopened.meta.updatedAt = at;
        validateBoardData(reopened);
        deepStrictEqual(reopened, normalized, `Unstable round trip: ${path}`);
        writeFileSync(path, JSON.stringify(normalized, null, 2) + '\n');
        log(`Validated ${path}: ${normalized.board.tasks.length} workitems, schema ${normalized.meta.schemaVersion}`);
    }

    const checkout = project('US-12 · Checkout', 'us12-checkout',
        'Projeto de pagamentos: hierarquia, aceitação funcional, trabalho de Sprints anteriores e planeamento futuro.',
        ['Ana', 'Rui', 'Marta QA'], ['pagamentos', 'acessibilidade', 'frontend', 'backend', 'documentação']);
    checkout.extensions.roadmap = { version: 4, phases: [
        { id: 'checkout', title: 'Checkout', startDate: '2026-10-01', endDate: '2026-12-04' },
        { id: 'discovery', title: 'Análise', parentId: 'checkout', startDate: '2026-10-01', endDate: '2026-10-18', color: '#7c3aed' },
        { id: 'delivery', title: 'Entrega', parentId: 'checkout', startDate: '2026-10-19', endDate: '2026-11-15', color: '#2563eb' },
        { id: 'stabilization', title: 'Estabilização', parentId: 'checkout', startDate: '2026-11-16', endDate: '2026-12-04', color: '#0f766e' }
    ], milestones: [
        { id: 'release', title: 'Primeira entrega', dueDate: '2026-11-13', color: '#2563eb' },
        { id: 'accessible', title: 'Revisão de acessibilidade', dueDate: '2026-11-20', color: '#7c3aed' }
    ], sprints: [
        { id: 'previous', title: 'Checkout · Sprint anterior', startDate: '2026-10-05', endDate: '2026-10-18', parentId: 'discovery' },
        { id: 'current', title: 'Checkout · Sprint atual', startDate: '2026-10-19', endDate: '2026-11-01', parentId: 'delivery' },
        { id: 'future', title: 'Checkout · Sprint futuro', startDate: '2026-11-02', endDate: '2026-11-15', parentId: 'delivery' }
    ] };
    checkout.extensions.workitemAutomation = { version: 1, start: { from: ['to-do'], to: 'doing' }, finish: { from: ['doing'], to: 'ready-to-test' } };
    checkout.extensions.workflow.transitions.done = ['doing'];
    save(checkout, 'test-board/us-12.board.json', [
        { id: 1201, type: 'epic', title: 'Checkout acessível', description: 'Organizar pagamentos e comprovativos. Concluir Tasks não conclui automaticamente este Epic.', objective: 'Permitir compras sem barreiras', scope: 'Fluxo de pagamento', businessValue: 'Reduzir abandono', status: 'doing', phaseId: 'delivery', milestoneId: 'release', assignees: ['Ana'], responsible: 'Ana', tags: ['pagamentos'], priority: 'high' },
        { id: 1202, type: 'story', title: 'Pagar com cartão', description: 'Como cliente, quero pagar com cartão e receber confirmação. Uma Task terminou no Sprint anterior; só a Task atual aparece no Board Técnico.', parentId: 1201, status: 'doing', sprintId: 'current', acceptanceCriteria: 'Compra confirmada e comprovativo apresentado', effort: 'L', phaseMode: 'inherit', milestoneMode: 'inherit', sprintHistory: [{ sprintId: 'previous', status: 'doing', at: '2026-10-18T17:00:00.000Z' }], assignees: ['Ana', 'Rui'], responsible: 'Ana', tags: ['pagamentos'], priority: 'high', dueDate: '2026-10-30' },
        { id: 1203, type: 'task', title: 'Validar cartão no Sprint anterior', description: 'Trabalho concluído: consultar na Table e no Sprint anterior, sem o repetir no Técnico atual.', parentId: 1202, status: 'done', sprintId: 'previous', phaseMode: 'inherit', milestoneMode: 'inherit', effort: 'M', assignees: ['Rui'], responsible: 'Rui', tags: ['backend'] },
        { id: 1204, type: 'task', title: 'Implementar confirmação', description: 'Última Task pendente da Story #1202. Concluir permite testar o avanço para Ready to test e a aceitação posterior.', parentId: 1202, status: 'doing', sprintId: 'current', phaseMode: 'inherit', milestoneMode: 'inherit', effort: 'S', assignees: ['Rui'], responsible: 'Rui', tags: ['frontend'], priority: 'high', dueDate: '2026-10-29', checklist: [{ text: 'Apresentar confirmação', done: true }, { text: 'Validar estado de erro', done: false }] },
        { id: 1205, type: 'task', title: 'Caso de teste abandonado', description: 'Task cancelada, excluída do denominador do progresso.', parentId: 1202, status: 'cancelled', sprintId: 'previous', phaseMode: 'inherit', assignees: ['Marta QA'], responsible: 'Marta QA' },
        { id: 1206, type: 'task', title: 'Preparar métricas do Epic', description: 'Task diretamente associada ao Epic: é independente de Story e pode ter planeamento próprio.', parentId: 1201, status: 'to-do', phaseMode: 'inherit', assignees: ['Ana'], responsible: 'Ana', tags: ['backend'], effort: 'M', priority: 'medium' },
        { id: 1207, type: 'bug', title: 'Botão de pagamento sem foco', status: 'testing', sprintId: 'current', stepsToReproduce: 'Navegar por teclado até ao botão Pagar', expectedResult: 'Foco visível', actualResult: 'Sem indicação de foco', severity: 'High', environment: 'Chrome / macOS', effort: 'S', assignees: ['Marta QA', 'Rui'], responsible: 'Marta QA', tags: ['acessibilidade', 'frontend'], priority: 'high', phaseId: 'delivery', milestoneId: 'accessible', dueDate: '2026-10-30' },
        { id: 1208, type: 'story', title: 'Consultar comprovativo', description: 'Story sem Tasks: segue o percurso manual e exige aceitação funcional.', status: 'testing', sprintId: 'current', acceptanceCriteria: 'Comprovativo pode ser descarregado', assignees: ['Ana'], responsible: 'Ana', phaseId: 'delivery', milestoneId: 'release', effort: 'M', tags: ['pagamentos'] },
        { id: 1209, type: 'task', title: 'Trabalho independente', description: 'Atualizar instruções de integração. Não pertence a Epic/Story e ainda não tem Sprint.', status: 'to-do', dueDate: '2026-11-05', phaseId: 'stabilization', assignees: ['Rui'], responsible: 'Rui', tags: ['documentação'], priority: 'low', effort: 'S' },
        { id: 1210, type: 'epic', title: 'Epic sem trabalho elegível', description: 'Estado vazio: progresso sem percentagem e sem filhos.', status: 'backlog', objective: 'Explorar pagamentos alternativos' },
        { id: 1211, type: 'story', title: 'Story do Sprint futuro', description: 'Continua visível no Funcional; a Task subordinada só entra no Técnico quando o Sprint estiver ativo.', parentId: 1201, status: 'to-do', sprintId: 'future', acceptanceCriteria: 'Resultado futuro', phaseMode: 'inherit', assignees: ['Ana'], responsible: 'Ana', dueDate: '2026-11-10' },
        { id: 1212, type: 'task', title: 'Task futura oculta no Técnico', parentId: 1211, status: 'to-do', sprintId: 'future', phaseMode: 'inherit', assignees: ['Rui'], responsible: 'Rui', effort: 'M' },
        { id: 1213, type: 'bug', title: 'Registo rápido por completar', description: 'Bug mínimo no Backlog, sem responsável, prioridade ou campos de reprodução.', status: 'backlog' }
    ]);

    const support = project('US-12 · Suporte', 'us12-support',
        'Projeto independente de suporte: estados diferentes, IDs locais repetidos e catálogos próprios para testar a vista All.',
        ['Ana', 'Bruno', 'Beatriz QA'], ['suporte', 'pesquisa', 'conteúdos', 'email']);
    support.extensions.workflow = { version: 2,
        states: [
            { id: 'backlog', name: 'Backlog', category: 'backlog', color: '#94a3b8' },
            { id: 'queued', name: 'Pronto', category: 'to-do', color: '#60a5fa' },
            { id: 'triage', name: 'Em triagem', category: 'to-do', color: '#a78bfa' },
            { id: 'building', name: 'Em execução', category: 'in-progress', color: '#fbbf24' },
            { id: 'review', name: 'Em revisão', category: 'in-progress', color: '#38bdf8' },
            { id: 'validated', name: 'Validado', category: 'completed', color: '#34d399' },
            { id: 'released', name: 'Publicado', category: 'completed', color: '#0f766e' },
            { id: 'discarded', name: 'Descartado', category: 'cancelled', color: '#f87171' }
        ], entryStateId: 'queued', references: { backlog: 'backlog', 'to-do': 'queued', 'in-progress': 'building', completed: 'released', cancelled: 'discarded' },
        transitions: { backlog: ['queued', 'triage', 'discarded'], queued: ['building', 'discarded'], triage: ['building', 'discarded'], building: ['review', 'validated', 'released', 'discarded'], review: ['building', 'validated', 'released', 'discarded'], validated: ['building', 'released'], released: ['building'], discarded: ['queued'] }
    };
    support.extensions.roadmap = { version: 4, phases: [
        { id: 'delivery', title: 'Pedidos de suporte', startDate: '2026-10-12', endDate: '2026-11-20', color: '#0f766e' },
        { id: 'knowledge', title: 'Base de conhecimento', startDate: '2026-10-26', endDate: '2026-11-27', color: '#b45309' }
    ], milestones: [
        { id: 'release', title: 'Portal disponível', dueDate: '2026-11-06', color: '#0f766e' },
        { id: 'docs', title: 'FAQ revista', dueDate: '2026-11-20', color: '#b45309' }
    ], sprints: [
        { id: 'previous', title: 'Suporte · Sprint anterior', startDate: '2026-10-05', endDate: '2026-10-18' },
        { id: 'current', title: 'Suporte · Sprint atual', startDate: '2026-10-19', endDate: '2026-11-01', parentId: 'delivery' },
        { id: 'future', title: 'Suporte · Sprint futuro', startDate: '2026-11-02', endDate: '2026-11-15', parentId: 'delivery' }
    ] };
    save(support, 'test-board/us-12-support.board.json', [
        { id: 1201, type: 'epic', title: 'Portal de suporte', objective: 'Permitir acompanhar pedidos sem contactar a equipa', status: 'building', phaseId: 'delivery', milestoneId: 'release', assignees: ['Ana'], responsible: 'Ana', tags: ['suporte'], priority: 'high' },
        { id: 1202, type: 'story', title: 'Abrir pedido de suporte', description: 'Mesmo número local da Story de Checkout, mas conteúdo e projeto diferentes.', parentId: 1201, status: 'review', sprintId: 'current', phaseMode: 'inherit', milestoneMode: 'inherit', acceptanceCriteria: 'Pedido criado com referência e confirmação por email', effort: 'M', assignees: ['Ana', 'Bruno'], responsible: 'Ana', tags: ['suporte', 'email'], dueDate: '2026-10-30', priority: 'high' },
        { id: 1203, type: 'task', title: 'Criar formulário de pedido', parentId: 1202, status: 'validated', sprintId: 'current', phaseMode: 'inherit', milestoneMode: 'inherit', assignees: ['Bruno'], responsible: 'Bruno', effort: 'M' },
        { id: 1204, type: 'task', title: 'Enviar confirmação por email', parentId: 1202, status: 'building', sprintId: 'current', phaseMode: 'inherit', milestoneMode: 'inherit', assignees: ['Bruno'], responsible: 'Bruno', effort: 'S', tags: ['email'], priority: 'high', dueDate: '2026-10-29' },
        { id: 1205, type: 'story', title: 'Consultar estado do pedido', parentId: 1201, status: 'queued', sprintId: 'future', phaseMode: 'inherit', acceptanceCriteria: 'Cliente consulta o estado e a última atualização', assignees: ['Ana'], responsible: 'Ana', effort: 'M' },
        { id: 1206, type: 'task', title: 'Mostrar histórico do pedido', parentId: 1205, status: 'queued', sprintId: 'future', phaseMode: 'inherit', assignees: ['Bruno'], responsible: 'Bruno', effort: 'S' },
        { id: 1207, type: 'bug', title: 'Pesquisa falha com acentos', status: 'review', sprintId: 'current', phaseId: 'knowledge', milestoneId: 'docs', stepsToReproduce: 'Pesquisar por confirmação', expectedResult: 'Apresentar artigos com acentos', actualResult: 'Nenhum resultado', severity: 'Medium', environment: 'Firefox / macOS', assignees: ['Beatriz QA', 'Bruno'], responsible: 'Beatriz QA', tags: ['pesquisa'], dueDate: '2026-10-30', priority: 'medium', effort: 'S' },
        { id: 1208, type: 'task', title: 'Atualizar base de conhecimento', description: 'Bloqueio manual informativo: aguarda revisão dos textos.', status: 'building', phaseId: 'knowledge', milestoneId: 'docs', blocked: true, blockerReason: 'Aguardar revisão jurídica dos textos', assignees: ['Ana'], responsible: 'Ana', tags: ['conteúdos'], priority: 'high', effort: 'L', dueDate: '2026-11-04' },
        { id: 1209, type: 'task', title: 'Rever respostas automáticas', status: 'queued', sprintId: 'current', phaseId: 'delivery', assignees: ['Bruno'], responsible: 'Bruno', tags: ['email'], effort: 'S' },
        { id: 1210, type: 'epic', title: 'Métricas de atendimento', objective: 'Medir tempo de resposta e satisfação', status: 'backlog' },
        { id: 1211, type: 'story', title: 'Receber número do pedido', parentId: 1201, status: 'released', sprintId: 'current', phaseMode: 'inherit', milestoneMode: 'inherit', acceptanceCriteria: 'Cada pedido recebe uma referência única', acceptance, assignees: ['Ana'], responsible: 'Ana', effort: 'S' },
        { id: 1212, type: 'task', title: 'Gerar referência única', parentId: 1211, status: 'validated', sprintId: 'current', phaseMode: 'inherit', assignees: ['Bruno'], responsible: 'Bruno', effort: 'XS' },
        { id: 1213, type: 'bug', title: 'Exportação repete pedidos', description: 'Bug descartado por duplicação de um incidente já corrigido.', status: 'discarded', tags: ['suporte'] },
        { id: 1214, type: 'task', title: 'Investigar timeout intermitente', description: 'A vista All deve preservar o estado Em triagem dentro da categoria To Do.', status: 'triage', assignees: ['Bruno'], responsible: 'Bruno', priority: 'medium', effort: 'M' },
        { id: 1215, type: 'task', title: 'Atualizar texto de ajuda', description: 'Trabalho por planear no Backlog.', status: 'backlog', tags: ['conteúdos'] },
        { id: 1216, type: 'task', title: 'Rascunho antigo de FAQ', description: 'Ativar o filtro de arquivo para consultar este cartão.', status: 'validated', archived: true, phaseId: 'knowledge', assignees: ['Ana'], responsible: 'Ana', tags: ['conteúdos'] }
    ]);
} finally { await server.close(); }
