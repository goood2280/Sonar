import { env } from "cloudflare:workers";
import type { AnchorRecord, WorkspaceState } from "@/lib/types";

type ChatRequest = {
  message?: string;
  workspace?: WorkspaceState;
};

type AssistantPayload = {
  message: string;
  proposedAnchor?: AnchorRecord;
};

const SYSTEM = `You are Sonar's semiconductor data steward and RCA copilot.
Help one engineer organize FAB, INLINE, ET, VM, chip yield and DVC/performance data.
Never invent geometry, units, physical constants, item equations or measured values.
Treat ET-to-INLINE estimates as uncertain multi-fidelity estimates, not ground truth.
Distinguish association, clean-split evidence and causal claims.
Return JSON only: {"message": string, "proposedAnchor"?: {"id": string,"item": string,"family": string,"structure": string,"unit": string,"role": "anchor"|"context"|"target_candidate","coverage": number,"confidence": "draft"|"unknown","note": string}}.
Use proposedAnchor only when the user clearly defines one item. Keep coverage at 0 until measured from data.`;

function endpoint(raw: string) {
  const value = raw.replace(/\/$/, "");
  if (value.endsWith("/chat/completions")) return value;
  if (value.endsWith("/v1")) return `${value}/chat/completions`;
  return `${value}/v1/chat/completions`;
}

function extractObject(text: string): AssistantPayload | null {
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(match?.[0] ?? cleaned) as AssistantPayload;
  } catch {
    return null;
  }
}

function fallback(message: string): AssistantPayload {
  const upper = message.toUpperCase();
  if (upper.includes("KELVIN")) {
    return {
      message:
        "Kelvin item을 local contact anchor 후보로 정리했습니다. 단위, TEG 내부 위치, chain의 contact 개수와 line topology가 확인되기 전에는 구조값을 확정하지 않겠습니다.",
      proposedAnchor: {
        id: `anc-${Date.now()}`,
        item: "KELVIN_ITEM_DRAFT",
        family: "Kelvin",
        structure: "unverified local structure",
        unit: "unknown",
        role: "anchor",
        coverage: 0,
        confidence: "draft",
        note: "Confirm item ID, unit, TEG position and chain topology before approval.",
      },
    };
  }
  if (upper.includes("INLINE") || upper.includes("ANCHOR")) {
    return {
      message:
        "INLINE은 item마다 map과 sampling rule이 다르므로 global 평균으로 합치지 않겠습니다. anchor item별로 좌표계, sampling mask, 관측 wafer 비율, 관련 ET family를 먼저 등록한 뒤 ET latent로 masked reconstruction을 수행하세요.",
    };
  }
  if (upper.includes("YIELD") || upper.includes("DVC") || upper.includes("PERFORMANCE")) {
    return {
      message:
        "Target contract부터 고정하겠습니다. Yield는 wafer×chip, DVC는 wafer 또는 shot×metric grain을 유지하고 measured_at/available_at을 필수로 두세요. Target이 연결되기 전에는 correlation과 surrogate를 학습 완료로 표시하지 않습니다.",
    };
  }
  return {
    message:
      "이 내용을 draft 도메인 지식으로 정리할 수 있습니다. item ID, 단위, 측정 grain, TEG/shot 위치, 관측 시각, 관련 구조와 확신 수준을 알려주시면 registry와 검증 항목으로 나누겠습니다.",
  };
}

export async function POST(request: Request) {
  const body = (await request.json()) as ChatRequest;
  const message = body.message?.trim() ?? "";
  if (!message) return Response.json({ error: "message is required" }, { status: 400 });

  const rawEndpoint = env.GPT_OSS_ENDPOINT?.trim();
  if (!rawEndpoint) return Response.json({ ...fallback(message), provider: "alpha-fallback" });

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env.GPT_OSS_TOKEN) {
    const header = env.GPT_OSS_AUTH_HEADER || "Authorization";
    const scheme = env.GPT_OSS_AUTH_SCHEME ?? "Bearer";
    headers[header] = scheme ? `${scheme} ${env.GPT_OSS_TOKEN}` : env.GPT_OSS_TOKEN;
  }
  if (env.GPT_OSS_EXTRA_HEADERS_JSON) {
    try {
      Object.assign(headers, JSON.parse(env.GPT_OSS_EXTRA_HEADERS_JSON));
    } catch {
      return Response.json({ error: "GPT_OSS_EXTRA_HEADERS_JSON is invalid" }, { status: 500 });
    }
  }

  const context = {
    sources: body.workspace?.sources.map(({ kind, name, grain, status, columns }) => ({ kind, name, grain, status, columns })),
    anchors: body.workspace?.anchors,
    relations: body.workspace?.relations,
  };
  try {
    const response = await fetch(endpoint(rawEndpoint), {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: env.GPT_OSS_MODEL || "gpt-oss-120b",
        temperature: 0,
        max_tokens: 1200,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: JSON.stringify({ question: message, workspace: context }) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`GPT gateway returned ${response.status}`);
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content ?? "";
    const parsed = extractObject(text);
    if (!parsed?.message) throw new Error("GPT response did not match the Sonar schema");
    return Response.json({ ...parsed, provider: "gpt-oss-120b" });
  } catch (error) {
    return Response.json({
      ...fallback(message),
      provider: "alpha-fallback",
      warning: error instanceof Error ? error.message : "GPT unavailable",
    });
  }
}
