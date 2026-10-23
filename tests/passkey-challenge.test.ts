import assert from "node:assert/strict";
import test from "node:test";
import {
  consumePasskeyChallenge,
  hashPasskeyChallenge,
  issuePasskeyChallenge,
  PASSKEY_CHALLENGE_TTL_MS,
  readPasskeyChallenge,
  type ChallengeScope,
} from "../src/worker/auth/passkey-challenge";

const origin = "https://mahjong-score.ha-rookie.workers.dev";
const register = (userId = "u1"): ChallengeScope => ({
  purpose: "register_user", userId, invitationId: null,
  expectedOrigin: origin, rpId: "mahjong-score.ha-rookie.workers.dev",
});
const login = (): ChallengeScope => ({
  purpose: "login", userId: null, invitationId: null,
  expectedOrigin: origin, rpId: "mahjong-score.ha-rookie.workers.dev",
});
type Row = {
  id: string; challengeHash: string; purpose: string; userId: string | null;
  invitationId: string | null; expectedOrigin: string; rpId: string;
  createdAt: string; expiresAt: string; consumedAt: string | null;
};
class FakeD1 {
  readonly rows = new Map<string, Row>();
  readonly statements: string[] = [];
  down = false;
  prepare(sql: string) {
    this.statements.push(sql);
    const db = this;
    let args: unknown[] = [];
    return {
      bind(...values: unknown[]) { args = values; return this; },
      async run() {
        if (db.down) throw new Error("D1 down");
        if (!sql.startsWith("INSERT INTO auth_challenges")) throw new Error("Unexpected write");
        const [id,hash,purpose,user,invite,expectedOrigin,rpId,createdAt,expiresAt] = args as string[];
        if (db.rows.has(id)) throw new Error("Duplicate challenge");
        db.rows.set(id, {
          id,challengeHash:hash,purpose,userId:user??null,invitationId:invite??null,
          expectedOrigin,rpId,createdAt,expiresAt,consumedAt:null,
        });
        return { success: true };
      },
      async first<T>(): Promise<T | null> {
        if (db.down) throw new Error("D1 down");
        const matches=(r:Row,purpose:unknown,user:unknown,invite:unknown,
          expectedOrigin:unknown,rpId:unknown,now:unknown) =>
            r.purpose===purpose && r.userId===user && r.invitationId===invite &&
            r.expectedOrigin===expectedOrigin && r.rpId===rpId &&
            r.consumedAt===null && r.expiresAt>String(now);
        if (sql.startsWith("SELECT challenge_hash")) {
          const [id,purpose,user,invite,o,rp,now] = args;
          const row=db.rows.get(String(id));
          return row&&matches(row,purpose,user,invite,o,rp,now)?
            { challengeHash:row.challengeHash,expectedOrigin:row.expectedOrigin,rpId:row.rpId } as T:null;
        }
        if (sql.startsWith("UPDATE auth_challenges") && sql.includes("RETURNING id")) {
          const [at,id,hash,purpose,user,invite,o,rp,now] = args;
          const row=db.rows.get(String(id));
          if (!row||row.challengeHash!==hash||!matches(row,purpose,user,invite,o,rp,now)) return null;
          row.consumedAt=String(at);
          return {id:row.id} as T;
        }
        throw new Error("Unexpected SELECT/UPDATE SQL");
      },
    };
  }
}
const database = (fake:FakeD1) => fake as unknown as D1Database;
const clock=new Date("2026-10-23T12:00:00.000Z");

test("S2-A issues CSPRNG challenge and stores digest, not the raw value",async()=>{
  const fake=new FakeD1();
  const x=await issuePasskeyChallenge(database(fake),register(),clock);
  assert.match(x.challenge,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(Date.parse(x.expiresAt)-clock.getTime(),PASSKEY_CHALLENGE_TTL_MS);
  assert.equal(fake.rows.size,1);
  const saved=fake.rows.get(x.id)!;
  assert.equal(saved.challengeHash,await hashPasskeyChallenge(x.challenge));
  assert.notEqual(saved.challengeHash,x.challenge);
  assert.equal(saved.userId,"u1");
  assert.equal(saved.invitationId,null);
  assert.equal(saved.consumedAt,null);
  assert.equal((await readPasskeyChallenge(database(fake),x.id,register(),clock))?.challengeHash,saved.challengeHash);
});

test("S2-A one-time UPDATE RETURNING only grants one claim across parallel requests",async()=>{
  const fake=new FakeD1(),db=database(fake);
  const x=await issuePasskeyChallenge(db,register(),clock);
  const results=await Promise.all(Array.from({length:4},()=>consumePasskeyChallenge(db,x.id,register(),x.challenge,clock)));
  assert.equal(results.filter(Boolean).length,1);
  assert.equal(await readPasskeyChallenge(db,x.id,register(),clock),null);
  assert.equal(await consumePasskeyChallenge(db,x.id,register(),x.challenge,clock),false);
  assert.ok(fake.statements.some(s=>s.includes("consumed_at IS NULL")&&s.includes("RETURNING id")));
});

test("S2-A rejects wrong challenge, target, purpose, binding and expired request",async()=>{
  const fake=new FakeD1(),db=database(fake);
  const x=await issuePasskeyChallenge(db,register(),clock);
  const wrong=await issuePasskeyChallenge(db,register(),clock);
  assert.equal(await consumePasskeyChallenge(db,x.id,register(),wrong.challenge,clock),false);
  assert.equal(await consumePasskeyChallenge(db,x.id,register("u2"),x.challenge,clock),false);
  assert.equal(await readPasskeyChallenge(db,x.id,register("u2"),clock),null);
  const invite:ChallengeScope={...register(),purpose:"register_invite",userId:null,invitationId:"invite1"};
  assert.equal(await consumePasskeyChallenge(db,x.id,invite,x.challenge,clock),false);
  const otherOrigin:ChallengeScope={...register(),expectedOrigin:"https://example.net",rpId:"example.net"};
  assert.equal(await consumePasskeyChallenge(db,x.id,otherOrigin,x.challenge,clock),false);
  const later=new Date(clock.getTime()+PASSKEY_CHALLENGE_TTL_MS);
  assert.equal(await readPasskeyChallenge(db,x.id,register(),later),null);
  assert.equal(await consumePasskeyChallenge(db,x.id,register(),x.challenge,later),false);
  assert.equal(await consumePasskeyChallenge(db,x.id,register(),x.challenge,clock),true);
});

test("S2-A login scope never stores or accepts a client-provided userId",async()=>{
  const fake=new FakeD1(),db=database(fake);
  const x=await issuePasskeyChallenge(db,login(),clock);
  assert.equal(fake.rows.get(x.id)?.userId,null);
  assert.equal(await consumePasskeyChallenge(db,x.id,login(),x.challenge,clock),true);
  await assert.rejects(issuePasskeyChallenge(db,{...login(),userId:"attacker"},clock),/Discoverable/);
});

test("S2-A invite purpose is bound to one invitation and never creates a User",async()=>{
  const fake=new FakeD1(),db=database(fake);
  const scope:ChallengeScope={...login(),purpose:"register_invite",invitationId:"invite1"};
  const x=await issuePasskeyChallenge(db,scope,clock);
  assert.equal(await consumePasskeyChallenge(db,x.id,{...scope,invitationId:"invite2"},x.challenge,clock),false);
  assert.equal(await consumePasskeyChallenge(db,x.id,scope,x.challenge,clock),true);
  assert.equal(fake.rows.size,1);
});

test("S2-A rejects invalid fixed RP/origin config and challenge encoding",async()=>{
  const fake=new FakeD1(),db=database(fake);
  for(const scope of [
    {...register(),expectedOrigin:"http://mahjong-score.ha-rookie.workers.dev"},
    {...register(),rpId:"evil.example"},
    {...register(),expectedOrigin:"https://mahjong-score.ha-rookie.workers.dev/extra"},
    {...register(),purpose:"login" as const},
    {...register(),userId:null},
    {...register(),invitationId:"unexpected"},
  ]) {
    await assert.rejects(issuePasskeyChallenge(db,scope,clock));
  }
  for(const challenge of ["short","+".repeat(43),".".repeat(43),"=", "A".repeat(44)]){
    await assert.rejects(hashPasskeyChallenge(challenge));
  }
  assert.equal(fake.rows.size,0);
});

test("S2-A propagates D1 errors instead of creating a usable challenge",async()=>{
  const fake=new FakeD1();fake.down=true;
  await assert.rejects(issuePasskeyChallenge(database(fake),register(),clock),/D1 down/);
  assert.equal(fake.rows.size,0);
});
