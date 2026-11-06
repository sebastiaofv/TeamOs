# US-25 / issue #66 — projetos em pastas

Usar o branch `codex/issue-66-project-folders`. Copiar esta pasta para um local de testes antes de abrir: as alterações são guardadas automaticamente. Abrir `dist-standalone/index.html` em Chrome ou Edge desktop, ou a aplicação servida por HTTP.

A pasta `projects/` contém dois projetos completos e uma subpasta ignorada:

```text
projects/
├── alpha/
│   ├── project.json
│   ├── history.json
│   └── attachments/   # imagens, PDFs, texto e outros formatos
├── beta/
│   ├── project.json
│   ├── history.json   # 10 001 eventos; Project Control
│   └── attachments/
└── notes/             # sem project.json; ignorada
```

1. **Criar:** Novo projeto → preencher nome e sigla → Guardar → selecionar uma pasta principal com escrita. Confirmar uma nova subpasta com os três elementos acima. Criar outro projeto com o mesmo nome e outra sigla: é pedido outro nome de pasta; os ficheiros anteriores ficam intactos.
2. **Abrir vários:** Abrir pasta → selecionar `projects/`. Alpha e Beta são acrescentados à sessão. Voltar a selecionar a pasta não duplica projetos. Abrir diretamente `projects/alpha/` também funciona.
3. **Abertura e edição leves:** Selecionar Beta sem consultar o histórico; editar um workitem. A abertura não lê `history.json` nem os binários. A edição com evento acrescenta-o ao histórico existente, mesmo sem este ter sido consultado. Alterações sem evento não regravam o histórico.
4. **Histórico:** Ativar a barra de timeline nas Definições da aplicação e selecionar **Carregar histórico / timeline**. Beta apresenta os 10 001 eventos iniciais, mais alterações realizadas. Percorrer eventos e voltar a Mais recente. Fechar e reabrir o projeto mantém os eventos. O separador Histórico de um workitem ou registo de Project Control também carrega os dados a pedido.
5. **Anexos e comentários:** Em Alpha, desativar o filtro de sprints ativos se necessário. Abrir o primeiro workitem → Anexos. Testar miniaturas, Abrir e Transferir. Em Comentários, confirmar a imagem publicada. Acrescentar um anexo, guardar e reabrir o projeto. Remover o anexo: o histórico e Desfazer continuam a ter acesso ao ficheiro físico. Os JSON contêm referências `teamos-attachment:…`, sem Base64.
6. **Migração:** Usar Migrar projetos, selecionar `migration/legacy.board.json` e uma pasta principal vazia. A aplicação cria a estrutura separada e mantém o original intacto. Comparar IDs, comentário com imagem, anexos e timeline. Fechar a versão original antes de abrir a cópia migrada, pois a identidade do projeto é preservada.
7. **Estruturas inválidas:** Abrir `invalid-projects/`: `missing-history` e `wrong-attachments-type` apresentam erros; o projeto `valid` continua a abrir. `corrupt-history` abre o estado atual e apresenta erro apenas ao consultar o histórico. `missing-binary` apresenta erros claros ao mostrar/abrir/descarregar os anexos em falta. Não reparar automaticamente nem sobrescrever os ficheiros inválidos.
8. **Isolamento e conflitos:** Abrir Alpha e Beta, editar um de cada vez e confirmar que cada grava na sua própria pasta. Abrir a mesma cópia em duas janelas e verificar alterações independentes e conflitos conforme o roteiro [US-28](../us-28.md). Revogar acesso ou tornar um ficheiro indisponível: a aplicação conserva as alterações pendentes e apresenta o erro de gravação.
9. **Compatibilidade:** Repetir abertura, criação, migração, edição, timeline e anexos em Chrome e Edge, incluindo o HTML standalone aberto localmente. Importar projetos e arrastar ficheiros continuam disponíveis para o formato antigo.

Os anexos usam nomes SHA-256 e ficam retidos para histórico e operações de desfazer; remover um anexo do estado atual não apaga os seus dados históricos. `.gitkeep` apenas permite versionar pastas vazias.

`node test-board/us-25/generate.mjs` gera as amostras com o serializador de produção. Para regenerar, remover primeiro apenas as pastas geradas `projects/alpha` e `projects/beta` desta cópia de testes; a criação recusa sobrescrever projetos existentes.
