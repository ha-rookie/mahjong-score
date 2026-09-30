import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker=readFileSync("src/worker.ts","utf8");
const app=readFileSync("src/App.tsx","utf8");
const component=readFileSync("src/components/finalized-game-correction.tsx","utf8");

test("finalized Game correction is restricted to System Admin",()=>{
  assert.match(worker,/correctingFinalized&&!await isSystemAdmin\(env,authUserId\)/);
  assert.match(worker,/System admin role required to correct finalized Game/);
  assert.match(app,/resultsBackView==="history"&&appAuth\?\.user\.systemRole==="admin"/);
});

test("finalized correction keeps version guard, placement recalculation and audit",()=>{
  assert.match(worker,/deriveGameResultPlacements/);
  assert.match(worker,/writableStatus=correctingFinalized\?"finalized":"active"/);
  assert.match(worker,/finalized_game_corrected/);
  assert.match(worker,/version=version\+1/);
});

test("correction UI preserves existing tags and requires explicit confirmation",()=>{
  assert.match(component,/tags:game\.tags/);
  assert.match(component,/window\.confirm\("確定済みの過去データを修正します/);
  assert.match(component,/parsed\.reduce\(\(sum,item\)=>sum\+\(item\.value\?\?0\),0\)===0/);
});
