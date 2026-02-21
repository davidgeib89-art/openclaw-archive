export type BrainIntent = "qa" | "edit" | "research" | "ops" | "creative" | "autonomous";

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
  workspaceDir?: string;
  trigger?: "message" | "heartbeat";
};

export type BrainSubconsciousMode = "answer_direct" | "ask_clarify" | "plan_then_answer";

export type BrainSubconsciousBrief = {
  goal: string;
  risk: BrainRiskLevel;
  mustAskUser: boolean;
  recommendedMode: BrainSubconsciousMode;
  notes: string;
};

export type BrainHomeostasisTelemetry = {
  current_latency_ms: number;
  context_window_usage_percent: number;
  recent_tool_error_count: number;
  recent_search_count: number;
};

export type BrainSubconsciousCuriositySignals = {
  recall_hits: number;
  intrinsic_learning_window_open: boolean;
};

export type BrainSubconsciousStatus = "ok" | "fail_open" | "skipped";

export type BrainSubconsciousResult = {
  status: BrainSubconsciousStatus;
  attempted: boolean;
  parseOk: boolean;
  failOpen: boolean;
  durationMs: number;
  timeoutMs: number;
  modelRef?: string;
  brief?: BrainSubconsciousBrief;
  error?: string;
};

export type BrainSubconsciousInput = {
  userMessage: string;
  sessionKey?: string;
  modelRef?: string;
  timeoutMs: number;
  homeostasis?: BrainHomeostasisTelemetry;
  curiosity?: BrainSubconsciousCuriositySignals;
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

export type BrainSubconsciousObserverEntry = {
  ts: string;
  event: "brain.subconscious.observer";
  mode: "observer";
  source: string;
  sessionKey?: string;
  input: BrainSubconsciousInput;
  result: BrainSubconsciousResult;
};

export type BrainAuditEntry =
  | BrainObserverEntry
  | BrainGuidanceEntry
  | BrainSubconsciousObserverEntry;

export type BrainObserverOptions = {
  now?: Date;
  baseDir?: string;
  source?: string;
  sessionKey?: string;
};
