import "server-only";

/**
 * Read through a cache without ever caching a failure.
 *
 * A cached builder throws when its database call fails, so Next never stores
 * the failure (it used to store an empty result, which blanked a page for as
 * long as the entry lived: half an hour for the portfolio desk's charts, a
 * day for the deal and commitment ledgers). On a failure this tries the read
 * once more directly, and only then falls back to `empty`, which nothing
 * keeps.
 */
export async function cachedOrDirect<T>(cached: () => Promise<T>, direct: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await cached();
  } catch {
    try {
      return await direct();
    } catch {
      return empty;
    }
  }
}
