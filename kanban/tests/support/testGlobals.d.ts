// Browser globals the Playwright suites install with page.evaluate: the fake
// File System Access disk, write records and write control.

type FakeDiskEntry = { text: string; lastModified: number };

type PortfolioTestWrite = { boardId: string; text: string; attempt?: number };

type PortfolioWriteControl = {
  boardId: string;
  holdWrites: boolean;
  failRemaining: number;
  attempts: number;
  active: number;
  maxActive: number;
  pendingResolvers: (() => void)[];
};

declare global {
  interface Window {
    __portfolioDiskByBoardId: Record<string, FakeDiskEntry>;
    __portfolioFileOpensByBoardId: Record<string, number>;
    __portfolioFileReadsByBoardId: Record<string, number>;
    __portfolioTestWrites: PortfolioTestWrite[];
    __portfolioWriteControl?: PortfolioWriteControl;
    __releaseNextPortfolioWrite?: () => boolean;
    __newProjectWrites: string[];
    __dropTestDataTransfer?: DataTransfer;
    __shortcutImportCalls: number;
  }
}

export {};
