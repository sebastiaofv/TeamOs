type FileLike = { name: string; size: number; type: string };

export function readFileAsDataUrl(file: FileLike): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('File read failed.'));
        reader.readAsDataURL(file as unknown as Blob);
    });
}
