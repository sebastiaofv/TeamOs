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
                    { kind: 'p', text: 'O TeamOS é um espaço de planeamento e execução para equipas que trabalham de forma Agile. Cada **projeto** é um único ficheiro `.board.json` no seu computador. Pode abrir vários projetos ao mesmo tempo, agrupar projetos relacionados num **produto** e trabalhar em todos a partir do mesmo ecrã.' },
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
                summary: 'A barra superior reúne as ações globais; a navegação e a seleção de projeto dão acesso a cada vista, com os controlos na sua barra existente.',
                blocks: [
                    { kind: 'terms', items: [
                        ['Barra superior', 'Seletor de projeto junto ao logo, pesquisa (abre a [paleta de comandos](prod-palette)), atalhos de teclado, documentação, definições da aplicação, Importar projetos e Novo projeto. Está sempre disponível, mesmo enquanto lê a documentação.'],
                        ['Botão de documentação', 'O ícone de livro abre esta documentação no lugar do espaço de trabalho. Durante a leitura mostra um ícone de aplicação: clique para voltar exatamente onde estava.'],
                        ['Navegação', 'Os botões de vista ficam à esquerda, por baixo da barra superior. Pesquisa, filtros e ordenação ficam à direita na barra do Board, junto de Apenas sprints ativos, e à esquerda no cabeçalho da Tabela. Colunas e criação de workitems na Tabela alinham à direita. Dashboard, Roadmap e Planeador não apresentam estes controlos de pesquisa.'],
                        ['Seletor de projeto', 'Junto ao logo, abra o nome selecionado para escolher **Todos** ou um projeto. Expanda um produto para ver os seus projetos. O menu mantém definições, remoção e repetição de gravação; o estado de gravação do projeto selecionado também aparece junto ao nome.'],
                        ['Vista', 'A área principal: Quadro, Dashboard, Tabela, Roadmap, Controlo do projeto, Calendário ou Planeador.'],
                        ['Barra do histórico', 'Opcional. Ative-a nas Definições da aplicação para percorrer o [histórico](files-history) de um projeto.']
                    ] },
                    { kind: 'h', text: 'Vistas e seleção de projeto' },
                    { kind: 'p', text: 'O Quadro, o Calendário e o Planeador funcionam com todos os projetos carregados. O Dashboard, a Tabela, o Roadmap e o Controlo do projeto descrevem um único projeto, por isso os respetivos botões aparecem quando seleciona um projeto junto ao logo. Consulte [Escolher uma vista](views-choose).' },
                    { kind: 'callout', tone: 'tip', text: 'Prima [[?]] a qualquer momento para ver todos os atalhos de teclado e [[H]] para abrir ou fechar esta documentação.' }
                ],
                related: ['views-choose', 'prod-shortcuts']
            },
            {
                id: 'start-first-project',
                title: 'Criar ou abrir um projeto',
                summary: 'Comece com um novo ficheiro de projeto ou importe ficheiros existentes. Um projeto aberto com permissão de escrita é guardado automaticamente.',
                blocks: [
                    { kind: 'h', text: 'Criar um novo projeto' },
                    { kind: 'steps', items: [
                        'Clique em **+ Novo projeto** na barra superior (ou prima [[N]]).',
                        'Preencha as definições: o **Nome do projeto** e uma **Sigla do projeto** com 1 a 4 letras são obrigatórios. A sigla é o prefixo dos IDs dos novos workitems, por exemplo `CHK-US-2`.',
                        'Opcionalmente, acrescente descrição, produto, membros e etiquetas. Pode alterar tudo isto mais tarde.',
                        'Escolha onde guardar o ficheiro `.board.json`. O projeto é adicionado ao portefólio e selecionado.'
                    ] },
                    { kind: 'h', text: 'Abrir projetos existentes' },
                    { kind: 'steps', items: [
                        'Clique em **Importar projetos** (ou prima [[I]]) e selecione um ou mais ficheiros `.board.json`.',
                        'Em alternativa, arraste os ficheiros de projeto para a janela.',
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
                        '**Descreva o objetivo.** Selecione o projeto, abra o Quadro, mude para o **Board Funcional** e clique em **Criar workitem**. Crie um **Epic** que descreva o objetivo de negócio.',
                        '**Expresse as necessidades.** A partir dos detalhes do Epic, crie **User Stories**. Dê a cada uma **Critérios de aceitação** — são obrigatórios para aceitar a Story mais tarde.',
                        '**Planeie o trabalho.** A partir de cada Story, crie as **Tasks** necessárias para a entregar. Defina prioridade e esforço.',
                        '**Planeie um sprint.** Abra o [Roadmap](plan-roadmap) ou a Tabela, selecione as Stories e crie um sprint com datas de início e fim.',
                        '**Execute.** No **Board Técnico**, as Tasks das Stories do sprint ativo aparecem nas colunas. Arraste-as à medida que o trabalho avança.',
                        '**Aceite.** Quando as Tasks estiverem concluídas, mova a Story para um estado concluído. A aplicação pede a aceitação funcional: confirme que os critérios são cumpridos e indique o seu nome.'
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
                    { kind: 'p', text: 'No TeamOS, os novos workitems começam no estado reservado **Backlog**. Ficam aí até estarem prontos para ser trabalhados; depois são enviados para o estado de entrada do Board (por omissão **To Do**).' },
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
                        'Ordene por prioridade ou pontuação e filtre por etiqueta ou participante.',
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
                    { kind: 'callout', tone: 'rule', title: 'Regra da aplicação', text: 'Uma User Story só pode pertencer a um Epic. Uma Task pode pertencer a um Epic, User Story ou Bug, ou ser independente. Os Bugs usam o workflow funcional e recebem uma Task de execução ao criar. O tipo de um workitem não pode mudar depois de criado.' }
                ],
                related: ['wi-types', 'wi-hierarchy', 'wi-acceptance']
            },
            {
                id: 'agile-sprints',
                title: 'Planeamento de sprints',
                summary: 'Escolha um objetivo de sprint, selecione as Stories que o servem e comprometa-se com o que cabe.',
                blocks: [
                    { kind: 'steps', items: [
                        'Acordem um **objetivo de sprint**: uma frase que descreve o resultado do sprint. Registe-o no título ou na descrição do sprint.',
                        'Crie o sprint com datas de início e fim, no [Roadmap](plan-roadmap) ou a partir de uma seleção na Tabela.',
                        'Acrescente as Stories, Tasks independentes e Bugs prontos de maior valor. Pare quando a experiência da equipa indicar que o sprint está cheio.',
                        'Confirme que cada Story tem Tasks; as Tasks de uma Story acompanham automaticamente a Story no sprint.'
                    ] },
                    { kind: 'callout', tone: 'rule', title: 'Regra da aplicação', text: 'As Tasks de uma Story são planeadas através da Story: uma Task que pertence a uma Story segue sempre o sprint atual da Story. Só os sprints Planeados ou Ativos aceitam novos workitems; um sprint cuja data de fim já passou está Concluído.' },
                    { kind: 'callout', tone: 'note', text: 'O TeamOS não regista story points, capacidade nem um fecho formal de sprint. O estado do sprint (Planeado, Ativo, Concluído) é derivado das datas. Use o esforço e o histórico da equipa como referência de planeamento.' }
                ],
                related: ['plan-sprints', 'plan-inheritance', 'views-table']
            },
            {
                id: 'agile-execution',
                title: 'Executar no Board Kanban',
                summary: 'Torne o trabalho visível, limite o trabalho em curso e remova bloqueios rapidamente.',
                blocks: [
                    { kind: 'p', text: 'Durante o sprint, o [Board](wf-board) é a imagem partilhada do trabalho da equipa. O **Board Técnico** mostra Tasks. O **Board Funcional** mostra User Stories e Bugs.' },
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
                    { kind: 'callout', tone: 'method', title: 'Prática Agile', text: 'Termine cada sprint com uma **revisão** (demonstrar e aceitar o que foi entregue) e uma **retrospetiva** (acordar uma ou duas melhorias). O TeamOS não guarda registos de revisão nem de retrospetiva; registe as decisões no [Controlo do projeto](views-control) ou em comentários.' }
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
                        ['Aceitação', 'Aceitar com base em critérios acordados', 'Uma Story precisa de Critérios de aceitação e de não ter Tasks pendentes para ser concluída; Stories e Bugs exigem uma aceitação funcional com autor'],
                        ['Workflow', 'Acordar uma definição clara de cada estado', 'Os movimentos têm de seguir as transições configuradas'],
                        ['Planeamento de sprint', 'Comprometer-se com o que cabe', 'As Tasks de Stories seguem a Story; só sprints Planeados/Ativos aceitam trabalho'],
                        ['WIP', 'Limitar o trabalho em curso', 'Não imposto'],
                        ['Estimativa', 'Dimensão relativa, velocidade', 'Apenas tamanhos de esforço; sem story points nem velocidade'],
                        ['Dependências', 'Resolver bloqueios cedo', 'Informativas: o bloqueio é mostrado mas não impede mudanças de estado'],
                        ['Revisão/retro', 'Realizá-las em cada sprint', 'Não registadas pela aplicação']
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
                    { kind: 'p', text: 'Um **projeto** é um conjunto independente de workitems com os seus próprios workflows e definições, guardado no seu próprio ficheiro. Um **produto** é apenas um nome partilhado por vários projetos: não tem workitems nem workflows próprios, nem outros níveis de agrupamento.' },
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
                    { kind: 'p', text: 'Abra as Definições do projeto no seletor de projeto junto ao logo. A janela tem três separadores: **Geral**, **Workflow técnico** e **Workflow funcional**. As alterações de todos os separadores formam um único rascunho e só são aplicadas quando clica em **Guardar**; Cancelar, Escape ou fechar a janela descarta-as.' },
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
                        'Mudar o nome de um membro atualiza todas as atribuições atuais, incluindo workitems arquivados.',
                        'Um membro ainda atribuído não pode ser removido: substitua ou remova primeiro essas atribuições.',
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
                        'Etiquetas em uso (incluindo em workitems arquivados) não podem ser removidas até serem retiradas desses workitems.',
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
                summary: 'Quatro tipos de workitem, cada um com o seu propósito e campos.',
                blocks: [
                    { kind: 'table', head: ['Tipo', 'ID', 'Campos específicos', 'Workflow'], rows: [
                        ['Epic', '`EP`', 'Objetivo / Resultado esperado, Âmbito, Valor de negócio', 'Funcional'],
                        ['User Story', '`US`', 'Critérios de aceitação', 'Funcional'],
                        ['Task', '`TK`', '—', 'Técnico'],
                        ['Bug', '`BG`', 'Passos para reproduzir, Resultado esperado, Resultado observado, Ambiente / Versão', 'Funcional']
                    ] },
                    { kind: 'p', text: 'Os IDs combinam a sigla do projeto, o tipo e um número partilhado pelo projeto, por exemplo `CHK-US-2`. IDs e tipos nunca mudam depois da criação e os números apagados não são reutilizados.' },
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
                        'Epic → User Story → Task, e ainda Tasks diretamente sob um Epic.',
                        'As Tasks independentes não têm pai. Os Bugs podem ter Tasks e recebem uma automaticamente ao criar.',
                        'O pai tem de estar no mesmo projeto; os ciclos são rejeitados.',
                        'Para apagar ou mover um workitem com filhos, mova ou desassocie primeiro os filhos.'
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
                summary: 'Título, descrição, pessoas, etiquetas, prioridade, esforço, datas, lista de tarefas e planeamento.',
                blocks: [
                    { kind: 'h', text: 'Formas de criar um workitem' },
                    { kind: 'list', items: [
                        '**Criar workitem** acima do Board ou na Tabela (selecione primeiro um único projeto).',
                        'A partir dos detalhes de um pai, para criar um filho.',
                        'Defina o prazo no editor em dd/mm/aaaa; consulte os prazos em Planeador → Calendar.',
                        'Na [paleta de comandos](prod-palette) com `+ Título @pessoa !high #etiqueta ~S due:fri`.'
                    ] },
                    { kind: 'terms', items: [
                        ['Título', 'Obrigatório, até 80 caracteres.'],
                        ['Descrição', 'Texto livre para contexto.'],
                        ['Participantes / Responsável', 'Membros do projeto; consulte [Pessoas](projects-people).'],
                        ['Etiquetas', 'Do catálogo do projeto.'],
                        ['Prioridade / Esforço', 'Alta–Baixa e XS–XL; juntos dão a pontuação.'],
                        ['Prazo', 'Os prazos continuam disponíveis nos detalhes dos workitems e no Calendário.'],
                        ['Lista de tarefas', 'Uma checklist reordenável para pequenos passos.'],
                        ['Bloqueada', 'Um bloqueio manual que exige um motivo.'],
                        ['Fase / Marco / Sprint', 'Associações de planeamento; consulte [Planeamento](plan-inheritance).']
                    ] },
                    { kind: 'p', text: 'Guardar um novo workitem abre os seus detalhes. Prima [[Ctrl/⌘]] + [[Enter]] para guardar a partir do editor. **Eliminar**, no menu ⋯ dos detalhes, remove o workitem definitivamente após confirmação.' }
                ],
                related: ['wi-types', 'wi-collab', 'agile-backlog']
            },
            {
                id: 'wi-acceptance',
                title: 'Critérios de aceitação e aceitação funcional',
                summary: 'O progresso de execução mede Tasks concluídas; a aceitação funcional confirma o resultado esperado.',
                blocks: [
                    { kind: 'p', text: 'Os **Critérios de aceitação** de uma User Story descrevem como verificar que a necessidade é cumprida. O seu **progresso de execução** é a proporção das Tasks não canceladas que estão concluídas — aparece como “Tarefas: 60%” no cartão.' },
                    { kind: 'h', text: 'Aceitar uma Story ou um Bug' },
                    { kind: 'steps', items: [
                        'Garanta que todas as Tasks da Story estão concluídas, canceladas ou desassociadas e que os Critérios de aceitação estão preenchidos.',
                        'Mova a Story (ou o Bug) para um estado da categoria **Concluído**.',
                        'A aplicação mostra os critérios (ou o resultado esperado do Bug) e pede o seu nome de autor local.',
                        'Confirme. A aceitação fica registada com o seu nome e a data como “local / não verificada”.'
                    ] },
                    { kind: 'callout', tone: 'rule', title: 'Regra da aplicação', text: 'Retirar uma Story ou um Bug da categoria Concluído remove a sua aceitação. Reabrir uma Task de uma Story aceite não reabre a Story: a aplicação avisa para que a possa rever. Concluir um Epic não conclui os seus filhos.' },
                    { kind: 'callout', tone: 'note', text: 'Os nomes de autor são escritos localmente e não são verificados. Documentam quem confirmou o resultado; não são autenticação.' },
                    { kind: 'callout', tone: 'method', title: 'Prática Agile', text: 'Idealmente, quem representa o utilizador (por exemplo, o Product Owner) aceita a Story, durante a revisão do sprint.' }
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
                    { kind: 'p', text: 'Ambos aparecem nos detalhes e são incluídos pelo filtro **Bloqueadas**. Ao apagar um workitem, as suas relações e o impacto nos bloqueios são listados antes de confirmar.' },
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
                        'Escolha o seu nome de autor local antes de publicar. [[Ctrl/⌘]] + [[Enter]] publica.',
                        'Os comentários publicados não podem ser editados nem apagados na aplicação. Os rascunhos por enviar são mantidos durante a sessão.'
                    ] },
                    { kind: 'h', text: 'Anexos' },
                    { kind: 'list', items: [
                        'Até 10 ficheiros por workitem, 10 MB cada, incorporados no ficheiro do projeto. Ficheiros grandes tornam a gravação mais lenta; a aplicação avisa.',
                        'O separador Anexos lista a data de carregamento, o nome do ficheiro e quem o carregou, com **Abrir** para formatos comuns (imagens, PDF, texto, áudio, vídeo) e **Transferir** para todos.'
                    ] },
                    { kind: 'h', text: 'Pull requests' },
                    { kind: 'p', text: 'Acrescente no editor ligações HTTP/HTTPS completas para pull requests. São apenas ligações locais: a aplicação não contacta o servidor até abrir uma.' }
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
                        ['Workflow funcional', 'Aplica-se a Epics e User Stories: como uma necessidade avança da ideia até à aceitação.'],
                        ['Workflow técnico', 'Aplica-se a Tasks: como o trabalho de execução avança de por iniciar até concluído.']
                    ] },
                    { kind: 'p', text: 'Ambos são editados nas Definições do projeto e são independentes: alterar um não afeta o outro. Os projetos mais antigos mantêm o processo existente até um workflow ser editado.' },
                    { kind: 'callout', tone: 'method', title: 'Prática Agile', text: 'Mantenha o workflow funcional próximo de como o cliente vê o progresso (pronto, em desenvolvimento, em validação, aceite) e o workflow técnico próximo de como a equipa trabalha (por iniciar, em curso, revisão, testes, concluído).' }
                ],
                related: ['wf-states', 'wf-editing', 'wf-board']
            },
            {
                id: 'wf-states',
                title: 'Estados, categorias e transições',
                summary: 'Os estados são definidos por si; cinco categorias fixas dão-lhes um significado comum.',
                blocks: [
                    { kind: 'p', text: 'Cada estado pertence a uma de cinco **categorias**. As categorias determinam o progresso, os indicadores de atraso, as dependências e a aceitação, seja qual for o nome do estado.' },
                    { kind: 'table', head: ['Categoria', 'Significado', 'Estados por omissão'], rows: [
                        ['Backlog', 'Ainda não está pronto para o board', 'Backlog (reservado)'],
                        ['Por iniciar', 'Pronto a começar', 'To Do (entrada no Board)'],
                        ['Em curso', 'Em trabalho', 'In progress, Ready to test, Testing, Re-analysis'],
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
                        'Em **Estados e transições**, acrescente ou edite estados: nome, cor e categoria. Use as setas para os reordenar.',
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
                    { kind: 'p', text: 'Com um projeto selecionado, o Quadro oferece duas perspetivas:' },
                    { kind: 'terms', items: [
                        ['Board Técnico', 'Tasks. Apenas Sprints ativos está selecionado por defeito; desmarque para incluir Tasks sem Sprint e outros Sprints.'],
                        ['Board Funcional', 'User Stories.']
                    ] },
                    { kind: 'p', text: 'As colunas mostram os estados Por iniciar, Em curso e Concluído. Os itens em Backlog são trabalhados na Tabela ou nos detalhes e **enviados para o Board** quando estiverem prontos. Abra **Filtros e vista → Colunas do Board** para ocultar estados de que não precisa; ocultar uma coluna nunca move nem apaga workitems. Com **Todos os projetos** selecionado, o quadro agrupa os cartões por categoria entre projetos.' },
                    { kind: 'h', text: 'Mover cartões' },
                    { kind: 'list', items: [
                        'Arraste um cartão com o rato, ou mantenha premido em ecrãs táteis.',
                        'Com o teclado, selecione um cartão com [[J]] / [[K]] e prima [[1]]–[[4]] para o mover.',
                        'Abra a [paleta de comandos](prod-palette) sobre um cartão e escolha **Mover para…**.'
                    ] },
                    { kind: 'p', text: 'Os cartões mostram o ID no topo esquerdo, um título menor em até duas linhas abaixo e o tipo e responsável no rodapé. A seta no topo direito avança para o próximo estado permitido pelo workflow; continua a ser possível arrastar os cartões. Altere o responsável no dropdown ou clique no cartão para abrir os detalhes. Edição, eliminação, cópia, transferência, datas, bloqueio e progresso continuam nos detalhes. As colunas preenchem a largura disponível e mantêm-se iguais quando há espaço. Com muitos estados ou uma janela estreita, as colunas vazias passam a metade da largura das ocupadas; o scroll horizontal continua disponível quando necessário.' },
                    { kind: 'callout', tone: 'rule', title: 'Regra da aplicação', text: 'Um movimento não permitido pelo workflow é recusado. Mover uma Story ou um Bug para Concluído pede a [aceitação funcional](wi-acceptance).' }
                ],
                related: ['agile-execution', 'wf-states', 'views-filters']
            },
            {
                id: 'wf-automation',
                title: 'Automação',
                summary: 'O que a aplicação atualiza por si e o que deixa deliberadamente às pessoas.',
                blocks: [
                    { kind: 'h', text: 'Sempre automático' },
                    { kind: 'list', items: [
                        'O progresso de execução de uma Story a partir das suas Tasks.',
                        'O bloqueio por dependência a partir de bloqueadores por concluir.',
                        'As Tasks de uma Story seguem o sprint da Story; os filhos herdam fase e marco salvo indicação explícita.',
                        'O estado dos sprints (Planeado, Ativo, Concluído) a partir das datas, atualizado à meia-noite.',
                        'Eventos de histórico para cada alteração guardada.'
                    ] },
                    { kind: 'h', text: 'Automação de Stories' },
                    { kind: 'p', text: 'Um projeto pode definir regras de automação de Stories: quando a primeira Task de uma Story começa (**A execução começa**) ou quando todas as Tasks estão concluídas (**A execução termina**), uma Story num dos estados de origem elegíveis avança para um estado de destino. Se o workflow funcional proibir essa transição, a Task é guardada na mesma e a aplicação explica porque é que a Story não avançou. Estas regras ficam guardadas no ficheiro do projeto; atualmente não existe editor para elas nas Definições do projeto.' },
                    { kind: 'h', text: 'Nunca automático' },
                    { kind: 'list', items: [
                        'A aceitação funcional de Stories e Bugs.',
                        'A conclusão de um Epic ou dos seus filhos.',
                        'Reabrir uma Story aceite quando uma das suas Tasks é reaberta.'
                    ] }
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
                        ['Fase', 'Um período do projeto com datas de início e fim. As fases podem ter subfases; as datas de uma fase-mãe são calculadas a partir das subfases.'],
                        ['Marco', 'Um ponto de controlo datado, como um lançamento ou uma revisão.'],
                        ['Sprint', 'Uma iteração com duração fixa; consulte [Sprints](plan-sprints).']
                    ] },
                    { kind: 'steps', items: [
                        'Selecione um projeto e abra o **Roadmap**.',
                        'Use **+ Fase**, **+ Marco** e **+ Sprint** para criar itens, com datas e cor.',
                        'Associe workitems a uma fase-folha e a um marco no editor do workitem (ou deixe os filhos [herdar](plan-inheritance)).',
                        'Expanda uma fase-folha ou Sprint para ver a tabela de workitems. As fases-pai expandem as suas subfases.'
                    ] },
                    { kind: 'p', text: 'O Roadmap mantém largura e zoom à esquerda e + Marco / + Fase à direita. Os losangos dos marcos têm tamanho fixo e mostram o progresso; nome e data aparecem ao passar o rato ou focar por teclado. Usam uma linha, acrescentando uma segunda apenas para sobreposições; as restantes têm scroll. Clique no losango para consultar workitems. Clique no nome da fase ou Sprint para editar e passe o rato na barra para ver datas. Os Sprints usam Play para iniciar e uma bandeira axadrezada para finalizar, mantendo as confirmações. Os Sprints concluídos não apresentam este botão.' },
                    { kind: 'p', text: 'O progresso conta os workitems elegíveis concluídos (os cancelados são excluídos). Entregáveis pendentes de aceitação no Controlo do projeto mantêm o progresso de fases e marcos abaixo de 100%.' },
                    { kind: 'callout', tone: 'rule', title: 'Regra da aplicação', text: 'Uma fase com subfases não pode ser apagada em cascata: mova ou apague primeiro as subfases. Apagar uma fase ou marco com workitems associados pede que os realoque ou limpe explicitamente.' }
                ],
                related: ['plan-sprints', 'plan-inheritance', 'views-control']
            },
            {
                id: 'plan-sprints',
                title: 'Sprints',
                summary: 'Crie sprints, aloque trabalho e consulte quem participou em cada um.',
                blocks: [
                    { kind: 'h', text: 'Criar um sprint' },
                    { kind: 'list', items: [
                        'No Roadmap, com **+ Sprint**.',
                        'A partir de uma seleção: selecione linhas em **Tabela → Backlog** e abra **Ações de sprint** para escolher **Criar sprint** ou **Adicionar ao sprint**.'
                    ] },
                    { kind: 'p', text: 'Cada sprint recebe o número seguinte do projeto e aparece como `Sprint 3 - Título`. Os números nunca são reutilizados.' },
                    { kind: 'h', text: 'Alocação e participação' },
                    { kind: 'terms', items: [
                        ['Alocação atual a sprint', 'O único sprint Planeado ou Ativo em que um workitem está atualmente planeado.'],
                        ['Participação em sprint', 'O registo de que um workitem participou num sprint, mantido mesmo depois de a alocação mudar.']
                    ] },
                    { kind: 'p', text: 'Isto permite que **Tabela → Sprints** mostre o que cada sprint passado continha, mesmo depois de o trabalho por concluir ter avançado. A participação de uma Story não implica que todas as suas Tasks tenham participado em todos os seus sprints.' },
                    { kind: 'callout', tone: 'rule', title: 'Regra da aplicação', text: 'O estado do sprint depende do calendário: Planeado antes da data de início, Ativo entre as datas (inclusive), Concluído depois da data de fim. Só sprints Planeados e Ativos aceitam workitems. Os Epics nunca são alocados a sprints.' }
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
                    { kind: 'p', text: 'Os sprints funcionam de forma diferente: uma Task que pertence a uma Story segue sempre a alocação atual da Story.' },
                    { kind: 'callout', tone: 'tip', text: 'Planeie ao nível mais alto que fizer sentido — o Epic ou a Story — e deixe os filhos herdar. Altere apenas as exceções.' }
                ],
                related: ['plan-roadmap', 'plan-sprints', 'wi-hierarchy']
            },
            {
                id: 'plan-calendar',
                title: 'Calendário',
                summary: 'Consulte prazos de Tasks e carga de trabalho por mês ou ano dentro de Planeador → Calendar.',
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
                        'Abra o **Planeador** (ou prima [[P]]). O tabuleiro lista os workitems que pode planear, filtrados como nas outras vistas.',
                        'Arraste um workitem para o dia, entre as 07:00 e as 21:00, em intervalos de 15 minutos.',
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
                        ['Calendário', 'Ver prazos e períodos por mês ou ano', 'Todos os projetos ou um'],
                        ['Planeador', 'Agendar o seu dia ou semana', 'Todos os projetos ou um']
                    ] },
                    { kind: 'p', text: 'Os filtros e a ordenação aplicam-se a todas as vistas. Mudar de vista, ou abrir esta documentação, mantém a seleção e os filtros.' }
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
                        ['Backlog', 'Não concluídos e sem sprint. Selecione linhas para criar um sprint ou adicioná-las a um.'],
                        ['Sprints', 'Uma tabela expansível por sprint, do mais recente para o mais antigo, com datas, estado e completude. As Stories expandem-se nas Tasks participantes.']
                    ] },
                    { kind: 'list', items: [
                        'Cada tabela tem uma única toolbar: contagens, número de selecionados e Limpar seleção à esquerda; pesquisa e ícones de Filtros, Colunas e Exportar CSV à direita, seguidos de um separador e + Criar workitem. No Backlog, **Ações de sprint** fica após o separador, imediatamente antes de +, e agrupa Criar sprint e Adicionar ao sprint. Mantêm-se as validações de seleção e de sprints elegíveis. Pesquise por ID, título e descrição; ordene por qualquer coluna.',
                        'Use **Filtros** para os filtros comuns e para tipo de workitem, Epic e User Story. O ícone **Colunas** abre listas Visíveis e Ocultas lado a lado. Oculte com o olho, adicione com + e reordene as visíveis pelo manípulo de arrasto ou pelas setas para cima/baixo. ID e Título permanecem visíveis com cadeado; Repor colunas restaura as predefinições. As preferências ficam guardadas localmente por projeto e contexto de tabela.',
                        'O ícone **Exportar CSV** abre um modal: escolha vírgula ou ponto e vírgula e confirme para descarregar todas as linhas filtradas, mesmo as recolhidas.',
                        'As tabelas dos Sprints não têm checkboxes de seleção, menu Ações de sprint ou + Criar workitem; mantêm pesquisa, filtros, colunas, exportação e hierarquia.',
                        'As datas e horas são apresentadas em UTC.'
                    ] }
                ],
                related: ['plan-sprints', 'agile-backlog', 'views-filters']
            },
            {
                id: 'views-dashboard',
                title: 'Dashboard',
                summary: 'Estado, progresso e atividade do projeto num período à escolha.',
                blocks: [
                    { kind: 'p', text: 'A **Visão global** tem nove secções que pode mostrar ou ocultar: visão do projeto, sprint ativo, estatísticas do projeto, workitems iniciados, concluídos e em curso no período, riscos abertos, entregáveis e decisões.' },
                    { kind: 'list', items: [
                        'Escolha as datas de **início** e **fim**: a atividade conta transições dentro do período; as secções de estado usam a data de fim.',
                        'Restrinja a uma fase com **Âmbito do plano**.',
                        'Selecione um indicador ou uma barra de gráfico para listar os workitems de origem e abri-los.',
                        'A **Análise de sprints** mostra a participação registada e as alterações de âmbito de cada sprint.'
                    ] },
                    { kind: 'callout', tone: 'note', text: 'O Dashboard usa apenas o histórico registado. Quando falta histórico mostra N/A em vez de adivinhar. Os filtros do Quadro e da Tabela não o afetam.' }
                ],
                related: ['agile-review', 'views-control', 'files-history']
            },
            {
                id: 'views-control',
                title: 'Controlo do projeto',
                summary: 'Riscos, decisões e entregáveis, ligados a fases, marcos e workitems.',
                blocks: [
                    { kind: 'terms', items: [
                        ['Risco', 'Probabilidade × impacto dá o nível de risco (Baixo, Médio, Alto). Registe planos de mitigação e contingência; se se materializar, registe a data e o impacto real.'],
                        ['Decisão', 'Proposta, Aprovada, Rejeitada ou Substituída, com decisor, data e fundamentação.'],
                        ['Entregável', 'Planeado → Em curso → Entregue → Aceite, com datas prevista, de entrega e de aceitação e um validador.']
                    ] },
                    { kind: 'p', text: 'Os registos têm IDs como `CHK-RK-1`, participantes, etiquetas, comentários e histórico, e podem ser associados a fases, marcos e workitems. Filtre por Todos, Pendentes, Em atraso ou Pendente de aceitação.' },
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
                summary: 'Reduza cada vista ao que importa neste momento.',
                blocks: [
                    { kind: 'list', items: [
                        '**Pesquisa**: use o campo na barra do Board ou no cabeçalho da Tabela, ou abra a [paleta de comandos](prod-palette) pela lupa na barra superior ou com [[Ctrl/⌘]] + [[K]] e escolha **Filtrar quadro por “…”**. A secção mostra a pesquisa atual; clique em × para a limpar.',
                        '**Filtros**: bloqueio, responsável, participante, prioridade, esforço e planeamento. Abra **Filtros e vista** na barra do Board ou **Filtros** no cabeçalho da Tabela. Os filtros ativos aparecem aí como chips removíveis.',
                        '**Ordenação**: por prioridade, esforço, pontuação ou nome, ascendente ou descendente.',
                        '**Repor**: prima [[R]] para repor filtros e ordenação.'
                    ] },
                    { kind: 'p', text: 'Os filtros combinam-se entre si e aplicam-se a todas as vistas. Ficam guardados no endereço, por isso pode guardar uma vista filtrada nos favoritos. A Tabela tem os seus próprios filtros de coluna.' }
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
                summary: 'Como os projetos são carregados e porque é que alguns abrem só para leitura.',
                blocks: [
                    { kind: 'list', items: [
                        '**Importar projetos** abre ficheiros através do seletor do navegador, com permissão para guardar.',
                        '**Arrastar ficheiros** para a janela carrega-os em **modo de leitura**, porque não é fornecida permissão de escrita.',
                        'Os ficheiros têm de ser ficheiros de projeto TeamOS válidos (`.board.json`); os inválidos são reportados e não são importados.',
                        'As versões antigas dos ficheiros são migradas na importação sem alterar IDs.'
                    ] },
                    { kind: 'p', text: 'Os projetos em modo de leitura mostram um aviso e uma marca no chip. Pode abrir detalhes, ler o histórico e seguir ligações, mas não alterar nada. Remova um projeto do portefólio com o × do chip; o ficheiro não é apagado.' }
                ],
                related: ['start-first-project', 'files-saving']
            },
            {
                id: 'files-saving',
                title: 'Gravação automática',
                summary: 'Cada alteração é escrita no ficheiro do projeto; o chip mostra o estado de gravação.',
                blocks: [
                    { kind: 'p', text: 'Não há botão Guardar para o projeto: cada alteração é guardada no ficheiro assim que a faz. O chip do projeto mostra **A guardar**, **Por guardar**, **Falha ao guardar**, **Conflito** ou **Atualização externa** quando relevante.' },
                    { kind: 'list', items: [
                        'Se uma gravação falhar, a alteração continua aplicada na aplicação; use **Tentar guardar novamente** no chip.',
                        'Ações como mover a partir da paleta mostram **Desfazer** durante alguns segundos.',
                        'Os editores e janelas (editor de workitem, Definições do projeto) só se aplicam quando os guarda.'
                    ] },
                    { kind: 'callout', tone: 'tip', text: 'Mantenha os ficheiros de projeto numa pasta sincronizada ou com cópia de segurança. O ficheiro é o seu projeto.' }
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
                        'Selecione um projeto e arraste o cursor do histórico para um evento passado. Todo o projeto é mostrado como estava, só de leitura.',
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
                        ['Tema', 'As Definições permitem escolher Clássico (o design original) ou Moderno (azul petróleo, superfícies suaves e tipografia Inter). As opções Claro/Escuro alternam o modo de forma independente em qualquer tema. Ambas as escolhas ficam guardadas neste navegador, incluindo entre separadores, sem alterar projetos ou rascunhos abertos.'],
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
                    { kind: 'p', text: 'Quando o sprint começa, o Board Técnico mostra a TK-4 e a TK-5. O Rui arrasta a TK-4 para Em curso; a TK-5 fica bloqueada por dependência. O Rui reserva duas horas no Planeador. Quando a TK-4 fica concluída, a TK-5 é desbloqueada e a Marta começa-a.' },
                    { kind: 'h', text: '7. Aceitar' },
                    { kind: 'p', text: 'Com as duas Tasks concluídas, a US-2 mostra **Tarefas: 100%** — a execução está completa, mas a Story ainda não está aceite. A Ana testa os critérios na revisão do sprint e move a US-2 para Done no Board Funcional. A aplicação mostra os critérios; a Ana indica o seu nome e confirma. A aceitação fica registada no histórico da US-2.' },
                    { kind: 'h', text: '8. Rever' },
                    { kind: 'p', text: 'O Dashboard mostra o progresso da Versão 1 e o que foi concluído no sprint. Na retrospetiva, a equipa regista no Controlo do projeto a decisão “Acordar contratos de API antes do trabalho de interface”.' },
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
                        ['Porque não consigo editar um projeto?', 'Foi aberto arrastando o ficheiro (modo de leitura) ou está a pré-visualizar o histórico. Importe-o com Importar projetos, ou clique em Mais recente. Consulte [Abrir projetos e modo de leitura](files-open).'],
                        ['Porque não consigo concluir uma Story?', 'Precisa de Critérios de aceitação e todas as Tasks têm de estar concluídas, canceladas ou desassociadas. Consulte [aceitação funcional](wi-acceptance).'],
                        ['Todas as Tasks estão concluídas. Porque é que a Story não está?', 'Progresso de execução e aceitação funcional são coisas diferentes. Alguém tem de mover a Story para Concluído e aceitá-la.'],
                        ['Um cartão não passa para uma coluna.', 'O workflow não permite essa transição. Verifique os destinos permitidos do estado nas [Definições do projeto](wf-editing).'],
                        ['Porque é que uma Task não aparece no Board Técnico?', 'As Tasks de uma Story só aparecem enquanto o sprint da Story está ativo. Verifique as datas do sprint, ou abra a Tabela.'],
                        ['Como atribuo alguém que não está na lista?', 'Acrescente a pessoa como membro nas [Definições do projeto](projects-people).'],
                        ['Posso mover uma Task para outro projeto?', 'Sim, se os dois projetos partilharem um produto. Consulte [Copiar e mover](projects-transfers).'],
                        ['Onde estão os meus dados?', 'Nos ficheiros `.board.json` que criou ou importou. Preferências como o tema ficam no navegador.'],
                        ['Alterei algo por engano.', 'Use Desfazer de imediato, ou restaure um estado anterior a partir do [histórico](files-history).'],
                        ['O TeamOS calcula a velocidade?', 'Não. Regista tamanhos de esforço e participação em sprints, mas não story points, capacidade nem resultados de fecho.']
                    ] }
                ],
                related: ['start-what', 'agile-rules']
            }
        ]
    }
];
