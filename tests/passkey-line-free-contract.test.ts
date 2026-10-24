import test from "node:test";
import assert from "node:assert/strict";
import {
  beginInvitePasskey,beginPasskeyLogin,findUnclaimedInvite,
  finishInvitePasskey,finishPasskeyLogin,PASSKEY_RP_ID,
} from "../src/worker/auth/passkey-line-free";
import {handleLineFreePasskey} from "../src/worker/auth/passkey-line-free-http";

const token="A".repeat(43);
const now=new Date();
class FakeDb{
  readonly calls:string[]=[];
  readonly challenges:Array<{id:string;purpose:string;userId:string|null;inviteId:string|null;
    challengeHash:string;origin:string;rpId:string;expires:string}>=[];
  available=true;
  inviteUnclaimed=true;
  batchCalled=false;
  prepare(sql:string){
    this.calls.push(sql);
    let args:unknown[]=[];
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const parent=this;
    return{
      bind(...v:unknown[]){args=v;return this;},
      async first<T>():Promise<T|null>{
        if(sql.startsWith("SELECT i.id,i.group_id AS groupId")){
          return parent.inviteUnclaimed?{id:"inv1",groupId:"g1",playerId:"p1",
            playerName:"友人A",groupName:"週末三麻",expiresAt:"2099-01-01T00:00:00Z"} as T:null;
        }
        if(sql.startsWith("SELECT challenge_hash AS")){
          const row=parent.challenges.find(c=>c.id===args[0]&&c.purpose===args[1]&&
            c.userId===args[2]&&c.inviteId===args[3]&&c.origin===args[4]&&
            c.rpId===args[5]&&c.expires>String(args[6]));
          return row?{challengeHash:row.challengeHash,expectedOrigin:row.origin,rpId:row.rpId} as T:null;
        }
        return null;
      },
      async run(){
        if(sql.startsWith("INSERT INTO auth_challenges")){
          const [id,challengeHash,purpose,userId,inviteId,origin,rpId,,expires]=args;
          parent.challenges.push({id:String(id),challengeHash:String(challengeHash),
            purpose:String(purpose),userId:userId as string|null,
            inviteId:inviteId as string|null,origin:String(origin),
            rpId:String(rpId),expires:String(expires)});
          return{meta:{changes:1}};
        }
        throw new Error("Unexpected write");
      },
    };
  }
  async batch(){this.batchCalled=true;throw new Error("Unexpected batch");}
}
const db=(x:FakeDb)=>x as unknown as D1Database;
test("P0 invitation registration starts without LINE or existing User and binds existing Player",async()=>{
  const fake=new FakeDb(),r=await beginInvitePasskey(db(fake),token,now);
  assert.equal(r.playerName,"友人A");
  assert.equal(r.groupName,"週末三麻");
  assert.equal(r.options.rp.id,PASSKEY_RP_ID);
  assert.equal(r.options.authenticatorSelection?.userVerification,"required");
  assert.equal(r.options.authenticatorSelection?.residentKey,"required");
  assert.equal(r.options.challenge.length,43);
  const row=fake.challenges[0];
  assert.equal(row.purpose,"register_invite");
  assert.equal(row.inviteId,"inv1");
  assert.equal(row.userId,null);
  assert.notEqual(row.challengeHash,r.options.challenge);
  assert.equal(fake.batchCalled,false);
  assert.equal(fake.calls.some(x=>x.includes("INSERT INTO users")),false);
});
test("P0 used, linked, expired or malformed invite refuses new passkey creation",async()=>{
  const fake=new FakeDb();
  assert.equal(await findUnclaimedInvite(db(fake),"not-an-invite"),null);
  assert.equal(fake.calls.length,0);
  fake.inviteUnclaimed=false;
  await assert.rejects(beginInvitePasskey(db(fake),token),/Invite invalid/);
  assert.equal(fake.challenges.length,0);
});
test("P0 passkey login offers discoverable credential without a LINE User ID",async()=>{
  const fake=new FakeDb(),r=await beginPasskeyLogin(db(fake),now);
  assert.equal(r.options.rpId,PASSKEY_RP_ID);
  assert.deepEqual(r.options.allowCredentials,[]);
  assert.equal(r.options.userVerification,"required");
  assert.equal(fake.challenges[0].purpose,"login");
  assert.equal(fake.challenges[0].inviteId,null);
  assert.equal(fake.challenges[0].userId,null);
});
test("P0 invalid verification cannot create User, link Player or touch Score",async()=>{
  const fake=new FakeDb();
  await assert.rejects(finishInvitePasskey(db(fake),token,"bad",{id:"!"} as never));
  await assert.rejects(finishPasskeyLogin(db(fake),"bad",{id:"!"} as never));
  assert.equal(fake.batchCalled,false);
  assert.equal(fake.calls.some(s=>/INSERT INTO users|UPDATE group_players|game_results/.test(s)),false);
});
test("P0 anonymous passkey API is same-origin POST, never needs LINE",async()=>{
  const fake=new FakeDb(),env={DB:db(fake),AUTH_SESSION_SECRET:"unused-test-secret"};
  const post=(url:string,origin:string,body:unknown,method="POST")=>
    handleLineFreePasskey(new Request(url,{method,headers:{
      origin,"content-type":"application/json",
    },...(method==="POST"?{body:JSON.stringify(body)}:{})}),env);
  const base="https://mahjong-score.ha-rookie.workers.dev";
  assert.equal((await post(base+"/api/auth/passkey/invite/options","https://evil.example",{token}))?.status,403);
  assert.equal((await post(base+"/api/auth/passkey/login/options",base,{}, "GET"))?.status,405);
  assert.equal((await post(base+"/api/auth/passkey/login/options",base,{}))?.status,200);
  const start=await post(base+"/api/auth/passkey/invite/options",base,{token});
  assert.equal(start?.status,200);
  const parsed=await start!.json() as {playerName:string;flowId:string};
  assert.equal(parsed.playerName,"友人A");
  assert.ok(parsed.flowId);
  assert.equal((await post(base+"/api/auth/passkey/invite/verify",base,{token,flowId:"a"}))?.status,400);
  assert.equal(fake.batchCalled,false);
});
