// Browser-side WebCrypto encryption and private key unlock.
// Decrypts patient records strictly in browser memory.
// Locking the key flushes memory and hides all clinical details.

const SALT = new TextEncoder().encode('swasthya-setu-demo-salt-2026');
const DEMO_DEFAULT_PASSPHRASE = 'doctor123';

// In-memory key state (never written to localStorage or sessionStorage)
let activeKey: CryptoKey | null = null;
let isBreakGlassActive = false;
let breakGlassReasonText = '';

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* no-op */
    }
  });
}

export function subscribeKeyStatus(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function isKeyUnlocked(): boolean {
  return activeKey !== null;
}

export function isBreakGlass(): boolean {
  return isBreakGlassActive;
}

export function getBreakGlassReason(): string {
  return breakGlassReasonText;
}

export async function deriveKeyFromPassphrase(passphrase: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: SALT,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function unlockWithPassphrase(passphrase: string): Promise<boolean> {
  if (!passphrase.trim()) return false;
  try {
    activeKey = await deriveKeyFromPassphrase(passphrase.trim());
    isBreakGlassActive = false;
    breakGlassReasonText = '';
    notify();
    return true;
  } catch {
    return false;
  }
}

export function unlockBreakGlass(reason: string): boolean {
  if (!reason.trim()) return false;
  try {
    // Break-glass derives key from the emergency master/default phrase
    isBreakGlassActive = true;
    breakGlassReasonText = reason.trim();
    deriveKeyFromPassphrase(DEMO_DEFAULT_PASSPHRASE).then((k) => {
      activeKey = k;
      notify();
    });
    return true;
  } catch {
    return false;
  }
}

export function lockKey(): void {
  activeKey = null;
  isBreakGlassActive = false;
  breakGlassReasonText = '';
  notify();
}

// AES-GCM Encrypt string
export async function encryptText(plainText: string, key?: CryptoKey): Promise<string> {
  const k = key ?? activeKey;
  if (!k) throw new Error('Key is locked');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plainText);
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, encoded);
  const combined = new Uint8Array(iv.length + cipherBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuffer), iv.length);
  return btoa(String.fromCharCode(...combined));
}

// AES-GCM Decrypt string
export async function decryptText(cipherB64: string, key?: CryptoKey): Promise<string> {
  const k = key ?? activeKey;
  if (!k) throw new Error('Key is locked');
  const bin = atob(cipherB64);
  const combined = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) combined[i] = bin.charCodeAt(i);
  const iv = combined.slice(0, 12);
  const cipherBuffer = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, k, cipherBuffer);
  return new TextDecoder().decode(decrypted);
}

// Helper to mask sensitive clinical text when locked
export const LOCKED_MASK = '🔒 [Encrypted — Passphrase required to unlock]';
export const LOCKED_MASK_SHORT = '🔒 [Encrypted]';
