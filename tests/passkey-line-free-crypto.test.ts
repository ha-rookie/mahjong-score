import test from "node:test";
import assert from "node:assert/strict";
import {
  beginInvitePasskey,finishInvitePasskey,
  beginPasskeyLogin,finishPasskeyLogin,
} from "../src/worker/auth/passkey-line-free";
import { buildAuthenticator } from "./support/passkey-test-authenticator";

type Challenge={id:string;hash:string;purpose:string;userId:string|null;
  invitationId:string|null;origin:string;rpId:string;expires:string;consumed:string|null};
type Credential={id:string;userId:string;credentialId:string;publicKey:Uint8Array;
  signCount:number;revoked:boolean};
class FakeD1{
  invite={id:"invite-existing",groupId:"g",playerId:"p",usedAt:null as string|null,
    usedBy:null as string|null,revoked:false};
  targetUser:string|null=null;
  memberUser:string|null=null;
  users=new Set(["admin"]);
  scores=["p:1999:100","p:1999:-100"];
  challenges=new Map<string,Challenge>();
  credentials=new Map<string,Credential>();
  batchInvocations=0;
  prepare(sql:string){
    let args:unknown[]=[];
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const db=this;
    return {
      bind(...v:unknown[]){args=v;return this;},
      async first<T>():Promise<T|null>{
        if(sql.startsWith("SELECT i.id,i.group_id AS groupId")){
          return db.invite.usedAt===null&&!db.invite.revoked&&db.targetUser===null?
            {id:db.invite.id,groupId:"g",playerId:"p",playerName:"既存Player",groupName:"昔からのグループ",expiresAt:"2099-01-01T00:00:00.000Z"} as T:null;
        }
        if(sql.startsWith("SELECT challenge_hash AS")){
          const c=db.challenges.get(String(args[0]));
          return c&&c.purpose===args[1]&&c.userId===args[2]&&c.invitationId===args[3]&&
            c.origin===args[4]&&c.rpId===args[5]&&c.consumed===null&&c.expires>String(args[6])?
              {challengeHash:c.hash,expectedOrigin:c.origin,rpId:c.rpId} as T:null;
        }
        if(sql.startsWith("UPDATE auth_challenges SET consumed_at")){
          const c=db.challenges.get(String(args[1]));
          if(!c||c.hash!==args[2]||c.purpose!==args[3]||c.userId!==args[4]||
             c.invitationId!==args[5]||c.origin!==args[6]||c.rpId!==args[7]||
             c.consumed!==null||c.expires<=String(args[8]))return null;
          c.consumed=String(args[0]);return{id:c.id} as T;
        }
        if(sql.startsWith("SELECT c.id,c.user_id AS userId")){
          const c=db.credentials.get(String(args[0]));
          return c&&!c.revoked?{id:c.id,userId:c.userId,credentialId:c.credentialId,
            publicKey:c.publicKey,signCount:c.signCount,transports:null,
            deviceType:"multiDevice",backedUp:1} as T:null;
        }
        throw new Error("unexpected query: "+sql.slice(0,38));
      },
      async run(){
        if(sql.startsWith("INSERT INTO auth_challenges")){
          const [id,challengeHash,purpose,userId,invitationId,origin,rpId,,expires]=args;
          db.challenges.set(String(id),{id:String(id),hash:String(challengeHash),purpose:String(purpose),
            userId:userId as string|null,invitationId:invitationId as string|null,
            origin:String(origin),rpId:String(rpId),expires:String(expires),consumed:null});
          return {meta:{changes:1}};
        }
        if(sql.startsWith("UPDATE passkey_credentials SET sign_count")){
          const [next,,id,userId,credentialId,old]=args;
          const c=db.credentials.get(String(credentialId));
          if(!c||c.revoked||c.id!==id||c.userId!==userId||c.signCount!==old)
            return{meta:{changes:0}};
          c.signCount=Number(next);return {meta:{changes:1}};
        }
        throw new Error("Unexpected write");
      },
      _stmt:{sql,args:()=>args},
    };
  }
  async batch(stmts:Array<{_stmt:{sql:string;args:()=>unknown[]}}>):Promise<Array<{meta:{changes:number}}>>{
    this.batchInvocations++;
    const backup={target:this.targetUser,member:this.memberUser,
      usedAt:this.invite.usedAt,usedBy:this.invite.usedBy,users:new Set(this.users)};
    const result:Array<{meta:{changes:number}}>=[];
    try{
      for(const statement of stmts){
        const sql=statement._stmt.sql,values=statement._stmt.args();
        if(sql.startsWith("INSERT INTO users")){
          const userId=String(values[0]);if(this.users.has(userId))throw new Error("Duplicate User");
          this.users.add(userId);result.push({meta:{changes:1}});
        }else if(sql.startsWith("UPDATE group_players")){
          if(this.targetUser!==null||this.invite.usedAt!==null||this.invite.revoked){result.push({meta:{changes:0}});continue;}
          this.targetUser=String(values[0]);result.push({meta:{changes:1}});
        }else if(sql.startsWith("INSERT INTO group_memberships")){
          if(!this.targetUser){result.push({meta:{changes:0}});continue;}
          this.memberUser=String(values[1]);result.push({meta:{changes:1}});
        }else if(sql.startsWith("UPDATE invitations SET used_at")){
          if(this.invite.usedAt!==null||this.targetUser!==values[1]){
            result.push({meta:{changes:0}});continue;
          }
          this.invite.usedAt=String(values[0]);this.invite.usedBy=String(values[1]);
          result.push({meta:{changes:1}});
        }else if(sql.startsWith("INSERT INTO passkey_credentials")){
          const id=String(values[2]),userId=String(values[1]);
          if(!this.invite.usedAt||this.invite.usedBy!==userId||
             this.memberUser!==userId||this.targetUser!==userId||
             this.credentials.has(id))throw new Error("Atomic enrollment guard violation");
          this.credentials.set(id,{id:String(values[0]),userId,credentialId:id,
            publicKey:values[3] as Uint8Array,signCount:Number(values[13]),revoked:false});
          result.push({meta:{changes:1}});
        }else throw new Error("unknown batch SQL");
      }
    }catch(e){
      this.targetUser=backup.target;this.memberUser=backup.member;
      this.invite.usedAt=backup.usedAt;this.invite.usedBy=backup.usedBy;
      this.users=backup.users;throw e;
    }
    return result;
  }
}
const fixture=()=>new FakeD1() as FakeD1;
test("P0 real P-256 WebAuthn registration and signature login preserve existing Player/Score",async()=>{
  const fake=fixture(),db=fake as unknown as D1Database,auth=await buildAuthenticator();
  const registration=await beginInvitePasskey(db,"A".repeat(43));
  const created=await finishInvitePasskey(db,"A".repeat(43),registration.flowId,
    auth.create(registration.options.challenge));
  assert.equal(created.playerId,"p");
  assert.equal(created.groupId,"g");
  assert.equal(fake.targetUser,created.userId);
  assert.equal(fake.memberUser,created.userId);
  assert.equal(fake.invite.usedBy,created.userId);
  assert.deepEqual(fake.scores,["p:1999:100","p:1999:-100"]);
  assert.equal(fake.credentials.get(auth.identity)?.userId,created.userId);
  const login=await beginPasskeyLogin(db);
  const session=await finishPasskeyLogin(db,login.flowId,
    await auth.authenticate(login.options.challenge));
  assert.equal(session.userId,created.userId);
  assert.equal(fake.credentials.get(auth.identity)?.signCount,1);
  await assert.rejects(finishPasskeyLogin(db,login.flowId,
    await auth.authenticate(login.options.challenge)),/already used|challenge missing/i);
  await assert.rejects(beginInvitePasskey(db,"A".repeat(43)),/invalid|linked|expired/i);
  assert.deepEqual(fake.scores,["p:1999:100","p:1999:-100"]);
});
