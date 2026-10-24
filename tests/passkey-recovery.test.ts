import test from "node:test";
import assert from "node:assert/strict";
import {
  createPasskeyRecoveryGrant,findPasskeyRecoveryGrant,
  beginExistingUserRecovery,finishExistingUserRecovery,
  PASSKEY_RECOVERY_TTL_MS,
} from "../src/worker/auth/passkey-recovery";

const now=new Date("2026-10-24T09:00:00.000Z");
type Grant={id:string;hash:string;userId:string;groupId:string;playerId:string;
  expiresAt:string;usedAt:string|null;revokedAt:string|null};
class FakeD1 {
  grants=new Map<string,Grant>();
  challengeIds:string[]=[];
  oldUserIds=["admin","user-old"];
  linkedUserId:string|null="user-old";
  role:"admin"|"member"="admin";
  scoreFingerprint="1999|old-p|+150";
  writes:string[]=[];
  prepare(sql:string){
    const self=this;
    let args:unknown[]=[];
    return{
      bind(...x:unknown[]){args=x;return this;},
      async first<T>():Promise<T|null>{
        if(sql.includes("FROM users WHERE id=? AND system_role='admin'")){
          return self.role==="admin"&&args[0]==="admin"?{id:"admin"} as T:null;
        }
        if(sql.startsWith("SELECT gp.user_id AS userId")){
          return self.linkedUserId===args[2]&&args[0]==="group-old"&&args[1]==="player-old"?
            {userId:self.linkedUserId} as T:null;
        }
        if(sql.startsWith("SELECT id FROM passkey_recovery_grants")){
          return self.grants.has(String(args[0]))?{id:args[0]} as T:null;
        }
        if(sql.startsWith("SELECT r.id,r.user_id AS userId")){
          const grant=[...self.grants.values()].find(g=>g.hash===args[0]&&
            g.usedAt===null&&g.revokedAt===null&&g.expiresAt>String(args[1])&&
            g.userId===self.linkedUserId);
          return grant?{id:grant.id,userId:grant.userId,groupId:grant.groupId,
            playerId:grant.playerId,groupName:"Existing",playerName:"Existing player",
            expiresAt:grant.expiresAt} as T:null;
        }
        throw new Error("Unexpected select "+sql.slice(0,50));
      },
      async all<T>():Promise<{results:T[]}>{
        if(sql.startsWith("SELECT credential_id"))return{results:[]};
        throw new Error("Unexpected list");
      },
      async run(){
        if(sql.startsWith("INSERT INTO auth_challenges")){
          self.challengeIds.push(String(args[0]));
          return{meta:{changes:1}};
        }
        throw new Error("Unexpected mutation: "+sql.slice(0,80));
      },
      statement:{sql,args:()=>args},
    };
  }
  async batch(statements:Array<{statement:{sql:string;args:()=>unknown[]}}>) {
    const results=[];
    for(const statement of statements){
      const sql=statement.statement.sql,args=statement.statement.args();
      if(sql.startsWith("UPDATE passkey_recovery_grants SET revoked_at")){
        let count=0;
        for(const grant of this.grants.values()){
          if(grant.userId===args[1]&&!grant.revokedAt&&!grant.usedAt){
            grant.revokedAt=String(args[0]);count++;
          }
        }
        results.push({meta:{changes:count}});
      }else if(sql.startsWith("INSERT INTO passkey_recovery_grants")){
        if(this.role!=="admin"||this.linkedUserId!==args[2])throw new Error("Linked User changed");
        this.grants.set(String(args[0]),{
          id:String(args[0]),hash:String(args[1]),userId:String(args[2]),
          groupId:String(args[3]),playerId:String(args[4]),
          expiresAt:String(args[7]),usedAt:null,revokedAt:null,
        });
        results.push({meta:{changes:1}});
      }else throw new Error("Unexpected batch "+sql.slice(0,70));
      this.writes.push(sql);
    }
    return results;
  }
}
const d=(x:FakeD1)=>x as unknown as D1Database;
test("P0 recovery grants preserve existing User, Player and old scores",async()=>{
  const fake=new FakeD1(),before=[...fake.oldUserIds],score=fake.scoreFingerprint;
  const grant=await createPasskeyRecoveryGrant(
    d(fake),"admin","group-old","player-old","user-old",now);
  assert.equal(grant.userId,"user-old");
  assert.equal(grant.expiresAt,new Date(now.getTime()+PASSKEY_RECOVERY_TTL_MS).toISOString());
  const found=await findPasskeyRecoveryGrant(d(fake),grant.token,now);
  assert.equal(found?.userId,"user-old");
  assert.equal(found?.playerId,"player-old");
  assert.equal(found?.groupId,"group-old");
  const begin=await beginExistingUserRecovery(d(fake),grant.token,now);
  assert.equal(begin.groupName,"Existing");
  assert.equal(begin.options.rp.id,"mahjong-score.ha-rookie.workers.dev");
  assert.equal(begin.options.authenticatorSelection?.userVerification,"required");
  assert.equal(fake.challengeIds.length,1);
  assert.deepEqual(fake.oldUserIds,before);
  assert.equal(fake.scoreFingerprint,score);
  assert.ok(fake.writes.every(sql=>/passkey_recovery_grants/.test(sql)));
  await assert.rejects(finishExistingUserRecovery(d(fake),grant.token,"bad",{id:"!"} as never,now));
  assert.equal(fake.scoreFingerprint,score);
});
test("P0 recovery grant cannot be issued by group member or to another linked User",async()=>{
  const fake=new FakeD1();
  fake.role="member";
  await assert.rejects(createPasskeyRecoveryGrant(d(fake),"member","group-old","player-old","user-old",now),
    /System administrator/);
  fake.role="admin";
  await assert.rejects(createPasskeyRecoveryGrant(d(fake),"admin","group-old","player-old","victim",now),
    /Target User\/Player link/);
  fake.linkedUserId=null;
  await assert.rejects(createPasskeyRecoveryGrant(d(fake),"admin","group-old","player-old","user-old",now),
    /Target User\/Player link/);
  assert.equal(fake.grants.size,0);
});
test("P0 issuing a replacement grant revokes old token but not User/Score",async()=>{
  const fake=new FakeD1();
  const a=await createPasskeyRecoveryGrant(d(fake),"admin","group-old","player-old","user-old",now);
  const b=await createPasskeyRecoveryGrant(d(fake),"admin","group-old","player-old","user-old",
    new Date(now.getTime()+1000));
  assert.notEqual(a.token,b.token);
  assert.equal(await findPasskeyRecoveryGrant(d(fake),a.token,new Date(now.getTime()+1000)),null);
  assert.equal((await findPasskeyRecoveryGrant(d(fake),b.token,new Date(now.getTime()+1000)))?.userId,"user-old");
  assert.deepEqual(fake.oldUserIds,["admin","user-old"]);
});
test("P0 expired or malformed recovery token fails closed",async()=>{
  const fake=new FakeD1();
  assert.equal(await findPasskeyRecoveryGrant(d(fake),"bogus",now),null);
  const grant=await createPasskeyRecoveryGrant(d(fake),"admin","group-old","player-old","user-old",now);
  const later=new Date(now.getTime()+PASSKEY_RECOVERY_TTL_MS+1);
  assert.equal(await findPasskeyRecoveryGrant(d(fake),grant.token,later),null);
  await assert.rejects(beginExistingUserRecovery(d(fake),grant.token,later),/invalid or expired/);
});
