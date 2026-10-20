/** Explicit local recovery download; never uploaded or stored in the shared project. */
export function downloadCommentRecovery(content: unknown): void {
    const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'workitem-comments-recovery.json';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
