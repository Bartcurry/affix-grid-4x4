export interface PRNG {
  (): number;
  getState(): number;
  setState(state: number): void;
  clone(): PRNG;
}

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function createMulberry32(seedOrState: number): PRNG {
  let state = (seedOrState >>> 0) || 1;
  const rng = (() => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as PRNG;

  rng.getState = () => state >>> 0;
  rng.setState = (s: number) => { state = (s >>> 0) || 1; };
  rng.clone = () => createMulberry32(state);

  return rng;
}

export function encodeSeed(seed: number): string {
  const s = seed >>> 0;
  const checksum = ((s ^ (s >>> 8) ^ (s >>> 16) ^ (s >>> 24)) * 37) & 0xff;
  const val = (BigInt(s) << 8n) | BigInt(checksum);
  let code = '';
  for (let i = 7; i >= 0; i--) {
    const shift = BigInt(i * 5);
    const index = Number((val >> shift) & 0x1fn);
    code += ALPHABET[index];
    if (i === 4) code += '-';
  }
  return code;
}

export function decodeSeed(input: string): number {
  if (!input) return 1;
  const clean = input.toUpperCase().replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, '');
  if (clean.length === 8) {
    let val = 0n;
    for (let i = 0; i < 8; i++) {
      const idx = ALPHABET.indexOf(clean[i]);
      if (idx === -1) break;
      val = (val << 5n) | BigInt(idx);
    }
    const seed = Number(val >> 8n) >>> 0;
    const checksum = Number(val & 0xffn);
    const expected = ((seed ^ (seed >>> 8) ^ (seed >>> 16) ^ (seed >>> 24)) * 37) & 0xff;
    if (checksum === expected) return seed || 1;
  }
  // Fallback hash for arbitrary user input string
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 16777619) >>> 0;
  }
  return h || 1;
}

export function generateSeedCode(): { code: string; seed: number } {
  const seed = (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
  return { code: encodeSeed(seed), seed };
}
