import "server-only";

import { supabaseRestRpc } from "./supabase-rest";
import { isLocalFormalBoard } from "./storage";
import { localCastVote, localCreateOption, localCreatePoll, localSnapshot, localUpdateOption, localUpdatePoll, localVoidVote } from "./local-store";
import type { PollOptionStatus, PollResultMode } from "./vote";

export type PollRow = {
  id: string; activity_id: string; title: string; description: string; choice_mode: "single-choice";
  status: "draft" | "open" | "closed"; result_mode: PollResultMode; host_eligible: boolean;
  allow_self_vote: boolean; data_version: number; created_by: string; created_at: string; updated_at: string; closed_at: string | null;
};
export type PollOptionRow = { id: string; poll_id: string; title: string; description: string; link: string | null; submitted_by: string | null; status: PollOptionStatus; data_version: number; created_at: string; updated_at: string };
export type VoteRow = { id: string; poll_id: string; option_id: string; voter_user_id: string; status: "active" | "voided"; cast_at: string; voided_at: string | null; void_reason: string | null };
export type PollSnapshot = { poll: PollRow; options: PollOptionRow[]; results: Array<{ optionId: string; count: number | null; recordedForViewer: boolean }>; viewerVote: { voteId: string; optionId: string; status: VoteRow["status"] } | null };
export type VoteCommandResult = { code: "RECORDED" | "ALREADY_VOTED"; vote: VoteRow; message: string };
type Row<T> = T[];
async function one<T>(promise: Promise<Row<T>>, label: string): Promise<T> { const rows = await promise; if (!rows[0]) throw new Error(`${label} returned no row.`); return rows[0]; }

export function createPoll(input: { userId: string; activityId: string; title: string; description: string; hostEligible: boolean; allowSelfVote: boolean; resultMode: PollResultMode; operationId: string; requestId: string }) {
  if (isLocalFormalBoard()) return Promise.resolve(localCreatePoll(input));
  return one(supabaseRestRpc<Row<PollRow>>("formal_create_poll", { p_user_id: input.userId, p_activity_id: input.activityId, p_title: input.title, p_description: input.description, p_host_eligible: input.hostEligible, p_allow_self_vote: input.allowSelfVote, p_result_mode: input.resultMode, p_operation_id: input.operationId, p_request_id: input.requestId }), "Poll creation");
}
export function createPollOption(input: { userId: string; pollId: string; title: string; description: string; link: string | null; submittedBy: string | null; operationId: string; requestId: string }) {
  if (isLocalFormalBoard()) return Promise.resolve(localCreateOption(input));
  return one(supabaseRestRpc<Row<PollOptionRow>>("formal_create_poll_option", { p_user_id: input.userId, p_poll_id: input.pollId, p_title: input.title, p_description: input.description, p_link: input.link, p_submitted_by: input.submittedBy, p_operation_id: input.operationId, p_request_id: input.requestId }), "Poll option creation");
}
export function updatePoll(input: { userId: string; pollId: string; title?: string; description?: string; hostEligible?: boolean; allowSelfVote?: boolean; resultMode?: PollResultMode; open: boolean; close: boolean; expectedVersion: number; operationId: string; requestId: string }) {
  if (isLocalFormalBoard()) return Promise.resolve(localUpdatePoll(input));
  return one(supabaseRestRpc<Row<PollRow>>("formal_update_poll", { p_user_id: input.userId, p_poll_id: input.pollId, p_title: input.title ?? null, p_description: input.description ?? null, p_host_eligible: input.hostEligible ?? null, p_allow_self_vote: input.allowSelfVote ?? null, p_result_mode: input.resultMode ?? null, p_open: input.open, p_close: input.close, p_expected_version: input.expectedVersion, p_operation_id: input.operationId, p_request_id: input.requestId }), "Poll update");
}
export function updatePollOption(input: { userId: string; pollId: string; optionId: string; title: string; description: string; link: string | null; submittedBy: string | null; status: PollOptionStatus; expectedVersion: number; operationId: string; requestId: string }) {
  if (isLocalFormalBoard()) return Promise.resolve(localUpdateOption(input));
  return one(supabaseRestRpc<Row<PollOptionRow>>("formal_update_poll_option", { p_user_id: input.userId, p_poll_id: input.pollId, p_option_id: input.optionId, p_title: input.title, p_description: input.description, p_link: input.link, p_submitted_by: input.submittedBy, p_status: input.status, p_expected_version: input.expectedVersion, p_operation_id: input.operationId, p_request_id: input.requestId }), "Poll option update");
}
export function castVote(input: { userId: string; pollId: string; optionId: string; operationId: string; requestId: string }) {
  if (isLocalFormalBoard()) return Promise.resolve(localCastVote(input));
  return supabaseRestRpc<VoteCommandResult>("formal_cast_vote", { p_user_id: input.userId, p_poll_id: input.pollId, p_option_id: input.optionId, p_operation_id: input.operationId, p_request_id: input.requestId });
}
export function voidVote(input: { userId: string; pollId: string; voteId: string; reason: string; operationId: string; requestId: string }) {
  if (isLocalFormalBoard()) return Promise.resolve(localVoidVote(input));
  return supabaseRestRpc<{ voided: true; vote: VoteRow }>("formal_void_vote", { p_user_id: input.userId, p_poll_id: input.pollId, p_vote_id: input.voteId, p_reason: input.reason, p_operation_id: input.operationId, p_request_id: input.requestId });
}
export function getPollSnapshot(userId: string, pollId: string) {
  if (isLocalFormalBoard()) return Promise.resolve(localSnapshot(userId, pollId));
  return supabaseRestRpc<PollSnapshot>("formal_get_poll_snapshot", { p_user_id: userId, p_poll_id: pollId });
}
export function getPollResult(userId: string, pollId: string) {
  if (isLocalFormalBoard()) return Promise.resolve(localSnapshot(userId, pollId, true));
  return supabaseRestRpc<PollSnapshot>("formal_get_poll_result", { p_user_id: userId, p_poll_id: pollId });
}
