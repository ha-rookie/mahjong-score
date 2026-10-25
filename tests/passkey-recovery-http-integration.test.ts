import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/worker";
import {PASSKEY_ORIGIN,PASSKEY_RP_ID} from "../src/worker/auth/passkey-line-free";
import type {RegistrationResponseJSON,AuthenticationResponseJSON} from "@simplewebauthn/server";

const secret="e2e-local-test-session-secret-not-production";
const enc=new TextEncoder();
const encode64=(v:Uint8Array)=>Buffer.from(v).toString("base64url");
const from64=(v:string)=>new Uint8Array(Buffer.from(v,"base64url"));
const join=(...items:Uint8Array[])=>{
  const out=new Uint8Array(items.reduce((sum,item)=>sum+item.length,0));
  let offset=0;
  for(const item of items){out.set(item,offset);offset+=item.length;}
  return out;
};
const hash=async(v:Uint8Array)=>new Uint8Array(await crypto.subtle.digest("SHA-256",Uint8Array.from(v)));
const cbor=(item:unknown):Uint8Array=>{
  const prefix=(major:number,n:number)=>{
    if(n<24)return Uint8Array.of(major*32+n);
    if(n<256)return Uint8Array.of(major*32+24,n);
    if(n<65536)return Uint8Array.of(major*32+25,n>>8,n&255);
    throw new Error("CBOR size outside test range");
  };
  if(typeof item==="number"&&Number.isSafeInteger(item)){
    return item>=0?prefix(0,item):prefix(1,-1-item);
  }
  if(item instanceof Uint8Array)return join(prefix(2,item.length),item);
  if(typeof item==="string"){
    const data=enc.encode(item);return join(prefix(3,data.length),data);
  }
  if(item instanceof Map){
    const parts:Uint8Array[]=[];
    for(const [key,value] of item){parts.push(cbor(key),cbor(value));}
    return join(prefix(5,item.size),...parts);
  }
  throw new Error("Unknown CBOR test value");
};
const count=(n:number)=>Uint8Array.of(n>>>24,n>>>16&255,n>>>8&255,n&255);
const userSession=async(userId:string)=>{
  const payload=encode64(enc.encode(JSON.stringify({
    userId,authVersion:0,exp:Math.floor(Date.now()/1000)+3600,
  })));
  const key=await crypto.subtle.importKey("raw",enc.encode(secret),{
    name:"HMAC",hash:"SHA-256",
  },false,["sign"]);
  return "mahjong_session="+payload+"."+encode64(new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(payload))));
};
const cookieFrom=(response:Response)=>{
  const set=response.headers.get("set-cookie")??"";
  assert.match(set,/^mahjong_session=/);
  assert.match(set,/HttpOnly/);
  assert.match(set,/Secure/);
  return set.split(";")[0];
};
const cookieUser=(cookie:string)=>{
  const value=cookie.split("=")[1].split(".")[0];
  return (JSON.parse(Buffer.from(value,"base64url").toString("utf8")) as {
    userId:string;authVersion:number;
  }).userId;
};

const makeAuthenticator=async()=>{
  const pair=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
  const jwk=await crypto.subtle.exportKey("jwk",pair.publicKey);
  const credId=encode64(crypto.getRandomValues(new Uint8Array(16)));
  const credBytes=from64(credId);
  const cose=cbor(new Map<number,unknown>([
    [1,2],[3,-7],[-1,1],[-2,from64(jwk.x!)],[-3,from64(jwk.y!)],
  ]));
  const rp=await hash(enc.encode(PASSKEY_RP_ID));
  const attested=join(rp,Uint8Array.of(0x45),count(0),new Uint8Array(16),
    Uint8Array.of(0,credBytes.length),credBytes,cose);
  const attestation=cbor(new Map<string,unknown>([
    ["fmt","none"],["attStmt",new Map()],["authData",attested],
  ]));
  const registration=(challenge:string):RegistrationResponseJSON=>{
    const client=enc.encode(JSON.stringify({
      type:"webauthn.create",challenge,origin:PASSKEY_ORIGIN,crossOrigin:false,
    }));
    return {id:credId,rawId:credId,type:"public-key",response:{
      clientDataJSON:encode64(client),attestationObject:encode64(attestation),
    },clientExtensionResults:{}} as RegistrationResponseJSON;
  };
  const assertion=async(challenge:string):Promise<AuthenticationResponseJSON>=>{
    const authenticator=join(rp,Uint8Array.of(0x05),count(1));
    const client=enc.encode(JSON.stringify({
      type:"webauthn.get",challenge,origin:PASSKEY_ORIGIN,crossOrigin:false,
    }));
    const raw=new Uint8Array(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},
      pair.privateKey,join(authenticator,await hash(client))));
    const trim=(part:Uint8Array)=>{
      let n=0;while(n<part.length-1&&part[n]===0)n++;
      const bytes=part.slice(n);return bytes[0]&128?join(Uint8Array.of(0),bytes):bytes;
    };
    const a=trim(raw.slice(0,raw.length/2)),b=trim(raw.slice(raw.length/2));
    const der=join(Uint8Array.of(0x30,a.length+b.length+4,0x02,a.length),
      a,Uint8Array.of(0x02,b.length),b);
    return {id:credId,rawId:credId,type:"public-key",response:{
      clientDataJSON:encode64(client),authenticatorData:encode64(authenticator),
      signature:encode64(der),userHandle:null,
    },clientExtensionResults:{}} as unknown as AuthenticationResponseJSON;
  };
  return {credId,registration,assertion};
};

type Grant={id:string;tokenHash:string;userId:string;groupId:string;playerId:string;
  expiresAt:string;usedAt:string|null;revokedAt:string|null};
type Challenge={id:string;hash:string;purpose:string;userId:string|null;
  invitationId:string|null;origin:string;rpId:string;expiresAt:string;consumedAt:string|null};
type CredentialRow={id:string;userId:string;credentialId:string;publicKey:Uint8Array;
  signCount:number;transports:string;revokedAt:string|null};
type BoundQuery={sql:string;getValues():unknown[]};
class InMemoryD1{
  readonly group={id:"existing-group",name:"既存三麻グループ",createdAt:"2026-01-01T00:00:00Z"};
  readonly linkedPlayer={id:"existing-player",displayName:"以前からの友人",userId:"existing-user",active:1};
  readonly scores=[{gameId:"existing-game",playerId:"existing-player",scorePoint:140},
    {gameId:"existing-game",playerId:"friend-player",scorePoint:-140}];
  readonly lineIdentities=[{provider:"line",subject:"old-line-sub",userId:"existing-user"}];
  readonly users=new Map([
    ["system-admin",{displayName:"管理者",systemRole:"admin",authVersion:0}],
    ["existing-user",{displayName:"以前からの友人",systemRole:"user",authVersion:0}],
    ["group-admin",{displayName:"グループ管理者",systemRole:"user",authVersion:0}],
  ]);
  readonly memberships=new Map([["existing-user","member"],["group-admin","group_admin"]]);
  readonly grants=new Map<string,Grant>();
  readonly challenges=new Map<string,Challenge>();
  readonly credentials=new Map<string,CredentialRow>();
  readonly writes:string[]=[];
  prepare(sql:string){
    let values:unknown[]=[];
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self=this;
    return{
      bind(...args:unknown[]){values=args;return this;},
      async first<T>():Promise<T|null>{return self.readOne(sql,values) as T|null;},
      async all<T>():Promise<{results:T[]}>{return {results:self.readAll(sql,values) as T[]};},
      async run(){return{meta:{changes:self.execute(sql,values)}};},
      getValues:()=>values,sql,
    };
  }
  readOne(sql:string,p:unknown[]):Record<string,unknown>|null{
    const uid=String(p[0]);
    if(sql.startsWith("SELECT id,auth_version AS authVersion FROM users WHERE id=?")){
      const user=this.users.get(uid);return user?{id:uid,authVersion:user.authVersion}:null;
    }
    if(sql.startsWith("SELECT 1 AS ok FROM users WHERE id=? AND system_role='admin'")){
      return this.users.get(uid)?.systemRole==="admin"?{ok:1}:null;
    }
    if(sql.startsWith("SELECT id FROM users WHERE id=? AND system_role='admin'")){
      return this.users.get(uid)?.systemRole==="admin"?{id:uid}:null;
    }
    if(sql.startsWith("SELECT gp.user_id AS userId")){
      return p[0]===this.group.id&&p[1]===this.linkedPlayer.id&&
        p[2]===this.linkedPlayer.userId&&this.linkedPlayer.active===1&&
        this.memberships.has(this.linkedPlayer.userId)?{userId:this.linkedPlayer.userId}:null;
    }
    if(sql.startsWith("SELECT id FROM passkey_recovery_grants WHERE id=?")){
      const grant=this.grants.get(uid);
      return grant&&!grant.revokedAt&&!grant.usedAt?{id:grant.id}:null;
    }
    if(sql.startsWith("SELECT r.id,r.user_id AS userId")){
      const grant=[...this.grants.values()].find(g=>g.tokenHash===p[0]&&
        !g.usedAt&&!g.revokedAt&&g.expiresAt>String(p[1])&&
        g.userId===this.linkedPlayer.userId&&this.linkedPlayer.active===1&&
        g.groupId===this.group.id&&g.playerId===this.linkedPlayer.id);
      return grant?{id:grant.id,userId:grant.userId,groupId:grant.groupId,
        playerId:grant.playerId,playerName:this.linkedPlayer.displayName,
        groupName:this.group.name,expiresAt:grant.expiresAt}:null;
    }
    if(sql.startsWith("SELECT challenge_hash AS challengeHash")){
      const c=this.challenges.get(uid);
      return c&&c.purpose===p[1]&&c.userId===p[2]&&c.invitationId===p[3]&&
        c.origin===p[4]&&c.rpId===p[5]&&!c.consumedAt&&c.expiresAt>String(p[6])?
        {challengeHash:c.hash,expectedOrigin:c.origin,rpId:c.rpId}:null;
    }
    if(sql.startsWith("UPDATE auth_challenges SET consumed_at=")){
      const c=this.challenges.get(String(p[1]));
      if(!c||c.hash!==p[2]||c.purpose!==p[3]||c.userId!==p[4]||
        c.invitationId!==p[5]||c.origin!==p[6]||c.rpId!==p[7]||
        c.consumedAt||c.expiresAt<=String(p[8]))return null;
      c.consumedAt=String(p[0]);return{id:c.id};
    }
    if(sql.startsWith("SELECT c.id,c.user_id AS userId")){
      const c=this.credentials.get(uid);
      return c&&!c.revokedAt?{id:c.id,userId:c.userId,credentialId:c.credentialId,
        publicKey:c.publicKey,signCount:c.signCount,transports:c.transports,
        deviceType:"multiDevice",backedUp:1}:null;
    }
    if(sql.startsWith("SELECT id,display_name AS displayName,system_role AS systemRole FROM users WHERE id=?")){
      const user=this.users.get(uid);
      return user?{id:uid,displayName:user.displayName,systemRole:user.systemRole}:null;
    }
    if(sql.startsWith("SELECT 1 AS ok FROM users WHERE system_role='admin' LIMIT 1")){
      return{ok:1};
    }
    if(sql.startsWith("SELECT role FROM group_memberships WHERE user_id=? AND group_id=?")){
      const role=this.memberships.get(uid);
      return role&&p[1]===this.group.id?{role}:null;
    }
    throw new Error("Unexpected read SQL: "+sql.slice(0,95));
  }
  readAll(sql:string,p:unknown[]):Array<Record<string,unknown>>{
    if(sql.startsWith("SELECT credential_id AS credentialId,transports")){
      return [...this.credentials.values()].filter(c=>c.userId===p[0]&&!c.revokedAt)
        .map(c=>({credentialId:c.credentialId,transports:c.transports}));
    }
    if(sql.startsWith("SELECT gm.group_id AS groupId,g.name AS groupName")){
      if(p[0]!=="existing-user"||!this.memberships.has("existing-user"))return[];
      return[{groupId:this.group.id,groupName:this.group.name,role:"member",
        playerId:this.linkedPlayer.id,playerDisplayName:this.linkedPlayer.displayName}];
    }
    if(sql.startsWith("SELECT p.id,p.display_name AS displayName")){
      return[{id:this.linkedPlayer.id,displayName:this.linkedPlayer.displayName,
        userId:this.linkedPlayer.userId,linkedUserDisplayName:"以前からの友人",
        groupRole:"member",createdAt:this.group.createdAt,updatedAt:this.group.createdAt}];
    }
    throw new Error("Unexpected list SQL: "+sql.slice(0,95));
  }
  execute(sql:string,p:unknown[]):number{
    this.writes.push(sql);
    if(sql.startsWith("INSERT INTO auth_challenges")){
      this.challenges.set(String(p[0]),{id:String(p[0]),hash:String(p[1]),
        purpose:String(p[2]),userId:p[3] as string|null,invitationId:p[4] as string|null,
        origin:String(p[5]),rpId:String(p[6]),expiresAt:String(p[8]),consumedAt:null});
      return 1;
    }
    if(sql.startsWith("UPDATE passkey_credentials SET sign_count=")){
      const row=this.credentials.get(String(p[4]));
      if(!row||row.id!==p[2]||row.userId!==p[3]||
        row.signCount!==p[5]||row.revokedAt)return 0;
      row.signCount=Number(p[0]);return 1;
    }
    throw new Error("Unexpected write SQL: "+sql.slice(0,95));
  }
  async batch(statements:BoundQuery[]):Promise<Array<{meta:{changes:number}}>>{
    const before=new Map([...this.grants].map(([key,value])=>[key,{...value}]));
    const keysBefore=new Map(this.credentials);
    const results:Array<{meta:{changes:number}}>=[];
    try{
      let consumed=0;
      for(const statement of statements){
        const sql=statement.sql,p=statement.getValues();
        this.writes.push(sql);
        if(sql.startsWith("UPDATE passkey_recovery_grants SET revoked_at=")){
          let changed=0;
          for(const grant of this.grants.values()){
            if(grant.userId===p[1]&&!grant.usedAt&&!grant.revokedAt){
              grant.revokedAt=String(p[0]);changed++;
            }
          }
          results.push({meta:{changes:changed}});
        }else if(sql.startsWith("INSERT INTO passkey_recovery_grants")){
          const groupId=String(p[3]),playerId=String(p[4]),userId=String(p[2]);
          if(groupId!==this.group.id||playerId!==this.linkedPlayer.id||
            userId!==this.linkedPlayer.userId||this.users.get(String(p[5]))?.systemRole!=="admin"||
            [...this.grants.values()].some(g=>g.userId===userId&&!g.usedAt&&!g.revokedAt)){
            throw new Error("Invalid admin recovery grant");
          }
          this.grants.set(String(p[0]),{id:String(p[0]),tokenHash:String(p[1]),userId,
            groupId,playerId,expiresAt:String(p[7]),usedAt:null,revokedAt:null});
          results.push({meta:{changes:1}});
        }else if(sql.startsWith("UPDATE passkey_recovery_grants SET used_at=")){
          const grant=this.grants.get(String(p[1]));
          consumed=grant&&grant.tokenHash===p[2]&&grant.userId===p[3]&&
            !grant.usedAt&&!grant.revokedAt&&grant.expiresAt>String(p[4])&&
            this.linkedPlayer.userId===p[7]&&this.linkedPlayer.active===1?1:0;
          if(consumed&&grant)grant.usedAt=String(p[0]);
          results.push({meta:{changes:consumed}});
        }else if(sql.startsWith("INSERT INTO passkey_credentials")){
          const [id,userId,credentialId,publicKey,grantId,tokenHash,checkUser,usedAt,counter]=p;
          const grant=this.grants.get(String(grantId));
          if(consumed!==1||!grant||grant.tokenHash!==tokenHash||
             grant.userId!==checkUser||grant.usedAt!==usedAt||
             userId!==this.linkedPlayer.userId||this.credentials.has(String(credentialId))){
            throw new Error("Credential insert failed CHECK/UNIQUE");
          }
          this.credentials.set(String(credentialId),{id:String(id),userId:String(userId),
            credentialId:String(credentialId),publicKey:publicKey as Uint8Array,
            signCount:Number(counter),transports:String(p[9]),revokedAt:null});
          results.push({meta:{changes:1}});
        }else throw new Error("Unexpected batch SQL: "+sql.slice(0,85));
      }
      return results;
    }catch(error){
      this.grants.clear();
      for(const [key,value] of before)this.grants.set(key,value);
      this.credentials.clear();
      for(const [key,value] of keysBefore)this.credentials.set(key,value);
      throw error;
    }
  }
}
const envFor=(db:InMemoryD1)=>({
  DB:db as unknown as D1Database,AUTH_SESSION_SECRET:secret,
  ASSETS:{fetch:async()=>new Response("assets")} as unknown as Fetcher,
});
const send=(db:InMemoryD1,path:string,body?:unknown,cookie?:string,method="POST")=>{
  const headers=new Headers({"origin":PASSKEY_ORIGIN,"sec-fetch-site":"same-origin"});
  if(body!==undefined)headers.set("content-type","application/json");
  if(cookie)headers.set("cookie",cookie);
  return worker.fetch(new Request(PASSKEY_ORIGIN+path,{
    method,headers,...(body===undefined?{}:{body:JSON.stringify(body)}),
  }),envFor(db));
};
const jsonBody=async<T>(response:Response):Promise<T>=>await response.json() as T;
type Options={flowId:string;options:{challenge:string};expiresAt:string};

test("P0 HTTP integration: admin issues recovery -> LINE-free real WebAuthn -> same User session -> sign out -> passkey login; linked Player/Group/Score unchanged",async()=>{
  const db=new InMemoryD1(),authenticator=await makeAuthenticator();
  const before={users:[...db.users.keys()],player:{...db.linkedPlayer},
    group:{...db.group},scores:structuredClone(db.scores),
    line:structuredClone(db.lineIdentities),members:[...db.memberships]};
  const adminCookie=await userSession("system-admin");
  const groupAdminCookie=await userSession("group-admin");
  const path="/api/admin/groups/existing-group/players/existing-player/passkey-recovery";

  const denied=await send(db,path,{expectedUserId:"existing-user"},groupAdminCookie);
  assert.equal(denied.status,403,"group admin cannot recover a User spanning other groups");
  const mismatched=await send(db,path,{expectedUserId:"wrong-user"},adminCookie);
  assert.equal(mismatched.status,409,"admin cannot recover an unrelated User");
  assert.equal(db.grants.size,0);
  const issued=await send(db,path,{expectedUserId:"existing-user"},adminCookie);
  assert.equal(issued.status,201);
  const issuance=await jsonBody<{recovery:{recoveryUrl:string;expiresAt:string}}>(issued);
  const token=new URL(issuance.recovery.recoveryUrl).searchParams.get("recover");
  assert.ok(token&&token.length===43);
  assert.ok(issuance.recovery.expiresAt);
  const optionsResponse=await send(db,"/api/auth/passkey/recovery/options",{token});
  assert.equal(optionsResponse.status,200);
  const options=await jsonBody<Options>(optionsResponse);
  const registered=await send(db,"/api/auth/passkey/recovery/verify",{
    token,flowId:options.flowId,
    credential:authenticator.registration(options.options.challenge),
  });
  assert.equal(registered.status,201,"real signed WebAuthn registration must complete");
  const recoveredCookie=cookieFrom(registered);
  assert.equal(cookieUser(recoveredCookie),"existing-user");
  assert.equal(db.users.size,3,"recovery must never create a new User");
  assert.equal(db.credentials.get(authenticator.credId)?.userId,"existing-user");
  const authMe=await send(db,"/api/auth/me",undefined,recoveredCookie,"GET");
  assert.equal(authMe.status,200);
  const current=await jsonBody<{
    authenticated:boolean;user:{id:string};memberships:Array<{groupId:string;playerId:string}>;
  }>(authMe);
  assert.equal(current.authenticated,true);
  assert.equal(current.user.id,"existing-user");
  assert.deepEqual(current.memberships.map(x=>[x.groupId,x.playerId]),
    [["existing-group","existing-player"]]);
  const players=await send(db,"/api/groups/existing-group/players",undefined,recoveredCookie,"GET");
  assert.equal(players.status,200);
  assert.deepEqual((await jsonBody<{players:Array<{id:string;userId:string}>}>(players))
    .players.map(x=>[x.id,x.userId]),[["existing-player","existing-user"]]);

  const replay=await send(db,"/api/auth/passkey/recovery/verify",{
    token,flowId:options.flowId,
    credential:authenticator.registration(options.options.challenge),
  });
  assert.equal(replay.status,409,"recovery grant cannot be consumed twice");
  assert.equal(db.credentials.size,1);

  const logout=await send(db,"/api/auth/logout",undefined,recoveredCookie);
  assert.equal(logout.status,204);
  assert.match(logout.headers.get("set-cookie")??"","Max-Age=0");
  const loggedOut=await send(db,"/api/auth/me",undefined,undefined,"GET");
  assert.equal(loggedOut.status,401);
  const loginStart=await send(db,"/api/auth/passkey/login/options",{});
  assert.equal(loginStart.status,200);
  const loginOptions=await jsonBody<Options>(loginStart);
  const login=await send(db,"/api/auth/passkey/login/verify",{
    flowId:loginOptions.flowId,
    credential:await authenticator.assertion(loginOptions.options.challenge),
  });
  assert.equal(login.status,200,"passkey must authenticate without LINE");
  const loginCookie=cookieFrom(login);
  assert.equal(cookieUser(loginCookie),"existing-user");
  const loggedIn=await send(db,"/api/auth/me",undefined,loginCookie,"GET");
  assert.equal(loggedIn.status,200);
  assert.equal((await jsonBody<{user:{id:string}}>(loggedIn)).user.id,"existing-user");
  assert.equal(db.credentials.get(authenticator.credId)?.signCount,1);
  assert.deepEqual([...db.users.keys()],before.users);
  assert.deepEqual(db.linkedPlayer,before.player);
  assert.deepEqual(db.group,before.group);
  assert.deepEqual([...db.memberships],before.members);
  assert.deepEqual(db.scores,before.scores);
  assert.deepEqual(db.lineIdentities,before.line);
  assert.equal(db.writes.some(sql=>/UPDATE (users|players|group_players|groups|game_results|games|sessions|external_identities)/.test(sql)),false);
});
