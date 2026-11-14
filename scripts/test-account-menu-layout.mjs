import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Regression for the Android account menu: inherited nowrap made the
// passkey explanation/100%-width button stretch the entire document.
const css=fs.readFileSync("src/index.css","utf8");
const rules=(selector)=>css.split(selector+"{").slice(1).map(s=>s.split("}")[0]).join(";");

test("account dropdown constrains its width and allows wrapping",()=>{
  const panel=rules(".account-menu__panel");
  assert.match(panel,/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(panel,/width:\s*min\(280px,\s*calc\(100vw - 28px\)\)/);
  assert.match(panel,/white-space:\s*normal/);
  assert.doesNotMatch(panel,/width:\s*180px/);
});
test("passkey text and button cannot impose a wide minimum grid track",()=>{
  const enroll=rules(".passkey-enroll");
  assert.match(enroll,/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(enroll,/min-width:\s*0/);
  assert.match(enroll,/white-space:\s*normal/);
  const button=rules(".passkey-enroll button");
  assert.match(button,/min-width:\s*0/);
  assert.match(button,/white-space:\s*normal/);
});
