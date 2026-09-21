/**
 * List the entry names of a ZIP archive (a .vsix is a ZIP) with no external tool.
 *
 * WHY THIS EXISTS: the VSIX audit used to shell out to `tar -tf`. That only works
 * with bsdtar (Windows tar.exe, macOS): GNU tar, which is what Git Bash and most
 * Linux distributions put first on PATH, cannot read ZIP at all, and it also reads a
 * Windows "C:\..." path as a remote host. Reading the central directory directly is
 * a few dozen deterministic lines, so the audit no longer depends on the shell, the
 * OS, or which `tar` is installed.
 *
 * Reads only the central directory (names), never file contents. ZIP64 is rejected
 * loudly rather than misread; a VSIX is nowhere near those limits.
 */
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const END_RECORD_MIN_BYTES = 22;
const MAX_ARCHIVE_COMMENT_BYTES = 0xffff;
const CENTRAL_ENTRY_FIXED_BYTES = 46;

export function listZipEntries(archive) {
  const buffer = Buffer.isBuffer(archive) ? archive : Buffer.from(archive);
  const lowest = Math.max(0, buffer.length - END_RECORD_MIN_BYTES - MAX_ARCHIVE_COMMENT_BYTES);
  let end = -1;
  for (let i = buffer.length - END_RECORD_MIN_BYTES; i >= lowest; i -= 1) {
    if (buffer.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY) { end = i; break; }
  }
  if (end < 0) throw new Error('Not a ZIP archive: end-of-central-directory record not found.');

  const count = buffer.readUInt16LE(end + 10);
  const directorySize = buffer.readUInt32LE(end + 12);
  const directoryOffset = buffer.readUInt32LE(end + 16);
  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new Error('ZIP64 archives are not supported by this audit.');
  }

  const names = [];
  let cursor = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (cursor + CENTRAL_ENTRY_FIXED_BYTES > buffer.length || buffer.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_ENTRY) {
      throw new Error('Corrupt ZIP: central directory entry is missing or malformed.');
    }
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const nameEnd = cursor + CENTRAL_ENTRY_FIXED_BYTES + nameLength;
    if (nameEnd > buffer.length) throw new Error('Corrupt ZIP: entry name runs past the end of the archive.');
    names.push(buffer.toString('utf8', cursor + CENTRAL_ENTRY_FIXED_BYTES, nameEnd));
    cursor = nameEnd + extraLength + commentLength;
  }
  return names;
}
