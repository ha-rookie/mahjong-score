import type { GroupId,ParticipantSegment,SegmentId,Session,SessionId } from "../../domain";
import type { SessionRepository } from "../../application/ports";
import { ok,type Result } from "../../shared/errors";
import { WorkerApiClient } from "../api";

export class ApiSessionRepository implements SessionRepository{
  constructor(private readonly api:WorkerApiClient){}
  async listByGroup(groupId:GroupId){const r=await this.api.request<{sessions:Session[]}>(`/api/groups/${encodeURIComponent(groupId)}/sessions`);return r.ok?ok(r.value.sessions):r;}
  async findById(id:SessionId){const r=await this.api.request<{session:Session}>(`/api/sessions/${encodeURIComponent(id)}`);if(!r.ok&&r.error.code==="session_not_found")return ok(null);return r.ok?ok(r.value.session):r;}
  async listSegments(id:SessionId){const r=await this.api.request<{segments:ParticipantSegment[]}>(`/api/sessions/${encodeURIComponent(id)}/segments`);return r.ok?ok(r.value.segments):r;}
  async createWithInitialSegment(s:Session,g:ParticipantSegment){const r=await this.api.request<unknown>(`/api/groups/${encodeURIComponent(s.groupId)}/sessions`,{method:"POST",body:JSON.stringify({...s,segmentId:g.id,participantPlayerIds:g.participantPlayerIds})});return r.ok?ok(undefined):r;}
  async save(s:Session){const r=await this.api.request<unknown>(`/api/sessions/${encodeURIComponent(s.id)}`,{method:"PATCH",body:JSON.stringify({...s,updatedAt:new Date().toISOString()})});return r.ok?ok(undefined):r;}
  async remove(id:SessionId):Promise<Result<void>>{const r=await this.api.request<unknown>(`/api/sessions/${encodeURIComponent(id)}`,{method:"DELETE"});return r.ok?ok(undefined):r;}
  async saveSegment(g:ParticipantSegment):Promise<Result<void>>{const r=await this.api.request<unknown>(`/api/segments/${encodeURIComponent(g.id)}`,{method:"PUT",body:JSON.stringify(g)});return r.ok?ok(undefined):r;}
  async findSegmentById(id:SegmentId){const r=await this.api.request<{segment:ParticipantSegment}>(`/api/segments/${encodeURIComponent(id)}`);if(!r.ok&&r.error.code==="segment_not_found")return ok(null);return r.ok?ok(r.value.segment):r;}
}
