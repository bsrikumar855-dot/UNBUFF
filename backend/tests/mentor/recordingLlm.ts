import { MockProvider } from "../../src/llm/mock.js";
import type { MentorChatOutput, MentorSummaryOutput } from "../../src/llm/schemas.js";
import { MemoryMentorStore, type ConversationRecord, type MemoryRecord } from "../../src/mentor/store.js";

/** The deterministic mock model, plus a log of every prompt it was given and hooks to script failures and answers. */
export class RecordingLlm extends MockProvider {
  chats: { system: string; prompt: string }[] = [];
  summaries: { system: string; prompt: string }[] = [];
  chatImpl?: (input: { system: string; prompt: string }) => Promise<MentorChatOutput>;
  summaryImpl?: (input: { system: string; prompt: string }) => Promise<MentorSummaryOutput>;
  delayMs = 0;

  override async mentorChat(input: { system: string; prompt: string }): Promise<MentorChatOutput> {
    this.chats.push(input);
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    return this.chatImpl ? this.chatImpl(input) : super.mentorChat(input);
  }

  override async mentorSummarize(input: { system: string; prompt: string }): Promise<MentorSummaryOutput> {
    this.summaries.push(input);
    return this.summaryImpl ? this.summaryImpl(input) : super.mentorSummarize(input);
  }
}

/** A mentor store whose failures can be switched on, to test honest degraded behaviour. */
export class FlakyMentorStore extends MemoryMentorStore {
  failSaveConversation = false;
  failSaveMemory = false;
  failListMemories = false;

  override async saveConversation(r: ConversationRecord): Promise<void> {
    if (this.failSaveConversation) throw new Error("conversation store down");
    return super.saveConversation(r);
  }
  override async saveMemory(r: MemoryRecord): Promise<void> {
    if (this.failSaveMemory) throw new Error("memory store down");
    return super.saveMemory(r);
  }
  override async listMemories(uid: string, limit: number): Promise<MemoryRecord[]> {
    if (this.failListMemories) throw new Error("memory store down");
    return super.listMemories(uid, limit);
  }
}
