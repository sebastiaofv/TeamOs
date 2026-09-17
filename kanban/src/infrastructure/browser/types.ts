// The browser file surface used by persistence adapters and test doubles.

export type BoardFile = { name: string; size?: number; lastModified?: number; text(): Promise<string> };
export type BoardWritable = { write(data: string): Promise<void>; close(): Promise<void> };
export type BoardFileHandle = {
    name: string;
    getFile(): Promise<BoardFile>;
    createWritable(): Promise<BoardWritable>;
};

