import type { BoardFileHandle, BoardRecord } from '../types';
import { nextPortfolioProjectId } from '../domain/board';
import { serializeBoardDataFromObject } from '../domain/serialize';
import { useAppStore } from '../state/store';

export function createPortfolioRecord({ handle = null, fileName = '', data }: {
    handle?: BoardFileHandle | null;
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
        fileName,
        title: payload.board.settings.title,
        data: payload
    };
}
