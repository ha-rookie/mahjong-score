import type { Clock, GroupRepository } from "../ports";
import { GROUP_NAME_MAX_LENGTH, type Group, type GroupId } from "../../domain";
import { AppError, err, type Result } from "../../shared/errors";

export class UpdateGroupNameUseCase {
  constructor(private readonly groups: GroupRepository, private readonly clock: Clock) {}

  async execute(input:{id:GroupId;name:string}):Promise<Result<Group>> {
    const name=input.name.trim();
    if(!name)return err(new AppError({code:"group_name_required",message:"Group name is required.",userMessage:"グループ名を入力してください。"}));
    if(name.length>GROUP_NAME_MAX_LENGTH)return err(new AppError({code:"group_name_too_long",message:"Group name is too long.",userMessage:`グループ名は${GROUP_NAME_MAX_LENGTH}文字以内で入力してください。`}));
    const current=await this.groups.findById(input.id);
    if(!current.ok)return current;
    if(!current.value)return err(new AppError({code:"group_not_found",message:"Group not found.",userMessage:"グループが見つかりません。"}));
    const group={...current.value,name,updatedAt:this.clock.now()};
    const saved=await this.groups.save(group);
    return saved.ok?{ok:true,value:group}:saved;
  }
}
