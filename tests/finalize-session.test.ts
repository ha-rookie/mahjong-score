import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { SessionRepository } from "../src/application/ports";
import { FinalizeSessionUseCase, GetActiveSessionUseCase } from "../src/application/use-cases";
import type { ParticipantSegment, SegmentId, Session, SessionId } from "../src/domain";
import { ok, type Result } from "../src/shared/errors";

const base: Session={id:"s1",groupId:"g1",sessionDate:"2026-09-23",startedAt:"2026-09-23T01:00:00.000Z",endedAt:null,status:"active",note:null,participantNotes:[],chipResults:[]};
const segment:ParticipantSegment={id:"seg1",sessionId:"s1",sequence:1,participantPlayerIds:["p1","p2","p3"]};
class Repo implements SessionRepository {
  session:Session=base;
  listByGroup():Promise<Result<readonly Session[]>>{return Promise.resolve(ok([this.session]));}
  findById(id:SessionId):Promise<Result<Session|null>>{return Promise.resolve(ok(id===this.session.id?this.session:null));}
  listSegments():Promise<Result<readonly ParticipantSegment[]>>{return Promise.resolve(ok([segment]));}
  createWithInitialSegment():Promise<Result<void>>{return Promise.resolve(ok(undefined));}
  save(session:Session):Promise<Result<void>>{this.session=session;return Promise.resolve(ok(undefined));}
  saveSegment():Promise<Result<void>>{return Promise.resolve(ok(undefined));}
  findSegmentById(id:SegmentId):Promise<Result<ParticipantSegment|null>>{return Promise.resolve(ok(id===segment.id?segment:null));}
}
test("finalize session records status and endedAt and removes it from active query",async()=>{
 const repo=new Repo();
 const result=await new FinalizeSessionUseCase(repo,{now:()=>"2026-09-23T09:30:00.000Z"}).execute("s1");
 assert.equal(result.ok,true);assert.equal(repo.session.status,"finalized");assert.equal(repo.session.endedAt,"2026-09-23T09:30:00.000Z");
 const active=await new GetActiveSessionUseCase(repo).execute("g1");assert.equal(active.ok,true);if(active.ok)assert.equal(active.value,null);
});
