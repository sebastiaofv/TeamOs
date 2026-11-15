// Native select backgrounds use the same Lucide artwork as React-rendered icons.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChevronDown } from 'lucide-react';
import { writeFile } from 'node:fs/promises';

for (const [theme, color] of [['light', '#666666'], ['dark', '#c3cad3']]) {
    const svg = renderToStaticMarkup(createElement(ChevronDown, { size: 24, color, strokeWidth: 1.75 }));
    await writeFile(new URL(`../src/assets/select-chevron-${theme}.svg`, import.meta.url), `${svg}\n`);
}
