import test from "node:test";
import assert from "node:assert/strict";
import {validateUatArtifact,PROVISIONAL_D1_ID,UAT_NAME} from "./uat-artifact-policy.mjs";
const PROD="95a84e69-692e-45f1-9762-0b71b298199b";
const PREVIEW="2494979f-57d5-4ba5-bde7-bc5ec674b8eb";
const PERFORMANCE="37b05ca8-9f6e-46b4-92be-7e02513cf044";
const fixture=()=>{
  const source={name:UAT_NAME,workers_dev:true,preview_urls:false,
    vars:{PASSKEY_ENV:"android-uat"},
    d1_databases:[{binding:"DB",database_name:UAT_NAME,database_id:PROVISIONAL_D1_ID}]};
  const generated=structuredClone(source);
  return {source,generated,
    production:{d1_databases:[{database_id:PROD,preview_database_id:PREVIEW}],
      previews:{d1_databases:[{database_id:PREVIEW}]}},
    performance:{d1_databases:[{database_id:PERFORMANCE}]}};
};
test("UAT CI checks isolated provisional config without granting deployment",()=>{
  const input=fixture();
  assert.equal(validateUatArtifact({...input,mode:"ci"}).provisional,true);
  assert.throws(()=>validateUatArtifact(input),/placeholder/);
});
test("UAT deploy gate accepts only a distinct provisioned UUID",()=>{
  const input=fixture(),id="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  input.source.d1_databases[0].database_id=id;
  input.generated.d1_databases[0].database_id=id;
  assert.equal(validateUatArtifact(input).d1Id,id);
});
test("UAT rejects production, preview, performance and unknown D1 bindings",()=>{
  for(const id of [PROD,PREVIEW,PERFORMANCE]){
    const input=fixture();input.source.d1_databases[0].database_id=id;
    input.generated.d1_databases[0].database_id=id;
    assert.throws(()=>validateUatArtifact({...input,mode:"ci"}),/protected/);
  }
  const input=fixture();input.generated.d1_databases[0].database_id=PROD;
  assert.throws(()=>validateUatArtifact({...input,mode:"ci"}),/differs/);
});
test("UAT rejects a production Worker name, routes, LINE vars, extra D1",()=>{
  const bad=[
    f=>{f.generated.name="mahjong-score";},
    f=>{f.source.routes=[{pattern:"example.com/*"}];},
    f=>{f.generated.vars.LINE_CHANNEL_ID="live";},
    f=>{f.generated.d1_databases.push(f.generated.d1_databases[0]);},
    f=>{f.source.preview_urls=true;},
    f=>{f.generated.previews={d1_databases:[{database_id:PREVIEW}]};},
  ];
  for(const change of bad){
    const input=fixture();change(input);
    assert.throws(()=>validateUatArtifact({...input,mode:"ci"}));
  }
});
