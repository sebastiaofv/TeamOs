# US2 — Relações e bloqueios

Board: [`us-2.board.json`](../../test-board/us-2.board.json). Branch: `us-2`. Issue: [#26](https://github.com/sebastiaofv/TeamOs/issues/26).

1. Importar uma cópia do board na implementação da US2. Por defeito há **10 itens ativos**; **Todos: 12**, incluindo os arquivados #208 e #209.
2. #203 depende de #201 e #202. Concluir apenas um mantém o bloqueio; concluir ambos resolve-o; reabrir um volta a bloquear. Alterar o estado de #203 continua permitido.
3. #205 tem bloqueio **manual**, mesmo com #204 concluído. Resolver/reabrir/concluir a dependência não deve apagar o motivo manual.
4. #209 está arquivado mas aberto: continua a bloquear #210. Concluir resolve; eliminar pede confirmação do impacto e preserva #210.
5. #206 está relacionado com #207 e #208 sem dependência. Navegar nos dois sentidos, substituir a relação escolhendo direção e remover sem apagar itens. A pesquisa deve encontrar #208 por ID/título e identificar arquivo/conclusão.
6. Em #206, **Criar relacionado** herda apenas etapa/milestone; não herda participantes, sprint, prioridade, prazo, tags, checklist ou bloqueio. O novo item começa no Backlog. Cancelar não deixa nada criado.
7. Cadeia #201 → #203 → #211: tentar #211 → #201 deve falhar por ciclo indireto. Autoassociações e repetição do par #201/#203 devem ser rejeitadas. Usar #212 para novas associações.
8. Guardar, reabrir e confirmar relações e bloqueios. Reimportar uma cópia original para repor o cenário.
