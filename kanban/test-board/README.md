# Boards de teste manual

As histórias integradas têm os boards e roteiros nesta pasta em `main`; histórias pendentes apontam para o respetivo branch:

| História | Board | Roteiro |
| --- | --- | --- |
| US1 · integrada em `main` · PR #44 | [us-1.board.json](us-1.board.json) | [us-1.md](us-1.md) |
| US2 · branch `us-2` · PR #45 | [us-2.board.json](https://github.com/sebastiaofv/TeamOs/blob/us-2/kanban/test-board/us-2.board.json) | [us-2.md](https://github.com/sebastiaofv/TeamOs/blob/us-2/kanban/test-board/us-2.md) |
| US3 · integrada em `main` · PR #46 | [us-3.board.json](us-3.board.json) | [us-3.md](us-3.md) |
| US5 · integrada em `main` · PR #49 | [us-5.board.json](us-5.board.json) | [us-5.md](us-5.md) |
| US7 · branch `us-7` | [us-7.board.json](us-7.board.json) | [us-7.md](us-7.md) |
| US8 · branch `us-8` | [us-8.board.json](us-8.board.json) | [us-8.md](us-8.md) |
| US6 · branch `us-6` | [us-6.board.json](us-6.board.json) | [us-6.md](us-6.md) |
| US11 · integrada em `main` · PR #55 | [us-11.board.json](us-11.board.json) | [us-11.md](us-11.md) |
| US21 · integrada em `main` · PR #55 | [us-21.board.json](us-21.board.json) | [us-21.md](us-21.md) |

Para US1 e US3, usar a aplicação de `main`. Para histórias pendentes, usar o branch correspondente. Os boards das histórias anteriores podem estar presentes por herança do branch base; cada nova história acrescenta apenas os seus próprios ficheiros.

Copiar os ficheiros antes de testar: **Import Projects** abre-os com escrita e cada alteração é gravada automaticamente. Arrastar os ficheiros para a aplicação permite testar em modo só de leitura. Todos os dados são fictícios.

As datas são fixas em outubro/novembro de 2026; navegar para esse período no Calendário/Roadmap e para **19/10/2026** no Day Planner.

## Condição para próximas histórias

Cada issue deve fornecer, no seu próprio branch e PR, um board JSON válido em `kanban/test-board/us-N.board.json` e o respetivo roteiro em `kanban/test-board/us-N.md`, com cenários representativos dos critérios de aceitação, estados vazios e casos-limite relevantes, passos e resultados esperados. O `README.md` desta pasta reúne as instruções gerais. Usar o esquema suportado pela respetiva implementação e validar o board antes do PR.
