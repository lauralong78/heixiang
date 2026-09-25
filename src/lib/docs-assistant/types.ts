export type ImprovementDraft = {
  title: string;
  priority: string;
  cost: string;
};

export type DocsAssistantDraft = {
  projectName: string;
  problem: string;
  targetUsers: string;
  coreFeatures: string;
  techStack: string;
  setupSteps: string;
  dataApiDesign: string;
  responsibility: string;
  aiUsage: string;
  challenge: string;
  risks: [string, string, string];
  improvements: [ImprovementDraft, ImprovementDraft, ImprovementDraft];
  repositoryUrl: string;
  deploymentUrl: string;
  demoUrl: string;
};

export type MissingItem = {
  id: string;
  label: string;
  detail: string;
  group: "links" | "readme" | "demo" | "ownership" | "risks" | "roadmap";
};

export type UrlCheck =
  | { status: "empty"; value: "" }
  | { status: "valid"; value: string }
  | { status: "invalid"; value: string; reason: string };

export type GeneratedDocuments = {
  readme: string;
  onePager: string;
};
