import test from "node:test";
import assert from "node:assert/strict";
import {
  isAppleMobilePlatform,
  isStandaloneDisplayMode,
} from "../src/infrastructure/pwa/ios-standalone-line-login";

test("detects iPhone and iPad-style Apple mobile platforms",()=>{
  assert.equal(isAppleMobilePlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)","iPhone",5),true);
  assert.equal(isAppleMobilePlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)","MacIntel",5),true);
});

test("does not route Android standalone through the iOS workaround",()=>{
  assert.equal(isAppleMobilePlatform("Mozilla/5.0 (Linux; Android 16)","Linux armv8l",5),false);
});

test("standalone display accepts modern media query or legacy navigator flag",()=>{
  assert.equal(isStandaloneDisplayMode(true,false),true);
  assert.equal(isStandaloneDisplayMode(false,true),true);
  assert.equal(isStandaloneDisplayMode(false,false),false);
  assert.equal(isStandaloneDisplayMode(false,undefined),false);
});
