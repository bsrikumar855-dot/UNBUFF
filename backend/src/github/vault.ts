import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encrypts GitHub access tokens before they reach the database (AES-256-GCM).
 *
 * - The key comes from the environment (GITHUB_TOKEN_ENCRYPTION_KEY, 32 random bytes, base64) and is never stored
 *   next to the data: someone who can read Firestore but not the server's secrets learns nothing.
 * - The owner (uid) and the GitHub account id are bound in as additional authenticated data, so a ciphertext copied
 *   to another student's record, or to another GitHub account, fails to decrypt.
 * - `keyId` is stored with each ciphertext. To rotate, deploy the new key as the active one and keep the old one in
 *   `retired` so existing records still decrypt; students are re-encrypted the next time they connect.
 */

export interface SealedToken {
  v: 1;
  key_id: string;
  iv: string; // base64, 12 bytes
  tag: string; // base64, 16 bytes
  data: string; // base64 ciphertext
}

export interface VaultKey {
  id: string;
  key: Buffer;
}

/** Returns why a key string is unusable, or null. */
export function keyProblem(raw: string | undefined): string | null {
  if (!raw?.trim()) return "GITHUB_TOKEN_ENCRYPTION_KEY is empty";
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) return "GITHUB_TOKEN_ENCRYPTION_KEY must be 32 random bytes encoded as base64";
  return null;
}

/** A short, non-reversible label for a key, safe to store and log. */
export function keyIdOf(raw: string): string {
  return createHash("sha256").update(raw.trim()).digest("hex").slice(0, 8);
}

export class TokenVault {
  private readonly active: VaultKey;
  private readonly all: Map<string, Buffer>;

  /** `active` encrypts; `retired` keys are accepted for decryption only. */
  constructor(active: string, retired: string[] = []) {
    const problem = keyProblem(active);
    if (problem) throw new Error(problem);
    this.active = { id: keyIdOf(active), key: Buffer.from(active.trim(), "base64") };
    this.all = new Map([[this.active.id, this.active.key]]);
    for (const r of retired) {
      if (keyProblem(r)) throw new Error("A retired GitHub token key is not 32 base64 bytes");
      this.all.set(keyIdOf(r), Buffer.from(r.trim(), "base64"));
    }
  }

  get keyId(): string {
    return this.active.id;
  }

  seal(token: string, uid: string, githubUserId: string): SealedToken {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.active.key, iv);
    cipher.setAAD(aad(uid, githubUserId));
    const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    return { v: 1, key_id: this.active.id, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
  }

  /** Throws if the record was tampered with, belongs to someone else, or its key is no longer available. */
  open(sealed: SealedToken, uid: string, githubUserId: string): string {
    const key = this.all.get(sealed.key_id);
    if (sealed.v !== 1 || !key) throw new Error("credential cannot be decrypted");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64"));
    decipher.setAAD(aad(uid, githubUserId));
    decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(sealed.data, "base64")), decipher.final()]).toString("utf8");
  }
}

function aad(uid: string, githubUserId: string): Buffer {
  return Buffer.from(`unbluff-github-token|${uid}|${githubUserId}`, "utf8");
}

/** SHA-256 of a one-time value, so the database never holds the value the browser carries. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
