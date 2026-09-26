import fs from "node:fs";

const replaceOnce=(path,from,to)=>{
  const before=fs.readFileSync(path,"utf8");
  if(!before.includes(from))throw new Error(`Expected source not found in ${path}`);
  const after=before.replace(from,to);
  if(after===before)throw new Error(`No change made in ${path}`);
  fs.writeFileSync(path,after);
};

replaceOnce(
  "src/application/ports/session-repository.ts",
  `import type {\n  ParticipantSegment,\n  SegmentId,\n  Session,\n  SessionId,\n  GroupId,\n} from "../../domain";\nimport type { Result } from "../../shared/errors";\n\nexport interface SessionRepository {\n  listByGroup(groupId: GroupId): Promise<Result<readonly Session[]>>;`,
  `import type {\n  ParticipantSegment,\n  PlayerId,\n  SegmentId,\n  Session,\n  SessionId,\n  GroupId,\n} from "../../domain";\nimport type { Result } from "../../shared/errors";\n\nexport interface ActiveSessionSnapshot {\n  readonly session: Session;\n  readonly participantPlayerIds: readonly PlayerId[];\n}\n\nexport interface SessionRepository {\n  listByGroup(groupId: GroupId): Promise<Result<readonly Session[]>>;\n  findActiveByGroup(groupId: GroupId): Promise<Result<ActiveSessionSnapshot | null>>;`,
);

replaceOnce(
  "src/infrastructure/repositories/api-session-repository.ts",
  `import type { SessionRepository } from "../../application/ports";`,
  `import type { ActiveSessionSnapshot, SessionRepository } from "../../application/ports";`,
);
replaceOnce(
  "src/infrastructure/repositories/api-session-repository.ts",
  `  async listByGroup(groupId:GroupId){const r=await this.api.request<{sessions:Session[]}>(\`/api/groups/\${encodeURIComponent(groupId)}/sessions\`);return r.ok?ok(r.value.sessions):r;}\n  async findById(id:SessionId)`,
  `  async listByGroup(groupId:GroupId){const r=await this.api.request<{sessions:Session[]}>(\`/api/groups/\${encodeURIComponent(groupId)}/sessions\`);return r.ok?ok(r.value.sessions):r;}\n  async findActiveByGroup(groupId:GroupId){const r=await this.api.request<{activeSession:ActiveSessionSnapshot|null}>(\`/api/groups/\${encodeURIComponent(groupId)}/active-session\`);return r.ok?ok(r.value.activeSession):r;}\n  async findById(id:SessionId)`,
);

replaceOnce(
  "src/infrastructure/repositories/local-storage-session-repository.ts",
  `import type { SessionRepository } from "../../application/ports";`,
  `import type { ActiveSessionSnapshot, SessionRepository } from "../../application/ports";`,
);
replaceOnce(
  "src/infrastructure/repositories/local-storage-session-repository.ts",
  `  async findById(id: SessionId): Promise<Result<Session | null>> {`,
  `  async findActiveByGroup(groupId: GroupId): Promise<Result<ActiveSessionSnapshot | null>> {\n    const loaded = await this.store.load();\n    if (!loaded.ok) return loaded;\n\n    const active = loaded.value.sessions\n      .filter((session) => session.groupId === groupId && session.status === "active")\n      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];\n    if (active === undefined) return ok(null);\n\n    const currentSegment = loaded.value.participantSegments\n      .filter((segment) => segment.sessionId === active.id)\n      .sort((a, b) => b.sequence - a.sequence)[0];\n\n    return ok({\n      session: active,\n      participantPlayerIds: currentSegment?.participantPlayerIds ?? [],\n    });\n  }\n\n  async findById(id: SessionId): Promise<Result<Session | null>> {`,
);

replaceOnce(
  "src/application/use-cases/read-models.ts",
  `  async execute(groupId: GroupId): Promise<Result<ActiveSessionSummary | null>> {\n    const listed = await this.sessions.listByGroup(groupId);\n    if (!listed.ok) return listed;\n\n    const active = [...listed.value]\n      .filter((session) => session.status === "active")\n      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];\n\n    if (active === undefined) return ok(null);\n\n    const segments = await this.sessions.listSegments(active.id);\n    if (!segments.ok) return segments;\n\n    const currentSegment = [...segments.value].sort(\n      (a, b) => b.sequence - a.sequence,\n    )[0];\n\n    return ok({\n      session: active,\n      participantPlayerIds: currentSegment?.participantPlayerIds ?? [],\n    });\n  }`,
  `  execute(groupId: GroupId): Promise<Result<ActiveSessionSummary | null>> {\n    return this.sessions.findActiveByGroup(groupId);\n  }`,
);

replaceOnce(
  "src/worker.ts",
  ` const sessions=url.pathname.match(/^\\/api\\/groups\\/([^/]+)\\/sessions$/);`,
  ` const activeSession=url.pathname.match(/^\\/api\\/groups\\/([^/]+)\\/active-session$/);if(request.method==="GET"&&activeSession){const groupId=decodeURIComponent(activeSession[1]);if(!await canUseGroup(env,authUserId,groupId))return deny("Group access required");const s=await env.DB.prepare("SELECT id,group_id AS groupId,session_date AS sessionDate,started_at AS startedAt,ended_at AS endedAt,status,note,version FROM sessions WHERE group_id=? AND status='active' LIMIT 1").bind(groupId).first<Record<string,unknown>>();if(!s)return json({activeSession:null});const sessionId=String(s.id);const [notes,chips,participants]=await Promise.all([env.DB.prepare("SELECT player_id AS playerId,note FROM session_participant_notes WHERE session_id=? ORDER BY player_id").bind(sessionId).all(),env.DB.prepare("SELECT player_id AS playerId,chip_count AS chipCount FROM chip_results WHERE session_id=? ORDER BY player_id").bind(sessionId).all(),env.DB.prepare("SELECT sp.player_id AS playerId FROM participant_segments ps JOIN segment_players sp ON sp.segment_id=ps.id WHERE ps.session_id=? AND ps.sequence=(SELECT MAX(sequence) FROM participant_segments WHERE session_id=?) ORDER BY sp.seat_order").bind(sessionId,sessionId).all()]);return json({activeSession:{session:{...s,participantNotes:notes.results,chipResults:chips.results},participantPlayerIds:participants.results.map(v=>v.playerId)}});}\n const sessions=url.pathname.match(/^\\/api\\/groups\\/([^/]+)\\/sessions$/);`,
);

replaceOnce(
  "tests/read-models.test.ts",
  `class FakeSessionRepository implements SessionRepository {\n  listByGroup(): Promise<Result<readonly Session[]>> {\n    return Promise.resolve(ok([activeSession]));\n  }`,
  `class FakeSessionRepository implements SessionRepository {\n  listByGroup(): Promise<Result<readonly Session[]>> {\n    return Promise.resolve(ok([activeSession]));\n  }\n\n  findActiveByGroup(): Promise<Result<{ session: Session; participantPlayerIds: readonly PlayerId[] } | null>> {\n    return Promise.resolve(ok({ session: activeSession, participantPlayerIds: currentSegment.participantPlayerIds }));\n  }`,
);

replaceOnce(
  "tests/game-result-use-cases.test.ts",
  `  listByGroup(): Promise<Result<readonly Session[]>> { return Promise.resolve(ok([session])); }\n  createWithInitialSegment()`,
  `  listByGroup(): Promise<Result<readonly Session[]>> { return Promise.resolve(ok([session])); }\n  findActiveByGroup(): Promise<Result<{session:Session;participantPlayerIds:readonly string[]}|null>> { return Promise.resolve(ok({session,participantPlayerIds:segment.participantPlayerIds})); }\n  createWithInitialSegment()`,
);

replaceOnce(
  "tests/worker-api-security.test.ts",
  `    if(sql.includes("SELECT id FROM sessions WHERE group_id=? AND status='active'")){\n      const entry=Object.entries(this.sessions).find(([,row])=>row.groupId===String(values[0]));\n      return entry?{id:entry[0]}:null;\n    }`,
  `    if(sql.includes("FROM sessions WHERE group_id=? AND status='active'")){\n      const entry=Object.entries(this.sessions).find(([,row])=>row.groupId===String(values[0])&&(row.status??"active")==="active");\n      if(!entry)return null;\n      const [id,row]=entry;\n      if(sql.includes("group_id AS groupId"))return {id,groupId:row.groupId,sessionDate:"2026-09-25",startedAt:"2026-09-25T06:00:00Z",endedAt:null,status:row.status??"active",note:null,version:row.version};\n      return {id};\n    }`,
);
replaceOnce(
  "tests/worker-api-security.test.ts",
  `  all(sql?:string,values:unknown[]=[]){\n    if(sql?.includes("SELECT player_id AS playerId FROM group_players")){`,
  `  all(sql?:string,values:unknown[]=[]){\n    if(sql?.includes("FROM participant_segments ps JOIN segment_players sp")&&sql.includes("MAX(sequence)")){\n      const segment=Object.values(this.segments).find(row=>row.sessionId===String(values[0]));\n      return (segment?.players??[]).map(playerId=>({playerId}));\n    }\n    if(sql?.includes("SELECT player_id AS playerId FROM group_players")){`,
);
replaceOnce(
  "tests/worker-api-security.test.ts",
  `test("group member can read own group players",async()=>{\n  const db=new FakeDb({member:{memberships:{g1:"member"}}});\n  const response=await worker.fetch(await request("/api/groups/g1/players",{},"member"),env(db));\n  assert.equal(response.status,200);\n  assert.deepEqual(await response.json(),{players:[]});\n});`,
  `test("group member can read own group players",async()=>{\n  const db=new FakeDb({member:{memberships:{g1:"member"}}});\n  const response=await worker.fetch(await request("/api/groups/g1/players",{},"member"),env(db));\n  assert.equal(response.status,200);\n  assert.deepEqual(await response.json(),{players:[]});\n});\n\ntest("group member can read active Session without loading Session history",async()=>{\n  const db=new FakeDb(\n    {member:{memberships:{g1:"member"}}},\n    {s1:{groupId:"g1",version:3,status:"active"}},\n    false,\n    {seg1:{sessionId:"s1",players:["p1","p2","p3"]}},\n  );\n  const response=await worker.fetch(await request("/api/groups/g1/active-session",{},"member"),env(db));\n  assert.equal(response.status,200);\n  const payload=await response.json() as {activeSession:{session:{id:string;version:number};participantPlayerIds:string[]}|null};\n  assert.equal(payload.activeSession?.session.id,"s1");\n  assert.equal(payload.activeSession?.session.version,3);\n  assert.deepEqual(payload.activeSession?.participantPlayerIds,["p1","p2","p3"]);\n});\n\ntest("active Session endpoint returns null when the Group has no active Session",async()=>{\n  const db=new FakeDb({member:{memberships:{g1:"member"}}});\n  const response=await worker.fetch(await request("/api/groups/g1/active-session",{},"member"),env(db));\n  assert.equal(response.status,200);\n  assert.deepEqual(await response.json(),{activeSession:null});\n});`,
);

console.log("Active Session optimization patch applied.");
