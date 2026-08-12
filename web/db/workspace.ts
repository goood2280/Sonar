import { env } from "cloudflare:workers";
import type { WorkspaceState } from "@/lib/types";

const CREATE_STATE_TABLE = `
  CREATE TABLE IF NOT EXISTS workspace_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    state_key TEXT NOT NULL UNIQUE,
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

export async function ensureWorkspaceTable() {
  await env.DB.prepare(CREATE_STATE_TABLE).run();
}

export async function readWorkspaceState(): Promise<WorkspaceState | null> {
  await ensureWorkspaceTable();
  const row = await env.DB.prepare(
    "SELECT state_json FROM workspace_state WHERE state_key = ? LIMIT 1"
  )
    .bind("primary")
    .first<{ state_json: string }>();
  return row?.state_json ? (JSON.parse(row.state_json) as WorkspaceState) : null;
}

export async function writeWorkspaceState(state: WorkspaceState) {
  await ensureWorkspaceTable();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO workspace_state (state_key, state_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(state_key) DO UPDATE SET
       state_json = excluded.state_json,
       updated_at = excluded.updated_at`
  )
    .bind("primary", JSON.stringify(state), now)
    .run();
  return now;
}
