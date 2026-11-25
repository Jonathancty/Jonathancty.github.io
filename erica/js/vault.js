// Shared by the browser and scripts/erica/encrypt.mjs so both always agree.
// Case, spacing and full-width/half-width differences never matter.
export const normalise = (word) => word.normalize('NFKC').toLowerCase().replace(/\s+/g, '');

export async function deriveKey(word, salt, iterations) {
  const raw = new TextEncoder().encode(normalise(word));
  const base = await crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

// Returns the content, or null when the word is wrong.
export async function unlock(word, box) {
  const key = await deriveKey(word, bytes(box.salt), box.iterations);
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(box.iv) }, key, bytes(box.data));
  } catch {
    return null;
  }
  return JSON.parse(new TextDecoder().decode(plain));
}
