import type { BoardRecord } from '@/features/portfolio/types';
import type { BoardFileHandle } from '@/infrastructure/browser/types';
import { nextPortfolioProjectId } from '@/domain/board';
import { serializeBoardDataFromObject } from '@/domain/serialize';
import { useAppStore } from '@/features/portfolio/state/store';

export function createPortfolioRecord({ handle = null, sourceKey = '', fileName = '', data }: {
    handle?: BoardFileHandle | null;
    sourceKey?: string;
    fileName?: string;
    data: unknown;
}): BoardRecord {
    const payload = serializeBoardDataFromObject(data);
    const colorSeed = useAppStore.getState().nextPortfolioProjectColorSeed;
    useAppStore.setState({ nextPortfolioProjectColorSeed: colorSeed + 1 });
    return {
        id: nextPortfolioProjectId(),
        colorSeed,
        handle,
        ...(sourceKey ? { sourceKey } : {}),
        fileName,
        title: payload.board.settings.title,
        data: payload
    };
}
