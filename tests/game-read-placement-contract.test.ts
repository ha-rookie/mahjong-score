import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const worker=readFileSync("src/worker.ts","utf8");
test("Game read APIs expose persisted placement and boolean isLast",()=>{assert.match(worker,/SELECT player_id AS playerId,score_point AS scorePoint,placement,is_last AS isLast FROM game_results WHERE game_id=\?/);assert.match(worker,/SELECT game_id AS gameId,player_id AS playerId,score_point AS scorePoint,placement,is_last AS isLast FROM game_results WHERE game_id IN/);assert.match(worker,/placement:r\.placement,isLast:Boolean\(r\.isLast\)/);});
