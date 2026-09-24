import type { Game,GameId,SessionId } from "../../domain";
import type { GameRepository } from "../../application/ports";
import { ok,type Result } from "../../shared/errors";
import { WorkerApiClient } from "../api";

export class ApiGameRepository implements GameRepository{
  constructor(private readonly api:WorkerApiClient){}
  async listBySession(id:SessionId){const r=await this.api.request<{games:Game[]}>(`/api/sessions/${encodeURIComponent(id)}/games`);return r.ok?ok(r.value.games):r;}
  async findById(id:GameId){const r=await this.api.request<{game:Game}>(`/api/games/${encodeURIComponent(id)}`);if(!r.ok&&r.error.code==="game_not_found")return ok(null);return r.ok?ok(r.value.game):r;}
  async save(g:Game){const found=await this.findById(g.id);if(!found.ok)return found;const path=found.value?`/api/games/${encodeURIComponent(g.id)}`:`/api/sessions/${encodeURIComponent(g.sessionId)}/games`;const payload=found.value?{...g,expectedVersion:g.version}:g;const r=await this.api.request<unknown>(path,{method:found.value?"PUT":"POST",body:JSON.stringify(payload)});return r.ok?ok(undefined):r;}
  async remove(id:GameId,expectedVersion?:number):Promise<Result<void>>{const suffix=expectedVersion===undefined?"":`?version=${expectedVersion}`;const r=await this.api.request<unknown>(`/api/games/${encodeURIComponent(id)}${suffix}`,{method:"DELETE"});return r.ok?ok(undefined):r;}
  async removeBySession(id:SessionId):Promise<Result<void>>{void id;return ok(undefined);}
}
