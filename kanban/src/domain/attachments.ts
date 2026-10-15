import type { Attachment, AttachmentKind, LooseBoardData, TaskInput } from './types';
import { TEAMOS_EXTENSIONS_KEY, TASK_ATTACHMENTS_EXTENSIONS_KEY, ATTACHMENT_HARD_MAX_BYTES, ATTACHMENT_MAX_COUNT } from './constants';
import { isRecord, normalizeTimestamp, nowIso } from './util';
import { getTeamOsExtensionsObject, getBoardExtensionsObject } from './extensions';
import { findTaskInBoardData } from './boardData';

const isAttachment = (item: Attachment | null): item is Attachment => item !== null;

export function attachmentDuplicateKey(input: { name?: unknown; mime?: unknown; sizeBytes?: unknown } | null | undefined): string {
    if (!input || typeof input !== 'object') return '';
    const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim().toLowerCase() : '';
    const mime = typeof input.mime === 'string' ? input.mime.trim().toLowerCase() : '';
    const sizeBytes = Number.isFinite(Number(input.sizeBytes)) ? Math.max(0, Math.round(Number(input.sizeBytes))) : 0;
    if (!name) return '';
    return `${name}::${mime}::${sizeBytes}`;
}

export function attachmentTaskKey(taskId: unknown): string {
    return `task:${Number(taskId)}`;
}

export function classifyAttachmentKind(mime: unknown, fileName: unknown): AttachmentKind {
    const type = String(mime || '').toLowerCase();
    if (type.startsWith('image/')) return 'image';
    const name = String(fileName || '').toLowerCase();
    if (/\.(png|jpe?g|gif|webp|bmp|svg|ico|avif|heic)$/.test(name)) return 'image';
    return 'file';
}

export function createAttachmentId(): string {
    return `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function utf8ByteLength(value: string): number {
    let bytes = 0;
    for (const character of value) {
        const codePoint = character.codePointAt(0) || 0;
        if (codePoint <= 0x7f) bytes += 1;
        else if (codePoint <= 0x7ff) bytes += 2;
        else if (codePoint <= 0xffff) bytes += 3;
        else bytes += 4;
    }
    return bytes;
}

// Declared size can understate the payload, so check the larger of both.
export function exceedsAttachmentHardLimit(item: Pick<Attachment, 'sizeBytes' | 'dataUrl'>): boolean {
    return Math.max(item.sizeBytes, estimateAttachmentDataUrlSizeBytes(item.dataUrl)) > ATTACHMENT_HARD_MAX_BYTES;
}

export function estimateAttachmentDataUrlSizeBytes(dataUrl: unknown): number {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return 0;
    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex < 0) return 0;
    const header = dataUrl.slice(0, commaIndex);
    const payload = dataUrl.slice(commaIndex + 1);
    if (!payload) return 0;
    if (/;base64/i.test(header)) {
        const paddingMatch = payload.match(/=*$/);
        const padding = paddingMatch ? paddingMatch[0].length : 0;
        return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
    }
    try {
        return utf8ByteLength(decodeURIComponent(payload));
    } catch (_) {
        return payload.length;
    }
}

export function stripLegacyTaskAttachmentsFromExtensions(extensionsValue: unknown): Record<string, unknown> {
    const extensions = isRecord(extensionsValue) ? extensionsValue : {};
    const teamOs = extensions[TEAMOS_EXTENSIONS_KEY];
    if (!isRecord(teamOs)) return extensions;
    if (!Object.prototype.hasOwnProperty.call(teamOs, TASK_ATTACHMENTS_EXTENSIONS_KEY)) {
        return extensions;
    }

    const nextExtensions = { ...extensions };
    const nextTeamOs = { ...teamOs };
    delete nextTeamOs[TASK_ATTACHMENTS_EXTENSIONS_KEY];
    if (Object.keys(nextTeamOs).length === 0) {
        delete nextExtensions[TEAMOS_EXTENSIONS_KEY];
    } else {
        nextExtensions[TEAMOS_EXTENSIONS_KEY] = nextTeamOs;
    }
    return nextExtensions;
}

export function normalizeAttachmentRecord(raw: unknown): Attachment | null {
    if (!isRecord(raw)) return null;
    const dataUrl = typeof raw.dataUrl === 'string' && raw.dataUrl.startsWith('data:') ? raw.dataUrl : '';
    if (!dataUrl) return null;
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Attachment';
    const mime = typeof raw.mime === 'string' ? raw.mime.trim() : '';
    const sizeCandidate = Number(raw.sizeBytes);
    const sizeBytes = Number.isFinite(sizeCandidate) && sizeCandidate >= 0
        ? Math.round(sizeCandidate)
        : estimateAttachmentDataUrlSizeBytes(dataUrl);
    const kind = raw.kind === 'image' || raw.kind === 'file'
        ? raw.kind
        : classifyAttachmentKind(mime, name);
    return {
        id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : createAttachmentId(),
        name,
        mime,
        sizeBytes,
        kind,
        dataUrl,
        createdAt: normalizeTimestamp(raw.createdAt) || nowIso()
    };
}

export function normalizeAttachmentList(value: readonly unknown[]): Attachment[] {
    return value.map(normalizeAttachmentRecord).filter(isAttachment);
}

export function getTaskAttachmentsMap(boardData: LooseBoardData | null | undefined, options: { create?: boolean } = {}): Record<string, unknown> | null {
    const create = Boolean(options.create);
    const teamOs = getTeamOsExtensionsObject(boardData, { create });
    if (!teamOs) return null;
    const map = teamOs[TASK_ATTACHMENTS_EXTENSIONS_KEY];
    if (!map || typeof map !== 'object' || Array.isArray(map)) {
        if (!create) return null;
        const created = {};
        teamOs[TASK_ATTACHMENTS_EXTENSIONS_KEY] = created;
        return created;
    }
    return map;
}

export function getLegacyTaskAttachmentsFromExtensions(boardData: LooseBoardData | null | undefined, taskId: unknown): Attachment[] {
    if (taskId === null || taskId === undefined || taskId === '') return [];
    const map = getTaskAttachmentsMap(boardData);
    if (!map) return [];
    const rawList = map[attachmentTaskKey(taskId)];
    if (!Array.isArray(rawList)) return [];
    return normalizeAttachmentList(rawList);
}

export function normalizeTaskAttachments(value: unknown): Attachment[] {
    if (!Array.isArray(value)) return [];
    return normalizeAttachmentList(value).slice(0, ATTACHMENT_MAX_COUNT);
}

export function removeLegacyTaskAttachmentsFromExtensions(boardData: LooseBoardData | null | undefined, taskId: unknown): void {
    if (taskId === null || taskId === undefined || taskId === '') return;
    const key = attachmentTaskKey(taskId);
    const map = getTaskAttachmentsMap(boardData);
    if (!map || !Object.prototype.hasOwnProperty.call(map, key)) return;
    delete map[key];

    if (Object.keys(map).length > 0) return;

    const teamOs = getTeamOsExtensionsObject(boardData);
    if (teamOs && Object.prototype.hasOwnProperty.call(teamOs, TASK_ATTACHMENTS_EXTENSIONS_KEY)) {
        delete teamOs[TASK_ATTACHMENTS_EXTENSIONS_KEY];
    }
    const extensions = getBoardExtensionsObject(boardData);
    if (teamOs && Object.keys(teamOs).length === 0 && extensions && Object.prototype.hasOwnProperty.call(extensions, TEAMOS_EXTENSIONS_KEY)) {
        delete extensions[TEAMOS_EXTENSIONS_KEY];
    }
}

export function calculateBoardAttachmentBytes(boardData: LooseBoardData | null | undefined, options: { excludeTaskId?: unknown } = {}): number {
    const excludeTaskId = options.excludeTaskId;
    const excludeTaskNum = excludeTaskId === null || excludeTaskId === undefined || excludeTaskId === ''
        ? null
        : Number(excludeTaskId);
    let total = 0;

    const taskList = boardData?.board?.tasks;
    if (Array.isArray(taskList)) {
        taskList.forEach((task: TaskInput | null) => {
            if (!task) return;
            if (excludeTaskNum !== null && Number(task.id) === excludeTaskNum) return;
            const items = Array.isArray(task.attachments)
                ? normalizeTaskAttachments(task.attachments)
                : getLegacyTaskAttachmentsFromExtensions(boardData, task.id);
            items.forEach((att) => {
                total += Math.max(0, Number(att.sizeBytes) || 0);
            });
        });
        return total;
    }

    const map = getTaskAttachmentsMap(boardData);
    if (!map) return 0;
    Object.entries(map).forEach(([key, list]) => {
        if (excludeTaskNum !== null && key === attachmentTaskKey(excludeTaskNum)) return;
        if (!Array.isArray(list)) return;
        list.forEach((entry) => {
            const att = normalizeAttachmentRecord(entry);
            if (att) total += Math.max(0, Number(att.sizeBytes) || 0);
        });
    });
    return total;
}

export function getTaskAttachments(boardData: LooseBoardData | null | undefined, taskId: unknown): Attachment[] {
    if (taskId === null || taskId === undefined || taskId === '') return [];
    const task = findTaskInBoardData(boardData, taskId);
    if (task) {
        if (Array.isArray(task.attachments)) {
            return normalizeTaskAttachments(task.attachments);
        }
        return getLegacyTaskAttachmentsFromExtensions(boardData, taskId);
    }
    return getLegacyTaskAttachmentsFromExtensions(boardData, taskId);
}

export function setTaskAttachments(boardData: LooseBoardData | null | undefined, taskId: unknown, attachments: unknown): void {
    if (taskId === null || taskId === undefined || taskId === '') return;
    const normalized = normalizeAttachmentList(Array.isArray(attachments) ? attachments : [])
        .slice(0, ATTACHMENT_MAX_COUNT);
    const task = findTaskInBoardData(boardData, taskId);
    if (task) {
        task.attachments = normalized;
    }
    removeLegacyTaskAttachmentsFromExtensions(boardData, taskId);
}
