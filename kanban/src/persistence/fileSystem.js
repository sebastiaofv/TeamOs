// File System Access API wrappers.
//
// These are the only functions that write to the user's disk. They are kept
// separate from src/domain/ because they are I/O, not logic: everything in
// src/domain/ is pure and testable without a browser, while these require a
// real FileSystemFileHandle.

export async function writeJsonToFileHandle(fileHandle, data) {
    const writable = await fileHandle.createWritable();
    const payload = JSON.stringify(data, null, 2);
    await writable.write(payload);
    await writable.close();
}
