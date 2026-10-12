# Gestão de projetos

Linguagem usada para definir os dados dos projetos e reutilizá-los no acompanhamento das tarefas e do planeamento.

## Language

**Projeto**:
Espaço de trabalho que reúne dados base, tarefas e planeamento com uma identidade própria.
_Avoid_: Board, quando se pretende referir ao projeto como um todo.

**Projeto selecionado**:
Projeto que está atualmente em foco e ao qual se aplicam as ações e vistas que exigem um único projeto.

**Dados base do projeto**:
Informação descritiva partilhada do projeto, mantida numa fonte única e editável para reutilização nos seus vários ecrãs.
_Avoid_: Dados estáticos, quando possa sugerir que a informação é imutável.

**Ficha do projeto**:
Área de consulta e edição dos dados base de um projeto: nome, descrição e equipa.

**Equipa do projeto**:
Conjunto de pessoas alocadas a um projeto, identificadas pelo nome e sem duplicados. Pertencer à equipa não implica ter tarefas atribuídas.
_Avoid_: Utilizadores, quando se pretende referir às pessoas alocadas e não a contas de acesso.

**Responsável da tarefa**:
Pessoa identificada pelo nome a quem uma tarefa está atribuída. Pode pertencer à equipa do projeto ou ser uma pessoa externa a essa equipa.

**Histórico do projeto**:
Sequência de alterações do projeto, incluindo os seus dados base, tarefas e planeamento, que permite compreender a sua evolução.

**Alteração dos dados base do projeto**:
Mudança ao nome, à descrição ou à equipa de um projeto, descrita pelos valores anteriores e seguintes e pelo momento em que ocorreu.
