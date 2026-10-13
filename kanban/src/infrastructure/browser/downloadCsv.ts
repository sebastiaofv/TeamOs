export function downloadCsv(content: string, fileName: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Defer revocation until the browser has consumed the download URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
