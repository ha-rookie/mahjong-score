import type { GameId, GameTag, PlayerId, SessionId, SessionParticipantNote, ChipResult } from "../../domain";
import { createGameResultsFromScoreSheet, validateChipResults } from "../../domain";
import { AppError, err, ok, type Result } from "../../shared/errors";
import type { GameRepository, SessionRepository } from "../ports";

export class UpdateGameUseCase {
  constructor(private readonly games: GameRepository, private readonly sessions: SessionRepository) {}
  async execute(input:{gameId:GameId;scorePointsByPlayer:Readonly<Record<PlayerId,number|null>>;tags:readonly GameTag[]}){
    const found=await this.games.findById(input.gameId); if(!found.ok)return found;
    if(!found.value)return err(new AppError({code:"game_not_found",message:"Game not found.",userMessage:"半荘が見つかりません。"}));
    const segment=await this.sessions.findSegmentById(found.value.segmentId); if(!segment.ok)return segment;
    if(!segment.value)return err(new AppError({code:"game_segment_not_found",message:"Segment not found.",userMessage:"参加者構成が見つかりません。"}));
    const results=createGameResultsFromScoreSheet({participantPlayerIds:segment.value.participantPlayerIds,scorePointsByPlayer:input.scorePointsByPlayer});
    if(!results.ok)return results;
    const game={...found.value,results:results.value,tags:input.tags};
    const saved=await this.games.save(game); return saved.ok?ok(game):saved;
  }
}
export class DeleteGameUseCase {
  constructor(private readonly games:GameRepository){}
  execute(gameId:GameId):Promise<Result<void>>{return this.games.remove(gameId);}
}
export class UpdateSessionDetailsUseCase {
  constructor(private readonly sessions:SessionRepository){}
  async execute(input:{sessionId:SessionId;note:string|null;participantNotes:readonly SessionParticipantNote[];chipResults:readonly ChipResult[]}){
    const found=await this.sessions.findById(input.sessionId);if(!found.ok)return found;
    if(!found.value)return err(new AppError({code:"session_not_found",message:"Session not found.",userMessage:"Sessionが見つかりません。"}));
    if(input.chipResults.length>0){const v=validateChipResults(input.chipResults);if(!v.valid)return err(new AppError({code:"chip_results_invalid",message:v.issues.map(x=>x.message).join(" / "),userMessage:"チップの合計を確認してください。"}));}
    const session={...found.value,note:input.note,participantNotes:input.participantNotes,chipResults:input.chipResults};
    const saved=await this.sessions.save(session);return saved.ok?ok(session):saved;
  }
}
