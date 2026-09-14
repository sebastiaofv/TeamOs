export function applyPortfolioViewVisibility({ viewMode = 'board', boardCount = 0, selectedBoardId = '' } = {}) {
    const boardWrap = document.getElementById('portfolioBoardWrap');
    if (!boardWrap) return;
    const boardGrid = document.getElementById('portfolioBoard');
    const roadmapView = document.getElementById('portfolioRoadmapView');
    const calendarView = document.getElementById('portfolioCalendarView');
    const roadmapActive = Boolean(selectedBoardId) && viewMode === 'roadmap';
    const calendarActive = boardCount > 0 && viewMode === 'calendar';

    boardWrap.classList.remove('hidden');
    boardGrid?.classList.toggle('hidden', roadmapActive || calendarActive);
    roadmapView?.classList.toggle('hidden', !roadmapActive);
    calendarView?.classList.toggle('hidden', !calendarActive);
}

