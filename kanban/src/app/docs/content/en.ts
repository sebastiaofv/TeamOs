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
                summary: 'Choose a project beside the logo, a view below the header, and use the controls within that view.',
                blocks: [
                    { kind: 'terms', items: [
                        ['Top bar', 'The project selector beside the logo, the magnifying glass for the [command palette](prod-palette), keyboard shortcuts, documentation, App settings, Import Projects and New Project. It stays available while reading documentation.'],
                        ['Documentation button', 'The book icon opens the documentation. It then shows an application icon: click it to return to your workspace, preserving the selected project, view and filters.'],
                        ['Navigation', 'Choose Board, Dashboard, Table, Roadmap, Project Control or Day Planner below the top bar. Calendar is a tab inside Day Planner.'],
                        ['Project selector', 'Open the name beside the logo to choose **All** or one project. Expand a product to see its projects. Project settings, removal and Retry save are available here; save state also appears beside the selected name.'],
                        ['View controls', 'Board search and Filters & View sit beside Active Sprints only. Workitem tables have their own search, Filters, Columns and Export CSV controls. Dashboard has period and planning controls; Roadmap has width and zoom controls; Planner has Day, Week and Calendar tabs.'],
                        ['Timeline bar', 'Enable it in App settings to consult a selected project’s [history](files-history).']
                    ] },
                    { kind: 'p', text: 'Board, Roadmap and Day Planner, including Calendar, support all loaded projects or one project. Dashboard, Table and Project Control appear when you select a single project.' },
                    { kind: 'callout', tone: 'tip', text: 'Press [[?]] to see keyboard shortcuts, and [[H]] to open or close this documentation. Single-letter shortcuts apply when you are not typing in a field.' }
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
                        'Click **Save**, select a parent folder and allow read/write access. TeamOS creates a named subfolder with `project.json`, `history.json` and `attachments/`, then selects the project. If the name exists, enter another name.'
                    ] },
                    { kind: 'h', text: 'Open existing projects' },
                    { kind: 'steps', items: [
                        'Click **Import Projects** (or press [[I]]) and choose a project folder or a parent with projects in direct subfolders. Existing projects stay open and duplicates are skipped. Legacy `.board.json` files in the selected folder are converted into project subfolders, preserving the originals.',
                        'Alternatively, drag legacy `.board.json` files onto the window for read-only consultation.',
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
                        '**Describe the goal.** Select the project, open **Table → All** and click **Create workitem**. Create an **Epic** that states the business objective.',
                        '**Express needs.** From the Epic\'s details, create **User Stories**. Give each one **Acceptance Criteria** so the team can validate the result later.',
                        '**Plan the work.** From each Story, create the **Tasks** needed to deliver it. Set priority and effort.',
                        '**Plan a sprint.** In **Table → Backlog**, select the Stories and use **Sprint Actions → Create Sprint**. Enter dates, a Sprint Goal and, optionally, capacity in Story Points.',
                        '**Execute.** Start the Sprint from Roadmap or Table → Sprints. With **Active Sprints only** selected, its work appears on the Board. Move Tasks through the allowed workflow states.',
                        '**Accept.** When the Tasks are done, move the Story to a completed state. The app asks for functional acceptance: confirm the result using the selected project identity, or provide a local author name if requested.'
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
                    { kind: 'p', text: 'New workitems start in the reserved **Backlog** state. Backlog is a workflow state; **Table → Backlog** is a planning list of units with unfinished work and no eligible Sprint allocation. Starting a Sprint moves its Backlog workitems to the first To do state of their workflow.' },
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
                        'Sort by priority or score, filter by participant, and use the [command palette](prod-palette) with `#tag` to find tagged workitems.',
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
                    { kind: 'callout', tone: 'rule', title: 'App rule', text: 'A User Story can only belong to an Epic. A Task can belong to an Epic, a User Story or a Bug, or be independent. Bugs receive an execution Task when created. Their workflow depends on the project’s workitem-type configuration. A workitem\'s type cannot change after creation.' }
                ],
                related: ['wi-types', 'wi-hierarchy', 'wi-acceptance']
            },
            {
                id: 'agile-sprints',
                title: 'Sprint planning',
                summary: 'Choose a sprint goal, select the Stories that serve it and commit to what fits.',
                blocks: [
                    { kind: 'steps', items: [
                        'Agree on the outcome and record it in **Sprint Goal**.',
                        'Select ready Stories, Bugs or independent Tasks on the Board or in **Table → Backlog**, then choose **Create Sprint** (under **Sprint Actions** in the Table).',
                        'Set start and end dates, or a duration in business days. Optionally enter **Sprint Capacity (SP)** and estimate eligible workitems with [Story Points](plan-sprints).',
                        'Review the selected work and any phase-date changes. Child Tasks of Stories and Bugs are planned through their parent.',
                        'Use **Start Sprint** in Roadmap or Table → Sprints when the team begins.'
                    ] },
                    { kind: 'callout', tone: 'rule', text: 'Sprint status is managed manually: new Sprints are Planned, Start Sprint makes them Active and Finish Sprint makes them Done. Passing an end date does not finish a Sprint. Only Planned or Active Sprints accept work.' },
                    { kind: 'callout', tone: 'method', title: 'Agile practice', text: 'Use planned Story Points and the capacity you enter as planning references. Effort sizes are separate estimates; the app does not convert them to points or enforce a capacity limit.' }
                ],
                related: ['plan-sprints', 'plan-inheritance', 'views-table']
            },
            {
                id: 'agile-execution',
                title: 'Executing on the Kanban board',
                summary: 'Make work visible, limit work in progress and remove blockers quickly.',
                blocks: [
                    { kind: 'p', text: 'During the sprint, the [Board](wf-board) is the team\'s shared picture of the work. By default, the **Technical Board** shows Tasks, and the **Functional Board** shows User Stories and Bugs. The project can assign workitem types to either workflow; Epics stay in the Table.' },
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
                    { kind: 'callout', tone: 'method', title: 'Agile practice', text: 'Close each sprint with a **review** (demonstrate and accept what was delivered) and a **retrospective** (agree on one or two improvements). Record the discussion in **Sprint Review** and **Sprint Retrospective** in the Sprint editor. Capture resulting decisions in [Project Control](views-control).' }
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
                        ['Acceptance', 'Accept against agreed criteria', 'Stories and Bugs need terminal child Tasks and a named functional acceptance; Acceptance Criteria are recommended, not required'],
                        ['Workflow', 'Agree on a clear definition of each state', 'Moves must follow the configured transitions'],
                        ['Sprint planning', 'Commit to what fits', 'Unfinished Tasks of Stories/Bugs follow their parent; only Planned/Active Sprints accept work'],
                        ['WIP', 'Limit work in progress', 'Not enforced'],
                        ['Estimation', 'Relative sizing, velocity', 'Optional Effort and Story Points; manual Sprint capacity; one-time completion credits and frozen velocity'],
                        ['Dependencies', 'Resolve blockers early', 'Informative: blocking is shown but does not prevent status changes'],
                        ['Review/retro', 'Hold them every sprint', 'Sprint Goal, Review and Retrospective fields in the Sprint editor']
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
                    { kind: 'p', text: 'A **project** is an independent collection of workitems with its own workflows and settings, stored in its own project folder (or a legacy `.board.json` file). A **product** is just a name shared by several projects: it has no workitems or workflows of its own and no further levels of grouping.' },
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
                    { kind: 'p', text: 'Open Project settings from the project selector beside the logo. The dialog has four tabs: **General**, **Technical workflow**, **Functional workflow** and **Automations**. The workflow tabs also let you assign each workitem type to a workflow. Changes in all tabs are kept as one draft and apply only when you click **Save**; Cancel, Escape or closing the dialog discards them.' },
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
                        'Renaming a member updates all current assignments, including workitems and Project Control records.',
                        'A member assigned to workitems or Project Control records cannot be removed: replace or remove those assignments first.',
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
                        'Tags in use (including existing workitems) cannot be removed until they are removed from those workitems and Project Control records.',
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
                summary: 'Four workitem types with specific fields; each type can be assigned to a workflow.',
                blocks: [
                    { kind: 'table', head: ['Type', 'ID', 'Specific fields', 'Workflow'], rows: [
                        ['Epic', '`EP`', 'Objective / Expected Outcome, Scope, Business Value', 'Functional by default'],
                        ['User Story', '`US`', 'Acceptance Criteria', 'Functional by default'],
                        ['Task', '`TK`', '—', 'Technical by default'],
                        ['Bug', '`BG`', 'Steps to Reproduce, Expected Result, Actual Result, Environment / Version', 'Functional by default']
                    ] },
                    { kind: 'p', text: 'IDs combine the project acronym, the type and a number shared by the project, for example `CHK-US-2`. Types never change after creation, and deleted numbers are not reused. Display IDs stay fixed within a project; a transfer allocates a destination project ID, while a move keeps the permanent identity.' },
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
                        'Epic → User Story or Bug → Task, plus Tasks directly under an Epic.',
                        'Independent Tasks have no parent. Bugs can contain Tasks and receive one automatically at creation.',
                        'The parent must be in the same project; cycles are rejected.',
                        'To delete a workitem, first reassign or detach its children. A move to another project can include descendants when all of them are in Backlog or To do; [review every mapping](projects-transfers).'
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
                summary: 'Title, description, people, tags, estimates, dates, checklist and planning, in the editor and details.',
                blocks: [
                    { kind: 'h', text: 'Ways to create a workitem' },
                    { kind: 'list', items: [
                        '**Create workitem** above the Board or in the Table (select a single project first).',
                        'From a parent\'s details, to create a child.',
                        'Use the editor for due dates in dd/mm/yyyy; Day Planner → Calendar consults Task deadlines only.',
                        'In the [command palette](prod-palette) with `+ Title @person !high #tag ~S due:fri`.'
                    ] },
                    { kind: 'terms', items: [
                        ['Title', 'Required, up to 80 characters.'],
                        ['Description', 'Free text for context.'],
                        ['Participants / Responsible', 'Project members; see [People](projects-people).'],
                        ['Tags', 'From the project catalogue.'],
                        ['Priority / Effort', 'High–Low and XS–XL; together they give the score.'],
                        ['Due date', 'Due dates remain available in workitem details and the Calendar.'],
                        ['Todo list', 'A reorderable checklist for small steps, available on Tasks only.'],
                        ['Blocked', 'A manual block that requires a reason.'],
                        ['Phase / Milestone / Sprint', 'Planning associations; see [Planning](plan-inheritance).']
                    ] },
                    { kind: 'p', text: 'Saving a new workitem opens its details. Editable sidebar properties save when changed; Story Points are available there for eligible planning units. The tabs organise Details, Relations, Attachments, Comments, Pull requests and History; Epics have no Pull requests tab. Press [[Ctrl/⌘]] + [[Enter]] to save from the editor. **Delete** is in the details ⋯ menu and removes the workitem permanently after confirmation.' }
                ],
                related: ['wi-types', 'wi-collab', 'agile-backlog']
            },
            {
                id: 'wi-acceptance',
                title: 'Acceptance criteria and functional acceptance',
                summary: 'Execution progress measures finished Tasks; functional acceptance confirms the expected result.',
                blocks: [
                    { kind: 'p', text: 'A User Story’s **Acceptance Criteria** describe how to check the expected result. Write them before execution, even though the app allows acceptance without them. **Execution progress** counts completed non-cancelled child Tasks; it is separate from functional acceptance and Sprint completion credits.' },
                    { kind: 'h', text: 'Accepting a Story or Bug' },
                    { kind: 'steps', items: [
                        'Complete, cancel or detach every pending child Task of the Story or Bug.',
                        'Move the Story or Bug to a state in the **Completed** category through an allowed transition.',
                        'Review the criteria or expected result shown by the app. Confirm using your selected project member identity; without a selected identity, provide a non-empty local author name.',
                        'Confirm acceptance. The app records the author and date as local, unverified attribution.'
                    ] },
                    { kind: 'callout', tone: 'rule', text: 'Leaving Completed clears acceptance. Changing an accepted Story’s criteria asks for acceptance again. Reopening a child can trigger [parent automation](wf-automation); it does not itself provide functional acceptance. Completing an Epic does not complete its children.' },
                    { kind: 'callout', tone: 'note', text: 'Author names are local attribution, not authenticated accounts.' },
                    { kind: 'callout', tone: 'method', title: 'Agile practice', text: 'Have the person representing the user validate the result during the Sprint review. All Tasks being Done establishes development completion, not acceptance.' }
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
                        'Up to 10 files per workitem, 10 MiB each. Folder projects store files separately in `attachments/` and load them for thumbnails, opening or downloading. Legacy files embed them.',
                        'The Attachments tab lists upload date, file name and uploader, with **Open** for common formats (images, PDF, text, audio, video) and **Download** for all.'
                    ] },
                    { kind: 'h', text: 'Pull requests' },
                    { kind: 'p', text: 'Add full HTTP/HTTPS links in the workitem’s **Pull requests** tab. Epics have no Pull requests tab. They are local links only: the app does not contact the server until you open one.' }
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
                        ['Functional workflow', 'For the progression of business needs. New projects assign Epics, User Stories and Bugs here.'],
                        ['Technical workflow', 'For execution work. New projects assign Tasks here.']
                    ] },
                    { kind: 'p', text: 'In **Project settings → Technical workflow / Functional workflow**, choose the workitem types that use each workflow. Each type belongs to exactly one workflow. The Board follows this assignment for non-Epic workitems; Epics are available in the Table.' },
                    { kind: 'p', text: 'When a type changes workflow, a workitem keeps its status if that status exists in the new workflow. Otherwise the app maps it to a state in the same category, falling back to the entry state, and asks you to review the impact.' },
                    { kind: 'callout', tone: 'note', text: 'Existing configured type assignments are retained. Projects saved before type selection adopt the default assignments on import: Bugs move to Functional, mapping their state to the same category if necessary. Consult Project settings to check each type.' },
                    { kind: 'callout', tone: 'method', title: 'Agile practice', text: 'Agree on the meaning of states with the team. Keep business validation and execution progress clear even when types use a customised workflow.' }
                ],
                related: ['wf-states', 'wf-editing', 'wf-board']
            },
            {
                id: 'wf-states',
                title: 'States, categories and transitions',
                summary: 'States are yours to define; six fixed categories give them a shared meaning.',
                blocks: [
                    { kind: 'p', text: 'Every state belongs to one of six **categories**. Categories drive progress, overdue indicators, dependencies and acceptance, whatever the state is called.' },
                    { kind: 'table', head: ['Category', 'Meaning', 'Default states'], rows: [
                        ['Backlog', 'Not yet ready for the board', 'Backlog (reserved)'],
                        ['To do', 'Ready to start', 'To Do (Board entry)'],
                        ['In progress', 'Being worked on', 'In progress, Re-analysis'],
                        ['Testing', 'Development ready for validation or being tested', 'Ready to test, Testing'],
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
                        'Choose the workitem types for the workflow. In **States & transitions**, add or edit each state’s name, colour and category, and use the arrows to reorder states.',
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
                    { kind: 'p', text: 'Choose **Technical** or **Functional** on the Board. New projects show Tasks on Technical, and User Stories and Bugs on Functional; [Project settings](wf-two) can change those type assignments. Epics stay in the Table.' },
                    { kind: 'p', text: '**Active Sprints only** is selected by default for both perspectives. Clear it to include unsprinted work and Planned or finished Sprints. Choosing a specific Sprint in Filters overrides this checkbox.' },
                    { kind: 'p', text: 'Columns follow the selected workflow, including Backlog and Testing. Cancelled states are hidden by default. Use **Filters & View → Board columns** to choose visible states; this preference is saved in the project and never moves or deletes workitems. With All projects selected, columns group work by category.' },
                    { kind: 'h', text: 'Moving and editing cards' },
                    { kind: 'list', items: [
                        'Drag a card with the mouse or a long press on a touch screen.',
                        'Select a card with [[J]] / [[K]] and use [[1]]–[[4]] for Backlog, To do, In progress or Completed, subject to workflow transitions.',
                        'Use the card’s top-right arrow for the next allowed state, or choose **Move to…** in the [command palette](prod-palette).',
                        'Change the responsible person from the card dropdown, or open details for editing, dates, blocking, progress and copy/move actions.',
                        'For a writable single project, select cards and use the selection actions to create a Sprint or add work to an existing one.'
                    ] },
                    { kind: 'p', text: 'Cards show the ID, title, type and responsible person. Columns share the available width; dense boards can scroll horizontally.' },
                    { kind: 'callout', tone: 'rule', text: 'The workflow must permit each move. Completing a Story or Bug asks for [functional acceptance](wi-acceptance). Child status changes may also trigger [automation review](wf-automation).' }
                ],
                related: ['agile-execution', 'wf-states', 'views-filters']
            },
            {
                id: 'wf-automation',
                title: 'Automation',
                summary: 'Configure eight project rules for parent progress, hierarchy changes and unfinished Tasks at Sprint closure.',
                blocks: [
                    { kind: 'h', text: 'Updates that always follow the data' },
                    { kind: 'list', items: [
                        'Execution progress is calculated from child Tasks.',
                        'Dependency blocking follows unfinished direct blockers, independently of manual blocking.',
                        'Children inherit phase and milestone unless explicitly overridden. Unfinished Tasks of Stories and Bugs follow their parent’s eligible Sprint allocation.',
                        'Saved changes are recorded in local history.'
                    ] },
                    { kind: 'h', text: 'Configurable workflow automations' },
                    { kind: 'p', text: 'Open **Project settings → Automations**. Each rule supports **Off** (disabled), **On 1** (ask for approval) or **On 2** (apply automatically when permitted). Rules default to On 1 and affect future events; saving settings does not retroactively change workitems.' },
                    { kind: 'table', head: ['Rule', 'When it applies'], rows: [
                        ['Parent to To do', 'A child enters To do while its parent is in Backlog.'],
                        ['Start parent work', 'A child starts execution while its parent is in Backlog or To do.'],
                        ['Prepare User Story testing', 'All relevant child Tasks are Testing or Completed; cancelled Tasks are excluded.'],
                        ['Complete Epic', 'All relevant children are Completed.'],
                        ['Cancel parent', 'All children are Cancelled.'],
                        ['Reopen / Reevaluate parent', 'A child reopens or moves to an earlier category.'],
                        ['Hierarchy changes', 'Children are added, removed or transferred; affected parents are reassessed.'],
                        ['Return unfinished Tasks to Backlog', 'A Sprint closes; Task status changes still require an allowed transition.']
                    ] },
                    { kind: 'p', text: '**Review workflow automations** lists affected workitems with their type, ID, title and current → proposed state. Choose **Apply change** or **Keep current** for approval proposals. Cascades follow the changes you apply. A forbidden transition produces an information message and leaves the affected state unchanged.' },
                    { kind: 'callout', tone: 'rule', text: 'Automations never provide functional acceptance for Stories or Bugs or bypass workflow transitions. Sprint status is managed separately with Start Sprint / Finish Sprint. [Sprint closure](plan-sprints) freezes results and removes unfinished allocations; the Sprint automation governs whether Task statuses also return to Backlog.' }
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
                    { kind: 'p', text: 'In **ALL**, Roadmap shows only projects marked **Active** in Project settings, ordered by their earliest phase start. Each project starts collapsed; its highlighted master bar covers every phase, including completed phases, and shows overall workitem progress. Expand a project to consult its phase hierarchy and associated workitems, or use **Expand all** and **Collapse all**. ALL hides milestones, Sprints and creation buttons; selecting one project restores the full Roadmap.' },
                    { kind: 'terms', items: [
                        ['Phase', 'A dated period that can contain subphases. Parent dates are calculated from descendants; assign workitems to leaf phases.'],
                        ['Milestone', 'A dated checkpoint, such as a release or review.'],
                        ['Sprint', 'An independent iteration created from a Board or Table selection; see [Sprints](plan-sprints).']
                    ] },
                    { kind: 'steps', items: [
                        'Select a project and open **Roadmap**.',
                        'Use **+ Phase** or **+ Milestone**, set dates and choose a colour. Create Sprints from selected workitems on the Board or Table; the Roadmap has no standalone + Sprint button.',
                        'Associate workitems in their editor or let children [inherit planning](plan-inheritance).',
                        'Use **Associated Workitems** for phase or Sprint tables; a parent phase includes descendants. The arrow expands the phase hierarchy. Click a milestone diamond to consult its workitems.'
                    ] },
                    { kind: 'p', text: 'Width and zoom controls sit on the left. Zoom ranges from **100% to 300%**, in 25-point steps: 100% fits the complete project period, while higher values expand the horizontal date scale with scrolling. Text, icons and bar heights keep their size.' },
                    { kind: 'p', text: 'Milestone diamonds fill with completion and show a check at 100%. Empty milestones show N/A. Hover or focus a diamond for its name, date and percentage. Click phase or Sprint names to edit them; hover a timeline bar for dates. Sprint rows offer Play to start and a chequered flag to finish.' },
                    { kind: 'p', text: 'Associated tables start with ID, Title, Type, Status, Responsible, Priority, Manually Blocked, Dependency Blocked and Updated. Their search, filters, configurable columns and CSV export follow the [Table](views-table).' },
                    { kind: 'callout', tone: 'rule', text: 'Cancelled work is excluded from progress. Deliverables awaiting acceptance can keep phase and milestone progress below 100%. Deleting an associated phase or milestone requires reallocation or explicitly clearing links; delete or move subphases before their parent.' }
                ],
                related: ['plan-sprints', 'plan-inheritance', 'views-control']
            },
            {
                id: 'plan-sprints',
                title: 'Sprints',
                summary: 'Plan with Story Points and capacity, start and finish manually, and retain frozen participation and results.',
                blocks: [
                    { kind: 'h', text: 'Create and allocate' },
                    { kind: 'steps', items: [
                        'Select ready Stories, Bugs or independent Tasks in a writable project’s Board or **Table → Backlog**. Use **Create Sprint**, or **Sprint Actions → Create Sprint** in the Table. **Add to sprint** assigns the selection to an existing eligible Sprint.',
                        'Enter a title, start and end dates, **Sprint Goal** and optional **Sprint Capacity (SP)**. The editor also supports duration in business days; changing the start or duration recalculates the end.',
                        'Review allocations and phase-date impacts. Each affected phase shows current/proposed dates and a choice to keep or extend them.'
                    ] },
                    { kind: 'p', text: 'Each Sprint has a permanent project number, shown as `Sprint 3 - Title`. Numbers are never reused. Only Planned or Active Sprints accept work; Epics are excluded. Unfinished child Tasks of Stories and Bugs are planned through their parent, rather than allocated independently.' },
                    { kind: 'h', text: 'Story Points and capacity' },
                    { kind: 'p', text: 'Set **Story Points (SP)** in workitem details for Stories, Bugs and Tasks outside a Story or Bug. The offered estimates are None, 1, 2, 3, 5, 8 and 13. Attaching a Task to a Story or Bug removes its own estimate. Effort (XS–XL) remains separate and is never converted to points. Capacity is a number you enter, not an automatically calculated limit.' },
                    { kind: 'p', text: 'Sprint headers show planned points against capacity and, after closure, completed points against planned points at closure. A completion credit is recorded once when development becomes complete in an Active Sprint: every child Task of a Story must be Done; a childless Story, independent Task or Bug must itself become Done. Functional acceptance is separate. Cancelled child Tasks do not count as Done for this credit. At closure, velocity sums the recorded credits; carrying work to another Sprint cannot count the same work twice.' },
                    { kind: 'h', text: 'Start and finish manually' },
                    { kind: 'steps', items: [
                        'New Sprints start **Planned**. Use **Start Sprint** on Roadmap or Table → Sprints to make one **Active**. If the planned start differs from today, choose whether to use today; the app then offers a recalculated end, the planned end or another date.',
                        'Starting moves allocated Backlog workitems and descendants to the first To do state of their workflow. Passing the planned end date does not finish the Sprint.',
                        'Use **Finish Sprint** to make it **Done**. Choose whether to use today as the end date, review any Task automation proposals and consult the list returning to Backlog.'
                    ] },
                    { kind: 'p', text: 'Closure freezes participation, workitem states, workflows, estimates, completed/carry-over work and results. Unfinished planning units lose their current allocation; unfinished Stories and Bugs return to the Backlog state. Task status resets depend on **Return unfinished Tasks to Backlog** in [Automations](wf-automation). Stories with implementation complete but awaiting acceptance keep their Sprint. Reopening work alone does not discard its allocation.' },
                    { kind: 'p', text: 'Table → Sprints preserves this recorded participation after live work moves or changes. The table’s closure values stay frozen. Opening an existing workitem can show its current editable details; those edits do not rewrite the closure snapshot. Edit the Sprint to record **Sprint Review** and **Sprint Retrospective**; these remain editable after closure.' },
                    { kind: 'callout', tone: 'rule', text: 'Only Planned Sprints can be deleted. One confirmation lists the affected workitems; deletion clears their allocation while keeping statuses. Older projects infer Sprint status from dates once during migration, then persist it.' }
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
                    { kind: 'p', text: 'Sprints work differently: unfinished Tasks of a Story or Bug follow the parent’s eligible current allocation when planning changes. Completed or cancelled Tasks retain their recorded participation. Reopening a Task alone preserves its allocation until closure or another planning change.' },
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
                        'Open **Day Planner** (or press [[P]]). The tray groups Tasks by project and has its own status choices; existing Board filters also affect the visible Tasks and blocks.',
                        'Drag a Task onto the day, between 07:00 and 21:00 in 15-minute slots.',
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
                        ['Roadmap', 'Plan phases, milestones and sprints over time; ALL groups active projects by phase', 'All active projects or one project'],
                        ['Project Control', 'Manage risks, decisions and deliverables', 'One project'],
                        ['Calendar', 'Consult Task deadlines by month or year inside Day Planner', 'All projects or one'],
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
                        ['Backlog', 'Planning units with pending work and no eligible Sprint allocation. Epics and child Tasks of Stories/Bugs are excluded; a Story with all Tasks Done or Cancelled is no longer pending, even before acceptance. Select rows to create or join a Sprint.'],
                        ['Sprints', 'One collapsible table per sprint, newest first, with name and dates on the left and compact Roadmap controls on the right, without a timeline. Stories expand into their participating Tasks.']
                    ] },
                    { kind: 'list', items: [
                        'Each table has one toolbar: workitem counts, selection count and Clear selection on the left; search, Filters, Columns and Export CSV icons on the right, followed by a divider and + Create workitem. In Backlog, **Sprint Actions** sits after the divider, immediately before +, and groups Create Sprint and Add to sprint. Existing selection and eligible-sprint checks still apply. Search by ID, title and description; sort by any column.',
                        'Use **Filters** for shared filters and workitem type, Epic and User Story. The **Columns** icon opens side-by-side Visible and Hidden lists. Hide with the eye, add with +, and reorder visible columns by dragging their handles or using the up/down arrows. ID and Title stay visible and locked; Reset to default restores the initial columns. Preferences are kept locally per project and table context.',
                        'The **Export CSV** icon opens a modal: choose comma or semicolon and confirm to download all filtered rows, even collapsed ones.',
                        'Sprint tables have no row-selection checkboxes, Sprint Actions menu or + Create workitem; their search, filters, columns, export and hierarchy remain available.',
                        'Workitem table timestamps use UTC; dates use dd/mm/yyyy. Sprint completeness counts unique planning units, excludes cancelled ones and includes legacy archived items. Filters affect rows and CSV, not the completeness denominator. Closed Sprint rows preserve frozen values; opening an existing workitem can show its current details without changing that snapshot.'
                    ] }
                ],
                related: ['plan-sprints', 'agile-backlog', 'views-filters']
            },
            {
                id: 'views-dashboard',
                title: 'Dashboard',
                summary: 'Consult project progress, activity over a UTC period, control records and recorded Sprint participation.',
                blocks: [
                    { kind: 'p', text: '**Overview** has nine sections you can show or hide: project overview, active Sprint, project statistics, workitems started, completed and currently in progress, open risks, deliverables and decisions.' },
                    { kind: 'list', items: [
                        'Choose **Start** and **End** dates. Activity uses recorded transitions in the selected UTC period; status sections use the end-date snapshot. The currently-in-progress section reflects status at that end date.',
                        'Use **Planning scope** for a phase and its descendants. Board and Table filters do not affect the Dashboard.',
                        'Project overview shows progress, blocked work, started phases with open work, overdue warnings and next/overdue milestones. Three circular charts show Stories, independent Tasks and Bugs by category.',
                        'Select an indicator or chart segment to list source workitems. Open workitem, Roadmap, Sprint or Project Control records for consultation.',
                        'Use **Sprint Analytics** to inspect recorded participation, category counts and scope changes. Select one Sprint for its distributions and scope changes.',
                        'The snapshot selector and recorded-history table let you consult earlier recorded states; return to **Current** / **Latest** to leave historical preview.'
                    ] },
                    { kind: 'callout', tone: 'note', text: 'History gaps show N/A or a partial-history notice. Sprint Analytics still shows placeholders for capacity, points, velocity, burndown, carry-over and goal/review reporting; consult Sprint headers and the Sprint editor for the points and closure data the app records.' }
                ],
                related: ['agile-review', 'views-control', 'files-history']
            },
            {
                id: 'views-control',
                title: 'Project Control',
                summary: 'Risks, decisions and deliverables, associated with phases and milestones.',
                blocks: [
                    { kind: 'terms', items: [
                        ['Risk', 'Probability × impact gives the risk level (Low, Medium, High). Record mitigation and contingency plans; if it materialises, record the date and actual impact.'],
                        ['Decision', 'Proposed, Approved, Rejected, Superseded or Cancelled, with decision maker, date and rationale.'],
                        ['Deliverable', 'Planned, In progress, Delivered, Accepted or Cancelled, with due, delivered and accepted dates and a validator.']
                    ] },
                    { kind: 'p', text: 'Records have IDs like `CHK-RK-1`, participants, tags, comments and history, and can be associated with phases and milestones. Older workitem links are retained as archived metadata, not active associations. Filter by All, Pending, Overdue or Pending acceptance.' },
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
                summary: 'Use independent Board and table queries; consult Dashboard, Roadmap and Planner with their own controls.',
                blocks: [
                    { kind: 'list', items: [
                        '**Search**: use the search field in the Board toolbar or Table heading, or open the [command palette](prod-palette) with the top-bar magnifying glass or [[Ctrl/⌘]] + [[K]] and choose **Filter board by “…”**. The section shows the current query; click × to clear it.',
                        '**Filters**: status, blocking (combined, manual or dependency), responsible person, participant, priority, effort and planning. Open **Filters & View** in the Board toolbar or **Filters** in the Table heading. The filter button shows the active count. Use **Clear all** or **Reset** in the panel header to clear the configured filters; no filter chips are shown.',
                        '**Sort**: by priority, effort, score or name, ascending or descending.',
                        '**Reset**: press [[R]] to reset filters and sort.'
                    ] },
                    { kind: 'p', text: 'Filters combine within each view. The Board includes Epic and User Story filters using the same criteria as the Table. Each Table subsection and each Sprint keep independent search and filters during the session; resetting one table leaves the others intact. Board filters remain in the address and also affect Planner/Calendar; those views do not expose the same query controls. Dashboard uses its own period and scope.' }
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
                summary: 'Open project folders for editing, convert legacy files, or drop legacy files for read-only consultation.',
                blocks: [
                    { kind: 'list', items: [
                        '**Import Projects** opens a project folder or a parent containing projects in direct subfolders, with read/write permission. Each folder requires `project.json`, `history.json` and `attachments/`.',
                        'Valid projects open even when a sibling is invalid; errors are reported individually. Existing projects stay loaded and duplicates are skipped.',
                        'Legacy `.board.json` files directly in the chosen folder are converted into subfolders, preserving IDs, history and images while leaving originals intact. Close an open original before importing its converted copy.',
                        'Dragging legacy `.board.json` files onto the window opens them **read-only**. Dropping only a folder project’s `project.json` is not a supported import path.',
                        'When folder picking is unavailable but file picking is supported, the app can create and open legacy `.board.json` files. Older supported formats migrate on import without replacing workitem IDs.'
                    ] },
                    { kind: 'p', text: 'Read-only projects are marked in the project selector. You can consult details, history, links and exports, but cannot edit. Remove a project through its entry in the selector beside the logo; this closes it in the app without deleting its files.' }
                ],
                related: ['start-first-project', 'files-saving']
            },
            {
                id: 'files-saving',
                title: 'Automatic saving',
                summary: 'Applied changes autosave to the project folder; the project selector shows saving, failure and conflict states.',
                blocks: [
                    { kind: 'p', text: 'Folder projects load current state from `project.json`. `history.json` is consulted on demand, including the timeline and workitem History/Comments tabs. Attachments are separate files under `attachments/`, loaded when needed for previews, opening or downloading.' },
                    { kind: 'p', text: 'There is no project Save button. Applied changes autosave; editors and Project settings apply their draft only when you click Save. New history events are appended without loading or rewriting older history; saves with no new history leave it unchanged.' },
                    { kind: 'p', text: 'The selected project’s save state appears beside its name in the header and inside the project selector: **Saving**, **Unsaved**, **Save failed**, **Conflict** or **External update**. Some dialogs also show a saving indicator.' },
                    { kind: 'list', items: [
                        'If saving fails, changes remain in the app. Open the project selector and use **Retry save**.',
                        'Conflicts pause autosave for the affected project until [resolved](files-external). Unsaved edits have a local recovery copy.',
                        'Palette mutations offer a brief **Undo** action. Historical and undo references retain attachment files that are still needed.'
                    ] },
                    { kind: 'callout', tone: 'tip', text: 'Back up or sync the complete project folder: current state, history and attachments belong together. Browser preferences are separate from project data.' }
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
                        ['Theme', 'Open App settings to choose Classic (the original design) or Modern (updated surfaces, controls and locally bundled Inter typography). The Light/Dark choices switch either theme independently. Both choices are remembered in this browser, including across tabs, without changing your projects or open drafts.'],
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
                    { kind: 'p', text: 'Use **Start Sprint** in Roadmap or Table → Sprints. The Technical Board then shows TK-4 and TK-5 with Active Sprints only selected. Rui drags TK-4 to In progress; TK-5 is marked blocked by dependency. Rui plans two hours in the Day Planner. When TK-4 is Done, TK-5 is unblocked and Marta starts it.' },
                    { kind: 'h', text: '7. Accept' },
                    { kind: 'p', text: 'With both Tasks done, US-2 shows **Tasks: 100%** — execution is complete, but the Story is not accepted yet. Ana tests the criteria in the sprint review and moves US-2 through the allowed states to Done on the Functional Board. The app shows the criteria; Ana confirms using her selected project identity. The acceptance is recorded in US-2\'s history.' },
                    { kind: 'h', text: '8. Review' },
                    { kind: 'p', text: 'The Dashboard shows the progress of Release 1 and what was completed in the sprint. The team finishes the Sprint, records the Sprint Review and Retrospective in its editor, and saves the decision “Agree API contracts before UI work” in Project Control.' },
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
                        ['Why can’t I edit a project?', 'Dropped legacy files and historical previews are read-only. Closed Sprint tables show frozen values; opening an existing workitem can show its current details. Use Import Projects for a writable project, or return to Latest. See [Opening projects](files-open).'],
                        ['Why can’t I complete a Story or Bug?', 'All child Tasks must be Completed, Cancelled or detached, the workflow must allow the move, and you must confirm [functional acceptance](wi-acceptance). Acceptance Criteria are recommended but are not a required field.'],
                        ['All Tasks are Done. Why isn’t the Story Done?', 'Development completion and acceptance are separate. Review the result and explicitly accept the Story. [Automations](wf-automation) can prepare it for testing but never accept it.'],
                        ['Why is my Sprint still Active after its end date?', 'Sprint status is manual. Use Finish Sprint on Roadmap or Table → Sprints; this records closure and handles unfinished work.'],
                        ['Why is a workitem missing from the Board?', 'Check Technical/Functional type assignments, Active Sprints only, explicit Sprint and other filters, and hidden columns. Clear Active Sprints only to include unsprinted work; Epics are consulted in the Table.'],
                        ['How do I assign someone absent from the list?', 'Add a member in [Project settings](projects-people) or the project identity selector.'],
                        ['Can I move a Task to another project?', 'Yes, between eligible projects in the same product, with reviewed destination states and mappings. See [Copying and moving](projects-transfers).'],
                        ['Where is my data?', 'Normally in a folder containing `project.json`, `history.json` and `attachments/`. Legacy `.board.json` files remain supported. Browser preferences stay in the browser.'],
                        ['I changed something by mistake.', 'Use Undo when offered, or preview and restore a state from the [timeline](files-history).'],
                        ['Does TeamOS calculate velocity?', 'It records optional Story Points, manual Sprint capacity, one-time development-completion credits and frozen velocity at closure. Sprint headers show recorded point totals; Dashboard Sprint Analytics still has placeholder metrics. See [Sprints](plan-sprints).']
                    ] }
                ],
                related: ['start-what', 'agile-rules']
            }
        ]
    }
];
