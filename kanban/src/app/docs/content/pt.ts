import type { DocSection } from '../docsModel';

// Documentação em português (pt-PT). Os ids de secções e tópicos têm de ser
// iguais aos de en.ts: os testes verificam o índice e as ligações.
export const DOCS_PT: DocSection[] = [
    {
        id: 'start',
        title: 'Introdução e primeiros passos',
        topics: [
            {
                id: 'start-what',
                title: 'O que é o TeamOS',
                summary: 'O TeamOS organiza o trabalho em projetos independentes, planeia-o num roadmap e em sprints e executa-o em boards Kanban — tudo a partir de ficheiros de projeto locais.',
                blocks: [
                    { kind: 'p', text: 'O TeamOS é um espaço de planeamento e execução para equipas que trabalham de forma Agile. Cada **projeto** tem a sua própria pasta no computador, com `project.json`, `history.json` e `attachments/`. Os ficheiros antigos `.board.json` continuam suportados. Pode abrir vários projetos ao mesmo tempo, agrupar projetos relacionados num **produto** e trabalhar em todos a partir do mesmo ecrã.' },
                    { kind: 'p', text: 'Tudo o que acompanha é um **workitem**: um Epic, uma User Story, uma Task ou um Bug. Os workitems avançam por workflows configuráveis, são planeados em fases, marcos e sprints e guardam um histórico local completo das alterações.' },
                    { kind: 'h', text: 'O que pode fazer' },
                    { kind: 'list', items: [
                        '**Planear** — decompor objetivos em Epics, User Stories e Tasks; calendarizá-los no [Roadmap](plan-roadmap) e em [sprints](plan-sprints).',
                        '**Executar** — mover o trabalho no [Board Kanban](wf-board), acompanhar dependências e bloqueios e planear o seu dia no [Planeador](plan-day).',
                        '**Acompanhar** — consultar a [Tabela](views-table), o [Dashboard](views-dashboard) e o [Controlo do projeto](views-control) para ver progresso, riscos, decisões e entregáveis.',
                        '**Validar** — confirmar que as User Stories e os Bugs produzem o resultado esperado através da [aceitação funcional](wi-acceptance).'
                    ] },
                    { kind: 'h', text: 'Como os dados são guardados' },
                    { kind: 'p', text: 'Não há servidor nem conta. Os projetos são ficheiros seus: a aplicação lê-os e escreve-os através do navegador (navegadores baseados em Chromium, como o Chrome ou o Edge). As alterações [são guardadas automaticamente](files-saving) no ficheiro e cada alteração guardada fica registada no [histórico](files-history) do projeto.' },
                    { kind: 'callout', tone: 'note', title: 'Sobre esta documentação', text: 'Esta documentação descreve a versão do TeamOS que está a utilizar. As notas **Prática Agile** são recomendações metodológicas; as notas **Regra da aplicação** descrevem comportamento imposto pela aplicação.' }
                ],
                related: ['start-layout', 'start-first-project', 'agile-principles']
            },
            {
                id: 'start-layout',
                title: 'Orientação no ecrã',
                summary: 'Escolha o projeto junto ao logo, a vista abaixo do cabeçalho e os controlos dentro dessa vista.',
                blocks: [
                    { kind: 'terms', items: [
                        ['Barra superior', 'Seletor de projeto junto ao logo, lupa para a [paleta de comandos](prod-palette), atalhos de teclado, documentação, Definições da aplicação, Importar projetos e Novo projeto. Continua disponível durante a leitura.'],
                        ['Botão de documentação', 'O livro abre a documentação e passa a mostrar um ícone de aplicação. Clique para regressar ao espaço de trabalho, mantendo o projeto, a vista e os filtros.'],
                        ['Navegação', 'Escolha Quadro, Dashboard, Tabela, Roadmap, Controlo do projeto ou Planeador por baixo da barra superior. O Calendário é um separador dentro do Planeador.'],
                        ['Seletor de projeto', 'Abra o nome junto ao logo para escolher **Todos** ou um projeto. Expanda um produto para ver os seus projetos. As definições, a remoção e a repetição de gravação ficam neste menu; o estado de gravação também aparece junto ao nome selecionado.'],
                        ['Controlos da vista', 'No Board, pesquisa e Filtros e vista ficam junto de Apenas sprints ativos. Cada tabela tem pesquisa, Filtros, Colunas e Exportar CSV. O Dashboard tem período e âmbito; o Roadmap tem largura e zoom; o Planeador tem Dia, Semana e Calendário.'],
                        ['Barra do histórico', 'Ative-a nas Definições da aplicação para consultar o [histórico](files-history) do projeto selecionado.']
                    ] },
                    { kind: 'p', text: 'O Quadro e o Planeador, incluindo o Calendário, funcionam com todos os projetos carregados ou com um projeto. Dashboard, Tabela, Roadmap e Controlo do projeto aparecem quando seleciona um único projeto.' },
                    { kind: 'callout', tone: 'tip', text: 'Prima [[?]] para ver os atalhos e [[H]] para abrir ou fechar a documentação. Os atalhos de uma letra aplicam-se quando não está a escrever num campo.' }
                ],
                related: ['views-choose', 'prod-shortcuts']
            },
            {
                id: 'start-first-project',
                title: 'Criar ou abrir um projeto',
                summary: 'Crie uma pasta de projeto, abra um ou vários projetos pela pasta principal ou importe ficheiros antigos. Autorize leitura e escrita para guardar automaticamente.',
                blocks: [
                    { kind: 'h', text: 'Criar um novo projeto' },
                    { kind: 'steps', items: [
                        'Clique em **+ Novo projeto** na barra superior (ou prima [[N]]).',
                        'Preencha as definições: o **Nome do projeto** e uma **Sigla do projeto** com 1 a 4 letras são obrigatórios. A sigla é o prefixo dos IDs dos novos workitems, por exemplo `CHK-US-2`.',
                        'Opcionalmente, acrescente descrição, produto, membros e etiquetas. Pode alterar tudo isto mais tarde.',
                        'Clique em **Guardar**, selecione a pasta principal e autorize leitura e escrita. O TeamOS cria uma subpasta com `project.json`, `history.json` e `attachments/` e seleciona o projeto. Se o nome já existir, indique outro.'
                    ] },
                    { kind: 'h', text: 'Abrir projetos existentes' },
                    { kind: 'steps', items: [
                        'Clique em **Importar projetos** (ou prima [[I]]) e selecione a pasta de um projeto ou uma pasta principal com projetos nas subpastas diretas. Os projetos abertos são mantidos, sem duplicados. Os ficheiros antigos `.board.json` encontrados na pasta selecionada são convertidos em subpastas, preservando os originais.',
                        'Em alternativa, arraste ficheiros antigos `.board.json` para a janela, para consulta em modo de leitura.',
                        'Quando o navegador pedir, autorize alterações ao ficheiro para que o projeto possa ser guardado.'
                    ] },
                    { kind: 'callout', tone: 'rule', title: 'Regra da aplicação', text: 'Os ficheiros arrastados para a janela não trazem permissão de escrita e abrem em **modo de leitura**: pode navegar e abrir workitems, mas não alterá-los. Use Importar projetos para trabalhar num ficheiro. Consulte [Abrir projetos e modo de leitura](files-open).' },
                    { kind: 'p', text: 'A seguir, acrescente membros e etiquetas nas [Definições do projeto](projects-settings) para poder atribuir pessoas e classificar workitems.' }
                ],
                related: ['projects-settings', 'files-open', 'start-first-flow']
            },
            {
                id: 'start-first-flow',
                title: 'O seu primeiro fluxo de trabalho',
                summary: 'Um percurso curto e prático, desde um projeto vazio até uma User Story validada.',
                blocks: [
                    { kind: 'steps', items: [
                        '**Descreva o objetivo.** Selecione o projeto, abra **Tabela → Todos** e clique em **Criar workitem**. Crie um **Epic** que descreva o objetivo de negócio.',
                        '**Expresse as necessidades.** A partir dos detalhes do Epic, crie **User Stories**. Dê a cada uma **Critérios de aceitação** para a equipa validar o resultado mais tarde.',
                        '**Planeie o trabalho.** A partir de cada Story, crie as **Tasks** necessárias para a entregar. Defina prioridade e esforço.',
                        '**Planeie um sprint.** Em **Tabela → Backlog**, selecione as Stories e use **Ações de sprint → Criar sprint**. Indique datas, um Objetivo do Sprint e, opcionalmente, capacidade em Story Points.',
                        '**Execute.** Inicie o Sprint no Roadmap ou em Tabela → Sprints. Com **Apenas sprints ativos** selecionado, o trabalho aparece no Board. Mova as Tasks pelas transições permitidas.',
                        '**Aceite.** Quando as Tasks estiverem concluídas, mova a Story para um estado concluído. A aplicação pede a aceitação funcional: confirme o resultado com a identidade selecionada no projeto, ou indique um autor local se for pedido.'
                    ] },
                    { kind: 'callout', tone: 'tip', text: 'O [exemplo completo](ex-walkthrough) segue este percurso em detalhe com um projeto realista.' }
                ],
                related: ['ex-walkthrough', 'agile-decomposition', 'wi-acceptance']
            }
        ]
    },
    {
        id: 'agile',
        title: 'Metodologia Agile no TeamOS',
        topics: [
            {
                id: 'agile-principles',
                title: 'Trabalho iterativo e incremental',
                summary: 'Entregue valor em incrementos pequenos e validados e adapte o plano ao que vai aprendendo.',
                blocks: [
                    { kind: 'p', text: 'As equipas Agile não tentam definir tudo à partida. Trabalham em **iterações** curtas (sprints), cada uma com um **incremento** que pode ser validado. O feedback de cada incremento orienta o seguinte.' },
                    { kind: 'h', text: 'O ciclo no TeamOS' },
                    { kind: 'table', head: ['Atividade Agile', 'Onde acontece no TeamOS'], rows: [
                        ['Recolher e refinar o backlog', 'Workitems no estado **Backlog**; [Tabela](views-table) e Board Funcional'],
                        ['Priorizar', 'Prioridade, esforço e pontuação; ordenação e filtros'],
                        ['Decompor', '[Hierarquia](wi-hierarchy) Epic → User Story → Task'],
                        ['Planear uma iteração', '[Sprints](plan-sprints) no Roadmap e na Tabela'],
                        ['Executar', '[Boards](wf-board) Técnico e Funcional'],
                        ['Inspecionar o progresso', '[Dashboard](views-dashboard), Tabela → Sprints, histórico'],
                        ['Validar resultados', '[Aceitação funcional](wi-acceptance) de Stories e Bugs'],
                        ['Gerir a incerteza', 'Riscos, decisões e entregáveis no [Controlo do projeto](views-control)']
                    ] },
                    { kind: 'callout', tone: 'method', title: 'Prática Agile', text: 'Mantenha iterações curtas (uma a quatro semanas) e com duração constante, para que o que a equipa conclui em cada sprint se torne uma referência fiável de planeamento.' }
                ],
                related: ['agile-backlog', 'agile-sprints', 'agile-rules']
            },
            {
                id: 'agile-backlog',
                title: 'Backlog e priorização',
                summary: 'O backlog é a lista ordenada de tudo o que pode ser feito. Mantenha-o visível, atualizado e ordenado por valor.',
                blocks: [
                    { kind: 'p', text: 'Os novos workitems começam no estado reservado **Backlog**. Backlog é um estado do workflow; **Tabela → Backlog** é uma lista de unidades de planeamento com trabalho pendente e sem alocação a um Sprint elegível. Iniciar um Sprint move os seus workitems em Backlog para o primeiro estado Por iniciar do respetivo workflow.' },
                    { kind: 'h', text: 'Priorizar' },
                    { kind: 'list', items: [
                        'A **Prioridade** (alta, média, baixa) exprime importância ou urgência.',
                        'O **Esforço** (XS, S, M, L, XL) é uma estimativa relativa de dimensão.',
                        'A **Pontuação** combina ambos (prioridade ÷ esforço): itens pequenos e importantes aparecem primeiro. Ordene por Pontuação para encontrar ganhos rápidos.',
                        'O **Prazo** marca um compromisso firme; os itens em atraso são destacados.'
                    ] },
                    { kind: 'h', text: 'Refinar o backlog' },
                    { kind: 'steps', items: [
                        'Abra a **Tabela** do projeto e use **Backlog** para ver o que ainda não está num sprint.',
                        'Ordene por prioridade ou pontuação, filtre por participante e use `#etiqueta` na [paleta de comandos](prod-palette) para encontrar workitems etiquetados.',
                        'Garanta que as Stories do topo têm Critérios de aceitação claros e Tasks suficientemente pequenas para terminar num sprint.'
                    ] },
                    { kind: 'callout', tone: 'method', title: 'Prática Agile', text: 'Refine o backlog regularmente (por exemplo, uma vez por sprint). Os itens do topo devem ser pequenos e bem compreendidos; os mais abaixo podem continuar genéricos.' },
                    { kind: 'callout', tone: 'rule', title: 'Regra da aplicação', text: 'A prioridade, o esforço e a pontuação são informativos. A aplicação não reordena nem bloqueia trabalho com base neles.' }
                ],
                related: ['wi-fields', 'views-filters', 'agile-decomposition']
            },
            {
                id: 'agile-decomposition',
                title: 'Decompor o trabalho',
                summary: 'Passe de um objetivo amplo para necessidades entregáveis e depois para trabalho de execução concreto.',
                blocks: [
                    { kind: 'table', head: ['Nível', 'Representa', 'Boa prática'], rows: [
                        ['Epic', 'Um objetivo ou resultado de negócio', 'Descreva objetivo, âmbito e valor de negócio. Demasiado grande para um sprint.'],
                        ['User Story', 'Uma necessidade de negócio, aceite com base em critérios', 'Escrita do ponto de vista do utilizador; cabe num sprint; critérios verificáveis.'],
                        ['Task', 'Trabalho de execução', 'Concreta, atribuível, idealmente concluída em um ou dois dias.'],
                        ['Bug', 'Comportamento incorreto a corrigir e validar', 'Passos para reproduzir, resultado esperado e observado.']
                    ] },
                    { kind: 'h', text: 'Escrever uma boa User Story' },
                    { kind: 'p', text: 'Um formato comum é: **Como** tipo de utilizador, **quero** uma capacidade, **para** obter um benefício. Acrescente Critérios de aceitação que qualquer pessoa possa verificar, como “Dado…, quando…, então…”.' },
                    { kind: 'callout', tone: 'method', title: 'Prática Agile', text: 'Boas Stories são Independentes, Negociáveis, Valiosas, Estimáveis, Pequenas e Testáveis (INVEST). Se uma Story não couber num sprint, divida-a por passo do processo, regra de negócio ou variação de dados.' },
                    { kind: 'callout', tone: 'rule', title: 'Regra da aplicação', text: 'Uma User Story só pode pertencer a um Epic. Uma Task pode pertencer a um Epic, User Story ou Bug, ou ser independente. Os Bugs recebem uma Task de execução ao criar. O workflow depende da configuração dos tipos de workitem no projeto. O tipo de um workitem não pode mudar depois de criado.' }
                ],
                related: ['wi-types', 'wi-hierarchy', 'wi-acceptance']
            },
            {
                id: 'agile-sprints',
                title: 'Planeamento de sprints',
                summary: 'Escolha um objetivo de sprint, selecione as Stories que o servem e comprometa-se com o que cabe.',
                blocks: [
                    { kind: 'steps', items: [
                        'Acordem o resultado pretendido e registem-no no **Objetivo do Sprint**.',
                        'Selecione Stories, Bugs ou Tasks independentes prontos no Board ou em **Tabela → Backlog**, e escolha **Criar sprint** (em **Ações de sprint** na Tabela).',
                        'Defina início e fim, ou uma duração em dias úteis. Opcionalmente, indique a **Capacidade do Sprint (SP)** e estime workitems elegíveis com [Story Points](plan-sprints).',
                        'Reveja a seleção e eventuais alterações às datas das fases. As Tasks de Stories e Bugs são planeadas através do respetivo pai.',
                        'Use **Iniciar Sprint** no Roadmap ou em Tabela → Sprints quando a equipa começar.'
                    ] },
                    { kind: 'callout', tone: 'rule', text: 'O estado do Sprint é manual: um Sprint novo fica Planeado, Iniciar Sprint torna-o Ativo e Finalizar Sprint torna-o Concluído. A passagem da data de fim não o encerra. Só Sprints Planeados ou Ativos aceitam trabalho.' },
                    { kind: 'callout', tone: 'method', title: 'Prática Agile', text: 'Use os Story Points planeados e a capacidade introduzida como referências. O Esforço é uma estimativa separada; a aplicação não o converte em pontos nem impõe um limite de capacidade.' }
                ],
                related: ['plan-sprints', 'plan-inheritance', 'views-table']
            },
            {
                id: 'agile-execution',
                title: 'Executar no Board Kanban',
                summary: 'Torne o trabalho visível, limite o trabalho em curso e remova bloqueios rapidamente.',
                blocks: [
                    { kind: 'p', text: 'Durante o sprint, o [Board](wf-board) é a imagem partilhada do trabalho da equipa. Por omissão, o **Board Técnico** mostra Tasks e o **Board Funcional** mostra User Stories e Bugs. O projeto pode atribuir os tipos a qualquer workflow; os Epics ficam na Tabela.' },
                    { kind: 'list', items: [
                        '**Puxe, não empurre**: comece um novo item apenas quando terminar outro.',
                        '**Torne os bloqueios explícitos**: marque um item como bloqueado com um motivo, ou associe-o como bloqueado por outro workitem.',
                        '**Coordenação diária**: percorra o board da direita para a esquerda — primeiro o que está mais perto de concluído.',
                        '**Planeie o seu dia**: arraste Tasks para o [Planeador](plan-day) para reservar tempo de foco.'
                    ] },
                    { kind: 'callout', tone: 'method', title: 'Prática Agile', text: 'Limite o trabalho em curso. Muitos itens “em curso” ao mesmo tempo significam, normalmente, mudanças de contexto e entregas tardias. Terminar vale mais do que começar.' },
                    { kind: 'callout', tone: 'rule', title: 'Regra da aplicação', text: 'Os movimentos seguem o workflow do projeto: um cartão só pode ir para um estado permitido pelas transições. O TeamOS não impõe limites de trabalho em curso (WIP).' }
                ],
                related: ['wf-board', 'wi-dependencies', 'plan-day']
            },
            {
                id: 'agile-review',
                title: 'Acompanhar e validar resultados',
                summary: 'Tasks concluídas não são o mesmo que uma necessidade entregue. Inspecione o progresso e valide o resultado de forma explícita.',
                blocks: [
                    { kind: 'p', text: 'O TeamOS separa duas perguntas que são muitas vezes confundidas:' },
                    { kind: 'terms', items: [
                        ['Progresso de execução', 'Quanto do trabalho de execução de uma Story (as suas Tasks) está concluído. Aparece como percentagem no cartão e nos detalhes.'],
                        ['Aceitação funcional', 'Uma confirmação explícita de que a Story ou o Bug cumpre o resultado funcional esperado. Fica registada com autor e data.']
                    ] },
                    { kind: 'p', text: 'Uma Story pode ter todas as Tasks concluídas e ainda não estar aceite — por exemplo, se os testes mostrarem que os critérios não são cumpridos. Consulte [Critérios e aceitação funcional](wi-acceptance).' },
                    { kind: 'h', text: 'Inspecionar o progresso' },
                    { kind: 'list', items: [
                        '**Tabela → Sprints** mostra os membros e a completude de cada sprint.',
                        'O **Dashboard** mostra o progresso do projeto, o sprint ativo, os workitems iniciados e concluídos num período e os riscos abertos.',
                        'O **Roadmap** mostra o progresso por fase e por marco.'
                    ] },
                    { kind: 'callout', tone: 'method', title: 'Prática Agile', text: 'Termine cada sprint com uma **revisão** (demonstrar e aceitar o que foi entregue) e uma **retrospetiva** (acordar uma ou duas melhorias). Registe a discussão em **Revisão do Sprint** e **Retrospetiva do Sprint** no editor do Sprint. Guarde as decisões resultantes no [Controlo do projeto](views-control).' }
                ],
                related: ['wi-acceptance', 'views-dashboard', 'views-control']
            },
            {
                id: 'agile-rules',
                title: 'Recomendações vs. regras da aplicação',
                summary: 'O que a metodologia recomenda e o que o TeamOS efetivamente impõe.',
                blocks: [
                    { kind: 'table', head: ['Tema', 'Recomendação Agile', 'O que o TeamOS impõe'], rows: [
                        ['Hierarquia', 'Epics contêm Stories; Stories contêm Tasks', 'Stories e Bugs sob Epics; Tasks sob Epics, Stories ou Bugs; sem ciclos'],
                        ['Aceitação', 'Aceitar com base em critérios acordados', 'Stories e Bugs exigem Tasks filhas em estados terminais e aceitação funcional com autor; os Critérios de aceitação são recomendados, não obrigatórios'],
                        ['Workflow', 'Acordar uma definição clara de cada estado', 'Os movimentos têm de seguir as transições configuradas'],
                        ['Planeamento de sprint', 'Comprometer-se com o que cabe', 'Tasks pendentes de Stories/Bugs seguem o pai; só Sprints Planeados/Ativos aceitam trabalho'],
                        ['WIP', 'Limitar o trabalho em curso', 'Não imposto'],
                        ['Estimativa', 'Dimensão relativa, velocidade', 'Esforço e Story Points opcionais; capacidade manual; créditos de conclusão únicos e velocidade congelada'],
                        ['Dependências', 'Resolver bloqueios cedo', 'Informativas: o bloqueio é mostrado mas não impede mudanças de estado'],
                        ['Revisão/retro', 'Realizá-las em cada sprint', 'Campos Objetivo, Revisão e Retrospetiva no editor do Sprint']
                    ] },
                    { kind: 'callout', tone: 'note', text: 'Quando a aplicação não impõe uma prática, vale a pena acordá-la em equipa e registá-la na descrição do projeto.' }
                ],
                related: ['agile-principles', 'wf-states', 'wi-acceptance']
            }
        ]
    },
    {
        id: 'projects',
        title: 'Produtos, projetos e configuração',
        topics: [
            {
                id: 'projects-products',
                title: 'Produtos e projetos independentes',
                summary: 'Um projeto contém workitems e workflows. Um produto apenas agrupa projetos relacionados.',
                blocks: [
                    { kind: 'p', text: 'Um **projeto** é um conjunto independente de workitems com os seus próprios workflows e definições, guardado na sua própria pasta de projeto (ou num ficheiro antigo `.board.json`). Um **produto** é apenas um nome partilhado por vários projetos: não tem workitems nem workflows próprios, nem outros níveis de agrupamento.' },
                    { kind: 'steps', items: [
                        'Abra as [Definições do projeto](projects-settings) no seletor de projeto junto ao logo.',
                        'Em **Geral**, introduza o mesmo nome de **Produto** em cada projeto relacionado. Maiúsculas e espaços exteriores são ignorados.',
                        'Guarde. Os projetos passam a aparecer agrupados num produto expansível no seletor.'
                    ] },
                    { kind: 'p', text: 'Projetos do mesmo produto podem trocar workitems através de [cópia e movimento](projects-transfers). Projetos sem produto ficam independentes.' },
                    { kind: 'callout', tone: 'method', title: 'Prática Agile', text: 'Use um projeto por equipa ou por componente entregue de forma independente e um produto para os ver em conjunto. Evite um único projeto enorme para tudo.' }
                ],
                related: ['projects-settings', 'projects-transfers']
            },
            {
                id: 'projects-settings',
                title: 'Definições do projeto',
                summary: 'Nome, sigla, descrição, estado, produto, membros, etiquetas e os dois workflows.',
                blocks: [
                    { kind: 'p', text: 'Abra as Definições do projeto no seletor de projeto junto ao logo. A janela tem quatro separadores: **Geral**, **Workflow técnico**, **Workflow funcional** e **Automatismos**. Os separadores de workflow também permitem atribuir cada tipo de workitem a um workflow. As alterações de todos os separadores formam um único rascunho e só são aplicadas quando clica em **Guardar**; Cancelar, Escape ou fechar a janela descarta-as.' },
                    { kind: 'terms', items: [
                        ['Nome do projeto', 'Obrigatório. Mudar o nome do projeto ou do ficheiro não altera a sua identidade.'],
                        ['Sigla do projeto', '1 a 4 letras, única entre os projetos abertos. É o prefixo dos IDs dos novos workitems (EP, US, TK, BG). Os IDs existentes nunca mudam.'],
                        ['Descrição', 'Texto livre: um bom lugar para o objetivo do projeto e os acordos da equipa.'],
                        ['Estado', 'Planeado, Ativo, Em pausa, Concluído ou Arquivado. Apenas informativo: nem Arquivado oculta ou bloqueia o projeto.'],
                        ['Produto', 'Agrupamento opcional; consulte [Produtos](projects-products).'],
                        ['Membros e etiquetas', 'As listas curadas usadas para atribuir pessoas e etiquetas. Consulte [Pessoas](projects-people) e [Etiquetas](projects-tags).']
                    ] },
                    { kind: 'callout', tone: 'rule', title: 'Regra da aplicação', text: 'As definições ficam só de leitura em projetos em modo de leitura e durante a pré-visualização do histórico. Volte a **Mais recente** e abra um ficheiro com permissão de escrita para as alterar.' }
                ],
                related: ['wf-editing', 'projects-people', 'projects-tags']
            },
            {
                id: 'projects-people',
                title: 'Membros, responsável e participantes',
                summary: 'As pessoas são geridas por projeto e atribuídas aos workitems como participantes, com um responsável opcional.',
                blocks: [
                    { kind: 'p', text: 'Acrescente as pessoas que trabalham no projeto como **membros** em Definições do projeto → Geral. Os workitems, a paleta e a criação rápida só aceitam membros do projeto de destino.' },
                    { kind: 'terms', items: [
                        ['Participantes', 'Todas as pessoas envolvidas num workitem. Um workitem pode ter vários.'],
                        ['Responsável', 'O participante que responde pelo workitem. Opcional; é sempre um dos participantes.']
                    ] },
                    { kind: 'list', items: [
                        'Os nomes dos membros têm de ser únicos, ignorando maiúsculas e espaços exteriores.',
                        'Mudar o nome de um membro atualiza todas as atribuições atuais, incluindo workitems e registos de Controlo do projeto.',
                        'Um membro atribuído a workitems ou registos de Controlo do projeto não pode ser removido: substitua ou remova primeiro essas atribuições.',
                        'Remover o participante responsável de um workitem pede confirmação, porque também retira a responsabilidade.'
                    ] },
                    { kind: 'callout', tone: 'method', title: 'Prática Agile', text: 'Dê a cada Story um único responsável que a acompanhe até à aceitação, mesmo quando várias pessoas participam nas suas Tasks.' }
                ],
                related: ['projects-settings', 'views-filters']
            },
            {
                id: 'projects-tags',
                title: 'Etiquetas',
                summary: 'As etiquetas classificam workitems em toda a hierarquia; são curadas por projeto.',
                blocks: [
                    { kind: 'p', text: 'Os novos projetos começam com as etiquetas removíveis `bug`, `feature`, `improvement` e `documentation`. Acrescente ou remova etiquetas em Definições do projeto → Geral.' },
                    { kind: 'list', items: [
                        'Uma etiqueta tem 1 a 30 caracteres; um workitem pode ter até 10 etiquetas.',
                        'Etiquetas usadas em workitems ou registos de Controlo do projeto não podem ser removidas até serem retiradas desses registos.',
                        'Pesquise `#etiqueta` na [paleta de comandos](prod-palette) para encontrar workitems etiquetados, ou acrescente `#etiqueta` ao criar uma tarefa numa linha.'
                    ] },
                    { kind: 'callout', tone: 'tip', text: 'Use etiquetas para temas transversais (área, componente, cliente) e não para estado ou prioridade, que têm campos próprios.' }
                ],
                related: ['projects-settings', 'views-filters']
            },
            {
                id: 'projects-transfers',
                title: 'Copiar e mover entre projetos',
                summary: 'Envie um workitem para outro projeto do mesmo produto, decidindo explicitamente cada associação.',
                blocks: [
                    { kind: 'p', text: 'Abra o menu ⋯ de um workitem e escolha **Copiar para projeto…** ou **Mover para projeto…**. Só são elegíveis outros projetos carregados, com permissão de escrita e do mesmo produto.' },
                    { kind: 'terms', items: [
                        ['Mover', 'Mantém a identidade permanente, os comentários e o histórico do workitem. O destino é guardado primeiro; a origem só é removida depois. Um movimento inclui todos os descendentes apenas quando todos estão numa categoria Backlog ou Por iniciar.'],
                        ['Copiar', 'Cria um novo workitem com nova identidade e histórico; os filhos ficam na origem.']
                    ] },
                    { kind: 'steps', items: [
                        'Escolha o projeto de destino.',
                        'Escolha o estado no workflow de destino.',
                        'Associe cada pessoa, etiqueta, fase, marco, sprint e pai a um valor de destino, ou aceite explicitamente a sua remoção. Os blocos agendados no Planeador e os registos de sprints anteriores têm de ser removidos.',
                        'Confirme. Os valores atuais e de destino aparecem lado a lado para revisão.'
                    ] },
                    { kind: 'callout', tone: 'rule', title: 'Regra da aplicação', text: 'Uma Story ou Bug concluído copiado para um estado concluído precisa de nova aceitação funcional. Se uma gravação for interrompida, o aviso **Transferências pendentes** permite retomar sem criar outro workitem.' }
                ],
                related: ['projects-products', 'wi-hierarchy']
            }
        ]
    },
    {
        id: 'workitems',
        title: 'Workitems e organização do trabalho',
        topics: [
            {
                id: 'wi-types',
                title: 'Epic, User Story, Task e Bug',
                summary: 'Quatro tipos de workitem com campos próprios; cada tipo pode ser atribuído a um workflow.',
                blocks: [
                    { kind: 'table', head: ['Tipo', 'ID', 'Campos específicos', 'Workflow'], rows: [
                        ['Epic', '`EP`', 'Objetivo / Resultado esperado, Âmbito, Valor de negócio', 'Funcional por omissão'],
                        ['User Story', '`US`', 'Critérios de aceitação', 'Funcional por omissão'],
                        ['Task', '`TK`', '—', 'Técnico por omissão'],
                        ['Bug', '`BG`', 'Passos para reproduzir, Resultado esperado, Resultado observado, Ambiente / Versão', 'Funcional por omissão']
                    ] },
                    { kind: 'p', text: 'Os IDs combinam a sigla do projeto, o tipo e um número partilhado pelo projeto, por exemplo `CHK-US-2`. Os tipos nunca mudam depois da criação e os números apagados não são reutilizados. Os IDs visíveis mantêm-se no projeto; uma transferência atribui um ID do destino, enquanto um movimento mantém a identidade permanente.' },
                    { kind: 'callout', tone: 'rule', title: 'Regra da aplicação', text: 'Os Epics não podem ter Esforço, alocação a Sprint nem ligações de Pull Request: são planeados através das suas Stories e Tasks.' },
                    { kind: 'callout', tone: 'tip', text: 'Use “workitem” quando se refere a qualquer tipo. “Task” refere-se apenas a trabalho de execução.' }
                ],
                related: ['wi-hierarchy', 'agile-decomposition', 'wf-two']
            },
            {
                id: 'wi-hierarchy',
                title: 'Hierarquia e relações',
                summary: 'Um workitem tem no máximo um pai hierárquico. As relações ligam workitems sem alterar a hierarquia.',
                blocks: [
                    { kind: 'h', text: 'Hierarquia' },
                    { kind: 'list', items: [
                        'Epic → User Story ou Bug → Task, e ainda Tasks diretamente sob um Epic.',
                        'As Tasks independentes não têm pai. Os Bugs podem ter Tasks e recebem uma automaticamente ao criar.',
                        'O pai tem de estar no mesmo projeto; os ciclos são rejeitados.',
                        'Para eliminar um workitem, reatribua ou desassocie primeiro os filhos. Mover para outro projeto pode incluir descendentes se todos estiverem em Backlog ou Por iniciar; [reveja cada associação](projects-transfers).'
                    ] },
                    { kind: 'p', text: 'Crie filhos a partir dos detalhes do pai: ao fechar uma nova Task volta à sua Story, depois ao Epic e depois ao ponto de partida.' },
                    { kind: 'h', text: 'Relações' },
                    { kind: 'terms', items: [
                        ['Relacionado com', 'Uma ligação simétrica e informativa.'],
                        ['Bloqueia / É bloqueado por', 'Uma dependência. Bloqueadores por concluir marcam o workitem dependente como bloqueado.']
                    ] },
                    { kind: 'p', text: 'Nos detalhes de um workitem → Relações, use **Associar workitem** (pesquisa por ID ou título, incluindo itens concluídos e arquivados) ou **Criar relacionado** (um novo item em Backlog que herda apenas a fase e o marco).' },
                    { kind: 'callout', tone: 'rule', title: 'Regra da aplicação', text: 'Um par de workitems tem no máximo uma relação, não são permitidas ligações a si próprio e os ciclos de dependência são rejeitados. As relações mantêm-se quando um workitem muda de projeto.' }
                ],
                related: ['wi-dependencies', 'plan-inheritance', 'projects-transfers']
            },
            {
                id: 'wi-fields',
                title: 'Criar e editar workitems',
                summary: 'Título, descrição, pessoas, etiquetas, estimativas, datas, checklist e planeamento, no editor e nos detalhes.',
                blocks: [
                    { kind: 'h', text: 'Formas de criar um workitem' },
                    { kind: 'list', items: [
                        '**Criar workitem** acima do Board ou na Tabela (selecione primeiro um único projeto).',
                        'A partir dos detalhes de um pai, para criar um filho.',
                        'Defina o prazo no editor em dd/mm/aaaa; Planeador → Calendário consulta apenas prazos de Tasks.',
                        'Na [paleta de comandos](prod-palette) com `+ Título @pessoa !high #etiqueta ~S due:fri`.'
                    ] },
                    { kind: 'terms', items: [
                        ['Título', 'Obrigatório, até 80 caracteres.'],
                        ['Descrição', 'Texto livre para contexto.'],
                        ['Participantes / Responsável', 'Membros do projeto; consulte [Pessoas](projects-people).'],
                        ['Etiquetas', 'Do catálogo do projeto.'],
                        ['Prioridade / Esforço', 'Alta–Baixa e XS–XL; juntos dão a pontuação.'],
                        ['Prazo', 'Os prazos continuam disponíveis nos detalhes dos workitems e no Calendário.'],
                        ['Lista de tarefas', 'Uma checklist reordenável para pequenos passos, disponível apenas nas Tasks.'],
                        ['Bloqueada', 'Um bloqueio manual que exige um motivo.'],
                        ['Fase / Marco / Sprint', 'Associações de planeamento; consulte [Planeamento](plan-inheritance).']
                    ] },
                    { kind: 'p', text: 'Guardar um novo workitem abre os seus detalhes. As propriedades editáveis na barra lateral são guardadas ao alterar; os Story Points estão aí disponíveis para unidades de planeamento elegíveis. Os separadores organizam Detalhes, Relações, Anexos, Comentários, Pull requests e Histórico; Epics não têm o separador Pull requests. Prima [[Ctrl/⌘]] + [[Enter]] para guardar no editor. **Eliminar**, no menu ⋯ dos detalhes, remove o workitem definitivamente após confirmação.' }
                ],
                related: ['wi-types', 'wi-collab', 'agile-backlog']
            },
            {
                id: 'wi-acceptance',
                title: 'Critérios de aceitação e aceitação funcional',
                summary: 'O progresso de execução mede Tasks concluídas; a aceitação funcional confirma o resultado esperado.',
                blocks: [
                    { kind: 'p', text: 'Os **Critérios de aceitação** de uma User Story descrevem como verificar o resultado esperado. Escreva-os antes da execução, mesmo que a aplicação permita aceitar sem os preencher. O **progresso de execução** conta as Tasks filhas concluídas, excluindo canceladas; é distinto da aceitação funcional e dos créditos de conclusão do Sprint.' },
                    { kind: 'h', text: 'Aceitar uma Story ou um Bug' },
                    { kind: 'steps', items: [
                        'Conclua, cancele ou desassocie todas as Tasks filhas pendentes da Story ou Bug.',
                        'Mova a Story ou Bug para um estado da categoria **Concluído**, através de uma transição permitida.',
                        'Reveja os critérios ou o resultado esperado apresentados. Confirme com a identidade de membro selecionada no projeto; se não existir, indique um nome de autor local não vazio.',
                        'Confirme a aceitação. Ficam registados autor e data como atribuição local, não verificada.'
                    ] },
                    { kind: 'callout', tone: 'rule', text: 'Sair de Concluído remove a aceitação. Alterar os critérios de uma Story aceite pede nova aceitação. Reabrir uma Task pode desencadear [automatismos do pai](wf-automation), mas não fornece aceitação funcional. Concluir um Epic não conclui os seus filhos.' },
                    { kind: 'callout', tone: 'note', text: 'Os nomes de autor são atribuição local, não contas autenticadas.' },
                    { kind: 'callout', tone: 'method', title: 'Prática Agile', text: 'Quem representa o utilizador deve validar o resultado na revisão do Sprint. Todas as Tasks Done significam implementação concluída, não aceitação.' }
                ],
                related: ['agile-review', 'wf-states', 'ex-walkthrough']
            },
            {
                id: 'wi-dependencies',
                title: 'Dependências e bloqueios',
                summary: 'Duas fontes independentes de bloqueio: um bloqueio manual com motivo e bloqueadores por concluir.',
                blocks: [
                    { kind: 'terms', items: [
                        ['Bloqueio manual', 'Marque **Bloqueada** no editor e descreva o que está a bloquear. Retire-o quando estiver resolvido.'],
                        ['Bloqueio por dependência', 'Derivado automaticamente de bloqueadores diretos por concluir (Bloqueia / É bloqueado por), incluindo arquivados. Desaparece quando os bloqueadores são concluídos ou a ligação é removida.']
                    ] },
                    { kind: 'p', text: 'Ambos aparecem nos detalhes e têm colunas e filtros independentes nas tabelas de workitems, incluindo o Roadmap. **Bloqueio manual** mantém-se até ser removido manualmente; **Bloqueio por dependências** desaparece quando todos os bloqueadores estão Done, mantendo as relações. O filtro **Bloqueadas** considera qualquer das duas fontes. Ao apagar um workitem, as suas relações e o impacto nos bloqueios são listados antes de confirmar.' },
                    { kind: 'callout', tone: 'rule', title: 'Regra da aplicação', text: 'As dependências são informativas: não impedem mudanças de estado e nunca substituem um bloqueio manual.' }
                ],
                related: ['wi-hierarchy', 'agile-execution', 'views-filters']
            },
            {
                id: 'wi-collab',
                title: 'Comentários, anexos e pull requests',
                summary: 'A conversa, os ficheiros e as ligações ao código ficam com o workitem.',
                blocks: [
                    { kind: 'h', text: 'Comentários' },
                    { kind: 'list', items: [
                        'Texto simples até 10 000 caracteres e até 10 imagens (PNG, JPEG ou WebP, 10 MiB cada). Cole capturas de ecrã diretamente.',
                        'Selecione um membro ao abrir o projeto; comentários e carregamentos de anexos usam essa identidade local. [[Ctrl/⌘]] + [[Enter]] publica.',
                        'Os comentários publicados não podem ser editados nem apagados na aplicação. Os rascunhos por enviar são mantidos durante a sessão.'
                    ] },
                    { kind: 'h', text: 'Anexos' },
                    { kind: 'list', items: [
                        'Até 10 ficheiros por workitem, 10 MiB cada. Nos projetos em pastas, os binários ficam em `attachments/` e são lidos para miniaturas, abertura ou transferência. Os ficheiros antigos continuam a incorporá-los.',
                        'O separador Anexos lista a data de carregamento, o nome do ficheiro e quem o carregou, com **Abrir** para formatos comuns (imagens, PDF, texto, áudio, vídeo) e **Transferir** para todos.'
                    ] },
                    { kind: 'h', text: 'Pull requests' },
                    { kind: 'p', text: 'Acrescente ligações HTTP/HTTPS completas no separador **Pull requests** do workitem. Os Epics não têm este separador. São apenas ligações locais: a aplicação não contacta o servidor até abrir uma.' }
                ],
                related: ['wi-fields', 'files-history']
            }
        ]
    },
    {
        id: 'workflows',
        title: 'Workflows e execução',
        topics: [
            {
                id: 'wf-two',
                title: 'Workflows funcional e técnico',
                summary: 'Cada projeto tem dois workflows: um para necessidades de negócio e outro para trabalho de execução.',
                blocks: [
                    { kind: 'terms', items: [
                        ['Workflow funcional', 'Progressão das necessidades de negócio. Os novos projetos atribuem-lhe Epics, User Stories e Bugs.'],
                        ['Workflow técnico', 'Trabalho de execução. Os novos projetos atribuem-lhe Tasks.']
                    ] },
                    { kind: 'p', text: 'Em **Definições do projeto → Workflow técnico / Workflow funcional**, escolha os tipos de workitem de cada workflow. Cada tipo pertence a um só workflow. O Board segue esta atribuição para workitems que não sejam Epics; os Epics ficam na Tabela.' },
                    { kind: 'p', text: 'Ao mudar o workflow de um tipo, um workitem mantém o estado se este existir no novo workflow. Caso contrário, a aplicação escolhe um estado da mesma categoria, recorrendo ao estado de entrada se necessário, e pede revisão do impacto.' },
                    { kind: 'callout', tone: 'note', text: 'As atribuições de tipos já configuradas são mantidas. Projetos anteriores à seleção de tipos adotam as predefinições na importação: os Bugs passam para Funcional, com estado da mesma categoria se necessário. Consulte as Definições para verificar cada tipo.' },
                    { kind: 'callout', tone: 'method', title: 'Prática Agile', text: 'Acorde com a equipa o significado dos estados. Distinga validação de negócio e execução mesmo com workflows personalizados.' }
                ],
                related: ['wf-states', 'wf-editing', 'wf-board']
            },
            {
                id: 'wf-states',
                title: 'Estados, categorias e transições',
                summary: 'Os estados são definidos por si; seis categorias fixas dão-lhes um significado comum.',
                blocks: [
                    { kind: 'p', text: 'Cada estado pertence a uma de seis **categorias**. As categorias determinam o progresso, os indicadores de atraso, as dependências e a aceitação, seja qual for o nome do estado.' },
                    { kind: 'table', head: ['Categoria', 'Significado', 'Estados por omissão'], rows: [
                        ['Backlog', 'Ainda não está pronto para o board', 'Backlog (reservado)'],
                        ['Por iniciar', 'Pronto a começar', 'To Do (entrada no Board)'],
                        ['Em curso', 'Em trabalho', 'In progress, Re-analysis'],
                        ['Em testes', 'Implementação pronta para validação ou em teste', 'Ready to test, Testing'],
                        ['Concluído', 'Terminado', 'Done'],
                        ['Cancelado', 'Não será feito', 'Cancelled, Duplication']
                    ] },
                    { kind: 'p', text: 'As **transições** indicam para que estados um workitem pode passar a partir de cada estado. Nos novos projetos, Done e Cancelled são terminais (sem transições de saída) até acrescentar um caminho de reabertura.' },
                    { kind: 'callout', tone: 'rule', title: 'Regra da aplicação', text: 'O Backlog é reservado; o estado de entrada no Board tem de ser um estado Por iniciar diferente do Backlog; é obrigatório pelo menos um estado Concluído; todos os estados têm de ser alcançáveis a partir do Backlog; os nomes dos estados têm de ser únicos.' }
                ],
                related: ['wf-editing', 'wi-acceptance', 'agile-rules']
            },
            {
                id: 'wf-editing',
                title: 'Editar um workflow',
                summary: 'Acrescente, renomeie, colora, reordene e ligue estados; realoque workitems de estados removidos.',
                blocks: [
                    { kind: 'steps', items: [
                        'Abra as Definições do projeto e escolha **Workflow técnico** ou **Workflow funcional**.',
                        'Escolha os tipos de workitem do workflow. Em **Estados e transições**, acrescente ou edite nome, cor e categoria de cada estado e use as setas para os reordenar.',
                        'Para cada estado, selecione os **Destinos permitidos**. As transições de regresso configuram-se no estado de destino.',
                        'Em **Entrada e referências**, escolha o estado de entrada no Board e o estado de referência de cada categoria.',
                        'Guarde. Se removeu estados ou mudou categorias, escolha um destino para os workitems afetados (incluindo arquivados) e confirme o impacto.'
                    ] },
                    { kind: 'callout', tone: 'tip', text: 'O aviso “Inalcançável a partir do Backlog” significa que nenhum caminho leva a esse estado: acrescente uma transição de entrada antes de guardar.' }
                ],
                related: ['wf-states', 'projects-settings']
            },
            {
                id: 'wf-board',
                title: 'Utilizar o Board Kanban',
                summary: 'As colunas são estados do workflow; arraste os cartões para os fazer avançar.',
                blocks: [
                    { kind: 'p', text: 'Escolha **Técnico** ou **Funcional** no Board. Os novos projetos mostram Tasks no Técnico e User Stories e Bugs no Funcional; as [Definições do projeto](wf-two) permitem alterar os tipos. Os Epics ficam na Tabela.' },
                    { kind: 'p', text: '**Apenas Sprints ativos** começa selecionado nas duas perspetivas. Desmarque para incluir trabalho sem Sprint e Sprints Planeados ou encerrados. Selecionar um Sprint específico nos Filtros sobrepõe-se a esta opção.' },
                    { kind: 'p', text: 'As colunas seguem o workflow selecionado, incluindo Backlog e Em testes. Os estados Cancelados ficam ocultos por omissão. Use **Filtros e vista → Colunas do Board** para escolher os estados visíveis; a preferência fica no projeto e não move nem elimina workitems. Com Todos os projetos, as colunas agrupam por categoria.' },
                    { kind: 'h', text: 'Mover e editar cartões' },
                    { kind: 'list', items: [
                        'Arraste um cartão com o rato ou mantenha-o premido num ecrã tátil.',
                        'Selecione com [[J]] / [[K]] e use [[1]]–[[4]] para Backlog, Por iniciar, Em curso ou Concluído, respeitando as transições.',
                        'Use a seta no topo direito para o próximo estado permitido, ou **Mover para…** na [paleta de comandos](prod-palette).',
                        'Altere o responsável no dropdown do cartão ou abra os detalhes para edição, datas, bloqueios, progresso e cópia/movimento.',
                        'Num projeto único com escrita, selecione cartões e use as ações de seleção para criar um Sprint ou adicionar trabalho a um existente.'
                    ] },
                    { kind: 'p', text: 'Os cartões mostram ID, título, tipo e responsável. As colunas partilham a largura disponível; boards densos podem ter deslocamento horizontal.' },
                    { kind: 'callout', tone: 'rule', text: 'O workflow tem de permitir cada movimento. Concluir uma Story ou Bug pede [aceitação funcional](wi-acceptance). Alterar estados de filhos pode desencadear [validação de automatismos](wf-automation).' }
                ],
                related: ['agile-execution', 'wf-states', 'views-filters']
            },
            {
                id: 'wf-automation',
                title: 'Automação',
                summary: 'Configure oito regras de projeto para progresso dos pais, hierarquia e Tasks pendentes no fecho de Sprint.',
                blocks: [
                    { kind: 'h', text: 'Atualizações que acompanham sempre os dados' },
                    { kind: 'list', items: [
                        'O progresso de execução é calculado a partir das Tasks filhas.',
                        'O bloqueio por dependência acompanha bloqueadores diretos por concluir, independentemente do bloqueio manual.',
                        'Os filhos herdam fase e marco salvo escolha explícita. Tasks pendentes de Stories e Bugs seguem a alocação elegível do pai.',
                        'As alterações guardadas ficam no histórico local.'
                    ] },
                    { kind: 'h', text: 'Automatismos configuráveis' },
                    { kind: 'p', text: 'Abra **Definições do projeto → Automatismos**. Cada regra suporta **Off** (desativada), **On 1** (pedir aprovação) e **On 2** (aplicar automaticamente quando permitido). As regras começam em On 1 e afetam eventos futuros; guardar definições não altera retroativamente os workitems.' },
                    { kind: 'table', head: ['Regra', 'Quando se aplica'], rows: [
                        ['Pai para To do', 'Um filho entra em Por iniciar e o pai está em Backlog.'],
                        ['Iniciar trabalho do pai', 'Um filho inicia execução e o pai está em Backlog ou Por iniciar.'],
                        ['Preparar testes da User Story', 'Todas as Tasks relevantes estão Em testes ou Concluídas; as canceladas são excluídas.'],
                        ['Concluir Epic', 'Todos os filhos relevantes estão Concluídos.'],
                        ['Cancelar pai', 'Todos os filhos estão Cancelados.'],
                        ['Reabrir / Reavaliar pai', 'Um filho reabre ou regressa a uma categoria anterior.'],
                        ['Alterações da hierarquia', 'Filhos são adicionados, removidos ou transferidos; os pais afetados são reavaliados.'],
                        ['Devolver Tasks pendentes ao Backlog', 'Um Sprint encerra; as mudanças de estado continuam a exigir uma transição permitida.']
                    ] },
                    { kind: 'p', text: '**Validar automatismos do workflow** lista tipo, ID, título e estado atual → proposto dos workitems afetados. Escolha **Aplicar alteração** ou **Manter estado atual** nas propostas com aprovação. As cascatas seguem as alterações aplicadas. Uma transição proibida gera informação e mantém o estado afetado.' },
                    { kind: 'callout', tone: 'rule', text: 'Os automatismos nunca fornecem aceitação funcional a Stories ou Bugs nem ignoram transições do workflow. O estado do Sprint é gerido separadamente com Iniciar / Finalizar Sprint. O [fecho](plan-sprints) congela resultados e remove alocações pendentes; a regra de Sprint controla se os estados das Tasks também regressam ao Backlog.' }
                ],
                related: ['wi-acceptance', 'plan-inheritance', 'files-history']
            }
        ]
    },
    {
        id: 'planning',
        title: 'Planeamento',
        topics: [
            {
                id: 'plan-roadmap',
                title: 'Roadmap, fases e marcos',
                summary: 'Distribua o projeto no tempo com fases, marcos e sprints.',
                blocks: [
                    { kind: 'terms', items: [
                        ['Fase', 'Um período datado que pode conter subfases. As datas do pai são calculadas pelos descendentes; associe workitems às fases-folha.'],
                        ['Marco', 'Um ponto datado, como um lançamento ou revisão.'],
                        ['Sprint', 'Uma iteração independente criada por seleção no Board ou Tabela; consulte [Sprints](plan-sprints).']
                    ] },
                    { kind: 'steps', items: [
                        'Selecione um projeto e abra o **Roadmap**.',
                        'Use **+ Fase** ou **+ Marco**, defina datas e escolha uma cor. Crie Sprints a partir de workitems selecionados no Board ou Tabela; o Roadmap não tem botão + Sprint autónomo.',
                        'Associe workitems no editor ou deixe os filhos [herdar o planeamento](plan-inheritance).',
                        'Use **Workitems associados** para tabelas de fase ou Sprint; uma fase-pai inclui descendentes. A seta expande a hierarquia. Clique no losango de um marco para consultar os seus workitems.'
                    ] },
                    { kind: 'p', text: 'Largura e zoom ficam à esquerda. O zoom vai de **100% a 300%**, em passos de 25 pontos: 100% ajusta todo o período do projeto; valores maiores expandem a escala horizontal com deslocamento. Texto, ícones e altura das barras mantêm o tamanho.' },
                    { kind: 'p', text: 'Os losangos preenchem-se com a conclusão e mostram um check a 100%. Marcos vazios mostram N/A. Passe o rato ou foque o losango para ver nome, data e percentagem. Clique no nome de fases ou Sprints para editar e passe o rato nas barras para ver datas. Os Sprints têm Play para iniciar e bandeira axadrezada para finalizar.' },
                    { kind: 'p', text: 'As tabelas associadas começam com ID, Título, Tipo, Estado, Responsável, Prioridade, Bloqueio manual, Bloqueio por dependências e Atualizado. Pesquisa, filtros, colunas e exportação CSV seguem a [Tabela](views-table).' },
                    { kind: 'callout', tone: 'rule', text: 'O trabalho cancelado é excluído do progresso. Entregáveis por aceitar podem manter fases e marcos abaixo de 100%. Eliminar uma fase ou marco associado exige realocação ou remoção explícita das ligações; elimine ou mova as subfases antes do pai.' }
                ],
                related: ['plan-sprints', 'plan-inheritance', 'views-control']
            },
            {
                id: 'plan-sprints',
                title: 'Sprints',
                summary: 'Planeie com Story Points e capacidade, inicie e encerre manualmente e mantenha participação e resultados congelados.',
                blocks: [
                    { kind: 'h', text: 'Criar e alocar' },
                    { kind: 'steps', items: [
                        'Selecione Stories, Bugs ou Tasks independentes prontos no Board ou em **Tabela → Backlog** de um projeto com escrita. Use **Criar sprint**, ou **Ações de sprint → Criar sprint** na Tabela. **Adicionar ao sprint** aloca a seleção a um Sprint elegível existente.',
                        'Indique título, início e fim, **Objetivo do Sprint** e, opcionalmente, **Capacidade do Sprint (SP)**. O editor suporta duração em dias úteis; mudar início ou duração recalcula o fim.',
                        'Reveja alocações e impactos nas datas das fases. Cada fase afetada mostra datas atuais/propostas e permite manter ou estender as datas.'
                    ] },
                    { kind: 'p', text: 'Cada Sprint tem um número permanente no projeto, como `Sprint 3 - Título`, nunca reutilizado. Só Sprints Planeados ou Ativos aceitam trabalho; os Epics são excluídos. Tasks pendentes de Stories e Bugs são planeadas através do pai, sem alocação independente.' },
                    { kind: 'h', text: 'Story Points e capacidade' },
                    { kind: 'p', text: 'Defina **Story Points (SP)** nos detalhes de Stories, Bugs e Tasks fora de uma Story ou Bug. As opções são Nenhum, 1, 2, 3, 5, 8 e 13. Associar uma Task a uma Story ou Bug remove a estimativa da Task. O Esforço (XS–XL) é separado e nunca convertido em pontos. A capacidade é introduzida por si, não um limite calculado automaticamente.' },
                    { kind: 'p', text: 'Os cabeçalhos mostram pontos planeados face à capacidade e, após o fecho, pontos concluídos face aos planeados no fecho. Um crédito de conclusão é registado uma só vez quando a implementação termina num Sprint Ativo: todas as Tasks de uma Story devem estar Done; uma Story sem Tasks, Task independente ou Bug tem de passar a Done. A aceitação funcional é separada. Tasks canceladas não contam como Done para este crédito. No fecho, a velocidade soma os créditos; transportar trabalho para outro Sprint não volta a contar o mesmo trabalho.' },
                    { kind: 'h', text: 'Iniciar e finalizar manualmente' },
                    { kind: 'steps', items: [
                        'Os novos Sprints começam **Planeados**. Use **Iniciar Sprint** no Roadmap ou em Tabela → Sprints para os tornar **Ativos**. Se o início previsto diferir de hoje, escolha se usa hoje; a aplicação permite recalcular o fim, manter o previsto ou indicar outra data.',
                        'Iniciar move os workitems alocados em Backlog e os seus descendentes para o primeiro estado Por iniciar do respetivo workflow. A passagem da data de fim não encerra o Sprint.',
                        'Use **Finalizar Sprint** para o tornar **Concluído**. Escolha se usa hoje como data de fim, reveja propostas de automatismos e consulte a lista que regressa ao Backlog.'
                    ] },
                    { kind: 'p', text: 'O fecho congela participação, estados, workflows, estimativas, trabalho concluído/transportado e resultados. Unidades de planeamento pendentes perdem a alocação; Stories e Bugs pendentes regressam ao estado Backlog. Repor estados de Tasks depende de **Devolver Tasks pendentes ao Backlog** em [Automatismos](wf-automation). Stories com implementação concluída a aguardar aceitação mantêm o Sprint. Reabrir trabalho, por si só, não remove a alocação.' },
                    { kind: 'p', text: 'Tabela → Sprints mantém a participação registada quando o trabalho atual muda. Os valores do fecho ficam congelados na tabela. Abrir um workitem existente pode mostrar os seus detalhes atuais editáveis; essas alterações não reescrevem o estado do fecho. Edite o Sprint para registar **Revisão do Sprint** e **Retrospetiva do Sprint**; estes campos continuam editáveis após o fecho.' },
                    { kind: 'callout', tone: 'rule', text: 'Só Sprints Planeados podem ser eliminados. Uma confirmação lista os workitems afetados; eliminar remove a alocação e mantém os estados. Os projetos antigos inferem o estado pelas datas uma vez na migração e passam a guardá-lo explicitamente.' }
                ],
                related: ['agile-sprints', 'views-table', 'plan-roadmap']
            },
            {
                id: 'plan-inheritance',
                title: 'Herança de planeamento',
                summary: 'Os filhos usam a fase e o marco do pai, salvo escolha em contrário.',
                blocks: [
                    { kind: 'p', text: 'Um novo workitem filho **herda** a fase e o marco efetivos do seu pai hierárquico. No editor, cada um dos dois campos pode ficar em **Herdar do pai**, num valor explícito ou em nenhum. A herança de fase e de marco são independentes.' },
                    { kind: 'p', text: 'Quando o planeamento de um pai muda, os filhos que herdam acompanham. Antes de guardar, a aplicação lista os workitems cuja fase ou marco efetivo muda, para poder rever o impacto.' },
                    { kind: 'p', text: 'Nos Sprints, Tasks pendentes de Stories e Bugs seguem a alocação atual elegível do pai quando o planeamento muda. Tasks concluídas ou canceladas mantêm a participação registada. Reabrir uma Task, por si só, preserva a alocação até ao fecho ou a outra alteração de planeamento.' },
                    { kind: 'callout', tone: 'tip', text: 'Planeie ao nível mais alto que fizer sentido — o Epic ou a Story — e deixe os filhos herdar. Altere apenas as exceções.' }
                ],
                related: ['plan-roadmap', 'plan-sprints', 'wi-hierarchy']
            },
            {
                id: 'plan-calendar',
                title: 'Calendário',
                summary: 'Consulte prazos de Tasks e carga de trabalho por mês ou ano em Planeador → Calendário.',
                blocks: [
                    { kind: 'list', items: [
                        'A **vista anual** mostra doze mini-meses; clique num mês para o abrir.',
                        'A **vista mensal** apresenta exclusivamente os prazos das Tasks.',
                        'O **Mapa de calor** colore os dias pelo número de Tasks com prazo: mais escuro significa mais.',
                        'O calendário serve para consulta; o planeamento por blocos continua nas vistas Dia e Semana.'
                    ] },
                    { kind: 'callout', tone: 'tip', text: 'Use o Mapa de calor para detetar semanas sobrecarregadas antes de chegarem e reequilibre prazos ou o âmbito dos sprints.' }
                ],
                related: ['plan-day', 'views-choose']
            },
            {
                id: 'plan-day',
                title: 'Planeador',
                summary: 'Agende Tasks de qualquer projeto em blocos de tempo no seu dia ou semana.',
                blocks: [
                    { kind: 'steps', items: [
                        'Abra o **Planeador** (ou prima [[P]]). O tabuleiro agrupa Tasks por projeto e tem escolhas de estado próprias; os filtros existentes do Board também afetam as Tasks e os blocos visíveis.',
                        'Arraste uma Task para o dia, entre as 07:00 e as 21:00, em intervalos de 15 minutos.',
                        'Arraste um bloco para o mover ou as suas extremidades para o redimensionar. Selecione um bloco e prima [[Delete]] para o remover.',
                        'Alterne entre **Dia** e **Semana** (segunda a sexta) e navegue com as setas ou [[T]] para hoje.'
                    ] },
                    { kind: 'p', text: 'Os blocos do planeador são guardados em cada ficheiro de projeto e registados no histórico. Nunca alteram o workitem — estado, datas e sprint ficam como estão.' },
                    { kind: 'callout', tone: 'tip', text: 'Na paleta de comandos, `plan login 14:00` coloca a Task correspondente no plano de hoje às 14:00, durante uma hora.' }
                ],
                related: ['agile-execution', 'prod-palette']
            }
        ]
    },
    {
        id: 'views',
        title: 'Vistas e acompanhamento',
        topics: [
            {
                id: 'views-choose',
                title: 'Escolher uma vista',
                summary: 'Cada vista responde a uma pergunta diferente.',
                blocks: [
                    { kind: 'table', head: ['Vista', 'Use-a para…', 'Âmbito'], rows: [
                        ['Quadro', 'Executar e acompanhar o trabalho diário', 'Todos os projetos ou um'],
                        ['Dashboard', 'Reportar estado, progresso e atividade num período', 'Um projeto'],
                        ['Tabela', 'Refinar, planear sprints, rever a hierarquia, exportar CSV', 'Um projeto'],
                        ['Roadmap', 'Planear fases, marcos e sprints no tempo', 'Um projeto'],
                        ['Controlo do projeto', 'Gerir riscos, decisões e entregáveis', 'Um projeto'],
                        ['Calendário', 'Consultar prazos de Tasks por mês ou ano dentro do Planeador', 'Todos os projetos ou um'],
                        ['Planeador', 'Agendar o seu dia ou semana', 'Todos os projetos ou um']
                    ] },
                    { kind: 'p', text: 'O Board, cada subseção da Tabela e cada Sprint expandido mantêm pesquisa e filtros independentes. Ao regressar a uma vista, são recuperados os seus filtros nesta sessão.' }
                ],
                related: ['views-filters', 'start-layout']
            },
            {
                id: 'views-table',
                title: 'Tabela',
                summary: 'Uma lista configurável de workitems com hierarquia, perspetivas de sprint e exportação CSV.',
                blocks: [
                    { kind: 'terms', items: [
                        ['Todos (por defeito)', 'Linhas expansíveis Epic → Story → Task, Tasks diretas de Epics e Tasks e Bugs independentes. Os descendentes correspondentes continuam visíveis quando os filtros ocultam os antecessores.'],
                        ['Dropdown de vistas', 'Alterne entre Todos, Epic, User Stories, Workitems independentes e Todas as Tasks e Bugs. O botão apresenta a vista selecionada.'],
                        ['Backlog', 'Unidades de planeamento com trabalho pendente e sem Sprint elegível. Exclui Epics e Tasks filhas de Stories/Bugs; uma Story com todas as Tasks Done ou Canceladas deixa de estar pendente, mesmo antes da aceitação. Selecione linhas para criar ou integrar um Sprint.'],
                        ['Sprints', 'Uma tabela expansível por sprint, do mais recente para o mais antigo, com nome e datas à esquerda e os controlos compactos do Roadmap à direita, sem timeline. As Stories expandem-se nas Tasks participantes.']
                    ] },
                    { kind: 'list', items: [
                        'Cada tabela tem uma única toolbar: contagens, número de selecionados e Limpar seleção à esquerda; pesquisa e ícones de Filtros, Colunas e Exportar CSV à direita, seguidos de um separador e + Criar workitem. No Backlog, **Ações de sprint** fica após o separador, imediatamente antes de +, e agrupa Criar sprint e Adicionar ao sprint. Mantêm-se as validações de seleção e de sprints elegíveis. Pesquise por ID, título e descrição; ordene por qualquer coluna.',
                        'Use **Filtros** para os filtros comuns e para tipo de workitem, Epic e User Story. O ícone **Colunas** abre listas Visíveis e Ocultas lado a lado. Oculte com o olho, adicione com + e reordene as visíveis pelo manípulo de arrasto ou pelas setas para cima/baixo. ID e Título permanecem visíveis com cadeado; Repor colunas restaura as predefinições. As preferências ficam guardadas localmente por projeto e contexto de tabela.',
                        'O ícone **Exportar CSV** abre um modal: escolha vírgula ou ponto e vírgula e confirme para descarregar todas as linhas filtradas, mesmo as recolhidas.',
                        'As tabelas dos Sprints não têm checkboxes de seleção, menu Ações de sprint ou + Criar workitem; mantêm pesquisa, filtros, colunas, exportação e hierarquia.',
                        'As horas das tabelas de workitems usam UTC e as datas dd/mm/aaaa. A completude do Sprint conta unidades únicas, exclui canceladas e inclui itens arquivados antigos. Os filtros afetam linhas e CSV, não o denominador. Sprints encerrados mantêm valores congelados; abrir um workitem existente pode mostrar os detalhes atuais sem alterar esse estado.'
                    ] }
                ],
                related: ['plan-sprints', 'agile-backlog', 'views-filters']
            },
            {
                id: 'views-dashboard',
                title: 'Dashboard',
                summary: 'Consulte progresso, atividade num período UTC, registos de controlo e participação registada em Sprints.',
                blocks: [
                    { kind: 'p', text: '**Visão global do projeto** reúne todos os widgets numa única secção: progresso, fases-pai, milestones, Sprint, estado dos workitems, Epics, atividade e registos de controlo.' },
                    { kind: 'list', items: [
                        'A navegação Visão global/Análise dos sprints fica fixa abaixo da navegação principal. A Visão global mostra a visibilidade dos widgets e as datas. Abra o campo de calendário para escolher início e fim. A Análise dos sprints substitui estes controlos por um seletor de Sprint, do mais recente para o mais antigo, com Todos os sprints selecionado por defeito. Os indicadores de estado refletem a data de fim; a atividade conta transições no período UTC inclusivo.',
                        'Todas as fases-pai aparecem cronologicamente, incluindo concluídas e futuras, e crescem sem scroll interno. Os alertas têm prioridade e destacam datas em incumprimento. Os nomes ocupam duas linhas com o título completo em hover.',
                        'Milestones mostra totais de concluídos, em atraso e por concluir. A lista cronológica inclui a última conclusão registada até dez dias depois, todos os atrasados e o próximo por concluir. Nome, data e progresso mantêm-se na mesma linha; o nome abre o detalhe.',
                        '**Sprint** mostra os Sprints ativos na data de fim e os concluídos durante o período selecionado. A altura fixa é igual à de Epics e permite dois Sprints sem scroll. Cada Sprint apresenta nome truncado e datas dd/mm na primeira linha; na segunda, a badge On Target/Completed/Overdue e Workitems, Story Points concluídos/planeados e Progresso. Workitems atualiza o detalhe integrado e usa o nome do Sprint no título. Os Sprints concluídos preservam os workitems e pontos registados no fecho. Epics fica ao lado de Sprint com linhas compactas e scroll, SP e valores na mesma linha e as barras de progresso existentes; o estado dá lugar a mais espaço para o título.',
                        '**Estado dos workitems** agrega User Stories, Tasks independentes e Bugs por categoria do workflow, com uma legenda comum. O conteúdo fica centrado verticalmente, com mais espaço entre elementos e sem scroll interno. As barras contínuas mostram quantidades nos segmentos e percentagens em hover. O progresso do projeto mantém o círculo azul e concluídos/total. As barras dos milestones e Epics ficam verdes a 100%.',
                        '**Resumo de atividade** fica entre Estado dos workitems e um único **Detalhe dos workitems**. Selecione Iniciados, Concluídos, Em curso, Em testes ou User Stories criadas para atualizar a lista compacta com scroll, sem abrir outro card no fundo. O detalhe começa com uma mensagem de seleção e adota a designação do indicador no título. Os três widgets adjacentes têm alturas compactas iguais e o detalhe mostra pelo menos três workitems sem scroll. Todas as seleções de progresso e Sprint usam este detalhe integrado; nunca aparece uma lista no fundo. Em curso inclui apenas a sua categoria, excluindo Testing. Em testes conta entradas registadas em Testing no período, independentemente da criação ou de alterações posteriores, mostrando o estado atual. Iniciados, Concluídos e Em curso mantêm o estado na data de fim. User Stories criadas conta as datas de criação no período independentemente do estado, incluindo Stories registadas e posteriormente eliminadas.',
                        'Cada linha mostra ID pequeno acima do título truncado, tipo e estado com pontos de cor e iniciais do responsável com nome completo em hover. O ID abre o detalhe. As quatro listas independentes continuam disponíveis em **Secções visíveis**, mas começam ocultas. O seletor apresenta Visíveis e Ocultas, olho para ocultar, + para mostrar e drag and drop ou setas para reordenar todos os widgets visíveis. A ordem e visibilidade de todos os widgets são partilhadas no ficheiro do projeto; **Repor predefinições** restaura Resumo de atividade e Detalhe dos workitems e oculta as listas independentes. Em leitura e no histórico, as alterações de disposição ficam locais.',
                        'Riscos abertos, entregáveis e decisões usam listas compactas com scroll e sem cabeçalhos de tabela, preservando estado, nível de risco, datas e responsáveis. Workitems e registos de controlo abrem o detalhe normal com edição, respeitando as mesmas permissões da Tabela e Board. A **Análise dos sprints — Todos os sprints** considera todos os Sprints concluídos, independentemente das datas da Visão global. O Resumo mostra Velocidade média (SP/Sprint), Previsibilidade dos sprints, Utilização da capacidade Trabalho por concluir (SP/Sprint) e Mediana de retrabalho pós-sprint (workitems/Sprint). O Desempenho dos sprints apresenta velocidade, previsibilidade, capacidade vs planeamento e trabalho por concluir, além de um boxplot do tempo de ciclo até Testing por SP e evolução do retrabalho pós-sprint com linha de mediana. Os gráficos adaptam-se à largura disponível; passe o rato ou foque para consultar nomes completos e valores exatos. O excesso de capacidade é destacado a vermelho.'
                    ] },
                    { kind: 'callout', tone: 'note', text: 'A ausência de histórico apresenta N/A nas contagens de transições. As criações usam as datas de criação registadas. A Análise dos sprints usa resultados congelados no fecho. A velocidade usa os créditos únicos de implementação concluída; o trabalho por concluir usa as unidades de planeamento pendentes no fecho. A previsibilidade é a média da percentagem de pontos inicialmente planeados que foram concluídos, excluindo adições posteriores; a utilização calcula a média de planeamento inicial/capacidade por Sprint. Tasks dependentes não duplicam os pontos da Story. Uma Story em Testing só pode contar como implementação concluída pelas regras existentes de conclusão dos filhos. O planeamento inicial é recuperado de um início de Sprint registado e congelado no fecho. Registos ausentes e denominadores zero apresentam N/A; as médias incluem apenas valores conhecidos. A entrada na Análise dos sprints carrega automaticamente o histórico dos projetos em pasta, com opção de repetir em caso de erro. Cada Sprint apresenta oito indicadores, alterações de âmbito, resultados, execução por SP, retrabalho pós-sprint e um único Detalhe dos workitems. O tempo de ciclo mede a primeira entrada em In Progress até à primeira entrada em Testing (ou Done se Testing foi omitido), mesmo antes do Sprint, em dias úteis UTC (zero no mesmo dia; exclui fins de semana). Transições desconhecidas ficam indisponíveis; SP ausentes são excluídos dos gráficos. Todos os sprints elimina duplicações de workitems. Os pontos abrem os detalhes e a linha liga as médias por SP. O retrabalho conta cada unidade de planeamento uma vez por Sprint se terminou em Testing e voltou depois a In Progress, incluindo via Backlog/To Do. Cada fecho posterior substitui o ciclo pendente; a regressão pertence apenas ao Sprint correspondente. O denominador é o total congelado no fecho. O retrabalho pode evoluir sem alterar resultados congelados. As seleções de âmbito, resultados e retrabalho usam o mesmo detalhe, limpo ao mudar de Sprint. O resumo individual apresenta duração em dias úteis inclusivos, SP inicialmente planeados, SP concluídos e respetiva percentagem, capacidade, conclusão, workitems concluídos, mediana do tempo de ciclo e retrabalho. Uma transição direta de In Progress para Done fornece o fim do ciclo quando Testing foi omitido. O Burndown do sprint e o gráfico de execução existente partilham a primeira linha. O burndown usa a alocação e categorias registadas, sem duplicar Tasks dependentes: Testing e Done retiram SP e as alterações de âmbito aplicam-se na data registada. Actual termina hoje ou no fecho; Ideal mantém o compromisso inicial até ao fim previsto. O histórico no fecho permanece congelado. Sem início registado, apresenta uma indicação de dados insuficientes. Added/Removed mostram contagem e SP; as barras de resultados e o indicador de retrabalho atualizam o mesmo detalhe. O carregamento mantém a navegação visível, processa o histórico em blocos e mostra percentagens de etapas concluídas. Operações de leitura sem progresso conhecido usam um indicador indeterminado; erros permitem repetir.' }
                ],
                related: ['agile-review', 'views-control', 'files-history']
            },
            {
                id: 'views-control',
                title: 'Controlo do projeto',
                summary: 'Riscos, decisões e entregáveis associados a fases e marcos.',
                blocks: [
                    { kind: 'terms', items: [
                        ['Risco', 'Probabilidade × impacto dá o nível de risco (Baixo, Médio, Alto). Registe planos de mitigação e contingência; se se materializar, registe a data e o impacto real.'],
                        ['Decisão', 'Proposta, Aprovada, Rejeitada, Substituída ou Cancelada, com decisor, data e fundamentação.'],
                        ['Entregável', 'Planeado, Em curso, Entregue, Aceite ou Cancelado, com datas prevista, de entrega e de aceitação e um validador.']
                    ] },
                    { kind: 'p', text: 'Os registos têm IDs como `CHK-RK-1`, participantes, etiquetas, comentários e histórico, e podem ser associados a fases e marcos. Ligações antigas a workitems ficam preservadas como metadados arquivados, não como associações ativas. Filtre por Todos, Pendentes, Em atraso ou Pendente de aceitação.' },
                    { kind: 'list', items: [
                        'Riscos, Decisões e Entregáveis mantêm subseções próprias com o mesmo layout de **Tabela → Todos**. Contagens e seleção ficam à esquerda; pesquisa, ícones de Filtros, Colunas e Exportar CSV, separador e **+ Novo registo** ficam à direita.',
                        'Abra **Filtros** para estado, responsável, associações a fases/milestones e Pendentes, além dos campos de cada tipo: avaliações/nível de risco, decisor/data, ou validador/data prevista/Em atraso/Pendente de aceitação. Os filtros ativos aparecem em etiquetas removíveis.',
                        'Selecione linhas ou a página atual, limpe a seleção, ordene por qualquer coluna visível e escolha 25, 50 ou 100 linhas por página. Clique numa linha, ID ou título para abrir o detalhe existente.',
                        'O ícone **Colunas** permite mostrar, ocultar, reordenar ou repor colunas. ID e título são obrigatórios. As listas Visíveis e Ocultas têm controlos olho/+, arrasto e setas para cima/baixo. As preferências ficam guardadas localmente por projeto e subseção, independentes das colunas da tabela de workitems. A coluna Estado apresenta apenas o estado do registo.',
                        '**Exportar CSV** pede vírgula ou ponto e vírgula e exporta todos os registos filtrados/ordenados pela ordem das colunas visíveis, incluindo outras páginas. Em leitura e no histórico mantém consulta e exportação; **+** fica desativado.'
                    ] },
                    { kind: 'callout', tone: 'rule', title: 'Regra da aplicação', text: 'Entregáveis pendentes de aceitação mantêm o progresso das respetivas fases e marcos abaixo de 100%.' },
                    { kind: 'callout', tone: 'method', title: 'Prática Agile', text: 'Reveja os riscos abertos no planeamento do sprint e registe decisões importantes — incluindo acordos da retrospetiva — como Decisões.' }
                ],
                related: ['views-dashboard', 'plan-roadmap', 'agile-review']
            },
            {
                id: 'views-filters',
                title: 'Pesquisa, filtros e ordenação',
                summary: 'Use pesquisas independentes no Board e nas tabelas; Dashboard, Roadmap e Planeador têm controlos próprios.',
                blocks: [
                    { kind: 'list', items: [
                        '**Pesquisa**: use o campo na barra do Board ou no cabeçalho da Tabela, ou abra a [paleta de comandos](prod-palette) pela lupa na barra superior ou com [[Ctrl/⌘]] + [[K]] e escolha **Filtrar quadro por “…”**. A secção mostra a pesquisa atual; clique em × para a limpar.',
                        '**Filtros**: estado, bloqueio (combinado, manual ou por dependência), responsável, participante, prioridade, esforço e planeamento. Abra **Filtros e vista** na barra do Board ou **Filtros** no cabeçalho da Tabela. O botão mostra o número de filtros ativos. Use **Limpar tudo** ou **Repor** no cabeçalho do painel para limpar os filtros configurados; não aparecem etiquetas de filtros.',
                        '**Ordenação**: por prioridade, esforço, pontuação ou nome, ascendente ou descendente.',
                        '**Repor**: prima [[R]] para repor filtros e ordenação.'
                    ] },
                    { kind: 'p', text: 'Os filtros combinam-se dentro de cada vista. O Board inclui filtros por Epic e User Story, com os mesmos critérios da Tabela. A pesquisa e os filtros de cada subseção da Tabela e de cada Sprint são independentes e mantêm-se durante a sessão; limpar uma tabela não altera as outras. Os filtros do Board ficam no endereço e também afetam Planeador/Calendário, que não apresentam os mesmos controlos de pesquisa. O Dashboard usa período e âmbito próprios.' }
                ],
                related: ['views-choose', 'prod-palette']
            }
        ]
    },
    {
        id: 'files',
        title: 'Ficheiros, gravação e histórico',
        topics: [
            {
                id: 'files-open',
                title: 'Abrir projetos e modo de leitura',
                summary: 'Abra pastas para editar, converta ficheiros antigos ou arraste ficheiros antigos para consultar em modo de leitura.',
                blocks: [
                    { kind: 'list', items: [
                        '**Importar projetos** abre uma pasta de projeto ou uma pasta principal com projetos nas subpastas diretas, com leitura e escrita. Cada projeto exige `project.json`, `history.json` e `attachments/`.',
                        'Os projetos válidos abrem mesmo que outros sejam inválidos; os erros são apresentados individualmente. Os já carregados mantêm-se e os duplicados são ignorados.',
                        'Ficheiros antigos `.board.json` diretamente na pasta escolhida são convertidos em subpastas, preservando IDs, histórico e imagens e mantendo os originais. Feche um original aberto antes de importar a cópia convertida.',
                        'Arrastar ficheiros antigos `.board.json` para a janela abre-os em **modo de leitura**. Arrastar apenas o `project.json` de uma pasta não é uma forma de importação suportada.',
                        'Se a seleção de pastas não estiver disponível mas a de ficheiros estiver, a aplicação permite criar e abrir ficheiros antigos `.board.json`. Os formatos antigos suportados são migrados sem substituir IDs.'
                    ] },
                    { kind: 'p', text: 'Os projetos só de leitura são identificados no seletor. Pode consultar detalhes, histórico, ligações e exportações, mas não editar. Remova um projeto pela sua entrada no seletor junto ao logo; fecha-o na aplicação sem eliminar os ficheiros.' }
                ],
                related: ['start-first-project', 'files-saving']
            },
            {
                id: 'files-saving',
                title: 'Gravação automática',
                summary: 'As alterações aplicadas são guardadas na pasta; o seletor mostra gravação, falhas e conflitos.',
                blocks: [
                    { kind: 'p', text: 'Projetos em pastas carregam o estado atual de `project.json`. `history.json` é consultado quando necessário, incluindo a timeline e os separadores Histórico/Comentários. Os anexos ficam em `attachments/` e são lidos para pré-visualização, abertura ou transferência.' },
                    { kind: 'p', text: 'Não há botão Guardar do projeto. As alterações aplicadas são guardadas automaticamente; os editores e Definições do projeto só aplicam o rascunho quando clica em Guardar. Novos eventos são acrescentados sem carregar ou reescrever o histórico anterior; gravações sem novos eventos não o alteram.' },
                    { kind: 'p', text: 'O estado de gravação aparece junto ao projeto selecionado no cabeçalho e no seletor: **A guardar**, **Por guardar**, **Falha ao guardar**, **Conflito** ou **Atualização externa**. Algumas janelas também mostram um indicador de gravação.' },
                    { kind: 'list', items: [
                        'Se guardar falhar, as alterações continuam na aplicação. Abra o seletor e use **Tentar guardar novamente**.',
                        'Os conflitos suspendem a gravação do projeto até serem [resolvidos](files-external). Alterações por guardar têm uma cópia de recuperação local.',
                        'As alterações da paleta oferecem **Desfazer** durante alguns segundos. Referências do histórico e de Desfazer preservam anexos ainda necessários.'
                    ] },
                    { kind: 'callout', tone: 'tip', text: 'Faça cópia de segurança ou sincronize a pasta completa: estado atual, histórico e anexos pertencem ao mesmo projeto. As preferências do navegador são separadas.' }
                ],
                related: ['files-external', 'files-history']
            },
            {
                id: 'files-external',
                title: 'Alterações externas e conflitos',
                summary: 'Os ficheiros abertos são vigiados; as alterações feitas noutro lado são recarregadas ou assinaladas.',
                blocks: [
                    { kind: 'p', text: 'O TeamOS verifica o ficheiro antes de cada gravação e novamente depois, e vigia alterações entre gravações. As alterações independentes são integradas automaticamente; um aviso permite consultar os detalhes.' },
                    { kind: 'p', text: 'Se existirem conflitos, a gravação automática desse projeto fica pausada e pode continuar a editar. Escolha **Resolver** para comparar a base, o seu valor e o valor externo de cada campo. Escolha individualmente ou use **Manter todos os meus** / **Manter todos os externos**, seguido de **Aplicar decisões e guardar**. As alterações independentes são preservadas. Se alterações relacionadas violarem a integridade do projeto, os elementos afetados são revistos em conjunto.' },
                    { kind: 'p', text: 'Escolha **Adiar** ou prima Escape para adiar sem gravar. As alterações por guardar têm uma cópia de recuperação local: depois de recarregar a página, volte a abrir o ficheiro do projeto e escolha **Recuperar alterações**. Fechar com alterações por guardar apresenta um aviso do browser. Uma revisão anterior ou igual com conteúdo diferente exige sempre revisão.' },
                    { kind: 'callout', tone: 'rule', title: 'Ficheiros partilhados', text: 'Os separadores do mesmo browser coordenam as gravações. Em pastas de rede ou sincronizadas continua a existir um pequeno intervalo entre verificar e gravar; a verificação deteta alterações concorrentes, mas o TeamOS não bloqueia ficheiros noutro computador nem controla conflitos do cliente de sincronização.' }
                ],
                related: ['files-saving', 'files-history']
            },
            {
                id: 'files-history',
                title: 'Histórico, linha temporal e restauro',
                summary: 'Cada alteração guardada fica registada. Consulte o histórico de um workitem ou pré-visualize e restaure um estado anterior do projeto.',
                blocks: [
                    { kind: 'h', text: 'Histórico do workitem' },
                    { kind: 'p', text: 'O separador **Histórico** nos detalhes do workitem lista alterações de criação, campos, estado, pessoas, planeamento, relações e arquivo, com valores antes e depois. Filtre por categoria.' },
                    { kind: 'h', text: 'Histórico do projeto' },
                    { kind: 'steps', items: [
                        'Ative **Mostrar barra do histórico** nas Definições da aplicação (roda dentada na barra superior).',
                        'Selecione um projeto, clique em **Carregar histórico / timeline** quando apresentado e arraste o cursor para um evento passado. Todo o projeto é mostrado como estava, só de leitura.',
                        'Clique em **Restaurar este estado** para o tornar atual, ou em **Mais recente** para voltar sem restaurar.'
                    ] },
                    { kind: 'callout', tone: 'rule', title: 'Regra da aplicação', text: 'O restauro também fica registado no histórico, por isso o estado anterior continua disponível. Identidades, números de workitems e números de sprints nunca são reutilizados. Os comentários publicados são mantidos.' },
                    { kind: 'callout', tone: 'note', text: 'O histórico é um registo local num ficheiro editável: útil e detalhado, mas não é uma auditoria à prova de adulteração.' }
                ],
                related: ['files-saving', 'views-dashboard', 'wi-collab']
            }
        ]
    },
    {
        id: 'productivity',
        title: 'Produtividade e referência rápida',
        topics: [
            {
                id: 'prod-palette',
                title: 'Paleta de comandos',
                summary: 'Uma caixa para encontrar tudo e agir sem largar o teclado.',
                blocks: [
                    { kind: 'paletteGuide' }
                ],
                related: ['prod-shortcuts', 'views-filters', 'plan-day']
            },
            {
                id: 'prod-shortcuts',
                title: 'Atalhos de teclado',
                summary: 'A lista completa de atalhos, gerada a partir da própria aplicação.',
                blocks: [
                    { kind: 'p', text: 'Os atalhos de uma só tecla funcionam quando não está a escrever num campo. Se entrarem em conflito com tecnologias de apoio, desative-os na janela **Atalhos** ([[?]]).' },
                    { kind: 'shortcutReference' }
                ],
                related: ['prod-palette', 'prod-settings']
            },
            {
                id: 'prod-settings',
                title: 'Tema, idioma e definições da aplicação',
                summary: 'Preferências pessoais, memorizadas neste navegador.',
                blocks: [
                    { kind: 'terms', items: [
                        ['Tema', 'As Definições permitem escolher Clássico (o design original) ou Moderno (superfícies e controlos atualizados, com tipografia Inter incluída localmente). As opções Claro/Escuro alternam o modo de forma independente em qualquer tema. Ambas as escolhas ficam guardadas neste navegador, incluindo entre separadores, sem alterar projetos ou rascunhos abertos.'],
                        ['Idioma', 'Nas Definições, escolha English ou Português, incluindo esta documentação.'],
                        ['Definições da aplicação', 'A roda dentada abre um painel flutuante com aparência, tema, idioma e visibilidade da barra do histórico.'],
                        ['Atalhos', 'Ativa ou desativa os atalhos de uma só tecla.']
                    ] },
                    { kind: 'p', text: 'Estas preferências ficam guardadas apenas neste navegador; não são escritas nos ficheiros de projeto.' }
                ],
                related: ['prod-shortcuts', 'files-history']
            }
        ]
    },
    {
        id: 'example',
        title: 'Exemplo completo e dúvidas frequentes',
        topics: [
            {
                id: 'ex-walkthrough',
                title: 'Exemplo de ponta a ponta',
                summary: 'De uma necessidade de negócio até uma User Story aceite, passo a passo.',
                blocks: [
                    { kind: 'p', text: 'Uma equipa desenvolve uma loja online. O negócio quer que os clientes possam **pagar com cartão**. A sigla do projeto é `SHP`; a Ana é a Product Owner, o Rui e a Marta são programadores.' },
                    { kind: 'h', text: '1. Preparar o projeto' },
                    { kind: 'p', text: 'Nas Definições do projeto, acrescente os membros Ana, Rui e Marta e as etiquetas `payments` e `frontend`. Crie no Roadmap a fase **Versão 1** e o marco **Entrada em produção**.' },
                    { kind: 'h', text: '2. Descrever o objetivo' },
                    { kind: 'p', text: 'Crie o Epic `SHP-EP-1` **Pagamentos com cartão**, com o Objetivo “Os clientes concluem compras com cartão”, a fase Versão 1 e o marco Entrada em produção.' },
                    { kind: 'h', text: '3. Expressar as necessidades' },
                    { kind: 'p', text: 'A partir do Epic, crie as Stories `SHP-US-2` **Pagar com um cartão guardado** e `SHP-US-3` **Receber o comprovativo de pagamento**. Herdam a Versão 1 e a Entrada em produção. Na US-2, escreva critérios como: “Dado um cartão guardado, quando confirmo a encomenda, então o pagamento é autorizado e a encomenda fica paga.” Defina a Ana como responsável.' },
                    { kind: 'h', text: '4. Planear a execução' },
                    { kind: 'p', text: 'A partir da US-2, crie as Tasks `SHP-TK-4` Integrar o gateway de pagamento (Rui, esforço M) e `SHP-TK-5` Ecrã de seleção do cartão (Marta, esforço S). Associe a TK-5 como **bloqueada pela** TK-4, porque o ecrã precisa da API.' },
                    { kind: 'h', text: '5. Planear o sprint' },
                    { kind: 'p', text: 'Em **Tabela → Backlog**, selecione a US-2 e a US-3 e escolha **Ações de sprint → Criar sprint**: **Sprint 1 - Pagamento com cartão**, duas semanas. As Tasks acompanham as suas Stories.' },
                    { kind: 'h', text: '6. Executar' },
                    { kind: 'p', text: 'Use **Iniciar Sprint** no Roadmap ou em Tabela → Sprints. O Board Técnico mostra então a TK-4 e a TK-5 com Apenas sprints ativos selecionado. O Rui arrasta a TK-4 para Em curso; a TK-5 fica bloqueada por dependência. O Rui reserva duas horas no Planeador. Quando a TK-4 fica concluída, a TK-5 é desbloqueada e a Marta começa-a.' },
                    { kind: 'h', text: '7. Aceitar' },
                    { kind: 'p', text: 'Com as duas Tasks concluídas, a US-2 mostra **Tarefas: 100%** — a execução está completa, mas a Story ainda não está aceite. A Ana testa os critérios na revisão do sprint e move a US-2 pelas transições permitidas até Done no Board Funcional. A aplicação mostra os critérios; a Ana confirma com a identidade selecionada no projeto. A aceitação fica registada no histórico da US-2.' },
                    { kind: 'h', text: '8. Rever' },
                    { kind: 'p', text: 'O Dashboard mostra o progresso da Versão 1 e o que foi concluído no sprint. A equipa encerra o Sprint, regista a Revisão e a Retrospetiva no editor e guarda no Controlo do projeto a decisão “Acordar contratos de API antes do trabalho de interface”.' },
                    { kind: 'callout', tone: 'method', title: 'O que este exemplo mostra', text: 'O planeamento flui de cima para baixo (Epic → Story → Task, com planeamento herdado); a execução flui de baixo para cima (as Tasks terminam e o progresso cresce); e a aceitação é uma decisão humana explícita face aos critérios.' }
                ],
                related: ['start-first-flow', 'wi-acceptance', 'agile-sprints']
            },
            {
                id: 'ex-faq',
                title: 'Dúvidas frequentes',
                summary: 'Respostas curtas a perguntas comuns.',
                blocks: [
                    { kind: 'terms', items: [
                        ['Porque não consigo editar um projeto?', 'Ficheiros antigos arrastados e pré-visualizações históricas são só de leitura. Tabelas de Sprints encerrados mostram valores congelados; abrir um workitem existente pode mostrar os detalhes atuais. Use Importar projetos para escrita ou volte a Mais recente. Consulte [Abrir projetos](files-open).'],
                        ['Porque não consigo concluir uma Story ou Bug?', 'As Tasks filhas têm de estar Concluídas, Canceladas ou desassociadas, o workflow tem de permitir a transição e é preciso confirmar a [aceitação funcional](wi-acceptance). Os Critérios são recomendados, mas não obrigatórios.'],
                        ['Todas as Tasks estão Done. Porque é que a Story não está?', 'Implementação concluída e aceitação são distintas. Reveja e aceite explicitamente a Story. Os [automatismos](wf-automation) podem prepará-la para testes, mas nunca aceitá-la.'],
                        ['Porque continua o Sprint Ativo depois da data de fim?', 'O estado é manual. Use Finalizar Sprint no Roadmap ou Tabela → Sprints para registar o fecho e tratar trabalho pendente.'],
                        ['Porque falta um workitem no Board?', 'Verifique a atribuição Técnico/Funcional, Apenas sprints ativos, Sprint e restantes filtros, e colunas ocultas. Desmarque Apenas sprints ativos para incluir trabalho sem Sprint; os Epics consultam-se na Tabela.'],
                        ['Como atribuo uma pessoa que não aparece?', 'Adicione um membro nas [Definições do projeto](projects-people) ou no seletor de identidade do projeto.'],
                        ['Posso mover uma Task para outro projeto?', 'Sim, entre projetos elegíveis do mesmo produto, revendo estados e associações de destino. Consulte [Copiar e mover](projects-transfers).'],
                        ['Onde estão os dados?', 'Normalmente numa pasta com `project.json`, `history.json` e `attachments/`. Os ficheiros antigos `.board.json` continuam suportados. As preferências ficam no navegador.'],
                        ['Alterei algo por engano.', 'Use Desfazer quando disponível, ou pré-visualize e restaure um estado no [histórico](files-history).'],
                        ['O TeamOS calcula velocidade?', 'Regista Story Points opcionais, capacidade manual, créditos únicos de implementação concluída e velocidade congelada no fecho. Os cabeçalhos mostram os totais de pontos; a Análise de sprints do Dashboard apresenta médias e tendências de Sprints concluídos a partir dos resultados congelados. Consulte [Sprints](plan-sprints).']
                    ] }
                ],
                related: ['start-what', 'agile-rules']
            }
        ]
    }
];
