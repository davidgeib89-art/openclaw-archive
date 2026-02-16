export type BrainIntent = "qa" | "edit" | "research" | "ops" | "creative";

export type BrainRiskLevel = "low" | "medium" | "high";

export type BrainPlanAction =
  | "analyze_request"
  | "gather_context"
  | "prepare_changes"
  | "ask_user"
  | "execute_safely"
  | "propose_answer";

export type BrainPlanStep = {
  stepId: string;
  action: BrainPlanAction;
  reason: string;
  target?: string;
};

export type BrainDecision = {
  decisionId: string;
  intent: BrainIntent;
  plan: BrainPlanStep[];
  riskLevel: BrainRiskLevel;
  allowedTools: string[];
  mustAskUser: boolean;
  explanation: string;
};

export type BrainDecisionInput = {
  userMessage: string;
  availableTools?: readonly string[];
  sessionKey?: string;
};

export type BrainObserverEntry = {
  ts: string;
  event: "brain.decision.observer";
  mode: "observer";
  source: string;
  sessionKey?: string;
  input: {
    userMessage: string;
    availableTools: string[];
  };
  decision: BrainDecision;
};

export type BrainGuidanceEntry = {
  ts: string;
  event: "brain.guidance.soft";
  mode: "guidance";
  source: string;
  sessionKey?: string;
  decisionId: string;
  riskLevel: BrainRiskLevel;
  mustAskUser: boolean;
  allowedTools: string[];
  note: string;
};

export type BrainAuditEntry = BrainObserverEntry | BrainGuidanceEntry;

export type BrainObserverOptions = {
  now?: Date;
  baseDir?: string;
  source?: string;
  sessionKey?: string;
};
