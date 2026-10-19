# US2 — Relações e bloqueios

Board: [`us-2.board.json`](us-2.board.json). Branch: `us-2`. Issue: [#26](https://github.com/sebastiaofv/TeamOs/issues/26).

1. Importar uma cópia do board na implementação da US2. Por defeito há **10 itens ativos**; **Todos: 12**, incluindo os arquivados #208 e #209.
2. #203 depende de #201 e #202. Concluir apenas um mantém o bloqueio; concluir ambos resolve-o; reabrir um volta a bloquear. Alterar o estado de #203 continua permitido.
3. #205 tem bloqueio **manual**, mesmo com #204 concluído. Resolver/reabrir/concluir a dependência não deve apagar o motivo manual.
4. #209 está arquivado mas aberto: continua a bloquear #210. Concluir resolve; eliminar pede confirmação do impacto e preserva #210.
5. #206 está relacionado com #207 e #208 sem dependência. Navegar nos dois sentidos, substituir a relação escolhendo direção e remover sem apagar itens. Em **Associar workitem**, clicar no único campo de pesquisa/seleção vazio: a dropdown deve mostrar os 11 outros itens do projeto, incluindo concluídos e arquivados. Escrever `#208` ou parte do título deve filtrar imediatamente e identificar arquivo/conclusão. Selecionar diretamente um resultado deve preencher o campo e fechar a lista. Repetir com teclado (↑/↓ e Enter); Escape fecha apenas a lista e Tab avança para a relação. Alterar o texto após selecionar limpa a seleção anterior; sem resultados, a confirmação fica desativada.
6. Em #206, **Criar relacionado** herda apenas etapa/milestone; não herda participantes, sprint, prioridade, prazo, tags, checklist ou bloqueio. O novo item começa no Backlog. Cancelar não deixa nada criado.
7. Cadeia #201 → #203 → #211: tentar #211 → #201 deve falhar por ciclo indireto. Autoassociações e repetição do par #201/#203 devem ser rejeitadas. Usar #212 para novas associações.
8. Guardar, reabrir e confirmar relações e bloqueios. Reimportar uma cópia original para repor o cenário.

## Estado e responsáveis nas relações

1. Abrir #203: em **É bloqueado por**, #201 apresenta **Estado: In Progress** e **Responsáveis: Ana**; #202 apresenta **To Do / Rui**. Em **Bloqueia**, #211 apresenta **Backlog / Ana**.
2. Abrir #206: em **Relacionado com**, #207 apresenta **Backlog / —** (sem responsável) e #208 apresenta **Done / José Silva**, mantendo a indicação de arquivo. Navegar para #207: a relação com #206 apresenta **In Progress / Ana, Marta**, sem omitir responsáveis.
3. Fechar o detalhe, editar #201 para substituir Ana por dois responsáveis e alterar o seu estado para Done. Voltar a abrir #203: a relação apresenta **Done** e os dois nomes atuais. Remover ambos os responsáveis e voltar a consultar: apresenta **—**. Guardar/reabrir o projeto mantém os valores atualizados.
4. Repetir em PT-PT e inglês (**Estado / Responsáveis**, **Status / Assignees**), em mobile e no modo de leitura. Os campos devem estar visíveis na própria secção, com títulos e nomes longos a ajustar à largura disponível e as relações navegáveis por teclado.
