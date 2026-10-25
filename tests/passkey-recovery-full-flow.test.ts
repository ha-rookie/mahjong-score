import test from "node:test";
import assert from "node:assert/strict";
import type {RegistrationResponseJSON,AuthenticationResponseJSON} from "@simplewebauthn/server";
import {createPasskeyRecoveryGrant,beginExistingUserRecovery,finishExistingUserRecovery} from "../src/worker/auth/passkey-recovery";
import {beginPasskeyLogin,finishPasskeyLogin,PASSKEY_ORIGIN,PASSKEY_RP_ID} from "../src/worker/auth/passkey-line-free";

const enc=new TextEncoder(),b64=(v:Uint8Array)=>Buffer.from(v).toString("base64url");
const bytes=(s:string)=>new Uint8Array(Buffer.from(s,"base64url"));
const concat=(...v:Uint8Array[])=>{const b=new Uint8Array(v.reduce((n,x)=>n+x.length,0));let p=0;for(const x of v){b.set(x,p);p+=x.length;}return b;};
const digest=async(v:Uint8Array)=>new Uint8Array(await crypto.subtle.digest("SHA-256",Uint8Array.from(v)));
const cbor=(v:unknown):Uint8Array=>{
  const head=(m:number,n:number)=>n<24?Uint8Array.of(m*32+n):n<256?Uint8Array.of(m*32+24,n):Uint8Array.of(m*32+25,n>>8,n&255);
  if(typeof v==="number")return v>=0?head(0,v):head(1,-v-1);
  if(typeof v==="string"){const x=enc.encode(v);return concat(head(3,x.length),x);}
  if(v instanceof Uint8Array)return concat(head(2,v.length),v);
  if(v instanceof Map)return concat(head(5,v.size),...[...v].flatMap(([k,x])=>[cbor(k),cbor(x)]));
  throw Error("Unsupported CBOR fixture");
};
const count=(n:number)=>Uint8Array.of(n>>>24,n>>>16&255,n>>>8&255,n);
const makeAuthenticator=async()=>{
  const pair=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
  const jwk=await crypto.subtle.exportKey("jwk",pair.publicKey);
  const cose=cbor(new Map<number,unknown>([[1,2],[3,-7],[-1,1],[-2,bytes(jwk.x!)],[-3,bytes(jwk.y!)]]));
  const id=bytes("AQIDBAUGBwgJCgsMDQ4PEA"),identity=b64(id);
  const rp=await digest(enc.encode(PASSKEY_RP_ID));
  const authData=concat(rp,Uint8Array.of(0x45),count(0),new Uint8Array(16),Uint8Array.of(0,id.length),id,cose);
  const attestation=cbor(new Map<string,unknown>([["fmt","none"],["attStmt",new Map()],["authData",authData]]));
  return{
    identity,
    registration:(challenge:string,origin=PASSKEY_ORIGIN):RegistrationResponseJSON=>({
      id:identity,rawId:identity,type:"public-key",clientExtensionResults:{},
      response:{clientDataJSON:b64(enc.encode(JSON.stringify({type:"webauthn.create",challenge,origin,crossOrigin:false}))),
        attestationObject:b64(attestation)},
    }) as RegistrationResponseJSON,
    authentication:async(challenge:string):Promise<AuthenticationResponseJSON>=>{
      const auth=concat(rp,Uint8Array.of(0x05),count(1));
      const client=enc.encode(JSON.stringify({type:"webauthn.get",challenge,origin:PASSKEY_ORIGIN,crossOrigin:false}));
      const sig=new Uint8Array(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},pair.privateKey,
        concat(auth,await digest(client))));
      const trim=(v:Uint8Array)=>{let i=0;while(i<v.length-1&&v[i]===0)i++;const a=v.slice(i);return a[0]&128?concat(Uint8Array.of(0),a):a;};
      const a=trim(sig.slice(0,32)),b=trim(sig.slice(32));
      const der=concat(Uint8Array.of(0x30,4+a.length+b.length,2,a.length),a,Uint8Array.of(2,b.length),b);
      return {id:identity,rawId:identity,type:"public-key",clientExtensionResults:{},
        response:{clientDataJSON:b64(client),authenticatorData:b64(auth),signature:b64(der),userHandle:null}} as unknown as AuthenticationResponseJSON;
    },
  };
};
type Challenge={hash:string;purpose:string;userId:string|null;invitationId:string|null;origin:string;rpId:string;expires:string;consumed:string|null};
type Grant={id:string;hash:string;userId:string;groupId:string;playerId:string;expires:string;used:string|null;revoked:string|null};
class D1Fixture{
  users=["admin","existing-user"];players=["existing-player"];groups=["existing-group"];
  scores=["game-1:existing-player:42000","game-2:existing-player:-16000"];
  link="existing-user";grants=new Map<string,Grant>();challenges=new Map<string,Challenge>();
  credentials=new Map<string,{id:string;userId:string;publicKey:Uint8Array;counter:number}>();
  prepare(sql:string){
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const db=this;let a:unknown[]=[];
    return{
      bind(...args:unknown[]){a=args;return this;},
      async first<T>():Promise<T|null>{
        if(sql.includes("FROM users WHERE id=? AND system_role='admin'"))return a[0]==="admin"?{id:"admin"} as T:null;
        if(sql.startsWith("SELECT gp.user_id AS userId"))return a[0]==="existing-group"&&a[1]==="existing-player"&&a[2]===db.link?{userId:db.link} as T:null;
        if(sql.startsWith("SELECT id FROM passkey_recovery_grants"))return db.grants.has(String(a[0]))?{id:a[0]} as T:null;
        if(sql.startsWith("SELECT r.id,r.user_id AS userId")){
          const g=[...db.grants.values()].find(x=>x.hash===a[0]&&!x.used&&!x.revoked&&x.expires>String(a[1])&&x.userId===db.link);
          return g?{id:g.id,userId:g.userId,groupId:g.groupId,playerId:g.playerId,groupName:"Old group",playerName:"Old player",expiresAt:g.expires} as T:null;
        }
        if(sql.startsWith("SELECT challenge_hash AS")){
          const c=db.challenges.get(String(a[0]));
          return c&&c.purpose===a[1]&&c.userId===a[2]&&c.invitationId===a[3]&&c.origin===a[4]&&c.rpId===a[5]&&!c.consumed&&c.expires>String(a[6])?
            {challengeHash:c.hash,expectedOrigin:c.origin,rpId:c.rpId} as T:null;
        }
        if(sql.startsWith("UPDATE auth_challenges SET consumed_at")){
          const c=db.challenges.get(String(a[1]));
          if(!c||c.hash!==a[2]||c.purpose!==a[3]||c.userId!==a[4]||c.invitationId!==a[5]||c.origin!==a[6]||c.rpId!==a[7]||c.consumed||c.expires<=String(a[8]))return null;
          c.consumed=String(a[0]);return{id:a[1]} as T;
        }
        if(sql.startsWith("SELECT c.id,c.user_id AS userId")){
          const c=db.credentials.get(String(a[0]));return c?{id:c.id,userId:c.userId,credentialId:a[0],publicKey:c.publicKey,signCount:c.counter,transports:null,deviceType:"multiDevice",backedUp:0} as T:null;
        }
        throw Error("Unexpected query "+sql.slice(0,70));
      },
      async all<T>():Promise<{results:T[]}>{
        if(sql.startsWith("SELECT credential_id"))return{results:[]};
        throw Error("Unexpected list");
      },
      async run(){
        if(sql.startsWith("INSERT INTO auth_challenges")){
          db.challenges.set(String(a[0]),{hash:String(a[1]),purpose:String(a[2]),userId:a[3] as string|null,
            invitationId:a[4] as string|null,origin:String(a[5]),rpId:String(a[6]),expires:String(a[8]),consumed:null});
          return{meta:{changes:1}};
        }
        if(sql.startsWith("UPDATE passkey_credentials SET sign_count")){
          const c=db.credentials.get(String(a[4]));
          if(!c||c.id!==a[2]||c.userId!==a[3]||c.counter!==a[5])return{meta:{changes:0}};
          c.counter=Number(a[0]);return{meta:{changes:1}};
        }
        throw Error("Unexpected run "+sql.slice(0,70));
      },
      statement:{sql,args:()=>a},
    };
  }
  async batch(stmts:Array<{statement:{sql:string;args:()=>unknown[]}}>) {
    const result=[];
    for(const stmt of stmts){
      const sql=stmt.statement.sql,a=stmt.statement.args();
      if(sql.startsWith("UPDATE passkey_recovery_grants SET revoked_at")){
        let n=0;for(const g of this.grants.values())if(g.userId===a[1]&&!g.used&&!g.revoked){g.revoked=String(a[0]);n++;}
        result.push({meta:{changes:n}});
      }else if(sql.startsWith("INSERT INTO passkey_recovery_grants")){
        this.grants.set(String(a[0]),{id:String(a[0]),hash:String(a[1]),userId:String(a[2]),
          groupId:String(a[3]),playerId:String(a[4]),expires:String(a[7]),used:null,revoked:null});
        result.push({meta:{changes:1}});
      }else if(sql.startsWith("UPDATE passkey_recovery_grants SET used_at")){
        const g=this.grants.get(String(a[1]));
        if(g&&g.hash===a[2]&&g.userId===a[3]&&!g.used&&!g.revoked&&g.expires>String(a[4])&&g.userId===this.link){
          g.used=String(a[0]);result.push({meta:{changes:1}});
        }else result.push({meta:{changes:0}});
      }else if(sql.startsWith("INSERT INTO passkey_credentials")){
        const g=[...this.grants.values()].find(x=>x.id===a[4]);
        if(!g?.used||g.hash!==a[5]||g.userId!==a[6]||g.used!==a[7]||this.credentials.has(String(a[2])))
          throw Error("Recovery credential atomic guard failed");
        this.credentials.set(String(a[2]),{id:String(a[0]),userId:String(a[1]),
          publicKey:a[3] as Uint8Array,counter:Number(a[8])});
        result.push({meta:{changes:1}});
      }else throw Error("Unexpected batch "+sql.slice(0,70));
    }
    return result;
  }
}
test("admin-issued recovery -> real P-256 passkey registration -> signature login: SAME User/Player/Group/Score",async()=>{
  const fake=new D1Fixture(),db=fake as unknown as D1Database,auth=await makeAuthenticator();
  const original={users:[...fake.users],players:[...fake.players],groups:[...fake.groups],scores:[...fake.scores],link:fake.link};
  const grant=await createPasskeyRecoveryGrant(db,"admin","existing-group","existing-player","existing-user");
  const options=await beginExistingUserRecovery(db,grant.token);
  const saved=await finishExistingUserRecovery(db,grant.token,options.flowId,auth.registration(options.options.challenge));
  assert.deepEqual(saved,{userId:"existing-user",groupId:"existing-group",playerId:"existing-player"});
  assert.equal(fake.credentials.get(auth.identity)?.userId,"existing-user");
  const login=await beginPasskeyLogin(db);
  const logged=await finishPasskeyLogin(db,login.flowId,await auth.authentication(login.options.challenge));
  assert.equal(logged.userId,"existing-user");
  assert.equal(fake.credentials.get(auth.identity)?.counter,1);
  await assert.rejects(finishPasskeyLogin(db,login.flowId,await auth.authentication(login.options.challenge)),/already used|challenge missing/i);
  await assert.rejects(beginExistingUserRecovery(db,grant.token),/invalid|expired/i);
  assert.deepEqual({users:fake.users,players:fake.players,groups:fake.groups,scores:fake.scores,link:fake.link},original);
});
test("recovery refuses wrong WebAuthn origin and does not grant credential or alter existing Score",async()=>{
  const fake=new D1Fixture(),db=fake as unknown as D1Database,auth=await makeAuthenticator();
  const grant=await createPasskeyRecoveryGrant(db,"admin","existing-group","existing-player","existing-user");
  const options=await beginExistingUserRecovery(db,grant.token);
  await assert.rejects(finishExistingUserRecovery(db,grant.token,options.flowId,
    auth.registration(options.options.challenge,"https://attacker.example")),/origin|unexpected/i);
  assert.equal(fake.credentials.size,0);
  assert.deepEqual(fake.scores,["game-1:existing-player:42000","game-2:existing-player:-16000"]);
});
