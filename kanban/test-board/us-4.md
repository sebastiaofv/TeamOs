# US-4 · Workflow por projeto

Usar o branch `us-4`. Copiar o JSON antes de importar com escrita; arrastar uma cópia permite testar leitura. Dados fictícios.

1. Importar `us-4.board.json`: Backlog está numa lista própria; Board mostra Ready, Development, Review, Delivered e Abandoned, com cores e ordem configuradas.
2. Enviar #401 para Board: passa para Ready sem sprint. Ready → Delivered é proibido; Ready → Development é permitido. Repetir via palette e drag-and-drop.
3. #402 está bloqueado: pode passar para Review. Abandoned com prazo antigo não mostra atraso.
4. Definições do projeto → Workflow: renomear/reordenar/mudar cor, Cancelar e reabrir: sem alterações. Guardar mantém IDs, tarefas e arquivo.
5. Adicionar estado sem ligações, duplicar nome ou remover categoria Concluído: Guardar é impedido. Backlog não pode ser eliminado nem mudar de categoria.
6. Eliminar Review: indica #403 arquivado e exige destino explícito. Atualizar transições/referências se necessário e guardar. #403 conserva os restantes campos.
7. Mudar categoria de estado em uso: confirmar impacto; Cancelar preserva o projeto. Remover uma transição não move tarefas existentes.
8. Vista agregada: mover para categoria com zero destinos mostra explicação, um move diretamente, vários pede escolha. O seletor no cartão permite mudar dentro da categoria.
9. Guardar/reabrir: estados, links direcionais e associações mantêm-se. Eventos novos conservam nomes dos estados à data, mesmo após renomear.
10. Arrastar ficheiro para leitura: consultar configuração e detalhes, sem mutações. Testar tema claro/escuro e teclado.

Hierarquia e derivação automática de pais dependem da US-12 (#36), ainda ausente em `main`. Dependências relacionais dependem da US-2 (#26); este branch não a inclui. A política de conclusão usa categorias e não nomes.

Validação automatizada: `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npx playwright test tests/e2e/workflow.test.ts`.
