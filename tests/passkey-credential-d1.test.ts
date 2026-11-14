import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("S2-B isolated local D1 stores public-key BLOB and forbids revoked Credential ID reassignment", { timeout: 120_000 }, () => {
  const persist=mkdtempSync(join(tmpdir(),"mahjong-s2b-credential-"));
  const command=(sql:string) => execFileSync(
    process.platform==="win32"?"npx.cmd":"npx",
    ["wrangler","d1","execute","DB","--local","--persist-to",persist,"--json","--command",sql],
    {encoding:"utf8",timeout:70_000,maxBuffer:4*1024*1024,stdio:["ignore","pipe","pipe"]},
  );
  const get=(sql:string) => {
    const raw=command(sql),i=raw.indexOf("[");
    assert.ok(i>=0,"Local D1 must return JSON");
    const items=JSON.parse(raw.slice(i)) as Array<{success:boolean;results:Record<string,unknown>[]}>;
    assert.ok(items.every(x=>x.success),"Local D1 statement failed");
    return items.flatMap(x=>x.results);
  };
  try{
    execFileSync(process.platform==="win32"?"npx.cmd":"npx",
      ["wrangler","d1","migrations","apply","DB","--local","--persist-to",persist],
      {encoding:"utf8",timeout:70_000,stdio:["ignore","pipe","pipe"]});
    for(const id of ["user1","user2"])get(
      `INSERT INTO users(id,display_name,created_at,updated_at) VALUES('${id}','Test','2026-10-24T00:00:00.000Z','2026-10-24T00:00:00.000Z')`);
    get("INSERT INTO passkey_credentials(id,user_id,credential_id,public_key,sign_count,created_at) VALUES('pk1','user1','AQID',X'A1010203',0,'2026-10-24T00:00:00.000Z')");
    const data=get("SELECT length(public_key) AS keyLen, hex(public_key) AS keyHex,user_id AS userId FROM passkey_credentials WHERE credential_id='AQID'");
    assert.deepEqual(data,[{keyLen:4,keyHex:"A1010203",userId:"user1"}]);
    get("UPDATE passkey_credentials SET revoked_at='2026-10-24T00:00:01.000Z' WHERE id='pk1'");
    assert.throws(()=>get("INSERT INTO passkey_credentials(id,user_id,credential_id,public_key,sign_count,created_at) VALUES('pk2','user2','AQID',X'A1',0,'2026-10-24T00:00:02.000Z')"));
    const count=get("SELECT count(*) AS n FROM passkey_credentials WHERE credential_id='AQID'");
    assert.equal(count[0]?.n,1);
    assert.throws(()=>get("INSERT INTO passkey_credentials(id,user_id,credential_id,public_key,sign_count,created_at) VALUES('pk3','not_existing','AgME',X'A1',0,'2026-10-24T00:00:02.000Z')"));
    assert.equal(get("SELECT count(*) AS n FROM passkey_credentials")[0]?.n,1);
    assert.equal(get("SELECT count(*) AS n FROM game_results")[0]?.n,0);
  }finally{rmSync(persist,{recursive:true,force:true});}
});
