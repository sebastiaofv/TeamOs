import { log } from 'node:console';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const server = await createServer({ server: { middlewareMode: true } });
try {
    const { createEmptyProjectData, validateBoardData } = await server.ssrLoadModule('/src/domain/board.ts');
    const { normalizeTask } = await server.ssrLoadModule('/src/domain/task.ts');
    const { serializeBoardDataFromObject } = await server.ssrLoadModule('/src/domain/serialize.ts');
    const data = createEmptyProjectData('US-12 · Workitems e hierarquia');
    data.extensions.roadmap = { version: 4, phases: [{ id: 'delivery', title: 'Entrega', startDate: '2026-01-01', endDate: '2099-12-31' }], milestones: [{ id: 'release', title: 'Primeira entrega', dueDate: '2099-12-31' }], sprints: [
        { id: 'previous', title: 'Sprint anterior', startDate: '2026-01-01', endDate: '2026-01-31' },
        { id: 'current', title: 'Sprint atual', startDate: '2026-02-01', endDate: '2098-12-31', parentId: 'delivery' },
        { id: 'future', title: 'Sprint futuro', startDate: '2099-01-01', endDate: '2099-01-31' }
    ] };
    data.extensions.workitemAutomation = { version: 1, start: { from: ['to-do'], to: 'doing' }, finish: { from: ['doing'], to: 'ready-to-test' } };
    data.extensions.workflow.transitions.done = ['doing'];
    const at = '2026-10-28T10:00:00.000Z';
    const inputs = [
        { id: 1201, type: 'epic', title: 'Checkout acessível', objective: 'Permitir compras sem barreiras', scope: 'Fluxo de pagamento', businessValue: 'Reduzir abandono', status: 'doing', phaseId: 'delivery', milestoneId: 'release' },
        { id: 1202, type: 'story', title: 'Pagar com cartão', parentId: 1201, status: 'doing', sprintId: 'current', acceptanceCriteria: 'Compra confirmada e comprovativo apresentado', effort: 'L', phaseMode: 'inherit', milestoneMode: 'inherit', sprintHistory: [{ sprintId: 'previous', status: 'doing', at }] },
        { id: 1203, type: 'task', title: 'Validar cartão no Sprint anterior', parentId: 1202, status: 'done', sprintId: 'previous', phaseMode: 'inherit', milestoneMode: 'inherit', effort: 'M' },
        { id: 1204, type: 'task', title: 'Implementar confirmação', parentId: 1202, status: 'doing', sprintId: 'current', phaseMode: 'inherit', milestoneMode: 'inherit', effort: 'S' },
        { id: 1205, type: 'task', title: 'Caso de teste abandonado', parentId: 1202, status: 'cancelled', sprintId: 'previous', phaseMode: 'inherit' },
        { id: 1206, type: 'task', title: 'Preparar métricas do Epic', parentId: 1201, status: 'to-do', phaseMode: 'inherit' },
        { id: 1207, type: 'bug', title: 'Botão de pagamento sem foco', status: 'testing', sprintId: 'current', stepsToReproduce: 'Navegar por teclado', expectedResult: 'Foco visível', actualResult: 'Sem indicação de foco', severity: 'High', environment: 'Browser', effort: 'S' },
        { id: 1208, type: 'story', title: 'Consultar comprovativo', status: 'testing', sprintId: 'current', acceptanceCriteria: 'Comprovativo pode ser descarregado' },
        { id: 1209, type: 'task', title: 'Trabalho independente', status: 'to-do', dueDate: '2026-12-01' },
        { id: 1210, type: 'epic', title: 'Epic sem trabalho elegível', status: 'backlog' },
        { id: 1211, type: 'story', title: 'Story do Sprint futuro', parentId: 1201, status: 'to-do', sprintId: 'future', acceptanceCriteria: 'Resultado futuro' },
        { id: 1212, type: 'task', title: 'Task futura oculta no Técnico', parentId: 1211, status: 'to-do', sprintId: 'future', phaseMode: 'inherit' },
        { id: 1213, type: 'bug', title: 'Registo rápido por completar', status: 'backlog' }
    ];
    data.board.tasks = inputs.map((task) => normalizeTask({ ...task, description: '', createdAt: at, updatedAt: at }, { workflow: data.extensions.workflow, roadmap: data.extensions.roadmap }));
    data.meta.createdAt = at; data.meta.updatedAt = at;
    const normalized = serializeBoardDataFromObject(data);
    validateBoardData(normalized);
    writeFileSync('test-board/us-12.board.json', JSON.stringify(normalized, null, 2) + '\n');
    log(`Validated US-12 board: ${normalized.board.tasks.length} workitems, schema ${normalized.meta.schemaVersion}`);
} finally { await server.close(); }
