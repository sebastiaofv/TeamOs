/** UI dates are day/month/year; persisted dates remain ISO for sorting and compatibility. */
export function formatDate(value: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}
export function parseDateInput(value: string): string | null {
    if (!value.trim()) return '';
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    if (!match) return null;
    const iso = `${match[3]}-${match[2]}-${match[1]}`;
    const date = new Date(`${iso}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}
export function formatTimestamp(value: string): string {
    if (!value || !Number.isFinite(Date.parse(value))) return '';
    const iso = new Date(value).toISOString();
    return `${formatDate(iso.slice(0, 10))} ${iso.slice(11, 19)}`;
}
