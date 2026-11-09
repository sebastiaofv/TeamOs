function csvCell(value: string, separator: ',' | ';'): string {
    // Spreadsheet parsers may ignore leading whitespace and control characters.
    let start = 0;
    while (start < value.length) {
        const code = value.charCodeAt(start);
        if (code > 32 && !(code >= 127 && code <= 159) && !/\s/u.test(value[start])) break;
        start += 1;
    }
    const safe = start < value.length && '=+-@'.includes(value[start]) ? `'${value}` : value;
    return safe.includes(separator) || /["\r\n]/u.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Quote delimiters, line breaks and spreadsheet formulas consistently across exports. */
export function buildCsv(rows: readonly (readonly string[])[], separator: ',' | ';' = ','): string {
    return rows.map(row => row.map(value => csvCell(value, separator)).join(separator)).join('\r\n');
}
