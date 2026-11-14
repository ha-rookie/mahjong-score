/**
 * P0 public WebAuthn challenge issuance guard.
 * Cloudflare owns CF-Connecting-IP; never use client-controlled X-Forwarded-For.
 * No new Worker bindings or Secrets. Rate limits bound D1 challenge writes,
 * not arbitrary network traffic: Cloudflare edge controls are a separate gate.
 */
export const PASSKEY_BUDGET_WINDOW_MS=5*60*1000;
export const PASSKEY_IP_BUDGET=8;
export const PASSKEY_GLOBAL_BUDGET=40;
export const PASSKEY_CHALLENGE_RETENTION_MS=24*60*60*1000;
export const PASSKEY_RATE_RECORD_RETENTION_MS=24*60*60*1000;
export const PASSKEY_PRUNE_BATCH=32;
export class PublicPasskeyRateLimited extends Error {
  constructor(){super("Public passkey challenge rate limited");}
}
const encode=new TextEncoder();
const digest=async(value:string)=>{
  const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",encode.encode(value)));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
};
/** IP is a trustable header when delivered by Cloudflare Workers. Absent or
 * malformed source IP fails closed, never allocating anonymous Challenge D1 writes.
 */
export const cloudflareClientAddress=(request:Request):string|null=>{
  const raw=request.headers.get("cf-connecting-ip")?.trim().toLowerCase();
  if(!raw||raw.length>64||!(/^[0-9a-f.:]+$/).test(raw)||
    (!raw.includes(".")&&!raw.includes(":")))return null;
  return raw;
};
type Count={attempts:number};
const count=async(db:D1Database,key:string):Promise<number>=>{
  const row=await db.prepare(
    "SELECT attempts FROM passkey_option_budgets WHERE bucket=?"
  ).bind(key).first<Count>();
  return Number(row?.attempts??0);
};
/** A DB-atomic conditional UPSERT makes each bucket's cap race-resistant.
 * Fast-path reads avoid ALL counter writes once buckets are saturated.
 * Failure of either counter fails closed before a WebAuthn Challenge is issued.
 */
const consume=async(db:D1Database,key:string,start:string,limit:number)=>{
  const result=await db.prepare(
    "INSERT INTO passkey_option_budgets(bucket,window_start,attempts) VALUES(?,?,1) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 WHERE attempts<? RETURNING attempts"
  ).bind(key,start,limit).first<Count>();
  if(!result||!Number.isSafeInteger(result.attempts)||result.attempts>limit)
    throw new PublicPasskeyRateLimited();
};
export const admitPublicPasskeyOptions=async(
  db:D1Database,request:Request,now=new Date(),
):Promise<void>=>{
  if(!Number.isFinite(now.getTime()))throw new PublicPasskeyRateLimited();
  const ip=cloudflareClientAddress(request);
  if(!ip)throw new PublicPasskeyRateLimited();
  const windowStart=new Date(Math.floor(now.getTime()/PASSKEY_BUDGET_WINDOW_MS)*PASSKEY_BUDGET_WINDOW_MS).toISOString();
  const globalKey="g:"+windowStart;
  // Store only SHA-256 of the address, never a raw client address.
  const clientKey="c:"+windowStart+":"+(await digest(ip));
  // Separate read-only prechecks minimize D1 writes on sustained abusive traffic.
  if(await count(db,clientKey)>=PASSKEY_IP_BUDGET||
    await count(db,globalKey)>=PASSKEY_GLOBAL_BUDGET)
    throw new PublicPasskeyRateLimited();
  // Global first prevents unbounded D1 counter writes from distributed traffic.
  await consume(db,globalKey,windowStart,PASSKEY_GLOBAL_BUDGET);
  await consume(db,clientKey,windowStart,PASSKEY_IP_BUDGET);
};
/** Lazy bounded collection, only after admission and before new issuance.
 * Retains challenges at least 24 h after expiry; NEVER deletes a live
 * challenge or relies on an unapproved Cron/remote database operation.
 * No cleanup writes when nothing has passed the safe retention cutoff.
 */
export const pruneExpiredPasskeyState=async(
  db:D1Database,now=new Date(),
):Promise<{challenges:number;budgets:number}>=>{
  if(!Number.isFinite(now.getTime()))throw Error("Invalid prune time");
  const expiredCutoff=new Date(now.getTime()-PASSKEY_CHALLENGE_RETENTION_MS).toISOString();
  const budgetsCutoff=new Date(now.getTime()-PASSKEY_RATE_RECORD_RETENTION_MS).toISOString();
  let challenges=0,budgets=0;
  const oldChallenge=await db.prepare(
    "SELECT id FROM auth_challenges WHERE expires_at<=? ORDER BY expires_at LIMIT 1"
  ).bind(expiredCutoff).first<{id:string}>();
  if(oldChallenge){
    const result=await db.prepare(
      "DELETE FROM auth_challenges WHERE id IN (SELECT id FROM auth_challenges WHERE expires_at<=? ORDER BY expires_at LIMIT ?) AND expires_at<=?"
    ).bind(expiredCutoff,PASSKEY_PRUNE_BATCH,expiredCutoff).run();
    challenges=Number(result.meta.changes??0);
  }
  const oldBudget=await db.prepare(
    "SELECT bucket FROM passkey_option_budgets WHERE window_start<=? ORDER BY window_start LIMIT 1"
  ).bind(budgetsCutoff).first<{bucket:string}>();
  if(oldBudget){
    const result=await db.prepare(
      "DELETE FROM passkey_option_budgets WHERE bucket IN (SELECT bucket FROM passkey_option_budgets WHERE window_start<=? ORDER BY window_start LIMIT ?) AND window_start<=?"
    ).bind(budgetsCutoff,PASSKEY_PRUNE_BATCH,budgetsCutoff).run();
    budgets=Number(result.meta.changes??0);
  }
  return {challenges,budgets};
};
