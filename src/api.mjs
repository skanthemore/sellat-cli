/**
 * Minimal client for the SELLAT v1 proof API (https://sellat.app/developers).
 *
 * Two endpoints, hash-only by design — the API never accepts file contents:
 *
 *   POST /api/v1/stamp        { hash, label, metadata? }  → 202 accepted
 *   GET  /api/v1/stamp/:id                                → current status
 *
 * Every stamp is linked to the client's previous stamp through a chained
 * hash, so a sequence of stamps forms a verifiable append-only chain.
 */

export class SellatApiError extends Error {
  constructor(message, { status, retryAfterSeconds } = {}) {
    super(message);
    this.name = 'SellatApiError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function createClient({
  token,
  baseUrl = 'https://sellat.app',
  fetchImpl = fetch,
} = {}) {
  if (!token) {
    throw new SellatApiError(
      'Missing API token. Set SELLAT_API_TOKEN or pass --token. Get one at https://sellat.app/developers'
    );
  }

  const base = baseUrl.replace(/\/+$/, '');

  async function request(method, path, body) {
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      /* non-JSON error body — handled below via status */
    }

    if (response.status === 401) {
      throw new SellatApiError('Invalid or revoked API token.', { status: 401 });
    }
    if (response.status === 429) {
      const retryAfterSeconds = Number(response.headers.get('retry-after') ?? 60);
      throw new SellatApiError(`Rate limited — retry in ${retryAfterSeconds}s.`, {
        status: 429,
        retryAfterSeconds,
      });
    }
    if (!response.ok || payload?.success === false) {
      throw new SellatApiError(payload?.error ?? `API answered HTTP ${response.status}.`, {
        status: response.status,
      });
    }

    return payload;
  }

  return {
    /** Submit a SHA-256 for stamping. Returns { id, status, hash, chainHash, … }. */
    stamp({ hash, label, metadata }) {
      return request('POST', '/api/v1/stamp', { hash, label, metadata });
    },

    /** Current status of a stamp, including blockchain fields once anchored. */
    status(id) {
      return request('GET', `/api/v1/stamp/${encodeURIComponent(id)}`);
    },
  };
}
