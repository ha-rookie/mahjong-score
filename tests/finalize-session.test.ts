import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { GameRepository, SessionRepository } from "../src/application/ports";
import { FinalizeSessionUseCase, GetActiveSessionUseCase } from "../src/application/use-cases";
import type { Game, GameId, ParticipantSegment, SegmentId, Session, SessionId } from "../src/domain";
import { ok, type Result } from "../src/shared/errors";

const base: Session={id:"s1",groupId:"g1",sessionDate:"2026-09-23",startedAt:"2026-09-23T01:00:00.000Z",endedAt:null,status:"active",note:null,participantNotes:[],chipResults:[],version:1};
const segment:ParticipantSegment={id:"seg1",sessionId:"s1",sequence:1,participantPlayerIds:["p1","p2","p3"]};
const game:Game={id:"g1",sessionId:"s1",segmentId:"seg1",sequence:1,playedAt:"2026-09-23T08:00:00.000Z",results:[{playerId:"p1",scorePoint:10},{playerId:"p2",scorePoint:-5},{playerId:"p3",scorePoint:-5}],tags:[],version:1};

class Repo implements SessionRepository {
  session:Session=base;
  listByGroup():Promise<Result<readonly Session[]>>{return Promise.resolve(ok([this.session]));}
  findActiveByGroup():Promise<Result<{session:Session;participantPlayerIds:readonly string[]}|null>>{return Promise.resolve(ok(this.session.status==="active"?{session:this.session,participantPlayerIds:segment.participantPlayerIds}:null));}
  findById(id:SessionId):Promise<Result<Session|null>>{return Promise.resolve(ok(id===this.session.id?this.session:null));}
  listSegments():Promise<Result<readonly ParticipantSegment[]>>{return Promise.resolve(ok([segment]));}
  createWithInitialSegment():Promise<Result<void>>{return Promise.resolve(ok(undefined));}
  save(session:Session):Promise<Result<void>>{this.session=session;return Promise.resolve(ok(undefined));}
  remove():Promise<Result<void>>{return Promise.resolve(ok(undefined));}
  cancelEmpty():Promise<Result<void>>{return Promise.resolve(ok(undefined));}
  saveSegment():Promise<Result<void>>{return Promise.resolve(ok(undefined));}
  findSegmentById(id:SegmentId):Promise<Result<ParticipantSegment|null>>{return Promise.resolve(ok(id===segment.id?segment:null));}
}

class Games implements GameRepository {
  constructor(readonly games:readonly Game[]=[game]){}
  listBySession(sessionId:SessionId):Promise<Result<readonly Game[]>>{return Promise.resolve(ok(this.games.filter(item=>item.sessionId===sessionId)));}
  findById(id:GameId):Promise<Result<Game|null>>{return Promise.resolve(ok(this.games.find(item=>item.id===id)??null));}
  save():Promise<Result<void>>{return Promise.resolve(ok(undefined));}
  remove():Promise<Result<void>>{return Promise.resolve(ok(undefined));}
  removeBySession():Promise<Result<void>>{return Promise.resolve(ok(undefined));}
}

test("finalize session records status and endedAt and removes it from active query",async()=>{
 const repo=new Repo();
 const result=await new FinalizeSessionUseCase(repo,new Games(),{now:()=>"2026-09-23T09:30:00.000Z"}).execute("s1");
 assert.equal(result.ok,true);assert.equal(repo.session.status,"finalized");assert.equal(repo.session.endedAt,"2026-09-23T09:30:00.000Z");
 const active=await new GetActiveSessionUseCase(repo).execute("g1");assert.equal(active.ok,true);if(active.ok)assert.equal(active.value,null);
});

test("zero-game Session cannot be finalized",async()=>{
 const repo=new Repo();
 const result=await new FinalizeSessionUseCase(repo,new Games([]),{now:()=>"2026-09-23T09:30:00.000Z"}).execute("s1");
 assert.equal(result.ok,false);
 if(!result.ok)assert.equal(result.error.code,"session_empty");
 assert.equal(repo.session.status,"active");
 assert.equal(repo.session.endedAt,null);
});
