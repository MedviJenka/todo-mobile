import * as ExpoCrypto from 'expo-crypto';

// Hermes has no WebCrypto. Without it supabase-js falls back to a Math.random PKCE verifier
// sent as a "plain" challenge; these two calls are all it needs to use S256 instead.
const g = globalThis as { crypto?: { -readonly [K in keyof Crypto]?: Crypto[K] } };
g.crypto ??= {};

if (typeof g.crypto.getRandomValues !== 'function') {
  g.crypto.getRandomValues = ExpoCrypto.getRandomValues as Crypto['getRandomValues'];
}

if (typeof g.crypto.subtle === 'undefined') {
  const subtle = {
    digest: (algorithm: AlgorithmIdentifier, data: BufferSource) => {
      const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
      if (name.toUpperCase() !== 'SHA-256') throw new Error(`Unsupported digest: ${name}`);
      return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data);
    },
  };
  g.crypto.subtle = subtle as unknown as SubtleCrypto;
}
