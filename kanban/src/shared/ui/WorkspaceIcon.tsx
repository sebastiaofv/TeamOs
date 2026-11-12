import {
    Activity, Archive, ArrowDown, ArrowDownUp, ArrowLeft, ArrowRight, ArrowRightToLine, ArrowUp, ArrowUpRight,
    AtSign, Bookmark, BookOpen, Bug, CalendarDays, ChartNoAxesCombined, Check, ChevronDown,
    ChevronLeft, ChevronRight, CircleCheck, CircleGauge, Clock, Columns3, Copy, Download,
    Ellipsis, Eye, Flag, FlaskConical, Folder, Gauge, GanttChart, GripVertical, Info,
    Keyboard, LayoutDashboard, LockKeyhole, Pencil, Play, Plus, Search, Settings,
    ShieldCheck, SlidersHorizontal, SquareCheck, Table2, Terminal, Timer, Trash2, TriangleAlert,
    UserRound, Waypoints, X, Zap, type LucideProps
} from 'lucide-react';

const icons = {
    progress: CircleGauge, phases: Waypoints, check: Check, alert: TriangleAlert,
    chart: ChartNoAxesCombined, settings: SlidersHorizontal, info: Info, lock: LockKeyhole,
    eye: Eye, arrowLeft: ArrowLeft, arrowRight: ArrowRight, play: Play, finish: Flag, search: Search,
    keyboard: Keyboard, folder: Folder, board: Columns3, dashboard: LayoutDashboard,
    table: Table2, roadmap: GanttChart, control: ShieldCheck, planner: CalendarDays,
    export: Download, chevronDown: ChevronDown, chevronLeft: ChevronLeft, chevronRight: ChevronRight,
    columns: Columns3, testing: FlaskConical, runner: Timer, story: Bookmark, plus: Plus,
    sort: ArrowDownUp, arrowUp: ArrowUp, arrowDown: ArrowDown, close: X,
    grip: GripVertical, more: Ellipsis, epic: Zap, task: SquareCheck, bug: Bug,
    user: UserRound, book: BookOpen, gear: Settings, filters: SlidersHorizontal,
    copy: Copy, move: ArrowRightToLine, gauge: Gauge, completed: CircleCheck,
    priority: Flag, archive: Archive, clock: Clock, assign: AtSign, external: ArrowUpRight,
    command: Terminal, activity: Activity, edit: Pencil, delete: Trash2
};
export type WorkspaceIconName = keyof typeof icons;

/** One Lucide icon family for navigation, actions and workitems throughout the app. */
export function WorkspaceIcon({ name, className, size = 16, ...props }: LucideProps & { name: WorkspaceIconName }) {
    const Icon = icons[name];
    return <Icon size={size} strokeWidth={1.75} aria-hidden={props['aria-label'] ? undefined : true}
        {...props} className={`workspace-icon${className ? ` ${className}` : ''}`} />;
}
