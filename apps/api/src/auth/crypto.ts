import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  randomUUID,
  sign,
  timingSafeEqual,
  verify,
  type KeyObject
} from "node:crypto";

import * as argon2 from "argon2";

export const PASSWORD_POLICY = {
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
  type: argon2.argon2id
} as const;

const DUMMY_PASSWORD = randomBytes(32).toString("base64url");
const dummyHash = argon2.hash(DUMMY_PASSWORD, PASSWORD_POLICY);

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, PASSWORD_POLICY);
}

export async function verifyPassword(
  storedHash: string | null,
  password: string
): Promise<{ valid: boolean; needsRehash: boolean }> {
  const candidate = storedHash ?? (await dummyHash);
  try {
    const valid = await argon2.verify(candidate, password);
    return {
      valid: storedHash !== null && valid,
      needsRehash: storedHash !== null && valid && argon2.needsRehash(storedHash, PASSWORD_POLICY)
    };
  } catch {
    return { valid: false, needsRehash: false };
  }
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeJson(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
}

export interface AccessClaims {
  readonly sub: string;
  readonly sid: string;
  readonly tenantId: string | null;
  readonly iss: string;
  readonly aud: string;
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
}

export class AccessTokenKeys {
  private readonly privateKey: KeyObject;
  private readonly verificationKeys: ReadonlyMap<string, KeyObject>;

  constructor(
    readonly issuer: string,
    readonly audience: string,
    readonly currentKid: string,
    privateKeyPem: string,
    verificationKeyPems: Readonly<Record<string, string>>
  ) {
    this.privateKey = createPrivateKey(privateKeyPem);
    if (this.privateKey.asymmetricKeyType !== "ed25519") {
      throw new Error("JWT private key must be Ed25519");
    }
    this.verificationKeys = new Map(
      Object.entries(verificationKeyPems).map(([kid, pem]) => [kid, createPublicKey(pem)])
    );
    for (const key of this.verificationKeys.values()) {
      if (key.asymmetricKeyType !== "ed25519") {
        throw new Error("JWT verification keys must be Ed25519");
      }
    }
    if (!this.verificationKeys.has(currentKid)) {
      throw new Error("Current JWT kid must be present in verification keys");
    }
    const probe = Buffer.from("zuridesk-jwt-key-consistency");
    const currentPublicKey = this.verificationKeys.get(currentKid)!;
    if (!verify(null, probe, currentPublicKey, sign(null, probe, this.privateKey))) {
      throw new Error("Current JWT private and public keys do not match");
    }
  }

  issue(input: { userId: string; sessionId: string; tenantId: string | null; now?: Date }): string {
    const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
    const header = encodeJson({ alg: "EdDSA", typ: "JWT", kid: this.currentKid });
    const payload = encodeJson({
      sub: input.userId,
      sid: input.sessionId,
      tenantId: input.tenantId,
      iss: this.issuer,
      aud: this.audience,
      iat: nowSeconds,
      exp: nowSeconds + 600,
      jti: randomUUID()
    });
    const body = `${header}.${payload}`;
    return `${body}.${sign(null, Buffer.from(body), this.privateKey).toString("base64url")}`;
  }

  verify(token: string, now = new Date()): AccessClaims {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Invalid access token");
    const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
    const header = decodeJson(headerPart);
    if (
      typeof header !== "object" ||
      header === null ||
      !("alg" in header) ||
      header.alg !== "EdDSA" ||
      !("typ" in header) ||
      header.typ !== "JWT" ||
      !("kid" in header) ||
      typeof header.kid !== "string"
    ) {
      throw new Error("Invalid access token header");
    }
    const key = this.verificationKeys.get(header.kid);
    if (
      key === undefined ||
      !verify(
        null,
        Buffer.from(`${headerPart}.${payloadPart}`),
        key,
        Buffer.from(signaturePart, "base64url")
      )
    ) {
      throw new Error("Invalid access token signature");
    }
    const claims = decodeJson(payloadPart);
    if (!isAccessClaims(claims)) throw new Error("Invalid access token claims");
    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (
      claims.iss !== this.issuer ||
      claims.aud !== this.audience ||
      claims.exp <= nowSeconds ||
      claims.iat > nowSeconds + 30 ||
      claims.exp - claims.iat !== 600
    ) {
      throw new Error("Invalid access token claims");
    }
    return claims;
  }
}

function isAccessClaims(value: unknown): value is AccessClaims {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.sub === "string" &&
    typeof row.sid === "string" &&
    (typeof row.tenantId === "string" || row.tenantId === null) &&
    typeof row.iss === "string" &&
    typeof row.aud === "string" &&
    typeof row.iat === "number" &&
    typeof row.exp === "number" &&
    typeof row.jti === "string"
  );
}

export interface OpaqueToken {
  readonly value: string;
  readonly id: string;
  readonly digest: string;
}

export class PurposeKeyRing {
  constructor(
    readonly purpose: "refresh" | "challenge" | "invite" | "csrf" | "subject",
    readonly currentVersion: string,
    private readonly keys: Readonly<Record<string, string>>
  ) {
    if (keys[currentVersion] === undefined) throw new Error(`Missing current ${purpose} key`);
  }

  issue(id: string): OpaqueToken {
    const secret = randomBytes(32).toString("base64url");
    const value = `${this.currentVersion}.${id}.${secret}`;
    return { value, id, digest: this.digest(value, this.currentVersion) };
  }

  parseAndDigest(value: string): { id: string; digest: string } | null {
    const [version, id, secret, ...rest] = value.split(".");
    if (
      version === undefined ||
      id === undefined ||
      secret === undefined ||
      rest.length > 0 ||
      secret.length < 40 ||
      this.keys[version] === undefined
    )
      return null;
    return { id, digest: this.digest(value, version) };
  }

  digestSubject(subject: string): string {
    return this.digest(subject, this.currentVersion);
  }

  digestSubjectAtVersion(subject: string, version: string): string | null {
    return this.keys[version] === undefined ? null : this.digest(subject, version);
  }

  matches(expectedHex: string, actualHex: string): boolean {
    const expected = Buffer.from(expectedHex, "hex");
    const actual = Buffer.from(actualHex, "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private digest(value: string, version: string): string {
    return createHmac("sha256", this.keys[version]!)
      .update(`${this.purpose}\0${value}`)
      .digest("hex");
  }
}
