# US3 — Participantes e responsável

Board: [`us-3.board.json`](../../test-board/us-3.board.json). Branch: `us-3`. Issue: [#27](https://github.com/sebastiaofv/TeamOs/issues/27). Requer esquema v2.

1. Importar uma cópia do board: **9 ativos / 10 no total**. No detalhe, os campos responsável/participantes são separados.
2. Responsável **Ana** + participante **Rui**: **#301 e #307** nos ativos; incluir arquivados acrescenta **#308**. #302 não corresponde porque o responsável é Rui.
3. **Sem responsável**: #303, #304 e #310. **Sem participantes**: só #304. Os dois filtros combinados também dão apenas #304.
4. Em #301, escolher Marta como responsável inclui-a nos participantes e mantém Ana/Rui. Limpar responsável mantém todos; o estado permanece igual. Testar nomes livres e sugestões também pela palette.
5. Em #302, corrigir Rui para Rui Silva atualiza o responsável apenas nesse item. #301 e os restantes mantêm Rui.
6. Em #305, remover Marta pede confirmação: cancelar mantém os dois campos; confirmar deixa Rui participante e limpa responsável. Repetir pela palette e testar Undo.
7. #303 tem um único participante e continua sem responsável. #304 permite guardar e mudar estado sem qualquer atribuição. #306 oferece nomes adicionais nas sugestões. #309 testa nomes que coincidem com valores internos de filtros.
8. Repetir os filtros em Board, Tabela, Roadmap (expandir Construção), Calendário (outubro de 2026) e Day Planner (19/10/2026; distinguir itens planeados e lista de itens).
9. Consultar a timeline depois das alterações: valores anteriores/posteriores, preview e reabertura devem manter coerência. Mostrar a coluna Responsável na Tabela e experimentar criação e gravação por Ctrl/Cmd+Enter.
10. Importar também uma cópia do board v1 de US1: a migração preserva participantes e deixa **todos sem responsável**, mesmo #126 com Ana como participante único. Gravar/reabrir passa a usar esquema v2.
