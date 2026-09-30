import { createHash } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { extname } from 'node:path';

/**
 * SHA-256 of a file, streamed — works the same for a 1 KB text file or a
 * multi-gigabyte backup, and the file's bytes never go anywhere else.
 */
export function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

/** Size in bytes, for the informational `size` field. */
export function fileSize(filePath) {
  return statSync(filePath).size;
}

// Control characters (C0 range and DEL) are the only thing a name may not carry.
const CONTROL_CHARS = new RegExp('[\\x00-\\x1f\\x7f]', 'g');

/**
 * A name the dashboard and the certificate can show. v2 accepts any string
 * up to 200 characters; only control characters are removed, and the name is
 * bounded. Kept as a function so a caller can still derive a clean name from
 * an arbitrary path.
 */
export function nameFromFilename(name) {
  const cleaned = name.replace(CONTROL_CHARS, '').trim().slice(0, 200);
  return cleaned || 'file';
}

/** @deprecated v1 label rules; use nameFromFilename. Kept for callers of 0.1.x. */
export function labelFromFilename(name) {
  const cleaned = name.replace(/[^a-zA-Z0-9._:/ -]/g, '-').slice(0, 200);
  return /^[a-zA-Z0-9]/.test(cleaned) ? cleaned : `f-${cleaned}`.slice(0, 200);
}

const MIME_BY_EXT = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.txt': 'text/plain',
  '.log': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.xml': 'application/xml',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** A best-effort MIME type from the extension; informational only. */
export function mimeTypeFor(filePath) {
  return MIME_BY_EXT[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}
