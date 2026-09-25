// Fuzzy matching for the command palette: how well a query matches a text,
// and which character ranges to highlight.

const isWordChar = (char: string | undefined) => Boolean(char && /[\p{L}\p{N}]/u.test(char));

// Letter positions of `query` found in order in `text` (earliest first), or
// null when some letter is missing.
function scatteredPositions(text: string, query: string): number[] | null {
    const positions: number[] = [];
    let from = 0;
    for (const char of query) {
        const index = text.indexOf(char, from);
        if (index < 0) return null;
        positions.push(index);
        from = index + 1;
    }
    return positions;
}

// 0 means no match. Higher is better: a prefix beats a word start, which
// beats a match inside a word, which beats letters scattered in order.
export function scoreText(text: string, query: string): number {
    const needle = query.trim().toLowerCase();
    if (!needle) return 1;
    const haystack = text.toLowerCase();
    const index = haystack.indexOf(needle);
    if (index === 0) return 100;
    if (index > 0) {
        const nearFront = Math.max(0, 10 - index) / 10;
        return (isWordChar(haystack[index - 1]) ? 60 : 80) + nearFront;
    }
    return scatteredPositions(haystack, needle) ? 20 : 0;
}

// [start, end) ranges of `text` to highlight for `query`.
export function matchRanges(text: string, query: string): [number, number][] {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const haystack = text.toLowerCase();
    const index = haystack.indexOf(needle);
    if (index >= 0) return [[index, index + needle.length]];
    const positions = scatteredPositions(haystack, needle);
    if (!positions) return [];
    const ranges: [number, number][] = [];
    positions.forEach((position) => {
        const last = ranges[ranges.length - 1];
        if (last && last[1] === position) last[1] = position + 1;
        else ranges.push([position, position + 1]);
    });
    return ranges;
}
