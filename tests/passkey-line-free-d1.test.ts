import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

test("P0 local D1: unclaimed existing Player and score remain intact; invalid enrollment cannot save a key",{
  timeout:120000,
},()=>{
  const persist=mkdtempSync(join(tmpdir(),"sanma-linefree-d1-"));
  const npx=process.platform==="win32"?"npx.cmd":"npx";
  const run=(args:string[])=>execFileSync(npx,["wrangler",...args],{
    cwd:process.cwd(),encoding:"utf8",timeout:70000,stdio:["ignore","pipe","pipe"],maxBuffer:4*1024*1024,
  });
  const sql=(statement:string)=>{
    const raw=run(["d1","execute","DB","--local","--persist-to",persist,"--json","--command",statement]);
    const i=raw.indexOf("[");assert.ok(i>=0,"D1 must emit JSON");
    const rows=JSON.parse(raw.slice(i)) as Array<{success:boolean;results:Array<Record<string,unknown>>}>;
    assert.ok(rows.every(r=>r.success));return rows.flatMap(r=>r.results);
  };
  const time="2026-10-24T00:00:00.000Z";
  try{
    run(["d1","migrations","apply","DB","--local","--persist-to",persist]);
    sql(`INSERT INTO groups(id,name,created_at,updated_at) VALUES('g','Existing group','${time}','${time}')`);
    sql(`INSERT INTO users(id,display_name,created_at,updated_at) VALUES('admin','Existing admin','${time}','${time}')`);
    sql(`INSERT INTO group_memberships(group_id,user_id,role,created_at,updated_at) VALUES('g','admin','group_admin','${time}','${time}')`);
    for(const name of ["p","q","r"]){
      sql(`INSERT INTO players(id,display_name,created_at,updated_at) VALUES('${name}','Existing ${name}','${time}','${time}')`);
      sql(`INSERT INTO group_players(group_id,player_id) VALUES('g','${name}')`);
    }
    sql(`INSERT INTO sessions(id,group_id,session_date,started_at,status,created_at,updated_at) VALUES('s','g','2026-10-24','${time}','finalized','${time}','${time}')`);
    sql("INSERT INTO participant_segments(id,session_id,sequence) VALUES('seg','s',1)");
    for(const [p,seat] of [["p",1],["q",2],["r",3]] as const)
      sql(`INSERT INTO segment_players(segment_id,player_id,seat_order) VALUES('seg','${p}',${seat})`);
    sql(`INSERT INTO games(id,session_id,segment_id,sequence,played_at) VALUES('game','s','seg',1,'${time}')`);
    for(const [p,rank,score] of [["p",1,100],["q",2,0],["r",3,-100]] as const){
      sql(`INSERT INTO game_results(game_id,player_id,rank,score_point,placement,is_last) VALUES('game','${p}',${rank},${score},${rank},${rank===3?1:0})`);
    }
    const fingerprint=sql("SELECT game_id,player_id,rank,score_point,placement,is_last FROM game_results ORDER BY player_id");
    sql(`INSERT INTO invitations(id,token_hash,group_id,player_id,created_by_user_id,expires_at,created_at) VALUES('inv','hash','g','p','admin','2099-01-01T00:00:00.000Z','${time}')`);
    // This is the final SQL guard used in the D1.batch() registration
    // transaction. sign_count=-1 violates the existing S1 CHECK constraint.
    const guardedInsert=(user:string)=>`INSERT INTO passkey_credentials(id,user_id,credential_id,public_key,sign_count,transports,device_type,backed_up,created_at) VALUES('pk','${user}','AQID',X'A1010203',CASE WHEN EXISTS(SELECT 1 FROM invitations WHERE id='inv' AND token_hash='hash' AND used_by_user_id='${user}' AND used_at='${time}' AND revoked_at IS NULL) AND EXISTS(SELECT 1 FROM group_players WHERE group_id='g' AND player_id='p' AND user_id='${user}' AND active=1) AND EXISTS(SELECT 1 FROM group_memberships WHERE group_id='g' AND user_id='${user}' AND role='member') THEN 0 ELSE -1 END,'[]','multiDevice',1,'${time}')`;
    sql(`INSERT INTO users(id,display_name,created_at,updated_at) VALUES('new','Existing p','${time}','${time}')`);
    assert.throws(()=>sql(guardedInsert("new")),"credential insert must fail before linking");
    assert.equal(sql("SELECT count(*) AS n FROM passkey_credentials")[0]?.n,0);
    assert.equal(sql("SELECT user_id AS userId FROM group_players WHERE group_id='g' AND player_id='p'")[0]?.userId,null);
    // Simulate the order of the server's atomic D1.batch() write.
    assert.equal(sql("UPDATE group_players SET user_id='new' WHERE group_id='g' AND player_id='p' AND active=1 AND user_id IS NULL AND EXISTS(SELECT 1 FROM invitations WHERE id='inv' AND token_hash='hash' AND used_at IS NULL AND revoked_at IS NULL AND expires_at>'2026-10-24')").length,0);
    sql(`INSERT INTO group_memberships(group_id,user_id,role,created_at,updated_at) SELECT 'g','new','member','${time}','${time}' WHERE EXISTS(SELECT 1 FROM group_players WHERE group_id='g' AND player_id='p' AND active=1 AND user_id='new')`);
    sql(`UPDATE invitations SET used_at='${time}',used_by_user_id='new' WHERE id='inv' AND token_hash='hash' AND used_at IS NULL AND revoked_at IS NULL AND expires_at>'2026-10-24' AND EXISTS(SELECT 1 FROM group_players WHERE group_id='g' AND player_id='p' AND user_id='new' AND active=1)`);
    sql(guardedInsert("new"));
    assert.deepEqual(sql("SELECT user_id AS userId FROM group_players WHERE group_id='g' AND player_id='p'"),[{userId:"new"}]);
    assert.deepEqual(sql("SELECT user_id AS userId FROM passkey_credentials WHERE credential_id='AQID'"),[{userId:"new"}]);
    assert.deepEqual(sql("SELECT used_by_user_id AS userId FROM invitations WHERE id='inv'"),[{userId:"new"}]);
    assert.equal(sql("SELECT count(*) AS n FROM group_memberships WHERE group_id='g' AND user_id='new'")[0]?.n,1);
    assert.equal(sql("UPDATE group_players SET user_id='another' WHERE group_id='g' AND player_id='p' AND user_id IS NULL").length,0);
    assert.throws(()=>sql("INSERT INTO passkey_credentials(id,user_id,credential_id,public_key,created_at) VALUES('pk2','admin','AQID',X'A101','2026-10-24')"));
    assert.deepEqual(sql("SELECT game_id,player_id,rank,score_point,placement,is_last FROM game_results ORDER BY player_id"),fingerprint);
  }finally{rmSync(persist,{recursive:true,force:true});}
});
