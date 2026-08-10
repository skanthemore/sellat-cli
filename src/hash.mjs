import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

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

/**
 * Derive an API-safe label from a filename. The API accepts letters, numbers,
 * spaces, dots, underscores, dashes, slashes and colons (must start with a
 * letter or number, max 200 chars).
 */
export function labelFromFilename(name) {
  const cleaned = name.replace(/[^a-zA-Z0-9._:/ -]/g, '-').slice(0, 200);
  return /^[a-zA-Z0-9]/.test(cleaned) ? cleaned : `f-${cleaned}`.slice(0, 200);
}
