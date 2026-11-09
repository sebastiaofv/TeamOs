import type { BoardFile, BoardFileHandle } from '@/infrastructure/browser/types';

type Envelope = { schemaVersion: number; projectId: string; baselineEventId: string };
type Stamp = { size: number | undefined; lastModified: number | undefined; envelope: Envelope };
const verified = new WeakMap<BoardFileHandle, Stamp>();
const fields = new Set(['schemaVersion', 'projectId', 'baselineEventId', 'events', 'recordHistory', 'transactions']);

/** Scan only JSON structure and root scalars. Events/archives are never allocated
 * or parsed on open, and memory is bounded to a 64 KiB input chunk. */
async function scanEnvelope(file: BoardFile): Promise<Envelope> {
    let mode: 'start' | 'key' | 'colon' | 'value' | 'string' | 'scalar' | 'collection' | 'after' | 'done' = 'start';
    let key = '', token = '', role: 'key' | 'value' = 'key', escaped = false, inString = false;
    const stack: string[] = [];
    const seen = new Set<string>();
    const envelope: Record<string, unknown> = {};
    const invalid = (): never => { throw new Error('Unsupported or ambiguous history envelope.'); };
    const store = (value: unknown) => {
        if (key === 'schemaVersion' ? value !== 1 : typeof value !== 'string') invalid();
        envelope[key] = value;
        mode = 'after';
    };
    const feed = (text: string) => {
        // Most event bytes are inside collection strings. Native regexp scanning
        // skips their contents without building tokens or walking every character.
        const structural = /["\\{}[\]]/g;
        for (let index = 0; index < text.length;) {
            let char = text[index];
            if (mode === 'collection') {
                if (escaped) { escaped = false; index++; continue; }
                structural.lastIndex = index;
                const match = structural.exec(text);
                if (!match) break;
                char = match[0]; index = structural.lastIndex;
                if (inString) {
                    if (char === '\\') escaped = true;
                    else if (char === '"') inString = false;
                } else if (char === '"') inString = true;
                else if (char === '[' || char === '{') stack.push(char);
                else if (char === ']' || char === '}') {
                    if (stack.pop() !== (char === ']' ? '[' : '{')) invalid();
                    if (!stack.length) mode = 'after';
                }
                continue;
            }
            index++;
            if (mode === 'string') {
                token += char;
                if (token.length > 64 * 1024) invalid();
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === '"') {
                    const value: unknown = JSON.parse(token);
                    if (role === 'key') {
                        if (typeof value !== 'string' || !fields.has(value) || seen.has(value)) invalid();
                        key = value as string; seen.add(key); mode = 'colon';
                    } else store(value);
                }
                continue;
            }
            if (mode === 'scalar') {
                if (/\s/.test(char) || char === ',' || char === '}') { store(JSON.parse(token)); index--; }
                else { token += char; if (token.length > 32) invalid(); }
                continue;
            }
            if (/\s/.test(char)) continue;
            if (mode === 'start') { if (char !== '{') invalid(); mode = 'key'; }
            else if (mode === 'key') { if (char !== '"') invalid(); token = '"'; role = 'key'; mode = 'string'; }
            else if (mode === 'colon') { if (char !== ':') invalid(); mode = 'value'; }
            else if (mode === 'value') {
                if (['events', 'recordHistory', 'transactions'].includes(key)) {
                    if (char !== (key === 'recordHistory' ? '{' : '[')) invalid();
                    stack.push(char); inString = false; mode = 'collection';
                } else if (char === '"') { token = '"'; role = 'value'; mode = 'string'; }
                else { token = char; mode = 'scalar'; }
            } else if (mode === 'after') {
                if (char === ',') mode = 'key';
                else if (char === '}') mode = 'done';
                else invalid();
            } else invalid();
        }
    };
    if (file.slice && file.size !== undefined) {
        const decoder = new TextDecoder();
        for (let offset = 0; offset < file.size; offset += 64 * 1024) feed(decoder.decode(await file.slice(offset, offset + 64 * 1024).arrayBuffer(), { stream: true }));
        feed(decoder.decode());
    } else feed(await file.text());
    if (String(mode) !== 'done' || seen.size !== fields.size || key !== 'transactions') invalid();
    return envelope as Envelope;
}

export async function validateHistoryEnvelope(handle: BoardFileHandle, projectId: string, baselineEventId: string, allowCachedStructure = false, allowLegacyEmptyBaseline = false): Promise<boolean> {
    const file = await handle.getFile();
    const previous = verified.get(handle);
    // File metadata is an optimization, never evidence of project identity. Opens
    // always scan structure; saves additionally reread identity even on a cache hit.
    const prefix = allowCachedStructure && file.slice ? await file.slice(0, 16 * 1024).text() : '';
    const identity = /^\s*\{\s*"schemaVersion"\s*:\s*1\s*,\s*"projectId"\s*:\s*("(?:[^"\\]|\\.)*")\s*,\s*"baselineEventId"\s*:\s*("(?:[^"\\]|\\.)*")\s*,\s*"events"\s*:\s*\[/.exec(prefix);
    if (identity && (JSON.parse(identity[1]) !== projectId || JSON.parse(identity[2]) !== baselineEventId)) throw new Error('History identity does not match project.json.');
    const envelope = allowCachedStructure && identity && previous && file.size !== undefined && file.lastModified !== undefined && previous.size === file.size && previous.lastModified === file.lastModified ? previous.envelope : await scanEnvelope(file);
    if (envelope.projectId !== projectId) throw new Error('History belongs to a different project.');
    const legacyEmptyBaseline = allowLegacyEmptyBaseline && envelope.baselineEventId === '' && Boolean(baselineEventId);
    if (envelope.baselineEventId !== baselineEventId && !legacyEmptyBaseline) throw new Error('History baseline does not match project.json.');
    verified.set(handle, { size: file.size, lastModified: file.lastModified, envelope });
    return legacyEmptyBaseline;
}

/** Our journal append changes no root fields; retain the verified envelope. */
export async function rememberHistoryAppend(handle: BoardFileHandle): Promise<void> {
    const previous = verified.get(handle);
    if (!previous) return;
    const file = await handle.getFile();
    verified.set(handle, { ...previous, size: file.size, lastModified: file.lastModified });
}
