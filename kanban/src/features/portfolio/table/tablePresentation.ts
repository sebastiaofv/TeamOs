/** UTC matches the persisted ISO reference; only presentation drops milliseconds. */
export function formatTableTimestamp(value: string): string {
    if (!value || Number.isNaN(Date.parse(value))) return '';
    return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}
