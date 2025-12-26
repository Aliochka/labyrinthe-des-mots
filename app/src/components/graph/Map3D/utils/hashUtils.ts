/**
 * Hash functions for stable, deterministic ID generation
 */

/**
 * FNV-1a hash algorithm for string hashing
 * Fast, simple, and provides good distribution for hash-based sampling
 * @param s - String to hash
 * @returns 32-bit integer hash value
 */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

/**
 * Simple Java-style hashCode implementation
 * Used for stable sampling of stars for tether visualization
 * @param str - String to hash
 * @returns Positive integer hash value
 */
export function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;  // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
