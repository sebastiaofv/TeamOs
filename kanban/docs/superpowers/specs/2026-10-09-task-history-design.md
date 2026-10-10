# US6 — Histórico de alterações da tarefa

Estado: entendimento partilhado confirmado pelo utilizador em 9 de outubro de 2026. Decisões de produto, orientação de reutilização da timeline e critérios de aceitação acordados; pronta para implementação.

## Necessidade

Como Gestor de projeto, quero abrir uma tarefa e consultar o histórico das suas alterações, incluindo mudanças de estado, para compreender a sua evolução quando necessário.

## Decisões confirmadas

- O âmbito da US6 são as tarefas do Board. Milestones, fases e sprints não são os itens cujo histórico se pretende consultar nesta história.
- O histórico apresenta uma sequência de alterações com data/hora e valores antes/depois.
- Consultar uma versão completa da tarefa num momento passado não faz parte da necessidade acordada para esta história.

### Conteúdo e apresentação

- Incluir todas as alterações aos dados da tarefa, incluindo mudanças de estado e a criação quando estiver registada.
- Valores calculados automaticamente não geram entradas próprias no histórico.
- Mostrar as alterações mais recentes primeiro.
- Apresentar uma secção recolhível **Histórico** dentro do detalhe da tarefa, com um botão claro para a expandir.
- A consulta do histórico mantém visíveis os dados da tarefa no contexto já selecionado, atual ou histórico, e mantém o âmbito do projeto selecionado.
- Mostrar o histórico disponível e indicar **Histórico anterior indisponível** quando não for possível consultar a evolução anterior.
- Um estado inicial conhecido é identificado como tal e não é apresentado como a criação da tarefa sem evidência dessa criação.
- Nesta US6, mostrar data/hora e alterações; a identificação do autor não faz parte do âmbito acordado. O responsável da tarefa não é tratado como autor da alteração.

### Operações abrangidas

- Incluir mudanças aos dados da tarefa originadas em operações indiretas, como atribuição em lote a um sprint, eliminação de uma fase associada ou restauro de uma versão do projeto. Identificar a operação de origem e os valores alterados na tarefa.
- Incluir criação, mudança e remoção de blocos de Planner associados à tarefa, identificados como **Planeamento**, com as alterações de data, hora ou duração correspondentes.
- Uma ação de desfazer conserva a alteração inicial e acrescenta a mudança inversa. A sequência real de alterações continua visível.
- Apresentar uma entrada por ação registada na timeline, agrupando os campos alterados nesse registo. Não inferir um agrupamento entre eventos independentes sem informação que os relacione.
- Mostrar um resumo legível e permitir expandir os valores antes/depois. Checklists e anexos usam descrições compreensíveis e identificação do item, como **item concluído** e **anexo adicionado**.

### Dados em memória e contexto histórico

- Apresentar as alterações no histórico imediatamente, acompanhando a indicação de gravação pendente ou erro do projeto.
- Ao reabrir um ficheiro, o histórico corresponde ao conteúdo que ficou gravado nesse ficheiro.
- Quando a tarefa é aberta numa versão histórica do projeto, apresentar o histórico apenas até ao momento dessa versão e identificar claramente esse limite.
- Consultar ou expandir o histórico da tarefa mantém a versão do projeto que já estava selecionada.

### Origem do histórico

- Usar a timeline já existente no projeto como fonte do histórico da tarefa.
- O histórico da tarefa é uma projeção dessa timeline: os estados e alterações relevantes para a tarefa são derivados dos eventos e estados conhecidos do projeto.
- Não criar uma timeline persistida separada para cada tarefa nem duplicar o histórico do projeto.
- A projeção considera alterações diretas, alterações indiretas e acontecimentos de planeamento associados à tarefa; filtrar apenas eventos com o identificador da tarefa não cobre o âmbito acordado.
- A reconstrução existente permite obter o estado depois de cada evento e observar alterações comparando os estados adjacentes. A baseline é o primeiro estado conhecido; não existe estado reconstruível anterior a ela.
- A ordem de referência é a sequência dos eventos na timeline do projeto. Num contexto histórico, considerar apenas o prefixo até ao evento selecionado, inclusive.

## Factos do modelo atual

- Existe uma timeline persistida no projeto, com eventos associados a tarefas e valores antes/depois dos campos alterados.
- Mudanças de estado podem aparecer num evento específico ou dentro de uma alteração com vários campos; ambos os casos são relevantes para a consulta.
- O detalhe da tarefa ainda não apresenta o histórico. A timeline existente apresenta o histórico do projeto e a sua navegação pode ativar uma pré-visualização histórica global.
- Os eventos existentes não têm autoria registada. O responsável da tarefa não identifica quem fez uma alteração.
- Alterações indiretas por operações de Roadmap ou restauro do projeto podem estar registadas apenas como eventos do projeto.
- Eventos de Planner associados a uma tarefa descrevem alterações ao seu planeamento, não necessariamente aos dados da tarefa.
- Tarefas importadas sem histórico não têm alterações anteriores recuperáveis; um estado inicial conhecido não prova quando a tarefa foi criada.
- O histórico acompanha o ficheiro do projeto. Eventos podem estar presentes em memória antes de a gravação terminar.
- Os identificadores numéricos das tarefas podem ser reutilizados após uma eliminação. A consulta terá de distinguir a tarefa atual de outras tarefas que tenham usado o mesmo identificador.
- `reconstructBoardStateFromTimeline` reconstitui o estado após um evento, inclusive; `applyTimelineEventToState` permite aplicar os eventos sequencialmente. A ordem é a do array de eventos, não uma ordenação pelos timestamps.
- A atribuição em lote de sprint não guarda valores antes/depois individuais, mas o replay permite derivá-los dos estados adjacentes quando o histórico anterior está íntegro.
- Operações de Roadmap e restauro podem guardar snapshots completos do projeto. O restauro conserva a timeline e inclui uma referência ao evento de origem.
- O seletor de preview limita a reconstrução, mas entrega a timeline completa. A consulta da tarefa precisa de aplicar o limite do evento selecionado à sua lista.
- A mudança inversa causada por desfazer fica registada como um evento normal; não existe informação que permita distingui-la com certeza de uma edição manual equivalente. O requisito é mostrar as duas alterações, não atribuir uma origem de **desfazer** sem evidência.
- Os timestamps automáticos da tarefa não são reconstituídos integralmente pelo replay. A data/hora da entrada de histórico vem do evento, não de `updatedAt` ou `statusChangedAt` da tarefa.
- Não existe um identificador de ciclo de vida por tarefa. Eventos de criação, eliminação e a proveniência de um restauro podem delimitar a sua identidade; casos sem evidência suficiente permanecem ambíguos.
- O Planner também usa identificadores numéricos de tarefa. Num replay que atravessa eliminação e reutilização de identificador, blocos antigos podem aparecer associados ao identificador reutilizado; essa associação não prova continuidade entre tarefas.

Referências: `src/domain/types.ts`, `src/domain/timeline.ts`, `src/domain/task.ts`, `src/domain/dayPlanner.ts`, `src/features/portfolio/queries/portfolioTimelineViews.ts`, `src/features/portfolio/commands/mutationContext.ts`, `src/features/portfolio/commands/taskCommands.ts`, `src/features/portfolio/commands/roadmapCommands.ts`, `src/features/portfolio/commands/timelineCommands.ts`, `src/features/portfolio/commands/plannerCommands.ts` e `src/features/portfolio/task/dialogs/TaskDetailDialog.tsx`.

## Regras de continuidade e apresentação confirmadas

- Quando uma entrada antiga não permite recuperar todos os valores, mostrar a informação conhecida e identificar os valores indisponíveis. Não inventar alterações, valores anteriores ou datas de criação.
- O histórico corresponde à tarefa aberta, não a todas as tarefas que tenham partilhado o seu identificador numérico.
- Quando um restauro recupera uma tarefa anterior e é possível reconhecer a sua continuidade, conservar o histórico anterior dessa tarefa e acrescentar a alteração causada pelo restauro. Alterações de outra tarefa que tenha reutilizado o identificador não entram nessa sequência.
- Quando os dados não permitem atribuir uma entrada a essa tarefa com confiança, não a apresentar como uma alteração comprovada da tarefa; indicar que o histórico disponível está incompleto.
- Sem entradas conhecidas, mostrar **Sem alterações registadas no histórico disponível**, acompanhado da indicação de histórico anterior indisponível quando aplicável.
- Alterações sem mudança efetiva aos dados ou ao planeamento não geram entradas de alteração.
- Atualizar o histórico quando mudam os dados carregados do projeto, incluindo alterações de tarefas, operações de planeamento ou Roadmap, restauro e recarregamento do ficheiro.
- Mostrar datas e horas locais e preservar a sequência dos eventos da timeline do projeto na apresentação das entradas, mais recentes primeiro.
- Manter todas as entradas disponíveis acessíveis numa lista legível e rolável; não introduzir uma política de eliminação ou expiração de histórico nesta história.
- Manter a apresentação coerente com os idiomas EN/PT, temas e navegação por teclado da aplicação.

## Critérios de aceitação

1. Abrir o detalhe de uma tarefa permite expandir e recolher a secção **Histórico**, mantendo o projeto e a versão selecionados.
2. Uma mudança de estado mostra o estado anterior, o seguinte e a data/hora, incluindo quando o estado muda juntamente com outros campos.
3. Uma edição de vários campos apresenta uma entrada com os respetivos valores antes/depois agrupados.
4. Uma operação indireta que altera dados da tarefa aparece no seu histórico com a operação de origem; alterações que afetam apenas outras tarefas não aparecem.
5. Criar, mover ou remover um bloco de Planner da tarefa produz uma entrada identificada como **Planeamento**, com as alterações correspondentes.
6. Desfazer uma alteração mantém a entrada inicial e apresenta a alteração inversa como outra entrada.
7. O histórico é derivado exclusivamente da timeline existente no projeto. Consultá-lo não cria uma timeline por tarefa, não duplica eventos e não altera o ficheiro do projeto.
8. Um estado inicial de uma tarefa importada não é apresentado como a sua criação sem evidência. Informação anterior ou valores irrecuperáveis são identificados como indisponíveis.
9. O histórico da tarefa aberta respeita a sua identidade e o seu ciclo de vida; não mistura tarefas de projetos diferentes ou tarefas distintas que reutilizaram um identificador.
10. Numa versão histórica, a lista termina no evento limite dessa versão e indica esse contexto. Não inclui acontecimentos posteriores.
11. Alterações ainda por guardar aparecem imediatamente, acompanhando a indicação de gravação pendente ou erro do projeto. Ao reabrir o ficheiro, apresenta-se o histórico nele gravado.
12. Checklists e anexos têm descrições e identificação legíveis, com possibilidade de consultar os detalhes dos valores alterados.
13. Autoria não é apresentada como informação conhecida; responsáveis da tarefa não são usados como autores dos eventos.
14. Estados vazios, atualização dos dados, ordenação, idiomas, temas e acesso por teclado seguem as regras de continuidade e apresentação confirmadas.

## Confirmação final

O utilizador confirmou as recomendações de todas as rondas, incluindo o tratamento de informação incompleta, a identidade e continuidade da tarefa e as regras e critérios de aceitação de fecho. A orientação explícita é derivar o histórico e os estados da tarefa da timeline já existente no projeto.
