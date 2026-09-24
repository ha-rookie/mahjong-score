import type { Group, GroupId } from "../../domain";
import type { GroupRepository } from "../../application/ports";
import { ok, type Result } from "../../shared/errors";
import { WorkerApiClient } from "../api";
export class ApiGroupRepository implements GroupRepository { constructor(private readonly api:WorkerApiClient){} async list(){const r=await this.api.request<{groups:Group[]}>("/api/groups");return r.ok?ok(r.value.groups):r;} async findById(id:GroupId):Promise<Result<Group|null>>{const r=await this.list();return r.ok?ok(r.value.find(x=>x.id===id)??null):r;} async save(group:Group):Promise<Result<void>>{const r=await this.api.request<{group:Group}>("/api/groups",{method:"POST",body:JSON.stringify(group)});return r.ok?ok(undefined):r;} }
