import { initialWorkspace } from "@/lib/demo";
import type { WorkspaceState } from "@/lib/types";
import { readWorkspaceState, writeWorkspaceState } from "@/db/workspace";

export async function GET() {
  try {
    const saved = await readWorkspaceState();
    return Response.json({ state: saved ?? initialWorkspace, persisted: Boolean(saved) });
  } catch (error) {
    return Response.json({
      state: initialWorkspace,
      persisted: false,
      warning: error instanceof Error ? error.message : "Workspace storage unavailable",
    });
  }
}

export async function POST(request: Request) {
  try {
    const state = (await request.json()) as WorkspaceState;
    if (!Array.isArray(state.sources) || !Array.isArray(state.anchors)) {
      return Response.json({ error: "invalid workspace state" }, { status: 400 });
    }
    const updatedAt = await writeWorkspaceState(state);
    return Response.json({ ok: true, updatedAt });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not save workspace" },
      { status: 500 }
    );
  }
}
