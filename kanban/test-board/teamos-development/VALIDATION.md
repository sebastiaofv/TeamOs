# Verificação da entrega #91

Base analisada: `main` em `1d7ad9122dcb4feb2f660d32dedea4e15f2629d0`. Dados com corte fixo em 12/11/2026 às 10:45 UTC.

- Lint e TypeScript passaram.
- **1 714 testes unitários passaram** em 77 ficheiros. Incluem abertura do exemplo pelo leitor de pastas de produção, hierarquia, comentários e imagens, referências de PR, resultados congelados de Sprint, milestones concluídos, replay final e observações históricas do Dashboard.
- **669 testes end-to-end de regressão passaram**, incluindo os testes web/standalone de projetos em pastas e todos os cenários que passaram a ler as fixtures em `tests/fixtures/manual`.
- O percurso do exemplo em Chromium importou a pasta, selecionou a identidade local, abriu Table e separadores do workitem, leu comentários e imagem PNG de 960 px, descarregou CSV, consultou Roadmap, os nove Sprints, Risks/Decisions/Deliverables e Day Planner, navegou à observação de junho pela Timeline e voltou ao presente. Renomeou uma Task, aguardou a gravação, fechou e reabriu a pasta: o título novo e a quantidade de comentários persistiram. Este percurso passou em cerca de 37 segundos.
- Um teste de browser separado carregou o histórico nativo completo e comparou o Project Overview entre **01–30/06/2026** e **01–31/10/2026**. Os indicadores diferiram e a secção de concluídos mostrou User Stories de outubro. O percurso passou em cerca de **4,4 minutos**, incluindo abertura e sucessivas alterações de datas.
- Builds web e standalone concluíram. Não houve alterações ao código da aplicação nem aos builds versionados: a alteração é o projeto de exemplo, o gerador, documentação e realocação das fixtures.
- A regeneração é determinística: `project.json`, `history.json`, `summary.json` e `SOURCES.md` ficam byte a byte iguais com o mesmo snapshot de fontes.

## Limitações observadas

O Dashboard atual percorre e normaliza o histórico em vários recálculos. Com este exemplo rico, a abertura e cada alteração de período podem demorar dezenas de segundos ou cerca de um minuto em Chromium. Esta limitação foi observada; não foi feita uma alteração de performance à aplicação no âmbito deste PR de dados. A Timeline e o save/reabertura foram testados separadamente.

Os metadados auxiliares `statusChangedAt` não são preservados nas projeções de snapshots pelo comportamento atual do domínio. A reconstrução e os indicadores usam os eventos canónicos de estado, que foram preservados e verificados. Não se inventou suporte de um campo histórico diferente.

As métricas de atividade do Dashboard usam User Stories e Tasks independentes segundo as regras atuais. Não coincidem necessariamente com a contagem de todos os workitems concluídos em `summary.json`, que inclui também as Tasks filhas.

O projeto único não consegue executar transferências entre dois projetos nem apresentar um Dashboard global de projetos que não estão carregados. Estes limites estão no roteiro, tal como as funcionalidades ainda planeadas.
