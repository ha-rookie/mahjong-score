import test from "node:test";
import assert from "node:assert/strict";
import { redeemInvitationById } from "../src/worker/auth/line-login";

class Statement {
  values: unknown[]=[];
  constructor(readonly db: FakeDb, readonly sql:string){}
  bind(...values:unknown[]){this.values=values;return this;}
  async first<T>():Promise<T|null>{
    if(this.sql.includes("FROM invitations WHERE id=?")){
      if(this.db.invite.used)return null;
      return {id:"inv1",groupId:"g1",playerId:"p1",expiresAt:"2099-01-01T00:00:00Z"} as T;
    }
    if(this.sql.includes("FROM group_players WHERE group_id=? AND user_id=?")){
      const userId=String(this.values[1]);
      return this.db.targetUserId===userId?{playerId:"p1"} as T:null;
    }
    if(this.sql.includes("SELECT active,user_id AS userId FROM group_players")){
      return {active:1,userId:this.db.targetUserId} as T;
    }
    return null;
  }
}
class FakeDb {
  invite={used:false,usedBy:null as string|null};
  targetUserId:string|null=null;
  memberships=new Map<string,"group_admin"|"member">();
  constructor(private raceBeforeBatch=false){}
  prepare(sql:string){return new Statement(this,sql);}
  async batch(statements:Statement[]){
    if(this.raceBeforeBatch){
      this.invite.used=true;this.invite.usedBy="winner";this.targetUserId="winner";
    }
    return statements.map(stmt=>{
      let changes=0;
      if(stmt.sql.startsWith("UPDATE group_players SET user_id=")){
        const userId=String(stmt.values[0]);
        if(!this.invite.used&&(this.targetUserId===null||this.targetUserId===userId)){this.targetUserId=userId;changes=1;}
      }else if(stmt.sql.startsWith("INSERT INTO group_memberships")){
        const userId=String(stmt.values[1]);
        const conditional=stmt.sql.includes(" SELECT ");
        if(!conditional||(this.targetUserId===userId&&!this.invite.used)){
          const current=this.memberships.get(userId);
          this.memberships.set(userId,current==="group_admin"?"group_admin":"member");changes=1;
        }
      }else if(stmt.sql.startsWith("UPDATE invitations SET used_at=")){
        const userId=String(stmt.values[1]);
        if(!this.invite.used&&this.targetUserId===userId){this.invite.used=true;this.invite.usedBy=userId;changes=1;}
      }
      return {meta:{changes}};
    });
  }
}

const env=(db:FakeDb)=>({DB:db as unknown as D1Database});

test("invitation race does not grant membership to losing user",async()=>{
  const db=new FakeDb(true);
  const result=await redeemInvitationById(env(db),"inv1","loser");
  assert.equal(result,"conflict");
  assert.equal(db.memberships.has("loser"),false);
  assert.equal(db.targetUserId,"winner");
});

test("successful invitation redemption preserves existing group_admin role",async()=>{
  const db=new FakeDb();
  db.memberships.set("admin","group_admin");
  const result=await redeemInvitationById(env(db),"inv1","admin");
  assert.equal(result,"accepted");
  assert.equal(db.memberships.get("admin"),"group_admin");
  assert.equal(db.targetUserId,"admin");
  assert.equal(db.invite.usedBy,"admin");
});
