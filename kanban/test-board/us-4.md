# US-4 · Workflow por projeto

Usar `us-4`. Copiar o JSON antes de importar com escrita; arrastar outra cópia permite testar leitura. Dados fictícios.

## Clarificações incorporadas

O comentário de 19/10/2026 em #28 prevalece sobre os pontos contraditórios da descrição inicial: cinco categorias distintas, nove estados iniciais, percursos de testes/reanálise, estados terminais por defeito e três colunas principais por categoria, tanto por projeto como no agregado.

1. Importar `us-4.board.json`: Board apresenta **To Do / In Progress / Done**; Backlog é uma lista própria e Cancelled/Duplication ficam numa lista de cancelados, não são concluídos nem aparecem como atrasados.
2. #401 → Enviar para Board utiliza To Do sem exigir sprint. Arrastar diretamente de Backlog para In Progress/Done é impedido pelo workflow predefinido. Novos itens começam sempre em Backlog.
3. #402 está bloqueado mas pode mudar para Ready to test ou Done. Estado/responsável são dimensões independentes: mudar estado conserva Ana. O cartão identifica o estado específico com a cor configurada.
4. #406: Ready to test → Testing → Re-analysis → In progress → Ready to test → Testing → Done. Repetir o ciclo antes de concluir mantém o mesmo ID e acrescenta eventos de estado à timeline do item.
5. Done, Cancelled e Duplication são terminais por defeito. Configurar explicitamente uma transição de reabertura permite voltar ao trabalho, sem criar outro item.
6. Abrir #402: estado e responsável editáveis no topo do detalhe, sem abrir o editor. Alterar responsável adiciona-o aos participantes quando necessário, mas não altera estado. Estado respeita só os destinos permitidos. Confirmar a mesma cor no cartão, detalhe e Table.
7. Arrastar entre categorias: zero destinos mostra explicação, um move diretamente, vários pede escolha. Dentro de In Progress, usar o estado do cartão para alternar Testing/Re-analysis; arrastar para a mesma categoria não muda o estado.
8. Definições → Workflow: criar/renomear/reordenar/colorir estados e editar ligações direcionais em rascunho. Cancelar descarta tudo; guardar valida categorias obrigatórias, Backlog reservado, nomes únicos, referências e acessibilidade a partir de Backlog. Estados sem saídas não terminais são identificados.
9. Eliminar Testing em uso exige realocação explícita e indica #403 arquivado. Referências/transições resultantes têm de ser válidas; aplicar tudo numa operação e preservar o histórico anterior. Mudar categoria em uso pede confirmação do impacto.
10. Guardar/reabrir preserva IDs, nomes, cores, estados, pessoas e ligações. Ficheiros antigos e workflow v1 migram para v2 sem substituir nomes/transições existentes nem inventar eventos. O novo percurso predefinido aplica-se a **novos projetos**, não é imposto retroativamente a workflows utilizados.
11. Leitura/fotografia histórica: consultar sem mutações. Testar PT-PT/inglês, teclado, temas claro/escuro e falha/retry de gravação.

## Integrações condicionais

A US-12 ainda não existe em `main`. Não são criados tipos nem uma hierarquia de workitems nesta história; a regra clarificada é que **Epics são agrupamentos sem estado/transições de workflow**, em vez de implementar a anterior proposta de estados derivados para Epics. Relações/bloqueadores dependem da US-2; a conclusão usa a categoria semântica, não o nome do estado. US-6 projeta os eventos canónicos no Histórico quando integrada.

Verificar: `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npx playwright test tests/e2e/workflow.test.ts`.
