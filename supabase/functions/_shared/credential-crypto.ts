/** AES-GCM credential storage shared by backend-only feed/integration code. */

const ENCRYPTION_KEY_ENV = 'INTEGRATION_ENCRYPTION_KEY'

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get(ENCRYPTION_KEY_ENV)
  if (!keyHex || !/^[0-9a-f]{64}$/i.test(keyHex)) {
    throw new Error('Credential encryption is not configured')
  }
  const keyBytes = new Uint8Array(keyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptCredentials(data: Record<string, string>): Promise<string> {
  const key = await getEncryptionKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(data)),
  )
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)
  return btoa(String.fromCharCode(...combined))
}

export async function decryptCredentials(encryptedBase64: string): Promise<Record<string, string>> {
  const key = await getEncryptionKey()
  const combined = Uint8Array.from(atob(encryptedBase64), character => character.charCodeAt(0))
  if (combined.length <= 12) throw new Error('Invalid encrypted credentials')
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: combined.slice(0, 12) },
    key,
    combined.slice(12),
  )
  const value = JSON.parse(new TextDecoder().decode(decrypted))
  if (!value || typeof value !== 'object') throw new Error('Invalid credential payload')
  return value as Record<string, string>
}
