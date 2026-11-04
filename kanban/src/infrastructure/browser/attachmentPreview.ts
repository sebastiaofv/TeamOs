export function createAttachmentPreviewUrl(dataUrl: string, mime: string): string | null {
    const comma = dataUrl.indexOf(',');
    if (!/^data:/i.test(dataUrl) || comma < 0) return null;
    try {
        const header = dataUrl.slice(5, comma);
        const payload = dataUrl.slice(comma + 1);
        const bytes = /;base64(?:;|$)/i.test(header)
            ? decodeBase64Bytes(payload)
            : decodePercentEncodedBytes(payload);
        return URL.createObjectURL(new Blob([bytes], { type: mime }));
    } catch {
        return null;
    }
}

function decodeBase64Bytes(payload: string): Uint8Array<ArrayBuffer> {
    const decoded = atob(payload);
    // Allocate once; Uint8Array.from(string, callback) builds an intermediate
    // iterable and calls JavaScript for every byte of every attachment.
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
    return bytes;
}

function decodePercentEncodedBytes(payload: string): Uint8Array<ArrayBuffer> {
    const encoded = new TextEncoder().encode(payload);
    const bytes: number[] = [];
    for (let index = 0; index < encoded.length; index++) {
        if (encoded[index] !== 37) {
            bytes.push(encoded[index]);
            continue;
        }
        const hex = String.fromCharCode(encoded[++index], encoded[++index]);
        if (!/^[0-9a-f]{2}$/i.test(hex)) throw new URIError('Invalid data URL escape');
        bytes.push(parseInt(hex, 16));
    }
    return new Uint8Array(bytes);
}
