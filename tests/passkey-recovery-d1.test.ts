import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

test("P0 local D1 recovery: same existing User and Player, Score intact, one-time credential grant",{
  timeout:120000,
},()=>{
  const persist=mkdtempSync(join(tmpdir(),"sanma-existing-user-recovery-"));
  const npx=process.platform==="win32"?"npx.cmd":"npx";
  const command=(args:string[])=>execFileSync(npx,["wrangler",...args],{
    encoding:"utf8",timeout:70000,maxBuffer:4*1024*1024,
    stdio:["ignore","pipe","pipe"],
  });
  const sql=(statement:string)=>{
    const raw=command(["d1","execute","DB","--local","--persist-to",persist,"--json","--command",statement]);
    const start=raw.indexOf("[");
    assert.ok(start>=0,raw);
    const blocks=JSON.parse(raw.slice(start)) as Array<{success:boolean;results:Array<Record<string,unknown>>}>;
    assert.ok(blocks.every(x=>x.success),"D1 statement failed");
    return blocks.flatMap(x=>x.results);
  };
  const t="2026-10-24T00:00:00.000Z";
  const grant="2026-10-24T00:00:01.000Z";
  const valid="2026-10-24T00:00:02.000Z";
  const expectedUser="old-user",group="g",player="p";
  const recoveryUpdate=(usedAt:string)=>`UPDATE passkey_recovery_grants SET used_at='${usedAt}' WHERE id='recovery' AND token_hash='grant-token-hash' AND user_id='old-user' AND used_at IS NULL AND revoked_at IS NULL AND expires_at>'2026-10-24T00:00:00.000Z' AND EXISTS(SELECT 1 FROM group_players gp JOIN group_memberships gm ON gm.user_id=gp.user_id AND gm.group_id=gp.group_id JOIN users u ON u.id=gp.user_id WHERE gp.group_id='g' AND gp.player_id='p' AND gp.user_id='old-user' AND gp.active=1 AND u.system_role='user')`;
  const credentialInsert=(id:string,at:string)=>`INSERT INTO passkey_credentials(id,user_id,credential_id,public_key,sign_count,transports,device_type,backed_up,created_at) VALUES('${id}','old-user','${id}',X'A10102',CASE WHEN changes()=1 AND EXISTS(SELECT 1 FROM passkey_recovery_grants r JOIN group_players gp ON gp.group_id=r.group_id AND gp.player_id=r.player_id WHERE r.id='recovery' AND r.token_hash='grant-token-hash' AND r.user_id='old-user' AND r.used_at='${at}' AND r.revoked_at IS NULL AND gp.user_id=r.user_id AND gp.active=1) THEN 0 ELSE -1 END,'[]','multiDevice',1,'${at}')`;
  try{
    command(["d1","migrations","apply","DB","--local","--persist-to",persist]);
    sql(`INSERT INTO groups(id,name,created_at,updated_at) VALUES('${group}','Established group','${t}','${t}')`);
    sql(`INSERT INTO users(id,display_name,system_role,created_at,updated_at) VALUES('admin','Admin','admin','${t}','${t}'),('${expectedUser}','Linked friend','user','${t}','${t}')`);
    sql(`INSERT INTO players(id,display_name,created_at,updated_at) VALUES('${player}','Linked existing player','${t}','${t}')`);
    sql(`INSERT INTO group_players(group_id,player_id,user_id,active) VALUES('${group}','${player}','${expectedUser}',1)`);
    sql(`INSERT INTO group_memberships(group_id,user_id,role,created_at,updated_at) VALUES('${group}','${expectedUser}','member','${t}','${t}')`);
    sql(`INSERT INTO passkey_recovery_grants(id,token_hash,user_id,group_id,player_id,created_by_user_id,created_at,expires_at) VALUES('recovery','grant-token-hash','${expectedUser}','${group}','${player}','admin','${t}','2099-01-01T00:00:00.000Z')`);
    sql(`INSERT INTO sessions(id,group_id,session_date,started_at,status,created_at,updated_at) VALUES('sess','g','2026-10-24','${t}','finalized','${t}','${t}')`);
    sql("INSERT INTO participant_segments(id,session_id,sequence) VALUES('seg','sess',1)");
    sql("INSERT INTO segment_players(segment_id,player_id,seat_order) VALUES('seg','p',1)");
    sql(`INSERT INTO games(id,session_id,segment_id,sequence,played_at) VALUES('game','sess','seg',1,'${t}')`);
    sql("INSERT INTO game_results(game_id,player_id,rank,score_point,placement,is_last) VALUES('game','p',1,142,1,0)");
    const score=sql("SELECT game_id AS gameId,player_id AS playerId,score_point AS score FROM game_results");
    // The SQL relies on SQLite changes() from the immediately preceding
    // UPDATE. Test both the successful path and replay/second-use denial.
    sql(recoveryUpdate(grant)+";"+credentialInsert("new-key",grant));
    assert.deepEqual(sql("SELECT used_at AS usedAt FROM passkey_recovery_grants WHERE id='recovery'"),[{usedAt:grant}]);
    assert.deepEqual(sql("SELECT user_id AS userId FROM passkey_credentials WHERE id='new-key'"),[{userId:expectedUser}]);
    assert.throws(()=>sql(recoveryUpdate(valid)+";"+credentialInsert("duplicate-key",valid)),
      "reused recovery link must violate credential CHECK");
    assert.equal(sql("SELECT COUNT(*) AS n FROM passkey_credentials")[0]?.n,1);
    assert.deepEqual(sql("SELECT id FROM users ORDER BY id"),[{id:"admin"},{id:"old-user"}]);
    assert.deepEqual(sql("SELECT group_id AS groupId,player_id AS playerId,user_id AS userId FROM group_players"),
      [{groupId:group,playerId:player,userId:expectedUser}]);
    assert.deepEqual(sql("SELECT game_id AS gameId,player_id AS playerId,score_point AS score FROM game_results"),score);
  }finally{rmSync(persist,{recursive:true,force:true});}
});
