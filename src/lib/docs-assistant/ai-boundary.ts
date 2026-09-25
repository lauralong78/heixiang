import type { DocsAssistantDraft, GeneratedDocuments } from "./types";

export type DocsAssistantSuggestionRequest = {
  draft: DocsAssistantDraft;
  currentDocuments: GeneratedDocuments;
};

export type DocsAssistantSuggestion = {
  document: keyof GeneratedDocuments;
  section: string;
  suggestion: string;
  rationale: string;
};

/**
 * Future server-side AI implementations must satisfy this boundary. The current
 * browser-only tool deliberately provides no implementation and makes no request.
 */
export interface DocsAssistantSuggestionProvider {
  suggest(
    request: DocsAssistantSuggestionRequest,
  ): Promise<readonly DocsAssistantSuggestion[]>;
}

export const DOCS_ASSISTANT_AI = {
  enabled: false,
  label: "AI 建议未启用",
} as const;
