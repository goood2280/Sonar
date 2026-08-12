export type SourceKind = "FAB" | "INLINE" | "ET" | "VM" | "YIELD" | "DVC";

export type SourceRecord = {
  id: string;
  kind: SourceKind;
  name: string;
  uri: string;
  grain: string;
  rows: string;
  status: "ready" | "needs_mapping" | "pending";
  columns: string[];
};

export type AnchorRecord = {
  id: string;
  item: string;
  family: string;
  structure: string;
  unit: string;
  role: "anchor" | "context" | "target_candidate";
  coverage: number;
  confidence: "approved" | "draft" | "unknown";
  note: string;
};

export type RelationRecord = {
  id: string;
  from: string;
  to: string;
  relation: string;
  evidence: string;
  status: "approved" | "proposed";
};

export type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  proposedAnchor?: AnchorRecord;
};

export type ImportedAsset = {
  id: string;
  name: string;
  role: "database" | "config" | "data";
  provider: "local" | "s3";
  sourceUri: string;
  importedPath: string;
  size: number;
  importedAt: string;
};

export type WorkspaceState = {
  sources: SourceRecord[];
  anchors: AnchorRecord[];
  relations: RelationRecord[];
  messages: ChatMessage[];
  assets?: ImportedAsset[];
};
