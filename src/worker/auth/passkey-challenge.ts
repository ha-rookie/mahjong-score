/**
 * Phase 4 S2-A (#345): D1-backed one-time WebAuthn challenges.
 *
 * INTERNAL ONLY. No HTTP route or session is issued by this module.
 * The caller must source expectedOrigin/rpId from reviewed SERVER config,
 * never from a browser-supplied Origin, Host, clientDataJSON or request body.
 * Verify the complete WebAuthn response cryptographically BEFORE claiming
 * the challenge with consumeChallenge(). A consumed challenge is not proof
 * that the assertion was otherwise authorized.
 */
export type PasskeyPurpose = "register_user" | "register_invite" | "login";

export interface ChallengeScope {
  readonly purpose: PasskeyPurpose;
  readonly userId: string | null;
  readonly invitationId: string | null;
  readonly expectedOrigin: string;
  readonly rpId: string;
}

export interface IssuedChallenge {
  readonly id: string;
  readonly challenge: string;
  readonly expiresAt: string;
}

export interface StoredChallenge {
  readonly challengeHash: string;
  readonly expectedOrigin: string;
  readonly rpId: string;
}

export const PASSKEY_CHALLENGE_TTL_MS = 120_000;
const encoder = new TextEncoder();
const validChallenge = /^[A-Za-z0-9_-]{43}$/;

const encode64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

export const hashPasskeyChallenge = async (challenge: string): Promise<string> => {
  if (!validChallenge.test(challenge)) throw new Error("Invalid WebAuthn challenge encoding");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(challenge));
  return encode64url(new Uint8Array(digest));
};

const validateScope = (scope: ChallengeScope): void => {
  if (!["register_user", "register_invite", "login"].includes(scope.purpose)) {
    throw new Error("Unsupported WebAuthn challenge purpose");
  }
  if (scope.purpose === "register_user" && (!scope.userId || scope.invitationId !== null)) {
    throw new Error("Current-user registration requires only userId");
  }
  if (scope.purpose === "register_invite" && (!scope.invitationId || scope.userId !== null)) {
    throw new Error("Invite registration requires only invitationId");
  }
  if (scope.purpose === "login" && (scope.userId !== null || scope.invitationId !== null)) {
    throw new Error("Discoverable passkey login must not rely on a client-provided userId");
  }
  // S2 begins with exact host-matching RP IDs. Custom domain / subdomain
  // support needs a separate reviewed server-configuration change.
  let origin: URL;
  try { origin = new URL(scope.expectedOrigin); }
  catch { throw new Error("Invalid fixed WebAuthn origin"); }
  if (origin.protocol !== "https:" || origin.hostname !== scope.rpId ||
      origin.username || origin.password || origin.port || origin.pathname !== "/" ||
      origin.search || origin.hash || origin.origin !== scope.expectedOrigin) {
    throw new Error("Origin and RP ID must be exact HTTPS server configuration");
  }
};

export const issuePasskeyChallenge = async (
  db: D1Database,
  scope: ChallengeScope,
  now = new Date(),
): Promise<IssuedChallenge> => {
  validateScope(scope);
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid challenge time");
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const challenge = encode64url(bytes);
  const id = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + PASSKEY_CHALLENGE_TTL_MS).toISOString();
  await db.prepare(
    "INSERT INTO auth_challenges(id,challenge_hash,purpose,user_id,invitation_id,expected_origin,rp_id,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)"
  ).bind(id, await hashPasskeyChallenge(challenge), scope.purpose,
    scope.userId, scope.invitationId, scope.expectedOrigin, scope.rpId, now.toISOString(), expiresAt).run();
  return { id, challenge, expiresAt };
};

export const readPasskeyChallenge = async (
  db: D1Database,
  id: string,
  scope: ChallengeScope,
  now = new Date(),
): Promise<StoredChallenge | null> => {
  validateScope(scope);
  if (!id || !Number.isFinite(now.getTime())) return null;
  // Caller uses challengeHash as a trusted expectedChallenge callback target.
  return db.prepare(
    "SELECT challenge_hash AS challengeHash,expected_origin AS expectedOrigin,rp_id AS rpId FROM auth_challenges WHERE id=? AND purpose=? AND user_id IS ? AND invitation_id IS ? AND expected_origin=? AND rp_id=? AND consumed_at IS NULL AND expires_at>?"
  ).bind(id,scope.purpose,scope.userId,scope.invitationId,scope.expectedOrigin,scope.rpId,now.toISOString())
   .first<StoredChallenge>();
};

export const consumePasskeyChallenge = async (
  db: D1Database,
  id: string,
  scope: ChallengeScope,
  verifiedChallenge: string,
  now = new Date(),
): Promise<boolean> => {
  validateScope(scope);
  if (!id || !Number.isFinite(now.getTime())) return false;
  const challengeHash = await hashPasskeyChallenge(verifiedChallenge);
  // IMPORTANT: one conditional UPDATE ... RETURNING is the replay gate.
  // Do not use D1.batch() followed by changes=0; that is not an atomic
  // rollback guarantee for subsequent User/Credential/Player writes.
  const claimed = await db.prepare(
    "UPDATE auth_challenges SET consumed_at=? WHERE id=? AND challenge_hash=? AND purpose=? AND user_id IS ? AND invitation_id IS ? AND expected_origin=? AND rp_id=? AND consumed_at IS NULL AND expires_at>? RETURNING id"
  ).bind(now.toISOString(),id,challengeHash,scope.purpose,scope.userId,scope.invitationId,
    scope.expectedOrigin,scope.rpId,now.toISOString()).first<{id: string}>();
  return claimed?.id === id;
};
