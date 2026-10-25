/**
 * P0 #345: end-to-end contract: signed admin session -> recovery link ->
 * WebAuthn registration -> SAME User session -> historical score ->
 * signed WebAuthn login -> SAME User again.
 * Uses real SQLite with all repo migrations and a real P-256 test authenticator.
 * No external Cloudflare, LINE, Worker deployment or Production data.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import {buildAuthenticator} from "./support/passkey-test-authenticator";
import worker from "../src/worker";
import {issuePasskeySessionCookie} from "../src/worker/auth/line-login";

const ORIGIN="https://mahjong-score.ha-rookie.workers.dev";
const secret="local-test-only-cookie-key-not-production";
const timestamp="2026-10-25T00:00:00.000Z";
type D1Result={meta:{changes:number}};
type Statement={
 bind:(...v:unknown[])=>Statement;
 first:<T>()=>Promise<T|null>;
 all:<T>()=>Promise<{results:T[]}>;
 run:()=>Promise<D1Result>;
};
class RealSqliteD1 {
  readonly sqlite=new DatabaseSync(":memory:");
  readonly statements:string[]=[];
  constructor(){
    this.sqlite.exec("PRAGMA foreign_keys=ON");
    for(const file of readdirSync("migrations").filter(x=>/^\d.*\.sql$/.test(x)).sort()){
      this.sqlite.exec(readFileSync("migrations/"+file,"utf8"));
    }
  }
  close(){this.sqlite.close();}
  direct(sql:string,...args:unknown[]){
    return this.sqlite.prepare(sql).all(...args.map(this.convert)) as Array<Record<string,unknown>>;
  }
  readonly convert=(value:unknown)=>{
    if(value instanceof Uint8Array)return Buffer.from(value);
    if(value===null||typeof value==="string"||typeof value==="number"||typeof value==="bigint")
      return value;
    if(typeof value==="boolean")return Number(value);
    throw new Error("Unexpected SQLite bind type "+typeof value);
  };
  prepare(sql:string):Statement {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const db=this;
    const command=this.sqlite.prepare(sql);
    this.statements.push(sql);
    let args:unknown[]=[];
    const stmt:Statement={
      bind(...values){args=values.map(db.convert);return stmt;},
      async first<T>(){
        const row=command.get(...args);
        return row?row as T:null;
      },
      async all<T>(){
        const results=command.all(...args) as T[];
        return{results};
      },
      async run(){const result=command.run(...args);return{meta:{changes:Number(result.changes)}};},
    };
    return stmt;
  }
  async batch(stmts:Statement[]):Promise<D1Result[]>{
    this.sqlite.exec("BEGIN IMMEDIATE");
    try{
      const results: D1Result[]=[];
      for(const stmt of stmts)results.push(await stmt.run());
      this.sqlite.exec("COMMIT");
      return results;
    }catch(error){
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
  seed(){
    this.sqlite.exec(`
      INSERT INTO groups(id,name,created_at,updated_at)
        VALUES('g','Saturday three-player mahjong','${timestamp}','${timestamp}');
      INSERT INTO users(id,display_name,system_role,created_at,updated_at)
        VALUES('admin','Admin','admin','${timestamp}','${timestamp}'),
              ('existing-user','Existing member','user','${timestamp}','${timestamp}');
      INSERT INTO external_identities(provider,provider_subject,user_id,created_at)
        VALUES('line','fixture-old-line-subject','existing-user','${timestamp}');
      INSERT INTO players(id,display_name,created_at,updated_at)
        VALUES('p','Existing player','${timestamp}','${timestamp}'),
              ('q','Other player q','${timestamp}','${timestamp}'),
              ('r','Other player r','${timestamp}','${timestamp}');
      INSERT INTO group_players(group_id,player_id,user_id,active)
        VALUES('g','p','existing-user',1),('g','q',NULL,1),('g','r',NULL,1);
      INSERT INTO group_memberships(group_id,user_id,role,created_at,updated_at)
        VALUES('g','existing-user','member','${timestamp}','${timestamp}');
      INSERT INTO sessions(id,group_id,session_date,started_at,status,created_at,updated_at)
        VALUES('s','g','2026-10-25','${timestamp}','finalized','${timestamp}','${timestamp}');
      INSERT INTO participant_segments(id,session_id,sequence) VALUES('seg','s',1);
      INSERT INTO segment_players(segment_id,player_id,seat_order)
        VALUES('seg','p',1),('seg','q',2),('seg','r',3);
      INSERT INTO games(id,session_id,segment_id,sequence,played_at)
        VALUES('game','s','seg',1,'${timestamp}');
      INSERT INTO game_results(game_id,player_id,rank,score_point,placement,is_last)
        VALUES('game','p',1,100,1,0),('game','q',2,0,2,0),('game','r',3,-100,3,1);
    `);
  }
  snapshot(){
    return {
      users:this.direct("SELECT id,display_name,system_role,auth_version FROM users ORDER BY id"),
      players:this.direct("SELECT group_id,player_id,user_id,active FROM group_players ORDER BY player_id"),
      groups:this.direct("SELECT * FROM groups ORDER BY id"),
      memberships:this.direct("SELECT * FROM group_memberships ORDER BY group_id,user_id"),
      identities:this.direct("SELECT * FROM external_identities ORDER BY user_id"),
      games:this.direct("SELECT * FROM games ORDER BY id"),
      scores:this.direct("SELECT * FROM game_results ORDER BY game_id,player_id"),
    };
  }
}
const environment=(d:RealSqliteD1)=>({
  DB:d as unknown as D1Database,AUTH_SESSION_SECRET:secret,
  ASSETS:{fetch:async()=>new Response("not used")},
});
const makePost=(path:string,body:unknown,cookie?:string)=>new Request(ORIGIN+path,{
  method:"POST",headers:{
    "origin":ORIGIN,"content-type":"application/json",
    ...(cookie?{"cookie":cookie}:{}),
  },body:JSON.stringify(body),
});
const guest=async(env:ReturnType<typeof environment>,path:string,body:unknown)=>{
  const result=await worker.fetch(makePost(path,body),env);
  return result;
};
const cookie=(value:string)=>value.split(";")[0];
const currentUser=async(env:ReturnType<typeof environment>,value:string)=>{
  const response=await worker.fetch(new Request(ORIGIN+"/api/auth/me",{
    headers:{"cookie":value},
  }),env);
  assert.equal(response.status,200);
  const data=await response.json() as {user:{id:string}};
  return data.user.id;
};

test("P0 full journey: system admin creates recovery URL -> real WebAuthn -> old User -> signed re-login; historical scores unchanged",{timeout:120000},async()=>{
  const db=new RealSqliteD1();
  db.seed();const initial=db.snapshot(),env=environment(db);
  try{
    const adminCookie=cookie(await issuePasskeySessionCookie(env.DB,secret,"admin"));
    const userCookie=cookie(await issuePasskeySessionCookie(env.DB,secret,"existing-user"));
    assert.equal(await currentUser(env,userCookie),"existing-user");

    // Only system administrators can issue a link for an exact already-linked Player.
    const denied=await worker.fetch(makePost(
      "/api/admin/groups/g/players/p/passkey-recovery",
      {expectedUserId:"existing-user"},userCookie),env);
    assert.equal(denied.status,403);
    assert.equal(db.direct("SELECT count(*) AS n FROM passkey_recovery_grants")[0].n,0);

    const wrong=await worker.fetch(makePost(
      "/api/admin/groups/g/players/p/passkey-recovery",
      {expectedUserId:"wrong-user"},adminCookie),env);
    assert.equal(wrong.status,409);

    const issued=await worker.fetch(makePost(
      "/api/admin/groups/g/players/p/passkey-recovery",
      {expectedUserId:"existing-user"},adminCookie),env);
    assert.equal(issued.status,201,await issued.text());
    const result=await issued.json() as {recovery:{recoveryUrl:string;playerId:string;groupId:string}};
    const token=new URL(result.recovery.recoveryUrl).searchParams.get("recover");
    assert.ok(token);
    assert.equal(result.recovery.playerId,"p");
    assert.equal(result.recovery.groupId,"g");
    assert.deepEqual(db.snapshot(),initial,"admin may only create grant, not rewrite User, Player or scores");

    const optionsRes=await guest(env,"/api/auth/passkey/recovery/options",{token});
    assert.equal(optionsRes.status,200,await optionsRes.text());
    const options=await optionsRes.json() as {
      flowId:string; options:{challenge:string;rp:{id:string}}
    };
    assert.equal(options.options.rp.id,"mahjong-score.ha-rookie.workers.dev");
    const authenticator=await buildAuthenticator();

    // Cryptographic attestation is independently verified by SimpleWebAuthn.
    const registered=await guest(env,"/api/auth/passkey/recovery/verify",{
      token,flowId:options.flowId,credential:authenticator.create(options.options.challenge),
    });
    assert.equal(registered.status,201,await registered.text());
    const payload=await registered.json() as {registered:boolean;playerId:string;groupId:string};
    assert.equal(payload.registered,true);
    assert.equal(payload.playerId,"p");assert.equal(payload.groupId,"g");
    const recoveryCookie=cookie(registered.headers.get("set-cookie")!);
    assert.equal(await currentUser(env,recoveryCookie),"existing-user");
    assert.deepEqual(db.snapshot(),initial,"WebAuthn registration must add ONLY credential and consumed grant");
    assert.deepEqual(db.direct("SELECT user_id AS userId,credential_id AS credentialId FROM passkey_credentials"),
      [{userId:"existing-user",credentialId:authenticator.identity}]);

    const replay=await guest(env,"/api/auth/passkey/recovery/verify",{
      token,flowId:options.flowId,credential:authenticator.create(options.options.challenge),
    });
    assert.equal(replay.status,409);
    assert.equal((await guest(env,"/api/auth/passkey/recovery/options",{token})).status,409);

    // New browser visit: no LINE Cookie; discoverable passkey verifies signature.
    const challengeResponse=await guest(env,"/api/auth/passkey/login/options",{});
    assert.equal(challengeResponse.status,200);
    const challenge=await challengeResponse.json() as {flowId:string;options:{challenge:string}};
    const signed=await authenticator.authenticate(challenge.options.challenge);
    const loggedIn=await guest(env,"/api/auth/passkey/login/verify",{
      flowId:challenge.flowId,credential:signed,
    });
    assert.equal(loggedIn.status,200,await loggedIn.text());
    const loginCookie=cookie(loggedIn.headers.get("set-cookie")!);
    assert.equal(await currentUser(env,loginCookie),"existing-user");
    assert.equal((await guest(env,"/api/auth/passkey/login/verify",{
      flowId:challenge.flowId,credential:signed,
    })).status,409);
    const groups=await worker.fetch(new Request(ORIGIN+"/api/groups",{
      headers:{"cookie":loginCookie},
    }),env);
    assert.equal(groups.status,200);
    assert.deepEqual((await groups.json() as {groups:Array<{id:string}>}).groups.map(x=>x.id),["g"]);
    const players=await worker.fetch(new Request(ORIGIN+"/api/groups/g/players",{
      headers:{"cookie":loginCookie},
    }),env);
    assert.equal(players.status,200);
    assert.equal((await players.json() as {players:Array<{id:string;userId:string|null}>})
      .players.find(p=>p.id==="p")?.userId,"existing-user");

    assert.deepEqual(db.snapshot(),initial,"Full admin -> registration -> login flow must preserve Player/Score");
    assert.equal(db.direct("SELECT count(*) AS n FROM users")[0].n,2);
    assert.equal(db.direct("SELECT sign_count AS signCount FROM passkey_credentials")[0].signCount,1);
  }finally{db.close();}
});
