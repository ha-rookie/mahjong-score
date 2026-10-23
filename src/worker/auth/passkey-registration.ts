/**
 * Phase 4 S2-B (#345) – server-only registration core for an EXISTING user.
 *
 * Deliberately NOT connected to an HTTP route. The future route MUST establish
 * a verified, recent LINE reauthentication for the SAME signed-in User, reject
 * cross-site requests, and rate-limit start/finish before using this module.
 * Neither a normal 24h session nor cookie sliding renewal proves freshness.
 */
import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import {
  hashPasskeyChallenge,
  issuePasskeyChallenge,
  readPasskeyChallenge,
  consumePasskeyChallenge,
  type ChallengeScope,
} from "./passkey-challenge";

export interface FreshLineIdentity {
  /** The User resolved from verified LINE ID token's `sub`, NOT the client body. */
  readonly reauthenticatedUserId: string;
  /** Verified LINE ID token's `auth_time`, only after prompt=login + max_age=0. */
  readonly authenticationTimeSeconds: number;
}

export type ExistingUserContext = {
  readonly sessionUserId: string;  // signed, DB-authVersion-validated session
  readonly lineIdentity: FreshLineIdentity; // verified LINE callback, never supplied by client
};

export const PASSKEY_STEP_UP_MAX_AGE_SECONDS = 300;
export const PASSKEY_PRODUCTION_ORIGIN = "https://mahjong-score.ha-rookie.workers.dev";
export const PASSKEY_PRODUCTION_RP_ID = "mahjong-score.ha-rookie.workers.dev";

const decoder = (text: string): Uint8Array =>
  Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=")), char => char.charCodeAt(0));
const as64 = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const canonicalCredentialId = (id: string) =>
  /^[A-Za-z0-9_-]{1,2048}$/.test(id) && id.length % 4 !== 1 &&
    as64(decoder(id)) === id;
const scope = (userId: string): ChallengeScope => ({
  purpose: "register_user", userId, invitationId: null,
  expectedOrigin: PASSKEY_PRODUCTION_ORIGIN, rpId: PASSKEY_PRODUCTION_RP_ID,
});

export const assertRecentLineReauthentication = (
  context: ExistingUserContext, nowSeconds = Math.floor(Date.now() / 1000),
): void => {
  const { sessionUserId, lineIdentity } = context;
  if (!sessionUserId || !lineIdentity || lineIdentity.reauthenticatedUserId !== sessionUserId) {
    throw new Error("Recent verified LINE identity must match the signed-in User");
  }
  const t = lineIdentity.authenticationTimeSeconds;
  if (!Number.isSafeInteger(t) || !Number.isSafeInteger(nowSeconds) ||
      t > nowSeconds + 30 || nowSeconds - t > PASSKEY_STEP_UP_MAX_AGE_SECONDS) {
    throw new Error("Recent explicit LINE reauthentication required");
  }
};

export const beginExistingUserPasskeyRegistration = async (
  db: D1Database, context: ExistingUserContext,
  now = new Date(),
) => {
  assertRecentLineReauthentication(context, Math.floor(now.getTime() / 1000));
  const userId = context.sessionUserId;
  const user = await db.prepare("SELECT id FROM users WHERE id=?")
    .bind(userId).first<{ id: string }>();
  if (!user || user.id !== userId) throw new Error("User not found");

  const saved = await db.prepare(
    "SELECT credential_id AS credentialId,transports FROM passkey_credentials WHERE user_id=? AND revoked_at IS NULL"
  ).bind(userId).all<{ credentialId: string; transports: string | null }>();
  const excludeCredentials = saved.results.map(row => ({
    id: row.credentialId,
    transports: row.transports ? JSON.parse(row.transports) as string[] : undefined,
  })).filter(row => canonicalCredentialId(row.id));

  // The binary stable user handle deliberately does not disclose the D1 User ID.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("sanma:user:" + userId));
  const challenge = await issuePasskeyChallenge(db, scope(userId), now);
  const options = await generateRegistrationOptions({
    rpName: "三麻スコア",
    rpID: PASSKEY_PRODUCTION_RP_ID,
    userName: "sanma-" + as64(new Uint8Array(digest)).slice(0, 16),
    userID: new Uint8Array(digest),
    challenge: decoder(challenge.challenge), // pass BYTES, not UTF8 of base64url
    attestationType: "none",
    supportedAlgorithmIDs: [-7],
    timeout: 120_000,
    excludeCredentials,
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  if (options.challenge !== challenge.challenge) throw new Error("WebAuthn options challenge mismatch");
  return { flowId: challenge.id, options, expiresAt: challenge.expiresAt };
};

/**
 * Called only after an authenticated, same-user, recently reauthenticated
 * session AND Origin/CSRF validation on the request. Never issue a session here.
 */
export const finishExistingUserPasskeyRegistration = async (
  db: D1Database,
  context: ExistingUserContext,
  flowId: string,
  response: RegistrationResponseJSON,
  now = new Date(),
): Promise<{ credentialId: string }> => {
  assertRecentLineReauthentication(context, Math.floor(now.getTime() / 1000));
  if (typeof flowId !== "string" || !/^[0-9a-f-]{36}$/.test(flowId)) {
    throw new Error("Invalid passkey flow identifier");
  }
  if (!response || typeof response !== "object" || typeof response.id !== "string" ||
      !canonicalCredentialId(response.id)) throw new Error("Invalid registration response");

  const binding = scope(context.sessionUserId);
  const pending = await readPasskeyChallenge(db, flowId, binding, now);
  if (!pending) throw new Error("Registration challenge missing or expired");

  // Library verifies the WebAuthn challenge, signed clientDataJSON, RP ID,
  // origin, UV, attestation data and public key. A hash callback permits
  // challenge-digest-only storage.
  const verified = await verifyRegistrationResponse({
    response,
    expectedChallenge: async received =>
      canonicalCredentialId(received) &&
      await hashPasskeyChallenge(received) === pending.challengeHash,
    expectedOrigin: pending.expectedOrigin,
    expectedRPID: pending.rpId,
    requireUserVerification: true,
    supportedAlgorithmIDs: [-7],
  });
  if (!verified.verified || !verified.registrationInfo?.credential) {
    throw new Error("WebAuthn registration verification failed");
  }
  const { credential, credentialDeviceType, credentialBackedUp } = verified.registrationInfo;
  if (!canonicalCredentialId(credential.id) || credential.id !== response.id ||
      !credential.publicKey?.byteLength || !Number.isSafeInteger(credential.counter) || credential.counter < 0) {
    throw new Error("Verified credential missing required fields");
  }
  // Fresh re-auth and current User existence are re-checked before any write.
  assertRecentLineReauthentication(context, Math.floor(Date.now() / 1000));
  const user = await db.prepare("SELECT id FROM users WHERE id=?")
    .bind(context.sessionUserId).first<{ id: string }>();
  if (user?.id !== context.sessionUserId) throw new Error("User no longer exists");

  // Claim before insert. A failed insert may consume the challenge, requiring
  // retrying a NEW flow, but MUST NOT create an orphaned credential.
  const claimed = await consumePasskeyChallenge(db, flowId, binding, 
    // Verified callback already established challenge digest equality;
    // read only the verified clientDataJSON.challenge, not top-level body field.
    (() => {
      const bytes = decoder(response.response.clientDataJSON);
      const obj = JSON.parse(new TextDecoder().decode(bytes)) as { challenge?: unknown };
      if (typeof obj.challenge !== "string") throw new Error("WebAuthn challenge missing");
      return obj.challenge;
    })(), now);
  if (!claimed) throw new Error("Registration challenge already used");
  await db.prepare(
    "INSERT INTO passkey_credentials(id,user_id,credential_id,public_key,sign_count,transports,device_type,backed_up,created_at) VALUES(?,?,?,?,?,?,?,?,?)"
  ).bind(crypto.randomUUID(),context.sessionUserId,credential.id,credential.publicKey,
    credential.counter,JSON.stringify(credential.transports ?? []),credentialDeviceType,
    credentialBackedUp ? 1 : 0,now.toISOString()).run();
  return { credentialId: credential.id };
};
