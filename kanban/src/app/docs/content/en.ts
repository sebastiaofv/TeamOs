import type { DocSection } from '../docsModel';

// English documentation. Keep section and topic ids identical to pt.ts:
// tests check that both languages share the same outline and valid links.
export const DOCS_EN: DocSection[] = [
    {
        id: 'start',
        title: 'Introduction and first steps',
        topics: [
            {
                id: 'start-what',
                title: 'What TeamOS is',
                summary: 'TeamOS organises work into independent projects, plans it on a roadmap and in sprints, and executes it on Kanban boards — all from local project files.',
                blocks: [
                    { kind: 'p', text: 'TeamOS is a planning and execution workspace for teams that work in an Agile way. Each **project** has its own folder on your computer, containing `project.json`, `history.json` and `attachments/`. Legacy `.board.json` files remain supported. You can open several projects at once, group related projects under a **product**, and work across them from one screen.' },
                    { kind: 'p', text: 'Everything you track is a **workitem**: an Epic, a User Story, a Task or a Bug. Workitems move through configurable workflows, are planned against phases, milestones and sprints, and keep a complete local history of what changed.' },
                    { kind: 'h', text: 'What you can do' },
                    { kind: 'list', items: [
                        '**Plan** — break objectives into Epics, User Stories and Tasks; schedule them on the [Roadmap](plan-roadmap) and in [sprints](plan-sprints).',
                        '**Execute** — move work across the [Kanban board](wf-board), follow dependencies and blockers, and plan your own day in the [Day Planner](plan-day).',
                        '**Track** — consult the [Table](views-table), the [Dashboard](views-dashboard) and [Project Control](views-control) for progress, risks, decisions and deliverables.',
                        '**Validate** — confirm that User Stories and Bugs deliver the expected result through [functional acceptance](wi-acceptance).'
                    ] },
                    { kind: 'h', text: 'How the data is stored' },
                    { kind: 'p', text: 'There is no server and no account. Projects are files you own: the app reads and writes them through your browser (Chromium-based browsers such as Chrome or Edge). Changes [save automatically](files-saving) to the file, and every saved change is recorded in the project [timeline](files-history).' },
                    { kind: 'callout', tone: 'note', title: 'About these docs', text: 'This documentation describes the version of TeamOS you are using. Callouts marked **Agile practice** are methodological recommendations; callouts marked **App rule** describe behaviour the application enforces.' }
                ],
                related: ['start-layout', 'start-first-project', 'agile-principles']
            },
            {
                id: 'start-layout',
                title: 'Finding your way around',
                summary: 'The top bar holds global actions; navigation and project selection lead to each view, with controls inside its existing toolbar.',
                blocks: [
                    { kind: 'terms', items: [
                        ['Top bar', 'The project selector beside the logo, search (opens the [command palette](prod-palette)), keyboard shortcuts, documentation, app settings, Import Projects and New Project. It is always available, including while you read the documentation.'],
                        ['Documentation button', 'The book icon opens this documentation in place of the workspace. While reading, it shows an application icon: click it to return exactly where you were.'],
                        ['Navigation', 'The view buttons sit on the left below the top bar. Search, filters and sort appear on the right of the Board toolbar beside Active Sprints only, and on the left of the Table heading. Table columns and workitem creation align to the right. Dashboard, Roadmap and Planner do not show these query controls.'],
                        ['Project selector', 'Beside the logo, open the selected name to choose **All** or a project. Expand a product to see its projects. Project settings, removal and save retry remain in this menu; the selected project’s save state also appears beside its name.'],
                        ['View', 'The main area: Board, Dashboard, Table, Roadmap, Project Control, Calendar or Day Planner.'],
                        ['Timeline bar', 'Optional. Enable it in App settings to scrub through a project\'s [history](files-history).']
                    ] },
                    { kind: 'h', text: 'Views and project selection' },
                    { kind: 'p', text: 'Board, Calendar and Day Planner work across all loaded projects. Dashboard, Table, Roadmap and Project Control describe one project, so their buttons appear once you select a project beside the logo. See [Choosing a view](views-choose).' },
                    { kind: 'callout', tone: 'tip', text: 'Press [[?]] at any time to see every keyboard shortcut, and [[H]] to open or close this documentation.' }
                ],
                related: ['views-choose', 'prod-shortcuts']
            },
            {
                id: 'start-first-project',
                title: 'Create or open a project',
                summary: 'Create a project folder, open one or several projects from a parent folder, or import legacy files. Grant read/write access to save automatically.',
                blocks: [
                    { kind: 'h', text: 'Create a new project' },
                    { kind: 'steps', items: [
                        'Click **+ New Project** in the top bar (or press [[N]]).',
                        'Fill in the project settings: the **Project name** and a **Project Acronym** of 1 to 4 letters are required. The acronym prefixes new workitem IDs, for example `CHK-US-2`.',
                        'Optionally add a description, a product, members and tags. You can change all of this later.',
                        'Select a parent folder and allow read/write access. TeamOS creates a named subfolder with `project.json`, `history.json` and `attachments/`, then selects the project. If the name exists, enter another name.'
                    ] },
                    { kind: 'h', text: 'Open existing projects' },
                    { kind: 'steps', items: [
                        'Click **Import Projects** (or press [[I]]) and choose a project folder or a parent with projects in direct subfolders. Existing projects stay open and duplicates are skipped. Legacy `.board.json` files in the selected folder are converted into project subfolders, preserving the originals.',
                        'Alternatively, drag project files onto the window.',
                        'When the browser asks, allow edits to the file so the project can save.'
                    ] },
                    { kind: 'callout', tone: 'rule', text: 'Files dropped onto the window have no file handle and open **read-only**: you can browse and open workitems, but not change them. Use Import Projects to work on a file. See [Opening and read-only projects](files-open).' },
                    { kind: 'p', text: 'Next, add members and tags in [Project settings](projects-settings) so you can assign people and classify workitems.' }
                ],
                related: ['projects-settings', 'files-open', 'start-first-flow']
            },
            {
                id: 'start-first-flow',
                title: 'Your first workflow',
                summary: 'A short, practical path from an empty project to a validated User Story.',
                blocks: [
                    { kind: 'steps', items: [
                        '**Describe the goal.** Select the project, open the Board, switch to **Functional Board** and click **Create workitem**. Create an **Epic** that states the business objective.',
                        '**Express needs.** From the Epic\'s details, create **User Stories**. Give each one **Acceptance Criteria** — they are required to accept the Story later.',
                        '**Plan the work.** From each Story, create the **Tasks** needed to deliver it. Set priority and effort.',
                        '**Plan a sprint.** Open the [Roadmap](plan-roadmap) or the Table, select the Stories and create a sprint with start and end dates.',
                        '**Execute.** On the **Technical Board**, Tasks of Stories in the active sprint appear in their columns. Drag them as work progresses.',
                        '**Accept.** When the Tasks are done, move the Story to a completed state. The app asks for functional acceptance: confirm that the criteria are met and enter your name.'
                    ] },
                    { kind: 'callout', tone: 'tip', text: 'The [complete example](ex-walkthrough) follows this path in detail with a realistic project.' }
                ],
                related: ['ex-walkthrough', 'agile-decomposition', 'wi-acceptance']
            }
        ]
    },
    {
        id: 'agile',
        title: 'Agile methodology in TeamOS',
        topics: [
            {
                id: 'agile-principles',
                title: 'Iterative and incremental work',
                summary: 'Deliver value in small, validated increments and adapt the plan based on what you learn.',
                blocks: [
                    { kind: 'p', text: 'Agile teams do not try to define everything up front. They work in short **iterations** (sprints), each delivering an **increment** that can be validated. Feedback from each increment shapes the next one.' },
                    { kind: 'h', text: 'The cycle in TeamOS' },
                    { kind: 'table', head: ['Agile activity', 'Where it happens in TeamOS'], rows: [
                        ['Capture and refine the backlog', 'Workitems in the **Backlog** state; [Table](views-table) and the Functional Board'],
                        ['Prioritise', 'Priority, effort and score; sort and filters'],
                        ['Decompose', 'Epic → User Story → Task [hierarchy](wi-hierarchy)'],
                        ['Plan an iteration', '[Sprints](plan-sprints) on the Roadmap and Table'],
                        ['Execute', 'Technical and Functional [Boards](wf-board)'],
                        ['Inspect progress', '[Dashboard](views-dashboard), Table → Sprints, history'],
                        ['Validate results', '[Functional acceptance](wi-acceptance) of Stories and Bugs'],
                        ['Manage uncertainty', 'Risks, decisions and deliverables in [Project Control](views-control)']
                    ] },
                    { kind: 'callout', tone: 'method', title: 'Agile practice', text: 'Keep iterations short (one to four weeks) and of a consistent length, so that what the team completes per sprint becomes a reliable reference for planning.' }
                ],
                related: ['agile-backlog', 'agile-sprints', 'agile-rules']
            },
            {
                id: 'agile-backlog',
                title: 'Backlog and prioritisation',
                summary: 'The backlog is the ordered list of everything that could be done. Keep it visible, current and ordered by value.',
                blocks: [
                    { kind: 'p', text: 'In TeamOS, new workitems start in the reserved **Backlog** state. They stay there until they are ready to be worked on; then they are sent to the Board\'s entry state (by default **To Do**).' },
                    { kind: 'h', text: 'Prioritising' },
                    { kind: 'list', items: [
                        '**Priority** (high, medium, low) expresses importance or urgency.',
                        '**Effort** (XS, S, M, L, XL) is a relative size estimate.',
                        '**Score** combines both (priority ÷ effort): small, important items come first. Sort by Score to find quick wins.',
                        '**Due date** marks a hard commitment; overdue items are highlighted.'
                    ] },
                    { kind: 'h', text: 'Refining the backlog' },
                    { kind: 'steps', items: [
                        'Open the **Table** for the project and use **Backlog** to see what is not yet in a sprint.',
                        'Sort by priority or score, and filter by tag or participant.',
                        'Make sure the top Stories have clear Acceptance Criteria and Tasks sized small enough to finish within a sprint.'
                    ] },
                    { kind: 'callout', tone: 'method', title: 'Agile practice', text: 'Refine the backlog regularly (for example, once per sprint). Items near the top should be small and well understood; items further down can stay coarse.' },
                    { kind: 'callout', tone: 'rule', title: 'App rule', text: 'Priority, effort and score are informative. The app does not reorder or block work based on them.' }
                ],
                related: ['wi-fields', 'views-filters', 'agile-decomposition']
            },
            {
                id: 'agile-decomposition',
                title: 'Breaking work down',
                summary: 'Go from a broad objective to deliverable needs and then to concrete execution work.',
                blocks: [
                    { kind: 'table', head: ['Level', 'Represents', 'Good practice'], rows: [
                        ['Epic', 'A business objective or outcome', 'State the objective, scope and business value. Too large for one sprint.'],
                        ['User Story', 'A business need, accepted against criteria', 'Write from the user\'s point of view; small enough for one sprint; verifiable criteria.'],
                        ['Task', 'Execution work', 'Concrete, assignable, ideally completed in a day or two.'],
                        ['Bug', 'Incorrect behaviour to correct and validate', 'Steps to reproduce, expected and actual result.']
                    ] },
                    { kind: 'h', text: 'Writing a good User Story' },
                    { kind: 'p', text: 'A common format is: **As** a type of user, **I want** a capability, **so that** I obtain a benefit. Follow it with Acceptance Criteria that anyone can check, such as “Given…, when…, then…”.' },
                    { kind: 'callout', tone: 'method', title: 'Agile practice', text: 'Good Stories are Independent, Negotiable, Valuable, Estimable, Small and Testable (INVEST). If a Story cannot be finished in one sprint, split it by workflow step, business rule or data variation.' },
                    { kind: 'callout', tone: 'rule', title: 'App rule', text: 'A User Story can only belong to an Epic. A Task can belong to an Epic, a User Story or a Bug, or be independent. Bugs use the functional workflow and receive an execution Task when created. A workitem\'s type cannot change after creation.' }
                ],
                related: ['wi-types', 'wi-hierarchy', 'wi-acceptance']
            },
            {
                id: 'agile-sprints',
                title: 'Sprint planning',
                summary: 'Choose a sprint goal, select the Stories that serve it and commit to what fits.',
                blocks: [
                    { kind: 'steps', items: [
                        'Agree on a **sprint goal**: one sentence describing the outcome of the sprint. Record it in the sprint title or description.',
                        'Create the sprint with start and end dates, in the [Roadmap](plan-roadmap) or from a Table selection.',
                        'Add the highest-value ready Stories, independent Tasks and Bugs. Stop when the team\'s experience says the sprint is full.',
                        'Check that each Story has Tasks; Tasks of a Story follow the Story into the sprint automatically.'
                    ] },
                    { kind: 'callout', tone: 'rule', title: 'App rule', text: 'You plan a Story\'s Tasks through their Story: a Task belonging to a Story always follows the Story\'s current sprint. Only Planned or Active sprints accept new workitems; a sprint whose end date has passed is Done.' },
                    { kind: 'callout', tone: 'note', text: 'TeamOS does not record story points, capacity or a formal sprint closure. Sprint status (Planned, Active, Done) is derived from dates. Use effort and the team\'s history as your planning reference.' }
                ],
                related: ['plan-sprints', 'plan-inheritance', 'views-table']
            },
            {
                id: 'agile-execution',
                title: 'Executing on the Kanban board',
                summary: 'Make work visible, limit work in progress and remove blockers quickly.',
                blocks: [
                    { kind: 'p', text: 'During the sprint, the [Board](wf-board) is the team\'s shared picture of the work. The **Technical Board** shows Tasks. The **Functional Board** shows User Stories and Bugs.' },
                    { kind: 'list', items: [
                        '**Pull, do not push**: start a new item only when you finish one.',
                        '**Make blockers explicit**: mark an item as blocked with a reason, or link it as blocked by another workitem.',
                        '**Daily coordination**: walk the board from right to left — what is closest to done first.',
                        '**Plan your day**: drag Tasks into the [Day Planner](plan-day) to schedule focused time.'
                    ] },
                    { kind: 'callout', tone: 'method', title: 'Agile practice', text: 'Limit work in progress. Many items “in progress” at once usually means context switching and late delivery. Finishing beats starting.' },
                    { kind: 'callout', tone: 'rule', title: 'App rule', text: 'Moves follow the project\'s workflow: a card can only move to a state allowed by the transitions. TeamOS does not enforce WIP limits.' }
                ],
                related: ['wf-board', 'wi-dependencies', 'plan-day']
            },
            {
                id: 'agile-review',
                title: 'Tracking and validating results',
                summary: 'Finished Tasks are not the same as a delivered need. Inspect progress and validate the outcome explicitly.',
                blocks: [
                    { kind: 'p', text: 'TeamOS separates two questions that are often confused:' },
                    { kind: 'terms', items: [
                        ['Execution progress', 'How much of a Story\'s execution work (its Tasks) is complete. Shown as a percentage on the card and in details.'],
                        ['Functional acceptance', 'An explicit confirmation that the Story or Bug meets its expected functional result. Recorded with an author and a date.']
                    ] },
                    { kind: 'p', text: 'A Story can have every Task done and still not be accepted — for example, if testing shows the criteria are not met. See [Acceptance criteria and functional acceptance](wi-acceptance).' },
                    { kind: 'h', text: 'Inspecting progress' },
                    { kind: 'list', items: [
                        '**Table → Sprints** shows each sprint\'s members and completeness.',
                        '**Dashboard** shows project progress, the active sprint, workitems started and completed in a period, and open risks.',
                        '**Roadmap** shows progress per phase and milestone.'
                    ] },
                    { kind: 'callout', tone: 'method', title: 'Agile practice', text: 'Close each sprint with a **review** (demonstrate and accept what was delivered) and a **retrospective** (agree on one or two improvements). TeamOS does not store review or retrospective records; capture decisions in [Project Control](views-control) or as comments.' }
                ],
                related: ['wi-acceptance', 'views-dashboard', 'views-control']
            },
            {
                id: 'agile-rules',
                title: 'Recommendations vs. app rules',
                summary: 'What the methodology recommends, and what TeamOS actually enforces.',
                blocks: [
                    { kind: 'table', head: ['Topic', 'Agile recommendation', 'What TeamOS enforces'], rows: [
                        ['Hierarchy', 'Epics contain Stories; Stories contain Tasks', 'Stories and Bugs under Epics; Tasks under Epics, Stories or Bugs; no cycles'],
                        ['Acceptance', 'Accept against agreed criteria', 'A Story needs Acceptance Criteria and no pending Tasks to complete; Stories and Bugs require a named functional acceptance'],
                        ['Workflow', 'Agree on a clear definition of each state', 'Moves must follow the configured transitions'],
                        ['Sprint planning', 'Commit to what fits', 'Story Tasks follow their Story; only Planned/Active sprints accept work'],
                        ['WIP', 'Limit work in progress', 'Not enforced'],
                        ['Estimation', 'Relative sizing, velocity', 'Effort sizes only; no story points or velocity'],
                        ['Dependencies', 'Resolve blockers early', 'Informative: blocking is shown but does not prevent status changes'],
                        ['Review/retro', 'Hold them every sprint', 'Not recorded by the app']
                    ] },
                    { kind: 'callout', tone: 'note', text: 'When the app does not enforce a practice, it is still worth agreeing on it as a team and writing it in the project description.' }
                ],
                related: ['agile-principles', 'wf-states', 'wi-acceptance']
            }
        ]
    },
    {
        id: 'projects',
        title: 'Products, projects and configuration',
        topics: [
            {
                id: 'projects-products',
                title: 'Products and independent projects',
                summary: 'A project holds workitems and workflows. A product only groups related projects.',
                blocks: [
                    { kind: 'p', text: 'A **project** is an independent collection of workitems with its own workflows and settings, stored in its own file. A **product** is just a name shared by several projects: it has no workitems or workflows of its own and no further levels of grouping.' },
                    { kind: 'steps', items: [
                        'Open [Project settings](projects-settings) from the project selector beside the logo.',
                        'In **General**, enter the same **Product** name in each related project. Case and outer spaces are ignored.',
                        'Save. The projects are now grouped under an expandable product in the selector.'
                    ] },
                    { kind: 'p', text: 'Projects in the same product can exchange workitems through [copy and move](projects-transfers). Projects without a product stay independent.' },
                    { kind: 'callout', tone: 'method', title: 'Agile practice', text: 'Use one project per team or per independently delivered component, and a product to view them together. Avoid one huge project for everything.' }
                ],
                related: ['projects-settings', 'projects-transfers']
            },
            {
                id: 'projects-settings',
                title: 'Project settings',
                summary: 'Name, acronym, description, status, product, members, tags and the two workflows.',
                blocks: [
                    { kind: 'p', text: 'Open Project settings from the project selector beside the logo. The dialog has three tabs: **General**, **Technical workflow** and **Functional workflow**. Changes in all tabs are kept as one draft and apply only when you click **Save**; Cancel, Escape or closing the dialog discards them.' },
                    { kind: 'terms', items: [
                        ['Project name', 'Required. Renaming the project or the file does not change its identity.'],
                        ['Project Acronym', '1 to 4 letters, unique among the open projects. It prefixes the IDs of new workitems (EP, US, TK, BG). Existing IDs never change.'],
                        ['Description', 'Free text: a good place for the project\'s goal and team agreements.'],
                        ['Status', 'Planned, Active, Paused, Completed or Archived. Informative only: even Archived does not hide or lock the project.'],
                        ['Product', 'Optional grouping; see [Products](projects-products).'],
                        ['Members and tags', 'The curated lists used when assigning people and tags. See [People](projects-people) and [Tags](projects-tags).']
                    ] },
                    { kind: 'callout', tone: 'rule', title: 'App rule', text: 'Settings are read-only for read-only projects and while previewing history. Return to **Latest** and open a writable file to change them.' }
                ],
                related: ['wf-editing', 'projects-people', 'projects-tags']
            },
            {
                id: 'projects-people',
                title: 'Members, responsible and participants',
                summary: 'People are managed per project and assigned to workitems as participants, with one optional responsible person.',
                blocks: [
                    { kind: 'p', text: 'Add the people who work on the project as **members** in Project settings → General. Workitems, the palette and quick-create only accept members of the target project.' },
                    { kind: 'terms', items: [
                        ['Participants', 'Everyone involved in a workitem. A workitem can have several.'],
                        ['Responsible', 'The one participant accountable for the workitem. Optional; it is always one of the participants.']
                    ] },
                    { kind: 'list', items: [
                        'Member names must be unique, ignoring case and outer spaces.',
                        'Renaming a member updates all current assignments, including existing workitems.',
                        'A member who is still assigned cannot be removed: replace or remove those assignments first.',
                        'Removing the responsible participant from a workitem asks for confirmation, because it also clears responsibility.'
                    ] },
                    { kind: 'callout', tone: 'method', title: 'Agile practice', text: 'Give each Story a single responsible person who follows it to acceptance, even when several people participate in its Tasks.' }
                ],
                related: ['projects-settings', 'views-filters']
            },
            {
                id: 'projects-tags',
                title: 'Tags',
                summary: 'Tags classify workitems across the hierarchy; they are curated per project.',
                blocks: [
                    { kind: 'p', text: 'New projects start with the removable tags `bug`, `feature`, `improvement` and `documentation`. Add or remove tags in Project settings → General.' },
                    { kind: 'list', items: [
                        'A tag has 1 to 30 characters; a workitem can have up to 10 tags.',
                        'Tags in use (including existing workitems) cannot be removed until they are removed from those workitems.',
                        'Search `#tag` in the [command palette](prod-palette) to find tagged workitems, or add `#tag` when creating a task in one line.'
                    ] },
                    { kind: 'callout', tone: 'tip', text: 'Use tags for cross-cutting concerns (area, component, customer) rather than for status or priority, which have their own fields.' }
                ],
                related: ['projects-settings', 'views-filters']
            },
            {
                id: 'projects-transfers',
                title: 'Copying and moving between projects',
                summary: 'Send a workitem to another project of the same product, deciding explicitly how each association maps.',
                blocks: [
                    { kind: 'p', text: 'Open a workitem\'s ⋯ menu and choose **Copy to project…** or **Move to project…**. Only other loaded, writable projects in the same product are eligible.' },
                    { kind: 'terms', items: [
                        ['Move', 'Keeps the workitem\'s permanent identity, comments and history. The destination is saved first; the source is removed only afterwards. A move includes all descendants only when every descendant is in a Backlog or To-do category.'],
                        ['Copy', 'Creates a new workitem with a new identity and history; children stay in the source.']
                    ] },
                    { kind: 'steps', items: [
                        'Choose the destination project.',
                        'Choose the destination workflow state.',
                        'Map each person, tag, phase, milestone, sprint and parent to a destination value, or explicitly accept its removal. Scheduled Day Planner blocks and previous sprint records must be removed.',
                        'Confirm. The current and destination values are shown side by side for review.'
                    ] },
                    { kind: 'callout', tone: 'rule', title: 'App rule', text: 'A completed Story or Bug copied to a completed state needs a fresh functional acceptance. If a write is interrupted, a **Pending transfers** notice lets you resume without creating another workitem.' }
                ],
                related: ['projects-products', 'wi-hierarchy']
            }
        ]
    },
    {
        id: 'workitems',
        title: 'Workitems and organising work',
        topics: [
            {
                id: 'wi-types',
                title: 'Epic, User Story, Task and Bug',
                summary: 'Four workitem types, each with its own purpose and fields.',
                blocks: [
                    { kind: 'table', head: ['Type', 'ID', 'Specific fields', 'Workflow'], rows: [
                        ['Epic', '`EP`', 'Objective / Expected Outcome, Scope, Business Value', 'Functional'],
                        ['User Story', '`US`', 'Acceptance Criteria', 'Functional'],
                        ['Task', '`TK`', '—', 'Technical'],
                        ['Bug', '`BG`', 'Steps to Reproduce, Expected Result, Actual Result, Environment / Version', 'Functional']
                    ] },
                    { kind: 'p', text: 'IDs combine the project acronym, the type and a number shared by the project, for example `CHK-US-2`. IDs and types never change after creation, and deleted numbers are not reused.' },
                    { kind: 'callout', tone: 'rule', title: 'App rule', text: 'Epics cannot have Effort, a Sprint allocation or Pull Request links: they are planned through their Stories and Tasks.' },
                    { kind: 'callout', tone: 'tip', text: 'Use “workitem” when you mean any type. “Task” refers only to execution work.' }
                ],
                related: ['wi-hierarchy', 'agile-decomposition', 'wf-two']
            },
            {
                id: 'wi-hierarchy',
                title: 'Hierarchy and relationships',
                summary: 'A workitem has at most one hierarchical parent. Relationships link workitems without changing the hierarchy.',
                blocks: [
                    { kind: 'h', text: 'Hierarchy' },
                    { kind: 'list', items: [
                        'Epic → User Story → Task, plus Tasks directly under an Epic.',
                        'Independent Tasks have no parent. Bugs can contain Tasks and receive one automatically at creation.',
                        'The parent must be in the same project; cycles are rejected.',
                        'To delete or move a workitem with children, first move or detach the children.'
                    ] },
                    { kind: 'p', text: 'Create children from the parent\'s details: closing a new Task returns you to its Story, then its Epic, then where you started.' },
                    { kind: 'h', text: 'Relationships' },
                    { kind: 'terms', items: [
                        ['Related to', 'A symmetric, informative link.'],
                        ['Blocks / Blocked by', 'A dependency. Unfinished blockers mark the dependent workitem as blocked.']
                    ] },
                    { kind: 'p', text: 'Open a workitem\'s details → Relations to **Link workitem** (search by ID or title, including completed items) or **Create related** (a new Backlog item that inherits only phase and milestone).' },
                    { kind: 'callout', tone: 'rule', title: 'App rule', text: 'A pair of workitems has at most one relationship, self-links are not allowed and dependency cycles are rejected. Relationships survive moves between projects.' }
                ],
                related: ['wi-dependencies', 'plan-inheritance', 'projects-transfers']
            },
            {
                id: 'wi-fields',
                title: 'Creating and editing workitems',
                summary: 'Title, description, people, tags, priority, effort, dates, checklist and planning.',
                blocks: [
                    { kind: 'h', text: 'Ways to create a workitem' },
                    { kind: 'list', items: [
                        '**Create workitem** above the Board or in the Table (select a single project first).',
                        'From a parent\'s details, to create a child.',
                        'Set its due date in the editor using dd/mm/yyyy; consult deadlines in Day Planner → Calendar.',
                        'In the [command palette](prod-palette) with `+ Title @person !high #tag ~S due:fri`.'
                    ] },
                    { kind: 'terms', items: [
                        ['Title', 'Required, up to 80 characters.'],
                        ['Description', 'Free text for context.'],
                        ['Participants / Responsible', 'Project members; see [People](projects-people).'],
                        ['Tags', 'From the project catalogue.'],
                        ['Priority / Effort', 'High–Low and XS–XL; together they give the score.'],
                        ['Due date', 'Due dates remain available in workitem details and the Calendar.'],
                        ['Todo list', 'A reorderable checklist for small steps.'],
                        ['Blocked', 'A manual block that requires a reason.'],
                        ['Phase / Milestone / Sprint', 'Planning associations; see [Planning](plan-inheritance).']
                    ] },
                    { kind: 'p', text: 'Saving a new workitem opens its details. Press [[Ctrl/⌘]] + [[Enter]] to save from the editor. **Delete** is in the details ⋯ menu and removes the workitem permanently after confirmation.' }
                ],
                related: ['wi-types', 'wi-collab', 'agile-backlog']
            },
            {
                id: 'wi-acceptance',
                title: 'Acceptance criteria and functional acceptance',
                summary: 'Execution progress measures finished Tasks; functional acceptance confirms the expected result.',
                blocks: [
                    { kind: 'p', text: 'A User Story\'s **Acceptance Criteria** describe how to check that the need is met. Its **execution progress** is the share of its non-cancelled Tasks that are completed — shown as “Tasks: 60%” on the card.' },
                    { kind: 'h', text: 'Accepting a Story or Bug' },
                    { kind: 'steps', items: [
                        'Make sure every Task of the Story is completed, cancelled or detached, and that the Acceptance Criteria are filled in.',
                        'Move the Story (or Bug) to a state in the **Completed** category.',
                        'The app shows the criteria (or the Bug\'s expected result) and asks for your local author name.',
                        'Confirm. The acceptance is recorded with your name and the date as “local / unverified”.'
                    ] },
                    { kind: 'callout', tone: 'rule', title: 'App rule', text: 'Moving a Story or Bug out of the Completed category removes its acceptance. Reopening a Task of an accepted Story does not reopen the Story: the app warns you so you can review it. Completing an Epic does not complete its children.' },
                    { kind: 'callout', tone: 'note', text: 'Author names are typed locally and are not verified. They document who confirmed the result; they are not authentication.' },
                    { kind: 'callout', tone: 'method', title: 'Agile practice', text: 'Ideally the person who represents the user (for example, the Product Owner) accepts the Story, during the sprint review.' }
                ],
                related: ['agile-review', 'wf-states', 'ex-walkthrough']
            },
            {
                id: 'wi-dependencies',
                title: 'Dependencies and blocking',
                summary: 'Two independent sources of blocking: a manual block with a reason, and unfinished blockers.',
                blocks: [
                    { kind: 'terms', items: [
                        ['Manual block', 'Tick **Blocked** in the editor and describe what is blocking. Clear it when resolved.'],
                        ['Dependency block', 'Derived automatically from unfinished direct blockers (Blocks / Blocked by). It clears when the blockers are completed or the link is removed.']
                    ] },
                    { kind: 'p', text: 'Both appear in details and have independent columns and filters in workitem tables, including Roadmap tables. **Manually Blocked** stays active until manually cleared; **Dependency Blocked** clears when every blocker is Done, even while the relations remain. The **Blocked** filter and Dashboard count either source. Deleting a workitem lists its relationships and the blocking impact before you confirm.' },
                    { kind: 'callout', tone: 'rule', title: 'App rule', text: 'Dependencies are informative: they do not prevent status changes, and a dependency never overwrites a manual block.' }
                ],
                related: ['wi-hierarchy', 'agile-execution', 'views-filters']
            },
            {
                id: 'wi-collab',
                title: 'Comments, attachments and pull requests',
                summary: 'Conversation, files and code links live with the workitem.',
                blocks: [
                    { kind: 'h', text: 'Comments' },
                    { kind: 'list', items: [
                        'Plain text up to 10,000 characters plus up to 10 images (PNG, JPEG or WebP, 10 MiB each). Paste screenshots directly.',
                        'Choose your project member when opening the project; comments and attachment uploads use that identity. [[Ctrl/⌘]] + [[Enter]] publishes.',
                        'Published comments cannot be edited or deleted in the app. Unsent drafts are kept for the session.'
                    ] },
                    { kind: 'h', text: 'Attachments' },
                    { kind: 'list', items: [
                        'Up to 10 files per workitem, 10 MB each. Folder projects store files separately in `attachments/` and load them for thumbnails, opening or downloading. Legacy files embed them.',
                        'The Attachments tab lists upload date, file name and uploader, with **Open** for common formats (images, PDF, text, audio, video) and **Download** for all.'
                    ] },
                    { kind: 'h', text: 'Pull requests' },
                    { kind: 'p', text: 'Add full HTTP/HTTPS links to pull requests in the editor. They are local links only: the app does not contact the server until you open one.' }
                ],
                related: ['wi-fields', 'files-history']
            }
        ]
    },
    {
        id: 'workflows',
        title: 'Workflows and execution',
        topics: [
            {
                id: 'wf-two',
                title: 'Functional and technical workflows',
                summary: 'Each project has two workflows: one for business needs and one for execution work.',
                blocks: [
                    { kind: 'terms', items: [
                        ['Functional workflow', 'Applies to Epics and User Stories: how a need progresses from idea to acceptance.'],
                        ['Technical workflow', 'Applies to Tasks: how execution work progresses from to-do to done.']
                    ] },
                    { kind: 'p', text: 'Both are edited in Project settings and are independent: changing one does not affect the other. Older projects keep their existing process until a workflow is edited.' },
                    { kind: 'callout', tone: 'method', title: 'Agile practice', text: 'Keep the functional workflow close to how the customer sees progress (ready, in development, in validation, accepted), and the technical workflow close to how the team works (to do, in progress, review, testing, done).' }
                ],
                related: ['wf-states', 'wf-editing', 'wf-board']
            },
            {
                id: 'wf-states',
                title: 'States, categories and transitions',
                summary: 'States are yours to define; five fixed categories give them a shared meaning.',
                blocks: [
                    { kind: 'p', text: 'Every state belongs to one of five **categories**. Categories drive progress, overdue indicators, dependencies and acceptance, whatever the state is called.' },
                    { kind: 'table', head: ['Category', 'Meaning', 'Default states'], rows: [
                        ['Backlog', 'Not yet ready for the board', 'Backlog (reserved)'],
                        ['To do', 'Ready to start', 'To Do (Board entry)'],
                        ['In progress', 'Being worked on', 'In progress, Ready to test, Testing, Re-analysis'],
                        ['Completed', 'Finished', 'Done'],
                        ['Cancelled', 'Will not be done', 'Cancelled, Duplication']
                    ] },
                    { kind: 'p', text: '**Transitions** say which states a workitem may move to from each state. In new projects, Done and Cancelled are terminal (no outgoing transitions) until you add a reopening path.' },
                    { kind: 'callout', tone: 'rule', title: 'App rule', text: 'Backlog is reserved; the Board entry state must be a To do state other than Backlog; at least one Completed state is required; every state must be reachable from Backlog; state names must be unique.' }
                ],
                related: ['wf-editing', 'wi-acceptance', 'agile-rules']
            },
            {
                id: 'wf-editing',
                title: 'Editing a workflow',
                summary: 'Add, rename, colour, reorder and connect states; reallocate workitems from removed states.',
                blocks: [
                    { kind: 'steps', items: [
                        'Open Project settings and choose **Technical workflow** or **Functional workflow**.',
                        'In **States & transitions**, add or edit states: name, colour and category. Use the arrows to reorder them.',
                        'For each state, select its **Allowed destinations**. Return transitions are configured on the destination state.',
                        'In **Entry & references**, choose the Board entry state and the reference state for each category.',
                        'Save. If states were removed or categories changed, choose a destination for affected workitems and confirm the impact.'
                    ] },
                    { kind: 'callout', tone: 'tip', text: 'An “Unreachable from Backlog” warning means no path leads to that state: add an incoming transition before saving.' }
                ],
                related: ['wf-states', 'projects-settings']
            },
            {
                id: 'wf-board',
                title: 'Using the Kanban board',
                summary: 'Columns are workflow states; drag cards to move them through the workflow.',
                blocks: [
                    { kind: 'p', text: 'With a project selected, the Board offers two perspectives:' },
                    { kind: 'terms', items: [
                        ['Technical Board', 'Tasks. Active Sprints only is selected by default; clear it to include unsprinted Tasks and other Sprints.'],
                        ['Functional Board', 'User Stories and Bugs.']
                    ] },
                    { kind: 'p', text: 'Columns show the To do, In progress and Completed states. Backlog items are worked in the Table or details and **sent to the Board** when ready. Open **Filters & View → Board columns** to hide states you do not need; hiding a column never moves or deletes workitems. With **All projects** selected, the board groups cards by category across projects.' },
                    { kind: 'h', text: 'Moving cards' },
                    { kind: 'list', items: [
                        'Drag a card with the mouse, or press and hold on touch screens.',
                        'With the keyboard, select a card with [[J]] / [[K]] and press [[1]]–[[4]] to move it.',
                        'Open the [command palette](prod-palette) on a card and choose **Move to…**.'
                    ] },
                    { kind: 'p', text: 'Cards show the ID at the top left, a smaller title of up to two lines below, and the type and responsible person at the bottom. The top-right arrow advances to the next allowed workflow state; dragging remains available. Change the responsible person directly using the dropdown, or click the card to open details. Editing, deletion, copy, move, dates, blocking and progress remain available in details. Columns fill the available width and stay equal when space permits. With many states or a narrow window, empty columns shrink to half the width of occupied columns; horizontal scrolling remains available when needed.' },
                    { kind: 'callout', tone: 'rule', title: 'App rule', text: 'A move not allowed by the workflow is refused. Moving a Story or Bug to Completed asks for [functional acceptance](wi-acceptance).' }
                ],
                related: ['agile-execution', 'wf-states', 'views-filters']
            },
            {
                id: 'wf-automation',
                title: 'Automation',
                summary: 'What the app updates for you, and what it deliberately leaves to people.',
                blocks: [
                    { kind: 'h', text: 'Always automatic' },
                    { kind: 'list', items: [
                        'Story execution progress from its Tasks.',
                        'Dependency blocking from unfinished blockers.',
                        'Tasks of a Story follow the Story\'s sprint; children inherit phase and milestone unless set explicitly.',
                        'Sprint status changes only when you start or finish the Sprint.',
                        'History and timeline events for every saved change.'
                    ] },
                    { kind: 'h', text: 'Workflow automations' },
                    { kind: 'p', text: 'Open **Project Settings → Automations** to configure eight rules per project. **Off** disables a rule, **On 1** asks for approval and **On 2** applies permitted changes automatically. New rules default to On 1. Manual status changes require no extra confirmation unless they trigger an active automation or require functional acceptance.' },
                    { kind: 'p', text: '**Review workflow automations** explains the triggered rule and lists each affected workitem with its type badge, ID, title, field and current → proposed value. Choose **Apply change** or **Keep current** for proposals. A forbidden workflow transition produces an information message without decision selectors; the original edit is kept.' },
                    { kind: 'p', text: 'Finishing a Sprint asks separately whether to use today as its end date. **Return unfinished Tasks to Backlog** controls Task status changes at closure. A separate information message lists only workitems visible in the Backlog; child Tasks remain grouped under their parents. Implemented Stories awaiting testing keep their Sprint. Reopening a Story or Task preserves its allocation until closure or a later planning change. Closed Sprint participation and results remain frozen.' },
                    { kind: 'h', text: 'Never automatic' },
                    { kind: 'list', items: [
                        'Functional acceptance of Stories and Bugs.',
                        'Transitions forbidden by the configured workflow.',
                        'Changes through rules configured as Off.'
                    ] }
                ],
                related: ['wi-acceptance', 'plan-inheritance', 'files-history']
            }
        ]
    },
    {
        id: 'planning',
        title: 'Planning',
        topics: [
            {
                id: 'plan-roadmap',
                title: 'Roadmap, phases and milestones',
                summary: 'Lay out the project over time with phases, milestones and sprints.',
                blocks: [
                    { kind: 'terms', items: [
                        ['Phase', 'A period of the project with start and end dates. Phases can have subphases; a parent\'s dates are calculated from its subphases.'],
                        ['Milestone', 'A dated checkpoint, such as a release or a review.'],
                        ['Sprint', 'A time-boxed iteration; see [Sprints](plan-sprints).']
                    ] },
                    { kind: 'steps', items: [
                        'Select a project and open **Roadmap**.',
                        'Use **+ Phase**, **+ Milestone** and **+ Sprint** to create items, with dates and a colour.',
                        'Assign workitems to a leaf phase and a milestone in the workitem editor (or let children [inherit](plan-inheritance)).',
                        'Use Associated Workitems on any phase or Sprint to open its table. Parent phases include workitems from every descendant phase; the separate arrow expands only the phase hierarchy.'
                    ] },
                    { kind: 'p', text: 'The Roadmap keeps width and zoom controls on the left and + Milestone / + Phase on the right. Milestone diamonds are compact, have a fixed size, a clear outline in the chosen colour and distinct filled/unfilled areas in both colour modes. They fill progressively as workitems complete and align with their dashed timeline guides; names, dates and completion percentages appear in a two-line tooltip on hover or keyboard focus. They use one lane, adding a second only for overlaps; additional lanes scroll. Click a diamond for associated workitems. Phase, milestone and Sprint tables show ID, Title, Type, Status, Responsible, Priority, Manually Blocked, Dependency Blocked and Updated, in that order. Click a phase or Sprint name to edit it, and hover its timeline bar for dates. Sprint rows use a Play icon to start and a chequered flag to finish, retaining confirmations. Completed Sprints have no lifecycle button.' },
                    { kind: 'p', text: 'Progress counts completed eligible workitems (cancelled ones are excluded). Deliverables awaiting acceptance in Project Control keep phase and milestone progress below 100%.' },
                    { kind: 'callout', tone: 'rule', title: 'App rule', text: 'A phase with subphases cannot be deleted in cascade: move or delete the subphases first. Deleting a phase or milestone with assigned workitems asks you to reallocate or explicitly clear them.' }
                ],
                related: ['plan-sprints', 'plan-inheritance', 'views-control']
            },
            {
                id: 'plan-sprints',
                title: 'Sprints',
                summary: 'Create sprints, allocate work to them and consult who participated in each one.',
                blocks: [
                    { kind: 'h', text: 'Creating a sprint' },
                    { kind: 'list', items: [
                        'In the Roadmap with **+ Sprint**.',
                        'From a selection: select rows in **Table → Backlog**, then open **Sprint Actions** and choose **Create Sprint** or **Add to sprint**.'
                    ] },
                    { kind: 'p', text: 'Each sprint receives the next number in the project and is shown as `Sprint 3 - Title`. Numbers are never reused.' },
                    { kind: 'p', text: 'Deleting a Planned Sprint asks for one confirmation, with one list of affected workitems. Confirming automatically removes their Sprint associations while keeping their statuses; cancelling changes nothing. When allocating work requires phase-date changes, each phase has its current/proposed dates and date choice above its affected workitems.' },
                    { kind: 'h', text: 'Allocation and participation' },
                    { kind: 'terms', items: [
                        ['Current Sprint allocation', 'The single Planned or Active sprint in which a workitem is currently planned.'],
                        ['Sprint participation', 'A record that a workitem took part in a sprint, kept even after its allocation changes.']
                    ] },
                    { kind: 'p', text: 'This lets **Table → Sprints** show what each past sprint contained, even after unfinished work moved on. A Story\'s participation does not imply that all its Tasks participated in every one of its sprints.' },
                    { kind: 'callout', tone: 'rule', title: 'App rule', text: 'Sprint status is calendar-based: Planned before the start date, Active between the dates (inclusive), Done after the end date. Only Planned and Active sprints accept workitems. Epics are never allocated to sprints.' }
                ],
                related: ['agile-sprints', 'views-table', 'plan-roadmap']
            },
            {
                id: 'plan-inheritance',
                title: 'Planning inheritance',
                summary: 'Children use their parent\'s phase and milestone unless you choose otherwise.',
                blocks: [
                    { kind: 'p', text: 'A new child workitem **inherits** the effective phase and milestone of its hierarchical parent. In the editor, each of the two fields can be set to **Inherit from parent**, an explicit value, or none. Phase and milestone inheritance are independent.' },
                    { kind: 'p', text: 'When a parent\'s planning changes, inheriting children follow. Before saving, the app lists the workitems whose effective phase or milestone changes so you can review the impact.' },
                    { kind: 'p', text: 'Sprints work differently: a Task belonging to a Story always follows the Story\'s current sprint allocation.' },
                    { kind: 'callout', tone: 'tip', text: 'Plan at the highest sensible level — the Epic or the Story — and let children inherit. Override only the exceptions.' }
                ],
                related: ['plan-roadmap', 'plan-sprints', 'wi-hierarchy']
            },
            {
                id: 'plan-calendar',
                title: 'Calendar',
                summary: 'Consult Task deadlines and workload by year or month inside Day Planner → Calendar.',
                blocks: [
                    { kind: 'list', items: [
                        '**Year view** shows twelve mini-months; click a month to open it.',
                        '**Month view** lists only Task deadlines.',
                        '**Heat Map** colours days by the number of Task deadlines: darker means more.',
                        'Calendar is for consultation; schedule time blocks in Day and Week.'
                    ] },
                    { kind: 'callout', tone: 'tip', text: 'Use the Heat Map to spot overloaded weeks before they arrive, then rebalance due dates or sprint scope.' }
                ],
                related: ['plan-day', 'views-choose']
            },
            {
                id: 'plan-day',
                title: 'Day Planner',
                summary: 'Schedule Tasks from any project into time blocks for your day or week.',
                blocks: [
                    { kind: 'steps', items: [
                        'Open **Day Planner** (or press [[P]]). The tray lists the workitems you can plan, filtered like the other views.',
                        'Drag a workitem onto the day, between 07:00 and 21:00 in 15-minute slots.',
                        'Drag a block to move it or its edges to resize it. Select a block and press [[Delete]] to remove it.',
                        'Switch between **Day** and **Week** (Monday to Friday) and move through dates with the arrows or [[T]] for today.'
                    ] },
                    { kind: 'p', text: 'Planner blocks are saved in each project file and recorded in the timeline. They never change the workitem itself — status, dates and sprint stay as they are.' },
                    { kind: 'callout', tone: 'tip', text: 'In the command palette, `plan login 14:00` puts the matching Task in today\'s plan at 14:00 for one hour.' }
                ],
                related: ['agile-execution', 'prod-palette']
            }
        ]
    },
    {
        id: 'views',
        title: 'Views and tracking',
        topics: [
            {
                id: 'views-choose',
                title: 'Choosing a view',
                summary: 'Each view answers a different question.',
                blocks: [
                    { kind: 'table', head: ['View', 'Use it to…', 'Scope'], rows: [
                        ['Board', 'Execute and follow day-to-day work', 'All projects or one'],
                        ['Dashboard', 'Report status, progress and activity in a period', 'One project'],
                        ['Table', 'Refine, plan sprints, review hierarchy, export CSV', 'One project'],
                        ['Roadmap', 'Plan phases, milestones and sprints over time', 'One project'],
                        ['Project Control', 'Manage risks, decisions and deliverables', 'One project'],
                        ['Calendar', 'See due dates and periods by month or year', 'All projects or one'],
                        ['Day Planner', 'Schedule your own day or week', 'All projects or one']
                    ] },
                    { kind: 'p', text: 'The Board, each Table subsection and each expanded Sprint keep independent search and filters. Returning to a view restores its filters during the session.' }
                ],
                related: ['views-filters', 'start-layout']
            },
            {
                id: 'views-table',
                title: 'Table',
                summary: 'A configurable list of workitems with hierarchy, sprint perspectives and CSV export.',
                blocks: [
                    { kind: 'terms', items: [
                        ['All (default)', 'Collapsible Epic → Story → Task rows, direct Epic Tasks, and independent Tasks and Bugs. Matching descendants stay visible when filters hide their ancestors.'],
                        ['View dropdown', 'Switch between All, Epic, User Stories, Independent Workitems and All Tasks & Bugs. The button shows the selected view.'],
                        ['Backlog', 'Not completed and without a sprint. Select rows to create a sprint or add them to one.'],
                        ['Sprints', 'One collapsible table per sprint, newest first, with name and dates on the left and compact Roadmap controls on the right, without a timeline. Stories expand into their participating Tasks.']
                    ] },
                    { kind: 'list', items: [
                        'Each table has one toolbar: workitem counts, selection count and Clear selection on the left; search, Filters, Columns and Export CSV icons on the right, followed by a divider and + Create workitem. In Backlog, **Sprint Actions** sits after the divider, immediately before +, and groups Create Sprint and Add to sprint. Existing selection and eligible-sprint checks still apply. Search by ID, title and description; sort by any column.',
                        'Use **Filters** for shared filters and workitem type, Epic and User Story. The **Columns** icon opens side-by-side Visible and Hidden lists. Hide with the eye, add with +, and reorder visible columns by dragging their handles or using the up/down arrows. ID and Title stay visible and locked; Reset to default restores the initial columns. Preferences are kept locally per project and table context.',
                        'The **Export CSV** icon opens a modal: choose comma or semicolon and confirm to download all filtered rows, even collapsed ones.',
                        'Sprint tables have no row-selection checkboxes, Sprint Actions menu or + Create workitem; their search, filters, columns, export and hierarchy remain available.',
                        'Timestamps are shown in UTC.'
                    ] }
                ],
                related: ['plan-sprints', 'agile-backlog', 'views-filters']
            },
            {
                id: 'views-dashboard',
                title: 'Dashboard',
                summary: 'Project status, progress and activity for a chosen period.',
                blocks: [
                    { kind: 'p', text: '**Overview** has nine sections you can show or hide: project overview, active sprint, project statistics, workitems started, completed and in progress in the period, open risks, deliverables and decisions.' },
                    { kind: 'list', items: [
                        'Choose **Start** and **End** dates: activity counts transitions within the period; status sections use the end date.',
                        'Restrict to a phase with **Planning scope**.',
                        'Select an indicator or chart bar to list its source workitems, then open them.',
                        '**Sprint Analytics** shows recorded participation and scope changes per sprint.'
                    ] },
                    { kind: 'callout', tone: 'note', text: 'The Dashboard only uses recorded history. Where history is missing it shows N/A rather than guessing. Board and Table filters do not affect it.' }
                ],
                related: ['agile-review', 'views-control', 'files-history']
            },
            {
                id: 'views-control',
                title: 'Project Control',
                summary: 'Risks, decisions and deliverables, linked to phases, milestones and workitems.',
                blocks: [
                    { kind: 'terms', items: [
                        ['Risk', 'Probability × impact gives the risk level (Low, Medium, High). Record mitigation and contingency plans; if it materialises, record the date and actual impact.'],
                        ['Decision', 'Proposed, Approved, Rejected or Superseded, with decision maker, date and rationale.'],
                        ['Deliverable', 'Planned → In progress → Delivered → Accepted, with due, delivered and accepted dates and a validator.']
                    ] },
                    { kind: 'p', text: 'Records have IDs like `CHK-RK-1`, participants, tags, comments and history, and can be associated with phases, milestones and workitems. Filter by All, Pending, Overdue or Pending acceptance.' },
                    { kind: 'list', items: [
                        'Risks, Decisions and Deliverables keep separate subsections with the same table layout as **Table → All**. Counts and selection stay on the left; search, Filters, Columns, Export CSV, a divider and **+ New record** sit on the right.',
                        'Open the **Filters** icon for status, responsible person, phase/milestone associations and Pending, plus the fields for each type: assessments/risk level, decision maker/date, or validator/due date/Overdue/Pending acceptance. Active filters appear as removable tags.',
                        'Select rows or the current page, clear selection, sort by any visible column and use 25, 50 or 100 rows per page. Click a row, ID or title to open its existing detail dialog.',
                        'The **Columns** icon shows, hides, reorders or resets columns. ID and title are required. Visible and Hidden lists support eye/+ controls, drag handles and up/down arrows. Preferences are saved locally per project and subsection, independently of workitem-table columns. Status cells show only the item status.',
                        '**Export CSV** asks for comma or semicolon and exports all filtered/sorted records in the visible column order, including other pages. Read-only and historical views retain consultation and export; **+** is disabled.'
                    ] },
                    { kind: 'callout', tone: 'rule', title: 'App rule', text: 'Deliverables awaiting acceptance keep the progress of their phases and milestones below 100%.' },
                    { kind: 'callout', tone: 'method', title: 'Agile practice', text: 'Review open risks in sprint planning, and record important decisions — including retrospective agreements — as Decisions.' }
                ],
                related: ['views-dashboard', 'plan-roadmap', 'agile-review']
            },
            {
                id: 'views-filters',
                title: 'Search, filters and sort',
                summary: 'Narrow every view to what matters right now.',
                blocks: [
                    { kind: 'list', items: [
                        '**Search**: use the search field in the Board toolbar or Table heading, or open the [command palette](prod-palette) with the top-bar magnifying glass or [[Ctrl/⌘]] + [[K]] and choose **Filter board by “…”**. The section shows the current query; click × to clear it.',
                        '**Filters**: blocked, responsible person, participant, priority, effort and planning. Open **Filters & View** in the Board toolbar or **Filters** in the Table heading. The filter button shows the active count. Use **Clear all** or **Reset** in the panel header to clear the configured filters; no filter chips are shown.',
                        '**Sort**: by priority, effort, score or name, ascending or descending.',
                        '**Reset**: press [[R]] to reset filters and sort.'
                    ] },
                    { kind: 'p', text: 'Filters combine within each view. The Board includes Epic and User Story filters using the same criteria as the Table. Each Table subsection and each Sprint keep independent search and filters during the session; resetting one table leaves the others intact. Board filters remain in the address.' }
                ],
                related: ['views-choose', 'prod-palette']
            }
        ]
    },
    {
        id: 'files',
        title: 'Files, saving and history',
        topics: [
            {
                id: 'files-open',
                title: 'Opening and read-only projects',
                summary: 'How projects are loaded, and why some open read-only.',
                blocks: [
                    { kind: 'list', items: [
                        '**Import Projects** opens the folder picker for a project folder or its direct project subfolders with read/write permission. Required files and current data are validated before import; invalid projects report errors while valid siblings continue.',
                        '**Import Projects** also converts legacy `.board.json` files found directly in the selected folder, preserving IDs, history and images and keeping originals intact. Close the original before opening its migrated copy.',
                        '**Dragging files** onto the window loads them **read-only**, because no file handle is provided.',
                        'Files must be valid TeamOS project files (`.board.json`); invalid files are reported and not imported.',
                        'Older file versions are migrated on import without changing IDs.'
                    ] },
                    { kind: 'p', text: 'Read-only projects show a notice and a marker on the chip. You can open details, read history and follow links, but not change anything. Remove a project from the portfolio with the × on its chip; the file is not deleted.' }
                ],
                related: ['start-first-project', 'files-saving']
            },
            {
                id: 'files-saving',
                title: 'Automatic saving',
                summary: 'Every change is written to the project file; the chip shows the save state.',
                blocks: [
                    { kind: 'p', text: 'Folder projects open only `project.json`. History is read from `history.json` when consulted; saves with new events preserve older history even before consultation. Other saves leave history unchanged. Attachments are separate files and historical/undo references keep them available.' },
                    { kind: 'p', text: 'There is no Save button for the project: each change is saved to its file as soon as you make it. The project chip shows **Saving**, **Unsaved**, **Save failed**, **Conflict** or **External update** when relevant.' },
                    { kind: 'list', items: [
                        'If a save fails, your change stays applied in the app; use **Retry save** on the chip.',
                        'Moving from the palette shows **Undo** for a few seconds.',
                        'Editors and dialogs (workitem editor, Project settings) apply only when you save them.'
                    ] },
                    { kind: 'callout', tone: 'tip', text: 'Keep project files in a synced or backed-up folder. Back up the complete project folder, including history and attachments.' }
                ],
                related: ['files-external', 'files-history']
            },
            {
                id: 'files-external',
                title: 'External changes and conflicts',
                summary: 'Open files are watched; changes made elsewhere are reloaded or reported.',
                blocks: [
                    { kind: 'p', text: 'TeamOS checks the file before every save and again afterwards, and watches for changes between saves. Independent changes are integrated automatically; a notice offers details.' },
                    { kind: 'p', text: 'If changes conflict, autosave pauses for that project while you can continue editing. Choose **Resolve** to compare the base, your value and the external value for each field. Choose individually, or use **Keep all mine** / **Keep all external**, then **Apply decisions and save**. Independent changes are preserved. If related changes would break project integrity, the affected entities are reviewed together.' },
                    { kind: 'p', text: 'Choose **Later** or press Escape to defer without writing. Unsaved changes have a local recovery copy: after reloading, reopen the same project file and choose **Recover changes**. Closing with unsaved changes triggers a browser warning. An older or equal file revision with different content always requires review.' },
                    { kind: 'callout', tone: 'rule', title: 'Shared files', text: 'Tabs in the same browser coordinate saves. Network or synced folders still have a small race between checking and writing; verification detects competing changes, but TeamOS cannot lock files on another computer or control sync-client conflicts.' }
                ],
                related: ['files-saving', 'files-history']
            },
            {
                id: 'files-history',
                title: 'History, timeline and restore',
                summary: 'Every saved change is recorded. Consult a workitem\'s history or preview and restore a past project state.',
                blocks: [
                    { kind: 'h', text: 'Workitem history' },
                    { kind: 'p', text: 'The **History** tab in workitem details lists creation, field, status, people, planning, relationship and archive changes, with before and after values. Filter by category.' },
                    { kind: 'h', text: 'Project timeline' },
                    { kind: 'steps', items: [
                        'Enable **Show timeline bar** in App settings (gear in the top bar).',
                        'Select a project, click **Load history / timeline** if shown, and drag the timeline slider to a past event. The whole project is shown as it was, read-only.',
                        'Click **Restore this state** to make it current again, or **Latest** to return without restoring.'
                    ] },
                    { kind: 'callout', tone: 'rule', title: 'App rule', text: 'Restoring is itself recorded in the timeline, so the state before it remains available. Identities, workitem numbers and sprint numbers are never reused. Published comments are kept.' },
                    { kind: 'callout', tone: 'note', text: 'History is a local record in an editable file: useful and detailed, but not tamper-proof auditing.' }
                ],
                related: ['files-saving', 'views-dashboard', 'wi-collab']
            }
        ]
    },
    {
        id: 'productivity',
        title: 'Productivity and quick reference',
        topics: [
            {
                id: 'prod-palette',
                title: 'Command palette',
                summary: 'One box to find anything and act on it without leaving the keyboard.',
                blocks: [
                    { kind: 'paletteGuide' }
                ],
                related: ['prod-shortcuts', 'views-filters', 'plan-day']
            },
            {
                id: 'prod-shortcuts',
                title: 'Keyboard shortcuts',
                summary: 'The complete list of shortcuts, generated from the app itself.',
                blocks: [
                    { kind: 'p', text: 'Single-letter shortcuts work when you are not typing in a field. If they conflict with assistive technology, turn them off in the **Shortcuts** dialog ([[?]]).' },
                    { kind: 'shortcutReference' }
                ],
                related: ['prod-palette', 'prod-settings']
            },
            {
                id: 'prod-settings',
                title: 'Theme, language and app settings',
                summary: 'Personal preferences, remembered in this browser.',
                blocks: [
                    { kind: 'terms', items: [
                        ['Theme', 'Open App settings to choose Classic (the original design) or Modern (petroleum blue, soft surfaces and Inter typography). The Light/Dark choices switch either theme independently. Both choices are remembered in this browser, including across tabs, without changing your projects or open drafts.'],
                        ['Language', 'App settings offers English and Português, including this documentation.'],
                        ['App settings', 'The gear opens a floating panel with appearance, theme, language and timeline visibility.'],
                        ['Shortcuts', 'Enable or disable single-key shortcuts.']
                    ] },
                    { kind: 'p', text: 'These preferences are stored in this browser only; they are not written to project files.' }
                ],
                related: ['prod-shortcuts', 'files-history']
            }
        ]
    },
    {
        id: 'example',
        title: 'Complete example and FAQ',
        topics: [
            {
                id: 'ex-walkthrough',
                title: 'End-to-end example',
                summary: 'From a business need to an accepted User Story, step by step.',
                blocks: [
                    { kind: 'p', text: 'A team builds an online shop. The business wants customers to **pay by card**. The project acronym is `SHP`; Ana is the Product Owner, Rui and Marta are developers.' },
                    { kind: 'h', text: '1. Prepare the project' },
                    { kind: 'p', text: 'In Project settings, add the members Ana, Rui and Marta and the tags `payments` and `frontend`. Create the Roadmap phase **Release 1** and the milestone **Go-live**.' },
                    { kind: 'h', text: '2. Describe the objective' },
                    { kind: 'p', text: 'Create the Epic `SHP-EP-1` **Card payments**, with Objective “Customers complete purchases by card”, the phase Release 1 and the milestone Go-live.' },
                    { kind: 'h', text: '3. Express the needs' },
                    { kind: 'p', text: 'From the Epic, create the Stories `SHP-US-2` **Pay with a saved card** and `SHP-US-3` **Receive a payment receipt**. They inherit Release 1 and Go-live. For US-2, write criteria such as: “Given a saved card, when I confirm the order, then the payment is authorised and the order is marked paid.” Make Ana responsible.' },
                    { kind: 'h', text: '4. Plan the execution' },
                    { kind: 'p', text: 'From US-2, create Tasks `SHP-TK-4` Integrate payment gateway (Rui, effort M) and `SHP-TK-5` Card selection screen (Marta, effort S). Link TK-5 as **blocked by** TK-4 because the screen needs the API.' },
                    { kind: 'h', text: '5. Plan the sprint' },
                    { kind: 'p', text: 'In **Table → Backlog**, select US-2 and US-3 and choose **Sprint Actions → Create Sprint**: **Sprint 1 - Card checkout**, two weeks. The Tasks follow their Stories.' },
                    { kind: 'h', text: '6. Execute' },
                    { kind: 'p', text: 'When the sprint starts, the Technical Board shows TK-4 and TK-5. Rui drags TK-4 to In progress; TK-5 is marked blocked by dependency. Rui plans two hours in the Day Planner. When TK-4 is Done, TK-5 is unblocked and Marta starts it.' },
                    { kind: 'h', text: '7. Accept' },
                    { kind: 'p', text: 'With both Tasks done, US-2 shows **Tasks: 100%** — execution is complete, but the Story is not accepted yet. Ana tests the criteria in the sprint review and moves US-2 to Done on the Functional Board. The app shows the criteria; Ana enters her name and confirms. The acceptance is recorded in US-2\'s history.' },
                    { kind: 'h', text: '8. Review' },
                    { kind: 'p', text: 'The Dashboard shows the progress of Release 1 and what was completed in the sprint. In the retrospective, the team records the decision “Agree API contracts before UI work” in Project Control.' },
                    { kind: 'callout', tone: 'method', title: 'What this shows', text: 'Planning flows top-down (Epic → Story → Task, with inherited planning); execution flows bottom-up (Tasks finish, progress grows); and acceptance is an explicit human decision against the criteria.' }
                ],
                related: ['start-first-flow', 'wi-acceptance', 'agile-sprints']
            },
            {
                id: 'ex-faq',
                title: 'Frequently asked questions',
                summary: 'Short answers to common questions.',
                blocks: [
                    { kind: 'terms', items: [
                        ['Why can\'t I edit a project?', 'It was opened by dragging the file (read-only), or you are previewing history. Import it with Import Projects, or click Latest. See [Opening and read-only projects](files-open).'],
                        ['Why can\'t I complete a Story?', 'It needs Acceptance Criteria, and all its Tasks must be completed, cancelled or detached. See [functional acceptance](wi-acceptance).'],
                        ['All my Tasks are done. Why isn\'t the Story done?', 'Execution progress and functional acceptance are different. Someone must move the Story to Completed and accept it.'],
                        ['A card won\'t move to a column.', 'The workflow does not allow that transition. Check the state\'s allowed destinations in [Project settings](wf-editing).'],
                        ['Why doesn\'t a Task appear on the Technical Board?', 'Tasks of a Story appear only while the Story\'s sprint is active. Check the sprint dates, or open the Table.'],
                        ['How do I assign someone who is not in the list?', 'Add them as a member in [Project settings](projects-people) first.'],
                        ['Can I move a Task to another project?', 'Yes, if both projects share a product. See [Copying and moving](projects-transfers).'],
                        ['Where is my data?', 'In the `.board.json` files you created or imported. Preferences such as theme stay in the browser.'],
                        ['I changed something by mistake.', 'Use Undo right away, or restore a previous state from the [timeline](files-history).'],
                        ['Does TeamOS calculate velocity?', 'No. It records effort sizes and sprint participation, but not story points, capacity or closure results.']
                    ] }
                ],
                related: ['start-what', 'agile-rules']
            }
        ]
    }
];
