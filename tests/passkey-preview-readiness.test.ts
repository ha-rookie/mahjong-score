import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  PASSKEY_PRODUCTION_ORIGIN,
  PASSKEY_PRODUCTION_RP_ID,
} from "../src/worker/auth/passkey-registration";

test("S2-B local-only deployment gate: Production vs Preview D1 IDs must remain separate",()=>{
  const config=JSON.parse(readFileSync("wrangler.jsonc","utf8")) as {
    name?:string;
    vars?:Record<string,string>;
    d1_databases?:Array<{binding:string;database_name:string;database_id:string;preview_database_id?:string}>;
    previews?:{d1_databases?:Array<{binding:string;database_name:string;database_id:string}>};
  };
  assert.equal(config.name,"mahjong-score");
  const prod=config.d1_databases?.find(d=>d.binding==="DB");
  const preview=config.previews?.d1_databases?.find(d=>d.binding==="DB");
  assert.ok(prod?.database_id);
  assert.ok(preview?.database_id);
  assert.equal(prod?.database_name,"mahjong-score-prod");
  assert.equal(preview?.database_name,"mahjong-score-preview");
  assert.notEqual(prod?.database_id,preview?.database_id);
  assert.equal(prod?.preview_database_id,preview?.database_id);
  // Enabling the feature requires a distinct Human Gate: do NOT allow a
  // seemingly harmless local/PR edit to turn on enrollment during deploy.
  assert.equal(config.vars?.PASSKEY_REGISTRATION_ENABLED,undefined);
});

test("S2-B preview readiness STOP: passkey RP and OAuth callback must not silently switch to another domain",()=>{
  const origin=new URL(PASSKEY_PRODUCTION_ORIGIN);
  assert.equal(origin.protocol,"https:");
  assert.equal(origin.hostname,PASSKEY_PRODUCTION_RP_ID);
  assert.equal(origin.pathname,"/");
  assert.equal(origin.origin,PASSKEY_PRODUCTION_ORIGIN);
  // A separate preview Worker URL is a different WebAuthn RP. Reusing these
  // exact Production constants there will NOT be an end-to-end test.
  // A staging RP/Origin and LINE registered redirect have to be verified
  // separately, with isolated D1 and no Production credentials.
});
