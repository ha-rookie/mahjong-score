import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { GameRepository, SessionRepository } from "../src/application/ports";
import { CancelEmptySessionUseCase } from "../src/application/use-cases";
import type { Game, ParticipantSegment, Session, SessionId } from "../src/domain";
import { ok, type Result } from "../src/shared/errors";

const session:Session={id:"s1",groupId:"g1",sessionDate:"2026-09-25",startedAt:"2026-09-25T08:00:00.000Z",endedAt:null,status:"active",note:null,participantNotes:[],chipResults:[],version:3};

class Sessions implements SessionRepository {
  cancelled:{id:SessionId;version?:number}|null=null;
  findById(id:SessionId):Promise<Result<Session|null>>{return Promise.resolve(ok(id===session.id?session:null));}
  listByGroup():Promise<Result<readonly Session[]>>{return Promise.resolve(ok([session]));}
  findActiveByGroup():Promise<Result<{session:Session;participantPlayerIds:readonly string[]}|null>>{return Promise.resolve(ok({session,participantPlayerIds:[]}));}
  listSegments():Promise<Result<readonly ParticipantSegment[]>>{return Promise.resolve(ok([]));}
  createWithInitialSegment():Promise<Result<void>>{return Promise.resolve(ok(undefined));}
  save():Promise<Result<void>>{return Promise.resolve(ok(undefined));}
  remove():Promise<Result<void>>{return Promise.resolve(ok(undefined));}
  cancelEmpty(id:SessionId,version?:number):Promise<Result<void>>{this.cancelled={id,version};return Promise.resolve(ok(undefined));}
  saveSegment():Promise<Result<void>>{return Promise.resolve(ok(undefined));}
  findSegmentById():Promise<Result<ParticipantSegment|null>>{return Promise.resolve(ok(null));}
}

class Games implements GameRepository {
  constructor(private readonly games:readonly Game[]){}
  listBySession(id:SessionId):Promise<Result<readonly Game[]>>{return Promise.resolve(ok(this.games.filter(game=>game.sessionId===id)));}
  findById():Promise<Result<Game|null>>{return Promise.resolve(ok(null));}
  save():Promise<Result<void>>{return Promise.resolve(ok(undefined));}
  remove():Promise<Result<void>>{return Promise.resolve(ok(undefined));}
  removeBySession():Promise<Result<void>>{return Promise.resolve(ok(undefined));}
}

test("empty active Session is cancelled with the read version",async()=>{
  const sessions=new Sessions();
  const result=await new CancelEmptySessionUseCase(sessions,new Games([])).execute("s1");
  assert.equal(result.ok,true);
  assert.deepEqual(sessions.cancelled,{id:"s1",version:3});
});

test("Session with a Game cannot be cancelled",async()=>{
  const sessions=new Sessions();
  const game:Game={id:"g1",sessionId:"s1",segmentId:"seg1",sequence:1,playedAt:"2026-09-25T08:30:00.000Z",results:[{playerId:"p1",scorePoint:10},{playerId:"p2",scorePoint:-5},{playerId:"p3",scorePoint:-5}],tags:[],version:1};
  const result=await new CancelEmptySessionUseCase(sessions,new Games([game])).execute("s1");
  assert.equal(result.ok,false);
  if(!result.ok)assert.equal(result.error.code,"session_not_empty");
  assert.equal(sessions.cancelled,null);
});
