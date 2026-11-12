# TeamOS — Desenvolvimento da Aplicação

Projeto único de demonstração do produto **TeamOS**, no formato atual de pastas: `project.json`, `history.json` e `attachments/`. Fonte: [issue #91](https://github.com/sebastiaofv/TeamOs/issues/91). A data de corte é **12/11/2026, 10:45 UTC**; as datas dos dados são fixas.

**Aviso: (fictício).** O Git contém commits desde fevereiro, embora o cenário pedido comece em junho. A cronologia de junho–agosto é uma reconstrução; Sprints, capacidade, Story Points, atribuições, bloqueios, aceitação local, Review/Retrospective e conversas inventadas são simulados. Os links de PR, os estados de integração e as datas reais das fontes foram preservados. As mensagens inventadas identificam-se no próprio texto. Excertos documentais reais têm conta original, data e URL; o membro local não autentica a conta GitHub.

## Abrir e explorar

1. Usar Chrome ou Edge desktop com a aplicação de `main`, ou o HTML standalone gerado neste branch.
2. **Copiar esta pasta** para um local de trabalho. Escolher **Import Projects** e selecionar a cópia, ou a pasta `test-board` que a contém. Não selecionar apenas `project.json` nem arrastá-lo como um board legado.
3. Escolher **Mário** ou **Sebastião** como identidade local do projeto.
4. O Board filtra Sprints ativos por defeito. Para consultar o universo completo, desativar **Active Sprints** ou usar **Table → All**. No Board Funcional aparecem Epics, User Stories e Bugs; no Técnico, Tasks de execução.
5. Começar por **Table → All**, pesquisar `US-27` ou `Reorganizar e otimizar`, abrir a User Story do formato v1 e consultar Details, History, Comments e Pull Requests. A hierarquia e os links abrem os itens correspondentes.

Consultar [VALIDATION.md](VALIDATION.md) para a verificação realizada, [summary.json](summary.json) para contagens e observações mensais reproduzíveis e [SOURCES.md](SOURCES.md) para a análise das fontes, issues, PRs e commits.

## Roteiro funcional

| Área | Exploração e resultado esperado |
|---|---|
| Board e Table | Alternar Técnico/Funcional; procurar tipos, participantes, prioridades e estados. Todas as User Stories têm pelo menos três Tasks concretas. Tasks sem User Story representam trabalho autónomo. |
| Workflow e aceitação | A Story do formato v1 passa por Testing → Re-analysis → In progress → Ready to test → Testing → Done no histórico. A aceitação por Mário é simulada e posterior à integração real. |
| Bugs | O bug de overflow referencia o issue #84 e PR #85 reais. Os Bugs de thumbnails e sobreposição são explicitamente fictícios, têm Tasks filhas e permanecem abertos. |
| Bloqueios e relações | O Bug de thumbnails tem motivo manual. A preparação do lançamento depende da nova medição de performance. Abrir Related para navegar entre pastas/formato v1. |
| Conversas | Abrir as Stories de Table, Roadmap, Sprints, pastas e formato v1: há interações simuladas e excertos dos comentários reais com links. As publicações têm autores e datas distribuídos. |
| Pull Requests | Abrir o separador nativo dos workitems: todos os links são PRs reais. A descrição indica datas de integração ou PR aberto; o TeamOS guarda URLs offline e não consulta o estado do GitHub. |
| Roadmap | Recuar até junho e avançar para novembro/dezembro. Expandir as cinco etapas e subfases, incluindo três níveis. Milestones de PRs integrados têm datas reais. A conclusão dos milestones deriva dos workitems e dos entregáveis aceites; não existe um campo inventado `completed`. |
| Sprints | Table → Sprints apresenta seis encerrados com roster/workflows/resultados congelados, um ativo em 09–13/11 e dois planeados. Comparar uma Story transitada com a fotografia do Sprint anterior; não deve perder a participação anterior. |
| Sprint Analytics | Selecionar um Sprint encerrado e consultar capacidade, planeado, concluído e velocidade. Os créditos são criados pelo mecanismo nativo, uma única vez; a conclusão das Tasks pode preceder a aceitação funcional. |
| Dashboard | Carregar o histórico quando pedido. Comparar 01–30/06, 01–31/07, 01–30/09, 01–31/10 e 01–12/11. Progresso, iniciados e concluídos variam com os eventos reais do exemplo. As contagens de atividade excluem filhos que não são unidades de planeamento, pelas regras nativas. |
| Timeline | Abrir Timeline e carregar history.json. Escolher uma observação de junho, setembro ou outubro; consultar Board/Roadmap/Detalhes no contexto temporal. Voltar ao estado atual antes de editar. |
| Project Control | Explorar Risks, Decisions e Deliverables: há riscos abertos/em mitigação/encerrados, decisões propostas/aprovadas/rejeitadas e entregáveis planeados/em execução/aceites. Cada registo tem histórico, comentário, responsável e ligações ao Roadmap. |
| Calendar e Day Planner | Ir a 19/10/2026 ou 11–12/11/2026 para encontrar blocos. O calendário consulta Tasks, prazos e carga; blocos não são compromissos históricos reais. |
| Anexos | Na Story de pastas (#66), abrir Attachments. TXT e CSV têm Open/Download; o PNG mostra um diagrama de execução e aceitação funcional. Comments contém também uma imagem. Os binários estão em attachments por SHA-256. |
| Pessoas e catálogos | Project Settings contém Mário e Sebastião e tags curadas. A preparação do lançamento muda de Sebastião para Mário em 12/11. Não é prova de atribuição histórica. |
| Automatizações | Project Settings → Automations demonstra regras Off/Confirm/Automatic. Numa cópia, concluir uma Task pendente permite observar o efeito na hierarquia e a revisão de propostas. |
| Temas, ajuda e atalhos | Alternar Clássico/Moderno e claro/escuro; abrir documentação, Shortcuts e a paleta Cmd/Ctrl+K. São preferências da aplicação e não campos artificiais do projeto. |
| Save e reabertura | Renomear uma Task numa cópia, aguardar a gravação, fechar o projeto e voltar a importar a mesma pasta. A alteração, comentários, PRs, binários e histórico devem permanecer. |

## Limites assumidos

- O exemplo tem apenas um projeto, conforme pedido. Transferências reais entre projetos e Dashboard global requerem outros projetos abertos; o exemplo documenta essas funcionalidades e não inventa projetos externos nem recibos de transferência.
- #34, #41, #42, #67, #73, #81, #89 e #90 continuam como trabalho planeado. O redesign #83 tem PR #87 aberto e fica em Testing. O novo separador Timeline pedido em #73 não é apresentado como já entregue; usa-se a Timeline atualmente disponível.
- #40 foi encerrado sem PR próprio; não se inventou um painel lateral entregue. A proposta aparece cancelada com Tasks e nota de âmbito.
- Os dados de risco, decisão e aceitação são reconstruídos. A evidência de merge não autentica automaticamente aceitação funcional nem aprovação por uma pessoa.
- O PNG é um diagrama documental, identificado como fictício, para explicar execução e aceitação e testar carregamento/preview. Não pretende ser uma captura histórica do produto.
- O Dashboard atual reconstrói o histórico completo em alguns recálculos. Com este exemplo, a abertura e cada mudança de período podem demorar dezenas de segundos ou cerca de um minuto; aguardar o recálculo antes de efetuar a seleção seguinte. Esta limitação da aplicação foi observada na verificação em browser.
- A data de corte é fixa: ao abrir depois de novembro, ajustar o período e o Sprint nos controlos. O estado manual dos Sprints continua persistido.

## Regenerar e verificar

Na pasta `kanban`, executar:

```bash
node scripts/example-project/generate.mjs
npm run lint
npm run typecheck
npm run test:unit
PLAYWRIGHT_PORT=4191 npx playwright test tests/e2e/example-project.test.ts
```

O gerador usa criação/normalização, eventos, comentários, Project Control, créditos e encerramento de Sprints do domínio, e a conversão nativa para v1. O snapshot público versionado em `scripts/example-project/evidence.json` permite reproduzir o projeto sem acesso ao GitHub. O gerador verifica o replay final e observações mensais; o teste de browser importa a pasta e verifica utilização e reabertura.
