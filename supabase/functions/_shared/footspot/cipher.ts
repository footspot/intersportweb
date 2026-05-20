// * AES-256-GCM encryption for stored Footspot api_tokens.
// *
// *   The key (API_TOKEN_ENCRYPTION_KEY) is a 64-char hex string = 32 bytes.
// *   Output format on disk: base64(iv || ciphertext || authTag), all packed
// *   as one Uint8Array. The GCM auth tag is appended to ciphertext by
// *   SubtleCrypto.encrypt automatically; SubtleCrypto.decrypt verifies it.

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('hex string has odd length')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

function b64Encode(buf: Uint8Array): string {
  let s = ''
  for (const b of buf) s += String.fromCharCode(b)
  return btoa(s)
}

function b64Decode(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function importKey(): Promise<CryptoKey> {
  const hex = Deno.env.get('API_TOKEN_ENCRYPTION_KEY')
  if (!hex || hex.length !== 64) {
    throw new Error('API_TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)')
  }
  const raw = hexToBytes(hex)
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptApiToken(plaintext: string): Promise<string> {
  const key = await importKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)),
  )
  const packed = new Uint8Array(iv.length + ct.length)
  packed.set(iv, 0)
  packed.set(ct, iv.length)
  return b64Encode(packed)
}

export async function decryptApiToken(packedB64: string): Promise<string> {
  const key = await importKey()
  const packed = b64Decode(packedB64)
  const iv = packed.slice(0, 12)
  const ct = packed.slice(12)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return new TextDecoder().decode(pt)
}
