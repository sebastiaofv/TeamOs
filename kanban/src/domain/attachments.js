import { TEAMOS_EXTENSIONS_KEY, TASK_ATTACHMENTS_EXTENSIONS_KEY, ATTACHMENT_MAX_COUNT } from './constants.js';
import { normalizeTimestamp, nowIso } from './util.js';
import { getTeamOsExtensionsObject, getBoardExtensionsObject } from './serialize.js';
import { findTaskInBoardData } from './task.js';

export function attachmentDuplicateKey(input) {
    if (!input || typeof input !== 'object') return '';
    const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim().toLowerCase() : '';
    const mime = typeof input.mime === 'string' ? input.mime.trim().toLowerCase() : '';
    const sizeBytes = Number.isFinite(Number(input.sizeBytes)) ? Math.max(0, Math.round(Number(input.sizeBytes))) : 0;
    if (!name) return '';
    return `${name}::${mime}::${sizeBytes}`;
}

export function attachmentTaskKey(taskId) {
    return `task:${Number(taskId)}`;
}

export function classifyAttachmentKind(mime, fileName) {
    const type = String(mime || '').toLowerCase();
    if (type.startsWith('image/')) return 'image';
    const name = String(fileName || '').toLowerCase();
    if (/\.(png|jpe?g|gif|webp|bmp|svg|ico|avif|heic)$/.test(name)) return 'image';
    return 'file';
}

export function createAttachmentId() {
    return `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function estimateAttachmentDataUrlSizeBytes(dataUrl) {
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
        return new Blob([decodeURIComponent(payload)]).size;
    } catch (_) {
        return payload.length;
    }
}

export function stripLegacyTaskAttachmentsFromExtensions(extensionsValue) {
    const extensions = (extensionsValue && typeof extensionsValue === 'object' && !Array.isArray(extensionsValue))
        ? extensionsValue
        : {};
    const hasTeamOs = extensions[TEAMOS_EXTENSIONS_KEY] && typeof extensions[TEAMOS_EXTENSIONS_KEY] === 'object' && !Array.isArray(extensions[TEAMOS_EXTENSIONS_KEY]);
    if (!hasTeamOs) return extensions;
    const teamOs = extensions[TEAMOS_EXTENSIONS_KEY];
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

export function normalizeAttachmentRecord(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
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

export function getTaskAttachmentsMap(boardData, options = {}) {
    const create = Boolean(options.create);
    const teamOs = getTeamOsExtensionsObject(boardData, { create });
    if (!teamOs) return null;
    if (!teamOs[TASK_ATTACHMENTS_EXTENSIONS_KEY] || typeof teamOs[TASK_ATTACHMENTS_EXTENSIONS_KEY] !== 'object' || Array.isArray(teamOs[TASK_ATTACHMENTS_EXTENSIONS_KEY])) {
        if (!create) return null;
        teamOs[TASK_ATTACHMENTS_EXTENSIONS_KEY] = {};
    }
    return teamOs[TASK_ATTACHMENTS_EXTENSIONS_KEY];
}

export function getLegacyTaskAttachmentsFromExtensions(boardData, taskId) {
    if (taskId === null || taskId === undefined || taskId === '') return [];
    const map = getTaskAttachmentsMap(boardData);
    if (!map) return [];
    const rawList = map[attachmentTaskKey(taskId)];
    if (!Array.isArray(rawList)) return [];
    return rawList.map(normalizeAttachmentRecord).filter(Boolean);
}

export function normalizeTaskAttachments(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map(normalizeAttachmentRecord)
        .filter(Boolean)
        .slice(0, ATTACHMENT_MAX_COUNT);
}

export function removeLegacyTaskAttachmentsFromExtensions(boardData, taskId) {
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

export function calculateBoardAttachmentBytes(boardData, options = {}) {
    const excludeTaskId = options.excludeTaskId;
    const excludeTaskNum = excludeTaskId === null || excludeTaskId === undefined || excludeTaskId === ''
        ? null
        : Number(excludeTaskId);
    let total = 0;

    const taskList = boardData?.board?.tasks;
    if (Array.isArray(taskList)) {
        taskList.forEach((task) => {
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

export function getTaskAttachments(boardData, taskId) {
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

export function setTaskAttachments(boardData, taskId, attachments) {
    if (taskId === null || taskId === undefined || taskId === '') return;
    const normalized = (Array.isArray(attachments) ? attachments : [])
        .map(normalizeAttachmentRecord)
        .filter(Boolean)
        .slice(0, ATTACHMENT_MAX_COUNT);
    const task = findTaskInBoardData(boardData, taskId);
    if (task) {
        task.attachments = normalized;
    }
    removeLegacyTaskAttachmentsFromExtensions(boardData, taskId);
}
