# Dashboards de projeto e portefólio

Estado: decisões de produto acordadas; aguarda confirmação final do entendimento partilhado e da proposta de fecho. A implementação depende dessa confirmação.

## Necessidade

Como Coordenador, quero uma visão do estado atual dos projetos abertos na aplicação para acompanhar o progresso e identificar onde é necessária intervenção. Preciso tanto de um dashboard de cada projeto como de um dashboard que agregue todos os projetos abertos.

Consulta diária e reuniões semanais são os momentos de utilização acordados.

## Decisões confirmadas

### Âmbito e navegação

- O portefólio corresponde aos projetos carregados na aplicação pelo utilizador.
- Acrescentar Dashboard às vistas existentes.
- Com Todos selecionado, apresentar o dashboard agregado do portefólio.
- Com um projeto selecionado, apresentar o dashboard desse projeto.
- Manter a vista Dashboard ao alternar entre projetos ou selecionar Todos.

### Indicadores

- Progresso de projeto: tarefas Done não arquivadas / total de tarefas não arquivadas, incluindo Backlog.
- Progresso global: somar numeradores e denominadores de todos os projetos abertos; não fazer a média das percentagens dos projetos.
- Mostrar a distribuição das tarefas não arquivadas pelos quatro estados.
- Projetos sem tarefas não arquivadas apresentam Sem tarefas, em vez de 0%.
- Sinais de intervenção: contagens de tarefas não arquivadas, por concluir, bloqueadas ou atrasadas.
- Próximos prazos: tarefas não arquivadas por concluir e milestones com data nos próximos sete dias, identificando o tipo de item e, na visão global, o projeto.
- Os indicadores usam os totais do âmbito selecionado e são independentes dos filtros do Board.

### Apresentação

- Dashboard global: indicadores agregados no topo e uma linha por projeto, com progresso, distribuição por estado, bloqueios, atrasos e próximos prazos.
- Ordenar os projetos pelo número de tarefas distintas que precisam de intervenção, do maior para o menor.
- Dashboard de projeto: os mesmos indicadores, acompanhados de listas de tarefas bloqueadas, tarefas atrasadas e próximos prazos.
- Mostrar o motivo do bloqueio nas listas de tarefas bloqueadas.

### Acesso ao detalhe

- Clicar no nome de um projeto abre o dashboard desse projeto.
- Clicar numa contagem mostra as tarefas correspondentes no dashboard e dentro do âmbito dessa contagem.
- Clicar numa tarefa abre o diálogo de detalhe existente.
- Clicar num milestone abre o respetivo detalhe no roadmap.

### Datas e sobreposição de sinais

- A janela de próximos prazos inclui hoje e os seis dias seguintes, pela data local.
- Uma tarefa está atrasada quando o prazo é anterior a hoje; prazo hoje não é atraso.
- Uma tarefa bloqueada e atrasada aparece em ambos os indicadores, mas conta uma única vez no total de tarefas que precisam de intervenção e na ordenação dos projetos.
- O indicador de atrasos usa apenas tarefas por concluir e não arquivadas. Milestones com data passada não são classificados como atrasados, pois o modelo não permite determinar a sua conclusão.

## Factos do modelo atual

- Não existe um estado persistido de projeto ativo: o âmbito acordado é o conjunto de projetos carregados.
- As tarefas têm estado, arquivamento, bloqueio e prazo.
- Milestones têm título e data, mas não têm estado de conclusão.
- Existem seleção Todos/projeto, diálogo de detalhe de tarefa e vistas Board, Roadmap, Calendar e Planner.

Referências: `src/domain/types.ts`, `src/features/portfolio/shell/PortfolioControls.tsx`, `src/features/portfolio/commands/taskCommands.ts` e `src/app/App.tsx`.

## Proposta de fecho — aguarda confirmação

- Atualizar os indicadores quando os dados carregados mudam, incluindo alterações a tarefas, importação, remoção ou recarregamento de projetos. As datas usam o dia local corrente.
- Sem projetos carregados, apresentar um estado vazio que convida a abrir projetos.
- Projetos sem tarefas não arquivadas continuam visíveis, com Sem tarefas no progresso e contagens de tarefas a zero; os seus próximos milestones continuam elegíveis.
- Apresentar listas de prazos por data crescente e usar o nome do projeto como desempate na ordenação por necessidade de intervenção.
- Manter a apresentação coerente com os idiomas EN/PT, temas e navegação por teclado da aplicação.

## Critérios de aceitação propostos

1. Dashboard com Todos selecionado agrega exatamente os projetos carregados; selecionar um projeto mantém Dashboard e restringe os indicadores a esse projeto.
2. Um projeto com duas tarefas não arquivadas, uma delas Done, apresenta 50% e a distribuição correspondente. Tarefas arquivadas não entram nas contagens nem nas listas de tarefas.
3. Com um projeto a 1/2 e outro a 90/100, o progresso global usa 91/102, aproximadamente 89,2%, e não 70%.
4. Uma tarefa bloqueada e atrasada aparece nas duas contagens e listas, mas contribui apenas uma vez para o total de intervenção.
5. Uma tarefa com prazo hoje aparece nos próximos prazos e não nos atrasos. Hoje e hoje + 6 dias estão na janela; hoje + 7 dias fica fora.
6. Tarefas Done não aparecem em bloqueios, atrasos ou próximos prazos, mesmo que tenham bloqueio ou prazo preenchidos.
7. Um milestone com data na janela aparece nos próximos prazos; um milestone com data passada não aumenta o indicador de tarefas atrasadas.
8. Alterar os filtros do Board não altera os indicadores do dashboard global ou do projeto.
9. Clicar num projeto, contagem, tarefa ou milestone conduz ao detalhe acordado e respeita o âmbito selecionado.
10. Estados vazios e alterações aos dados seguem a proposta de fecho acima.

## Confirmação pendente

Confirmar que o conjunto de decisões, a proposta de fecho e os critérios de aceitação representam o entendimento partilhado antes da implementação.

## Estudo visual

O utilizador pediu um mockup visual antes da implementação. O protótipo usa dados ilustrativos e permite avaliar as duas escalas do dashboard e a abertura das listas ao clicar nas contagens.

- A — Visão analítica: tabela comparativa dos projetos; indicadores e listas detalhadas no projeto.
- B — Cartões de projeto: mosaico de cartões; painel de progresso e listas no projeto.
- C — Foco na intervenção: seleção lateral de projetos, tarefas que precisam de intervenção e agenda de próximos prazos.

Executar `npm run prototype:dashboard`. Na rota `/`, usar `?prototype=dashboard&variant=A`, `B` ou `C`. A barra inferior e as teclas de seta permitem comparar as propostas. Selecionar Todos ou um projeto muda o âmbito; clicar nas contagens apresenta os itens correspondentes dentro do dashboard.

Fontes do mockup: `src/features/portfolio/dashboard/DashboardPrototype.tsx`, `dashboard-prototype.css` e `dashboard.prototype.html`. A entrada de desenvolvimento encontra-se em `src/app/main.tsx`.

Estado da avaliação visual: aguarda escolha ou combinação das propostas pelo utilizador.
