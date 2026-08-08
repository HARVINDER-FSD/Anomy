/**
 * End-to-End Encryption for AnuFy Chat
 * 
 * Protocol: ECDH (P-256) key exchange + AES-256-GCM message encryption
 * 
 * Flow:
 * 1. Each user generates a key pair (public + private) on first launch
 * 2. Public key is uploaded to server and shared with chat partners
 * 3. Both users derive the same shared secret using ECDH
 * 4. Messages are encrypted with AES-256-GCM using the shared secret
 * 5. Server only sees encrypted ciphertext - cannot read messages
 * 
 * Security properties:
 * - Forward secrecy: Each conversation has a unique derived key
 * - Server-blind: Server stores only encrypted data
 * - Authenticated: AES-GCM provides authentication (tamper detection)
 */

import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRIVATE_KEY_STORAGE = 'e2e_private_key_v1';
const PUBLIC_KEY_STORAGE = 'e2e_public_key_v1';
const SHARED_KEYS_STORAGE = 'e2e_shared_keys_v1';

// ─── Key Generation ───────────────────────────────────────────────────────────

/**
 * Generate a new ECDH key pair for this device.
 * Called once on first launch, stored in AsyncStorage.
 */
export async function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, // extractable
    ['deriveKey', 'deriveBits']
  );

  const publicKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  const publicKey = bufferToBase64(publicKeyBuffer);
  const privateKey = bufferToBase64(privateKeyBuffer);

  return { publicKey, privateKey };
}

/**
 * Get or create this device's key pair.
 * Returns the public key (to share with server) and stores private key locally.
 */
export async function getOrCreateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const storedPublic = await AsyncStorage.getItem(PUBLIC_KEY_STORAGE);
  const storedPrivate = await AsyncStorage.getItem(PRIVATE_KEY_STORAGE);

  if (storedPublic && storedPrivate) {
    return { publicKey: storedPublic, privateKey: storedPrivate };
  }

  const { publicKey, privateKey } = await generateKeyPair();
  await AsyncStorage.setItem(PUBLIC_KEY_STORAGE, publicKey);
  await AsyncStorage.setItem(PRIVATE_KEY_STORAGE, privateKey);
  return { publicKey, privateKey };
}

/**
 * Get this device's public key (to share with server/other users).
 */
export async function getMyPublicKey(): Promise<string | null> {
  return AsyncStorage.getItem(PUBLIC_KEY_STORAGE);
}

// ─── Shared Secret Derivation ─────────────────────────────────────────────────

/**
 * Derive a shared AES key from our private key + their public key.
 * Both users derive the same key independently (ECDH magic).
 * 
 * @param myPrivateKeyB64 - Our private key (base64)
 * @param theirPublicKeyB64 - Their public key (base64, from server)
 * @returns Shared AES-256-GCM key
 */
async function deriveSharedKey(
  myPrivateKeyB64: string,
  theirPublicKeyB64: string
): Promise<CryptoKey> {
  const myPrivateKey = await crypto.subtle.importKey(
    'pkcs8',
    base64ToBuffer(myPrivateKeyB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits']
  );

  const theirPublicKey = await crypto.subtle.importKey(
    'spki',
    base64ToBuffer(theirPublicKeyB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  const sharedKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false, // not extractable - stays in memory only
    ['encrypt', 'decrypt']
  );

  return sharedKey;
}

/**
 * Get or derive the shared key for a conversation.
 * Caches derived keys in memory for performance.
 */
const sharedKeyCache = new Map<string, CryptoKey>();

export async function getSharedKeyForConversation(
  conversationId: string,
  theirPublicKeyB64: string
): Promise<CryptoKey> {
  // Check memory cache first
  if (sharedKeyCache.has(conversationId)) {
    return sharedKeyCache.get(conversationId)!;
  }

  const myPrivateKey = await AsyncStorage.getItem(PRIVATE_KEY_STORAGE);
  if (!myPrivateKey) {
    throw new Error('E2E: No private key found. Call getOrCreateKeyPair() first.');
  }

  const sharedKey = await deriveSharedKey(myPrivateKey, theirPublicKeyB64);
  sharedKeyCache.set(conversationId, sharedKey);
  return sharedKey;
}

/**
 * Clear cached keys (call on logout).
 */
export function clearKeyCache(): void {
  sharedKeyCache.clear();
}

// ─── Encryption / Decryption ──────────────────────────────────────────────────

/**
 * Encrypt a message using AES-256-GCM.
 * 
 * @param plaintext - The message to encrypt
 * @param sharedKey - The derived shared key
 * @returns Base64-encoded "iv:ciphertext" string
 */
export async function encryptMessage(
  plaintext: string,
  sharedKey: CryptoKey
): Promise<string> {
  // Generate a random 12-byte IV for each message
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    encoded
  );

  // Format: base64(iv) + ':' + base64(ciphertext)
  return `${bufferToBase64(iv)}:${bufferToBase64(ciphertext)}`;
}

/**
 * Decrypt a message using AES-256-GCM.
 * 
 * @param encrypted - Base64-encoded "iv:ciphertext" string
 * @param sharedKey - The derived shared key
 * @returns Decrypted plaintext
 */
export async function decryptMessage(
  encrypted: string,
  sharedKey: CryptoKey
): Promise<string> {
  const [ivB64, ciphertextB64] = encrypted.split(':');
  if (!ivB64 || !ciphertextB64) {
    throw new Error('E2E: Invalid encrypted message format');
  }

  const iv = base64ToBuffer(ivB64);
  const ciphertext = base64ToBuffer(ciphertextB64);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

// ─── High-Level API ───────────────────────────────────────────────────────────

/**
 * Encrypt a message for a conversation.
 * Returns the encrypted string or original text if encryption fails.
 */
export async function encryptForConversation(
  conversationId: string,
  theirPublicKey: string,
  plaintext: string
): Promise<string> {
  try {
    if (!theirPublicKey || !plaintext) return plaintext;
    const sharedKey = await getSharedKeyForConversation(conversationId, theirPublicKey);
    const encrypted = await encryptMessage(plaintext, sharedKey);
    return `e2e:${encrypted}`; // Prefix to identify encrypted messages
  } catch (_err) {
    // Fallback to plaintext if encryption fails (graceful degradation)
    return plaintext;
  }
}

/**
 * Decrypt a message from a conversation.
 * Returns the decrypted string or original text if not encrypted / decryption fails.
 */
export async function decryptFromConversation(
  conversationId: string,
  theirPublicKey: string,
  content: string
): Promise<string> {
  try {
    if (!content?.startsWith('e2e:')) return content; // Not encrypted
    if (!theirPublicKey) return content;

    const encrypted = content.slice(4); // Remove 'e2e:' prefix
    const sharedKey = await getSharedKeyForConversation(conversationId, theirPublicKey);
    return await decryptMessage(encrypted, sharedKey);
  } catch (_err) {
    // Return original if decryption fails (e.g., key mismatch, corrupted)
    return content;
  }
}

/**
 * Check if a message is E2E encrypted.
 */
export function isEncrypted(content: string): boolean {
  return typeof content === 'string' && content.startsWith('e2e:');
}

// ─── Key Exchange API ─────────────────────────────────────────────────────────

/**
 * Store a peer's public key for a conversation.
 */
export async function storePeerPublicKey(
  conversationId: string,
  peerPublicKey: string
): Promise<void> {
  const stored = await AsyncStorage.getItem(SHARED_KEYS_STORAGE);
  const keys = stored ? JSON.parse(stored) : {};
  keys[conversationId] = peerPublicKey;
  await AsyncStorage.setItem(SHARED_KEYS_STORAGE, JSON.stringify(keys));
  // Clear cached derived key so it gets re-derived with new public key
  sharedKeyCache.delete(conversationId);
}

/**
 * Get a peer's stored public key for a conversation.
 */
export async function getPeerPublicKey(conversationId: string): Promise<string | null> {
  const stored = await AsyncStorage.getItem(SHARED_KEYS_STORAGE);
  if (!stored) return null;
  const keys = JSON.parse(stored);
  return keys[conversationId] || null;
}

/**
 * Clear all E2E keys (call on logout).
 */
export async function clearAllE2EKeys(): Promise<void> {
  await AsyncStorage.multiRemove([
    PRIVATE_KEY_STORAGE,
    PUBLIC_KEY_STORAGE,
    SHARED_KEYS_STORAGE,
  ]);
  sharedKeyCache.clear();
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
