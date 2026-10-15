export function safeWebUrl(value: string, httpsOnly = false): string | null {
    if ([...value].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) return null;
    try {
        const url = new URL(value);
        if (!(httpsOnly ? url.protocol === 'https:' : ['http:', 'https:'].includes(url.protocol)) || url.username || url.password || !url.hostname) return null;
        return url.href;
    } catch { return null; }
}
