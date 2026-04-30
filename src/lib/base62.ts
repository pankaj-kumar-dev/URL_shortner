// Base62 encoding: deterministic, collision-free, no randomness needed
// ID 1 → "1", ID 3844 → "100", grows naturally with scale
const CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BASE = CHARS.length; // 62

export function encodeBase62(id: number): string {
  if (id === 0) return CHARS[0];

  let result = '';
  let num = id;

  while (num > 0) {
    result = CHARS[num % BASE] + result;
    num = Math.floor(num / BASE);
  }

  return result;
}
