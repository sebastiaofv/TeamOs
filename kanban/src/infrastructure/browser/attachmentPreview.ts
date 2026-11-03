export function createAttachmentPreviewUrl(dataUrl: string, mime: string): string | null {
    const match = /^data:([^,]*),([\s\S]*)$/i.exec(dataUrl);
    if (!match) return null;
    try {
        const bytes = /;base64(?:;|$)/i.test(match[1])
            ? Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0))
            : decodePercentEncodedBytes(match[2]);
        return URL.createObjectURL(new Blob([bytes], { type: mime }));
    } catch {
        return null;
    }
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
