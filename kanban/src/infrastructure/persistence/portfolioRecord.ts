import type { LooseBoardData } from '@/domain/types';
import type { BoardRecord } from '@/features/portfolio/types';
import type { BoardFileHandle } from '@/infrastructure/browser/types';
import { nextPortfolioProjectId } from '@/domain/board';
import { serializeBoardDataFromObject } from '@/domain/serialize';

export function createPortfolioRecord({ handle = null, sourceKey = '', fileName = '', data }: {
    handle?: BoardFileHandle | null;
    sourceKey?: string;
    fileName?: string;
    data: unknown;
}): BoardRecord {
    const payload = serializeBoardDataFromObject(data);
    const importedAt = (data as LooseBoardData)?.meta?.updatedAt;
    if (typeof importedAt === 'string') payload.meta.updatedAt = importedAt;
    return {
        id: nextPortfolioProjectId(),
        // The store assigns the colour seed when the record is added.
        colorSeed: null,
        handle,
        ...(sourceKey ? { sourceKey } : {}),
        fileName,
        title: payload.board.settings.title,
        data: payload
    };
}
