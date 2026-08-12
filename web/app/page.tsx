"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { initialWorkspace } from "@/lib/demo";
import type {
  AnchorRecord,
  ChatMessage,
  ImportedAsset,
  SourceKind,
  SourceRecord,
  WorkspaceState,
} from "@/lib/types";

type Section = "overview" | "explorer" | "data" | "registry" | "map" | "simulator";

type ExplorerProvider = "local" | "s3";
type ExplorerItem = {
  name: string;
  path: string;
  type: "folder" | "file";
  size: number | null;
  modified: string | null;
  supported: boolean;
};

const FILE_API = process.env.NEXT_PUBLIC_SONAR_FILE_API || "http://127.0.0.1:4711";

const nav: Array<{ id: Section; label: string; eyebrow: string }> = [
  { id: "overview", label: "Overview", eyebrow: "01" },
  { id: "explorer", label: "File explorer", eyebrow: "02" },
  { id: "data", label: "Data intake", eyebrow: "03" },
  { id: "registry", label: "Domain registry", eyebrow: "04" },
  { id: "map", label: "Map lab", eyebrow: "05" },
  { id: "simulator", label: "Surrogate lab", eyebrow: "06" },
];

const sourceColors: Record<SourceKind, string> = {
  FAB: "blue",
  INLINE: "amber",
  ET: "cyan",
  VM: "violet",
  YIELD: "red",
  DVC: "green",
};

function statusLabel(status: SourceRecord["status"]) {
  return status === "ready" ? "Ready" : status === "needs_mapping" ? "Map needed" : "Pending";
}

function makeMap(seed: number) {
  return Array.from({ length: 169 }, (_, index) => {
    const x = (index % 13) - 6;
    const y = Math.floor(index / 13) - 6;
    const radius = Math.sqrt(x * x + y * y);
    if (radius > 6.45) return null;
    const ring = Math.max(0, radius - 3.1) * 0.08;
    const hotspot = Math.exp(-((x - 2) ** 2 + (y + 1) ** 2) / 4) * 0.5;
    const wave = Math.sin((x + seed) * 0.7) * 0.05 + Math.cos((y - seed) * 0.45) * 0.04;
    return Math.max(0, Math.min(1, 0.32 + ring + hotspot + wave));
  });
}

function PanelTitle({ kicker, title, note }: { kicker: string; title: string; note?: string }) {
  return (
    <div className="panel-title">
      <div>
        <span className="kicker">{kicker}</span>
        <h2>{title}</h2>
      </div>
      {note ? <p>{note}</p> : null}
    </div>
  );
}

/*
 * 소나 스코프 — hero 우측 시각물
 *
 * 원근 평면(scale(1, .4))에 동심원과 회전 sweep 을 얹어 3D 처럼 보이게 한다.
 * 중앙의 잠수함이 Sonar 자신이고, 주변 contact 4개가 원천 데이터군이다.
 * sweep 이 지나가는 순간에만 contact 가 밝아지도록 각 blip 의 animation-delay 를
 * 자기 각도(A)에 맞춰 -(주기 - A/360*주기) 로 어긋나게 걸어 뒀다.
 *
 * 좌표는 중심 (180,138), 평면 y 압축률 .4 로 미리 계산한 값이다.
 * stroke 는 전부 non-scaling — 안 그러면 y 압축에 눌려 선 굵기가 달라진다.
 */
const CONTACTS = [
  { id: "c02", x: 188, y: 248, delay: "-1.2s", label: "C-02", range: "1.8 km" },
  { id: "c03", x: 270, y: 346, delay: "-3.8s", label: "C-03", range: "3.1 km" },
  { id: "c04", x: 564, y: 330, delay: "-5.5s", label: "C-04", range: "4.6 km" },
];

function SonarScope() {
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState<"active" | "passive">("active");
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const scopeStyle = {
    "--sonar-tilt-x": `${tilt.x}deg`,
    "--sonar-tilt-y": `${tilt.y}deg`,
  } as CSSProperties;

  return (
    <figure
      className={`sonar-scope ${paused ? "is-paused" : ""} is-${mode}`}
      aria-label="수중 잠수함 접촉을 입체적으로 탐지하는 Sonar 전술 스코프"
      style={scopeStyle}
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        setTilt({
          x: ((event.clientX - bounds.left) / bounds.width - 0.5) * 7,
          y: ((event.clientY - bounds.top) / bounds.height - 0.5) * -5,
        });
      }}
      onPointerLeave={() => setTilt({ x: 0, y: 0 })}
    >
      <div className="sonar-commandbar">
        <div className="sonar-status"><i /><span>SONAR ARRAY</span><strong>ONLINE</strong></div>
        <div className="sonar-modes" aria-label="소나 모드">
          <button className={mode === "passive" ? "active" : ""} onClick={() => setMode("passive")}>PASSIVE</button>
          <button className={mode === "active" ? "active" : ""} onClick={() => setMode("active")}>ACTIVE</button>
        </div>
        <button className="sonar-pause" onClick={() => setPaused((value) => !value)} aria-pressed={paused}>
          {paused ? "RESUME" : "HOLD"}
        </button>
      </div>

      <div className="sonar-viewport">
        <div className="sonar-caustics" />
        <div className="sonar-particles" aria-hidden="true">
          {Array.from({ length: 18 }, (_, index) => <i key={index} />)}
        </div>

        <svg className="sonar-scene" viewBox="0 0 720 440" role="img" aria-labelledby="sonar-scene-title sonar-scene-desc">
          <title id="sonar-scene-title">3D 수중 소나 추적 화면</title>
          <desc id="sonar-scene-desc">우현 전방 2.4킬로미터, 수심 380미터에서 잠수함 접촉 하나를 추적 중입니다.</desc>
          <defs>
            <linearGradient id="sonar-water" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#07171c" />
              <stop offset="0.55" stopColor="#061114" />
              <stop offset="1" stopColor="#020708" />
            </linearGradient>
            <radialGradient id="sonar-horizon" cx="50%" cy="28%" r="70%">
              <stop offset="0" stopColor="#12424a" stopOpacity="0.36" />
              <stop offset="0.45" stopColor="#082429" stopOpacity="0.2" />
              <stop offset="1" stopColor="#020708" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="sonar-floor" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#123e3d" stopOpacity="0.44" />
              <stop offset="0.62" stopColor="#0b2728" stopOpacity="0.3" />
              <stop offset="1" stopColor="#031012" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="sonar-sweep-fill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ff8a4c" stopOpacity="0.04" />
              <stop offset="1" stopColor="#ff8a4c" stopOpacity="0.42" />
            </linearGradient>
            <linearGradient id="submarine-hull" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#b9e5df" />
              <stop offset="0.3" stopColor="#3f7e7b" />
              <stop offset="0.62" stopColor="#183c3c" />
              <stop offset="1" stopColor="#061617" />
            </linearGradient>
            <linearGradient id="submarine-top" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#234c4b" />
              <stop offset="0.55" stopColor="#82b7b0" />
              <stop offset="1" stopColor="#15302f" />
            </linearGradient>
            <filter id="sonar-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="submarine-shadow" x="-30%" y="-80%" width="180%" height="260%">
              <feDropShadow dx="0" dy="14" stdDeviation="11" floodColor="#000" floodOpacity="0.8" />
            </filter>
          </defs>

          <rect width="720" height="440" fill="url(#sonar-water)" />
          <rect width="720" height="440" fill="url(#sonar-horizon)" />
          <path className="sonar-seabed" d="M0 344 C88 318 154 354 230 338 C316 320 362 358 448 333 C534 307 614 339 720 308 L720 440 L0 440 Z" />

          <g className="sonar-depth-grid">
            {[94, 138, 182, 226, 270, 314, 358, 402].map((x) => <line key={x} x1="360" y1="244" x2={x} y2="440" />)}
            {[280, 318, 356, 394, 432].map((y, index) => (
              <path key={y} d={`M${50 - index * 20} ${y} Q360 ${y - 48 - index * 3} ${670 + index * 20} ${y}`} />
            ))}
          </g>

          <g className="sonar-range-plane" transform="translate(360 304) scale(1 .34)">
            <circle r="306" fill="url(#sonar-floor)" />
            {[72, 132, 194, 254, 306].map((r) => <circle key={r} className="sonar-ring" r={r} vectorEffect="non-scaling-stroke" />)}
            {[0, 30, 60, 90, 120, 150].map((angle) => {
              const radians = angle * Math.PI / 180;
              return <line key={angle} className="sonar-ring sonar-spoke" x1={-306 * Math.cos(radians)} y1={-306 * Math.sin(radians)} x2={306 * Math.cos(radians)} y2={306 * Math.sin(radians)} vectorEffect="non-scaling-stroke" />;
            })}
            <circle className="sonar-ping" r="306" vectorEffect="non-scaling-stroke" />
            <circle className="sonar-ping sonar-ping--late" r="306" vectorEffect="non-scaling-stroke" />
            <g className="sonar-sweep">
              <path d="M0 0 L306 0 A306 306 0 0 0 216.4 -216.4 Z" fill="url(#sonar-sweep-fill)" />
              <line className="sonar-beam" x1="0" y1="0" x2="306" y2="0" vectorEffect="non-scaling-stroke" />
            </g>
          </g>

          <g className="sonar-emitter" transform="translate(360 304)" filter="url(#sonar-glow)">
            <circle r="18" />
            <path d="M0 -12 L9 0 L0 12 L-9 0 Z" />
            <circle className="sonar-emitter-core" r="3" />
          </g>

          {CONTACTS.map((contact) => (
            <g key={contact.id} className="sonar-contact" style={{ animationDelay: contact.delay }} transform={`translate(${contact.x} ${contact.y})`}>
              <circle r="10" />
              <path d="M-14 -8 L-14 -14 L-8 -14 M8 -14 L14 -14 L14 -8 M14 8 L14 14 L8 14 M-8 14 L-14 14 L-14 8" />
              <text x="18" y="-3">{contact.label}</text>
              <text className="sonar-contact-range" x="18" y="11">{contact.range}</text>
            </g>
          ))}

          <g className="sonar-target" transform="translate(485 203) rotate(-4)" filter="url(#submarine-shadow)">
            <ellipse className="sonar-target-aura" cx="0" cy="7" rx="96" ry="43" />
            <g className="sonar-submarine">
              <path className="submarine-fin far" d="M-43 7 L-21 -22 L-5 1 Z" />
              <path className="submarine-tail-fin far" d="M-76 2 L-100 -24 L-94 4 Z" />
              <path className="submarine-hull" d="M-96 4 C-82 -15 -42 -22 18 -21 C63 -20 91 -8 103 3 C89 18 57 27 9 29 C-38 31 -78 22 -96 4 Z" />
              <path className="submarine-topline" d="M-79 2 C-49 -9 16 -11 74 -3 C34 -6 -22 -5 -68 8 Z" />
              <path className="submarine-sail" d="M-17 -19 L-4 -44 L22 -44 L34 -18 Z" />
              <path className="submarine-sail-top" d="M-4 -44 L7 -51 L24 -45 L22 -40 Z" />
              <path className="submarine-periscope" d="M6 -47 L7 -64 L10 -64 L11 -48 Z M16 -46 L18 -58 L21 -58 L21 -44 Z" />
              <path className="submarine-fin" d="M-23 20 L14 50 L42 23 Z" />
              <path className="submarine-tail-fin" d="M-82 6 L-105 35 L-94 8 Z" />
              <path className="submarine-rudder" d="M-91 1 L-112 -7 L-93 -11 Z" />
              <ellipse className="submarine-highlight" cx="40" cy="-8" rx="34" ry="5" />
            </g>
          </g>

          <g className="sonar-lock" transform="translate(485 203)">
            <circle r="78" />
            <circle className="sonar-lock-pulse" r="58" />
            <path d="M-84 -58 L-84 -76 L-66 -76 M66 -76 L84 -76 L84 -58 M84 58 L84 76 L66 76 M-66 76 L-84 76 L-84 58" />
            <line x1="82" y1="-56" x2="146" y2="-103" />
          </g>

          <g className="sonar-depth-scale">
            <line x1="32" y1="82" x2="32" y2="360" />
            {[0, 100, 200, 300, 400].map((depth, index) => (
              <g key={depth} transform={`translate(0 ${82 + index * 69.5})`}><line x1="27" x2="39" /><text x="46" y="4">{depth}m</text></g>
            ))}
          </g>
        </svg>

        <div className="sonar-target-card">
          <span>PRIMARY CONTACT</span>
          <strong>SSN—041</strong>
          <dl>
            <div><dt>RANGE</dt><dd>2.4 KM</dd></div>
            <div><dt>DEPTH</dt><dd>380 M</dd></div>
            <div><dt>BEARING</dt><dd>067°</dd></div>
            <div><dt>CONF.</dt><dd>94.8%</dd></div>
          </dl>
        </div>

        <div className="sonar-bearing"><span>330</span><span>000</span><strong>030</strong><span>060</span><span>090</span></div>
        <div className="sonar-footnote"><span>{mode.toUpperCase()} PULSE · 11.6 KHZ</span><span>SEA STATE 2</span><strong>CONTACTS 04</strong></div>
      </div>
    </figure>
  );
}

function Overview({ state, setSection }: { state: WorkspaceState; setSection: (value: Section) => void }) {
  const ready = state.sources.filter((source) => source.status === "ready").length;
  return (
    <div className="section-stack">
      <section className="hero-grid">
        <div className="hero-copy">
          <span className="kicker">Independent semiconductor intelligence</span>
          <h1>구조를 압축해<br />원인을 추론합니다.</h1>
          <p className="hero-formula">
            <code>FAB · ET · INLINE · VM</code>
            <i>→</i>
            <code>24D map latent</code>
            <i>→</i>
            <code>yield · DVC</code>
          </p>
          <p>좌표를 열로 펼치지 않고, 검증 가능한 descriptor로 압축해 추론합니다.</p>
          <div className="hero-actions">
            <button className="button primary" onClick={() => setSection("data")}>원본 데이터 연결</button>
            <button className="button secondary" onClick={() => setSection("registry")}>Anchor 정리하기</button>
          </div>
        </div>
        <SonarScope />
      </section>

      <section className="metric-row">
        <article><span>Sources ready</span><strong>{ready}<small> / {state.sources.length}</small></strong><em>S3 contracts</em></article>
        <article><span>Anchor items</span><strong>{state.anchors.length}</strong><em>{state.anchors.filter((a) => a.confidence === "approved").length} approved</em></article>
        <article><span>Feature budget</span><strong>42</strong><em>24 latent + 18 explainable</em></article>
        <article><span>Target readiness</span><strong className="warn">0%</strong><em>Yield · DVC pending</em></article>
      </section>

      <section className="architecture-board">
        <PanelTitle kicker="Runtime shape" title="S3를 경계로 완전히 독립 운영" note="Flow는 서비스 의존성이 아니라 versioned geometry package만 제공합니다." />
        <div className="pipeline">
          <div className="pipe-card"><span>Valve side</span><strong>Raw producer</strong><small>FAB · ET · INLINE · VM</small></div>
          <div className="pipe-arrow">S3</div>
          <div className="pipe-card active"><span>Sonar</span><strong>Canonical long-form</strong><small>Clock · quality · lineage</small></div>
          <div className="pipe-arrow">→</div>
          <div className="pipe-card"><span>Experts</span><strong>Tree-MoE</strong><small>Process · spatial · rare</small></div>
          <div className="pipe-arrow">→</div>
          <div className="pipe-card"><span>Evidence</span><strong>GPT-OSS RCA</strong><small>Proposal · validation · review</small></div>
        </div>
      </section>

      <section className="two-col">
        <div className="surface">
          <PanelTitle kicker="Column control" title="열 폭발을 막는 3층 표현" />
          <div className="layer-list">
            <div><b>01</b><span><strong>Point store</strong><small>wafer × shot × TEG × item을 long-form으로 보존</small></span><em>∞ rows</em></div>
            <div><b>02</b><span><strong>Fixed latent</strong><small>mask-aware SVD / spatial basis / morphology</small></span><em>24 dims</em></div>
            <div><b>03</b><span><strong>Explainable top-K</strong><small>radial · quadrant · hotspot · anchor residual</small></span><em>18 cols</em></div>
          </div>
        </div>
        <div className="surface">
          <PanelTitle kicker="Next gate" title="POC 승인 조건" />
          <ul className="check-list">
            <li className="done">Valve S3 source contract</li>
            <li className="done">ET full-shot coordinate fields</li>
            <li>INLINE anchor item map registry</li>
            <li>Chip yield target with available_at</li>
            <li>DVC grain decision: chip / shot / wafer</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

function formatBytes(size: number | null) {
  if (size === null) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`;
  return `${(size / 1024 ** 3).toFixed(1)} GB`;
}

function FileExplorer({ state, setState }: { state: WorkspaceState; setState: (value: WorkspaceState) => void }) {
  const [provider, setProvider] = useState<ExplorerProvider>("local");
  const [currentPath, setCurrentPath] = useState("");
  const [items, setItems] = useState<ExplorerItem[]>([]);
  const [selected, setSelected] = useState<ExplorerItem | null>(null);
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState("로컬 파일 서비스 확인 중…");
  const [rootLabel, setRootLabel] = useState("Local root");
  const [role, setRole] = useState<ImportedAsset["role"]>("config");

  async function load(nextProvider = provider, nextPath = currentPath) {
    setStatus("목록을 읽는 중…");
    setSelected(null);
    setPreview("");
    try {
      const response = await fetch(`${FILE_API}/api/files?provider=${nextProvider}&path=${encodeURIComponent(nextPath)}`);
      const result = await response.json() as { items?: ExplorerItem[]; bucket?: string | null; error?: string };
      if (!response.ok) throw new Error(result.error || "목록을 읽지 못했습니다.");
      setItems(result.items || []);
      setRootLabel(nextProvider === "s3" ? `s3://${result.bucket || "not-configured"}` : "Local root");
      setStatus(`${result.items?.length || 0} items`);
    } catch (error) {
      setItems([]);
      setStatus(error instanceof Error ? error.message : "파일 서비스에 연결할 수 없습니다.");
    }
  }

  useEffect(() => {
    let active = true;
    const url = `${FILE_API}/api/files?provider=${provider}&path=${encodeURIComponent(currentPath)}`;
    fetch(url)
      .then(async (response) => {
        const result = await response.json() as { items?: ExplorerItem[]; bucket?: string | null; error?: string };
        if (!response.ok) throw new Error(result.error || "목록을 읽지 못했습니다.");
        if (!active) return;
        setItems(result.items || []);
        setRootLabel(provider === "s3" ? `s3://${result.bucket || "not-configured"}` : "Local root");
        setStatus(`${result.items?.length || 0} items`);
        setSelected(null);
        setPreview("");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setItems([]);
        setStatus(error instanceof Error ? error.message : "파일 서비스에 연결할 수 없습니다.");
      });
    return () => { active = false; };
  }, [provider, currentPath]);

  function switchProvider(next: ExplorerProvider) {
    setProvider(next);
    setCurrentPath("");
  }

  function up() {
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join("/"));
  }

  async function choose(item: ExplorerItem) {
    if (item.type === "folder") {
      setCurrentPath(item.path);
      return;
    }
    setSelected(item);
    setPreview(item.supported ? "미리보기를 읽는 중…" : "지원하지 않는 파일 형식입니다.");
    if (!item.supported) return;
    try {
      const response = await fetch(`${FILE_API}/api/preview?provider=${provider}&path=${encodeURIComponent(item.path)}`);
      const result = await response.json() as { text?: string; error?: string };
      setPreview(response.ok ? result.text || "빈 파일입니다." : result.error || "미리보기 없음");
    } catch {
      setPreview("DB·Parquet 등 바이너리 파일은 가져온 뒤 schema scan 단계에서 확인합니다.");
    }
  }

  async function importSelected() {
    if (!selected) return;
    setStatus(`${selected.name} 가져오는 중…`);
    try {
      const response = await fetch(`${FILE_API}/api/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, path: selected.path }),
      });
      const result = await response.json() as { importedPath?: string; sourceUri?: string; size?: number; error?: string };
      if (!response.ok || !result.importedPath || !result.sourceUri) throw new Error(result.error || "가져오기에 실패했습니다.");
      const asset: ImportedAsset = {
        id: `asset-${Date.now()}`,
        name: selected.name,
        role,
        provider,
        sourceUri: result.sourceUri,
        importedPath: result.importedPath,
        size: result.size || 0,
        importedAt: new Date().toISOString(),
      };
      setState({ ...state, assets: [...(state.assets || []), asset] });
      setStatus(`${selected.name} → 로컬 staging 완료`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "가져오기에 실패했습니다.");
    }
  }

  return (
    <div className="section-stack">
      <PanelTitle kicker="Local-first explorer" title="로컬 폴더와 S3를 한 화면에서 탐색" note="브라우저에는 자격증명을 노출하지 않고 127.0.0.1 sidecar가 파일과 S3를 읽습니다." />
      <section className="explorer-shell surface">
        <div className="explorer-toolbar">
          <div className="provider-tabs">
            <button className={provider === "local" ? "active" : ""} onClick={() => switchProvider("local")}>Local</button>
            <button className={provider === "s3" ? "active" : ""} onClick={() => switchProvider("s3")}>S3</button>
          </div>
          <button className="icon-button" onClick={up} disabled={!currentPath} aria-label="상위 폴더">↑</button>
          <div className="breadcrumb"><b>{rootLabel}</b>{currentPath ? <span> / {currentPath}</span> : null}</div>
          <button className="icon-button" onClick={() => load()} aria-label="새로고침">↻</button>
        </div>
        <div className="explorer-grid">
          <div className="file-list">
            <div className="file-list-head"><span>Name</span><span>Size</span><span>Modified</span></div>
            {items.map((item) => (
              <button key={item.path} className={`file-row ${selected?.path === item.path ? "selected" : ""}`} onClick={() => choose(item)}>
                <span className={`file-icon ${item.type}`}>{item.type === "folder" ? "▰" : "▤"}</span>
                <span className="file-name"><b>{item.name}</b><small>{item.type === "file" && !item.supported ? "unsupported" : item.type}</small></span>
                <span>{formatBytes(item.size)}</span>
                <span>{item.modified ? new Date(item.modified).toLocaleDateString("ko-KR") : "—"}</span>
              </button>
            ))}
            {!items.length ? <div className="empty-files">{status}</div> : null}
          </div>
          <aside className="file-inspector">
            <span className="kicker">Inspector</span>
            <h3>{selected?.name || "파일을 선택하세요"}</h3>
            {selected ? <><code>{provider === "s3" ? "s3://" : "local://"}{selected.path}</code><pre>{preview}</pre><label>Asset 역할<select value={role} onChange={(event) => setRole(event.target.value as ImportedAsset["role"])}><option value="database">Database</option><option value="config">Config / manifest</option><option value="data">Data file</option></select></label><button className="button primary" disabled={!selected.supported} onClick={importSelected}>Local staging으로 가져오기</button></> : <p>`.db`, `.duckdb`, `.sqlite`, `.json`, `.yaml`, `.parquet`, `.csv` 등을 선택할 수 있습니다.</p>}
          </aside>
        </div>
        <div className="explorer-status"><span className="health-dot" />{status}</div>
      </section>
      <section className="surface imported-assets">
        <PanelTitle kicker="Imported assets" title="Sonar local staging" note="원본 위치와 로컬 사본을 함께 기록하므로 lineage를 잃지 않습니다." />
        {(state.assets || []).map((asset) => <div className="asset-row" key={asset.id}><span className={`asset-role ${asset.role}`}>{asset.role}</span><div><strong>{asset.name}</strong><small>{asset.sourceUri}</small></div><code>{asset.importedPath}</code><em>{formatBytes(asset.size)}</em></div>)}
        {!(state.assets || []).length ? <div className="empty-assets">아직 가져온 DB·설정 파일이 없습니다.</div> : null}
      </section>
    </div>
  );
}

function DataIntake({ state, setState }: { state: WorkspaceState; setState: (value: WorkspaceState) => void }) {
  const [kind, setKind] = useState<SourceKind>("ET");
  const [name, setName] = useState("");
  const [uri, setUri] = useState("s3://");
  const [grain, setGrain] = useState("wafer × item × shot × TEG");
  const [uploadNote, setUploadNote] = useState("");

  function addSource() {
    if (!name.trim() || !uri.trim()) return;
    const source: SourceRecord = {
      id: `src-${Date.now()}`,
      kind,
      name: name.trim(),
      uri: uri.trim(),
      grain: grain.trim(),
      rows: "scan pending",
      status: "needs_mapping",
      columns: [],
    };
    setState({ ...state, sources: [...state.sources, source] });
    setName("");
  }

  async function uploadManifest(file: File | null) {
    if (!file) return;
    setUploadNote("Uploading manifest…");
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const result = (await response.json()) as { uri?: string; error?: string };
      setUploadNote(result.uri ? `Saved ${result.uri}` : result.error ?? "Upload failed");
    } catch {
      setUploadNote("Upload storage is available after deployment. Use an S3 URI locally.");
    }
  }

  return (
    <div className="section-stack">
      <PanelTitle kicker="Data intake" title="원본은 S3 long-form으로 등록" note="대용량 파일은 브라우저에 올리지 않고 URI·grain·clock contract만 관리합니다." />
      <section className="two-col intake-grid">
        <div className="surface form-surface">
          <h3>새 source contract</h3>
          <label>데이터 종류<select value={kind} onChange={(e) => setKind(e.target.value as SourceKind)}>{Object.keys(sourceColors).map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>표시 이름<input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: Kelvin full-shot ET" /></label>
          <label>S3 URI<input value={uri} onChange={(e) => setUri(e.target.value)} /></label>
          <label>측정 grain<input value={grain} onChange={(e) => setGrain(e.target.value)} /></label>
          <button className="button primary" onClick={addSource}>Contract 추가</button>
          <div className="upload-box">
            <span>작은 manifest / dictionary만 업로드</span>
            <input type="file" accept=".csv,.json,.yaml,.yml,.txt" onChange={(e) => uploadManifest(e.target.files?.[0] ?? null)} />
            {uploadNote ? <small>{uploadNote}</small> : null}
          </div>
        </div>
        <div className="surface contract-note">
          <span className="kicker">Required contract</span>
          <h3>Target grain은 섞지 않습니다</h3>
          <div className="grain-row"><b>Yield</b><span>wafer × chip</span><em>pass/fail · bin · available_at</em></div>
          <div className="grain-row"><b>DVC</b><span>chip / shot / wafer × metric</span><em>test condition · available_at</em></div>
          <div className="grain-row"><b>Feature</b><span>wafer × point</span><em>예측 시점 이전 데이터만</em></div>
          <p>Chip target은 chip 모델에, wafer target은 wafer 모델에 연결하고 서로 다른 head로 유지합니다.</p>
        </div>
      </section>
      <section className="source-table surface">
        <div className="table-head"><span>Source</span><span>Grain</span><span>Location</span><span>Status</span></div>
        {state.sources.map((source) => (
          <div className="table-row" key={source.id}>
            <div className="source-name"><i className={`source-dot ${sourceColors[source.kind]}`} /><span><strong>{source.name}</strong><small>{source.kind} · {source.rows}</small></span></div>
            <span>{source.grain}</span><code>{source.uri}</code><span className={`status ${source.status}`}>{statusLabel(source.status)}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

function Registry({ state, setState }: { state: WorkspaceState; setState: (value: WorkspaceState) => void }) {
  function approve(anchor: AnchorRecord) {
    setState({ ...state, anchors: state.anchors.map((item) => item.id === anchor.id ? { ...item, confidence: "approved" } : item) });
  }
  return (
    <div className="section-stack">
      <PanelTitle kicker="Domain registry" title="대화로 만든 Anchor와 구조 관계" note="GPT 제안은 draft로만 들어오며 사람이 승인해야 feature와 simulation에 사용됩니다." />
      <section className="anchor-grid">
        {state.anchors.map((anchor) => (
          <article className="anchor-card" key={anchor.id}>
            <div className="anchor-top"><span className={`family family-${anchor.family.toLowerCase()}`}>{anchor.family}</span><span className={`confidence ${anchor.confidence}`}>{anchor.confidence}</span></div>
            <h3>{anchor.item}</h3>
            <p>{anchor.structure}</p>
            <div className="coverage"><span style={{ width: `${anchor.coverage}%` }} /></div>
            <div className="anchor-meta"><span>{anchor.unit}</span><span>{anchor.coverage}% coverage</span><span>{anchor.role}</span></div>
            <small>{anchor.note}</small>
            {anchor.confidence !== "approved" ? <button className="text-button" onClick={() => approve(anchor)}>검토 후 승인</button> : null}
          </article>
        ))}
      </section>
      <section className="two-col">
        <div className="surface">
          <PanelTitle kicker="Structure graph" title="현재 관계 후보" />
          <div className="relation-list">
            {state.relations.map((relation) => (
              <div key={relation.id}><strong>{relation.from}</strong><span>→ {relation.relation} →</span><strong>{relation.to}</strong><em>{relation.status}</em></div>
            ))}
          </div>
        </div>
        <div className="surface teg-card">
          <PanelTitle kicker="TEG topology" title="Shot 내부 위치 registry" />
          <div className="teg-stage">
            <span className="teg-point p1">Kelvin<small>-4.2, 1.8</small></span>
            <span className="teg-point p2">Chain<small>0.8, 2.6</small></span>
            <span className="teg-point p3">PC–CA<small>3.9, -1.6</small></span>
            <span className="teg-point p4">OCD<small>-1.4, -3.2</small></span>
          </div>
        </div>
      </section>
    </div>
  );
}

function MapLab() {
  const [metric, setMetric] = useState<"latent" | "yield" | "dvc">("latent");
  const values = useMemo(() => makeMap(metric === "latent" ? 1 : metric === "yield" ? 2 : 3), [metric]);
  return (
    <div className="section-stack">
      <PanelTitle kicker="Map lab" title="모양과 결과를 함께 보는 공간 근거" note="좌표별 열을 만들지 않고 fixed map latent와 해석 descriptor를 함께 저장합니다." />
      <section className="map-layout">
        <div className="surface map-surface">
          <div className="map-toolbar">
            <div><strong>SBXL-2051 · W18</strong><small>ET_KELVIN_CONT · 169-point aligned mask</small></div>
            <div className="segmented">
              {(["latent", "yield", "dvc"] as const).map((item) => <button key={item} className={metric === item ? "active" : ""} onClick={() => setMetric(item)}>{item === "latent" ? "ET latent" : item.toUpperCase()}</button>)}
            </div>
          </div>
          <div className="wafer-map" aria-label={`${metric} wafer map`}>
            {values.map((value, index) => <span key={index} className={value === null ? "void" : "cell"} style={value === null ? undefined : { "--level": value } as React.CSSProperties} />)}
          </div>
          <div className="map-legend"><span>Low</span><i /><span>High</span></div>
        </div>
        <div className="surface evidence-panel">
          <span className="kicker">Morphology evidence</span>
          <h3>Edge ring + southeast hotspot</h3>
          <div className="evidence-score"><strong>0.84</strong><span>shape confidence</span></div>
          <div className="descriptor"><span>Radial slope</span><b>+0.62</b></div>
          <div className="descriptor"><span>Hotspot overlap</span><b>0.71</b></div>
          <div className="descriptor"><span>Basis cosine</span><b>0.88</b></div>
          <div className="descriptor"><span>Valid mask</span><b>92%</b></div>
          <p>유사 wafer 17개 중 12개가 동일 ET tail 방향을 보였습니다. 아직 chip yield label이 없어 원인으로 승격하지 않습니다.</p>
        </div>
      </section>
      <section className="surface similar-table">
        <PanelTitle kicker="Retrieval" title="비슷한 과거 map" />
        {[['SBXL-1988 · W07','0.91','same recipe','Yield pending'],['SBXL-2012 · W14','0.87','same EQP epoch','DVC pending'],['SBXL-1931 · W22','0.82','different lot','Yield pending']].map((row) => <div key={row[0]}><strong>{row[0]}</strong><span>Similarity {row[1]}</span><em>{row[2]}</em><b>{row[3]}</b></div>)}
      </section>
    </div>
  );
}

function Simulator() {
  const [topCd, setTopCd] = useState(0);
  const [ocd, setOcd] = useState(0);
  const [knob, setKnob] = useState(0);
  const etDelta = -0.7 * topCd + 0.35 * ocd + 0.2 * knob;
  const leakage = 0.42 * topCd + 0.68 * ocd + 0.12 * knob;
  const yieldDelta = -0.23 * Math.abs(topCd) - 0.14 * Math.max(0, leakage) + 0.18 * knob;
  const dvcDelta = 0.31 * topCd - 0.18 * ocd + 0.22 * knob;
  const support = Math.max(12, Math.round(86 - Math.abs(topCd) * 10 - Math.abs(ocd) * 8 - Math.abs(knob) * 12));
  return (
    <div className="section-stack">
      <PanelTitle kicker="Surrogate lab · Stage 2" title="Split을 넣고 전사 경로를 미리 확인" note="과거 support 범위 안의 data-driven counterfactual이며 물리 TCAD가 아닙니다." />
      <section className="sim-layout">
        <div className="surface controls-panel">
          <label><span>Top CD shift <b>{topCd > 0 ? '+' : ''}{topCd.toFixed(1)} nm</b></span><input type="range" min="-3" max="3" step="0.2" value={topCd} onChange={(e) => setTopCd(Number(e.target.value))} /></label>
          <label><span>OCD profile shift <b>{ocd > 0 ? '+' : ''}{ocd.toFixed(1)} nm</b></span><input type="range" min="-2" max="2" step="0.2" value={ocd} onChange={(e) => setOcd(Number(e.target.value))} /></label>
          <label><span>KNOB normalized <b>{knob > 0 ? '+' : ''}{knob.toFixed(1)} σ</b></span><input type="range" min="-2" max="2" step="0.2" value={knob} onChange={(e) => setKnob(Number(e.target.value))} /></label>
          <div className="support-meter"><span style={{ width: `${support}%` }} /><b>{support}% historical support</b></div>
          <p>Support 40% 아래에서는 추천이 아니라 extrapolation 경고만 제공합니다.</p>
        </div>
        <div className="sim-chain">
          <div><span>01 · Structure</span><strong>Top CD {topCd >= 0 ? '+' : ''}{topCd.toFixed(1)} nm</strong><small>OCD profile {ocd >= 0 ? '+' : ''}{ocd.toFixed(1)} nm</small></div>
          <i>→</i>
          <div><span>02 · ET latent</span><strong>{etDelta >= 0 ? '+' : ''}{etDelta.toFixed(2)} σ</strong><small>PC–CA LKG {leakage >= 0 ? '+' : ''}{leakage.toFixed(2)} σ</small></div>
          <i>→</i>
          <div><span>03 · Outcome</span><strong>Yield {yieldDelta >= 0 ? '+' : ''}{yieldDelta.toFixed(2)} pt</strong><small>DVC {dvcDelta >= 0 ? '+' : ''}{dvcDelta.toFixed(2)}%</small></div>
        </div>
      </section>
      <section className="two-col">
        <div className="surface"><PanelTitle kicker="Replay contract" title="실제 split과 상보 검증" /><ul className="check-list"><li>사전 CD/OCD 예상값 저장</li><li>실제 INLINE 이행 delta 비교</li><li>ET/Kelvin/Chain residual 비교</li><li>Chip yield·DVC 결과 비교</li><li>단계별 discrepancy 재학습</li></ul></div>
        <div className="surface"><PanelTitle kicker="Safety" title="현재 제약" /><div className="warning-box">Yield와 DVC label이 아직 없으므로 수치는 UI 동작을 보여주는 synthetic surrogate입니다. 실제 source가 연결되면 동일 화면에서 model version·uncertainty·support를 표시합니다.</div></div>
      </section>
    </div>
  );
}

function Assistant({ state, setState }: { state: WorkspaceState; setState: (value: WorkspaceState) => void }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [state.messages]);

  async function send(text = input) {
    const clean = text.trim();
    if (!clean || busy) return;
    const user: ChatMessage = { id: `m-${Date.now()}`, role: "user", text: clean };
    const next = { ...state, messages: [...state.messages, user] };
    setState(next);
    setInput("");
    setBusy(true);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: clean, workspace: next }) });
      const data = (await response.json()) as { message?: string; proposedAnchor?: AnchorRecord; provider?: string; error?: string };
      const assistant: ChatMessage = { id: `m-${Date.now()}-a`, role: "assistant", text: data.message ?? data.error ?? "응답을 만들지 못했습니다.", proposedAnchor: data.proposedAnchor };
      setState({ ...next, messages: [...next.messages, assistant] });
    } catch {
      setState({ ...next, messages: [...next.messages, { id: `m-${Date.now()}-a`, role: "assistant", text: "내부 GPT endpoint가 연결되지 않았습니다. S3와 registry 작업은 계속할 수 있습니다." }] });
    } finally { setBusy(false); }
  }

  function apply(anchor: AnchorRecord, messageId: string) {
    setState({ ...state, anchors: [...state.anchors, anchor], messages: state.messages.map((message) => message.id === messageId ? { ...message, proposedAnchor: undefined } : message) });
  }

  return (
    <aside className="assistant-panel">
      <div className="assistant-head"><div><span className="live-dot" /><strong>Sonar Copilot</strong><small>GPT-OSS 120B · evidence-first</small></div><button aria-label="Clear conversation" onClick={() => setState({ ...state, messages: [initialWorkspace.messages[0]] })}>Clear</button></div>
      <div className="suggestions">
        <button onClick={() => send("INLINE anchor item별 map과 관련 ET family를 어떻게 정리할까?")}>INLINE anchor 정리</button>
        <button onClick={() => send("Kelvin과 chain의 TEG 구조 관계를 draft로 만들어줘")}>Kelvin / Chain</button>
        <button onClick={() => send("Yield와 DVC target grain 계약을 점검해줘")}>Target grain</button>
      </div>
      <div className="chat-scroll" ref={scrollRef}>
        {state.messages.map((message) => (
          <div className={`message ${message.role}`} key={message.id}>
            <span>{message.role === "assistant" ? "S" : "You"}</span><p>{message.text}</p>
            {message.proposedAnchor ? <div className="proposal"><b>Draft anchor · {message.proposedAnchor.family}</b><code>{message.proposedAnchor.item}</code><button onClick={() => apply(message.proposedAnchor!, message.id)}>Registry에 적용</button></div> : null}
          </div>
        ))}
        {busy ? <div className="thinking">Evidence와 registry를 확인하는 중…</div> : null}
      </div>
      <div className="chat-input"><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="데이터나 공정 구조를 설명해 주세요…" /><button onClick={() => send()} disabled={busy}>Send</button></div>
      <p className="assistant-foot">GPT 제안은 자동으로 학습에 반영되지 않습니다. 승인된 registry만 feature와 simulation을 활성화합니다.</p>
    </aside>
  );
}

export default function Home() {
  const [section, setSection] = useState<Section>("overview");
  const [state, setState] = useState<WorkspaceState>(initialWorkspace);
  const [saveState, setSaveState] = useState("Demo workspace");

  useEffect(() => {
    fetch("/api/workspace").then((response) => response.json()).then((data: { state?: WorkspaceState; persisted?: boolean }) => {
      if (data.state) setState(data.state);
      setSaveState(data.persisted ? "Saved workspace" : "Demo workspace");
    }).catch(() => setSaveState("Demo workspace"));
  }, []);

  async function save() {
    setSaveState("Saving…");
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state) });
      if (!response.ok) throw new Error("save failed");
      setSaveState("Saved just now");
    } catch { setSaveState("Storage unavailable"); }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">S</span><div><strong>SONAR</strong><small>Semiconductor intelligence alpha</small></div></div>
        <div className="runtime-badges"><span>Independent runtime</span><span>S3 boundary</span><span className="gpt">GPT-OSS ready</span></div>
        <div className="save-area"><small>{saveState}</small><button className="button secondary compact" onClick={save}>Save workspace</button></div>
      </header>
      <div className="body-grid">
        <nav className="side-nav">
          <div className="nav-group-label">Workspace</div>
          {nav.map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}><span>{item.eyebrow}</span>{item.label}</button>)}
          <div className="nav-footer"><span className="health-dot" /><div><strong>Alpha environment</strong><small>Targets not connected</small></div></div>
        </nav>
        <div className="content">
          {section === "overview" ? <Overview state={state} setSection={setSection} /> : null}
          {section === "explorer" ? <FileExplorer state={state} setState={setState} /> : null}
          {section === "data" ? <DataIntake state={state} setState={setState} /> : null}
          {section === "registry" ? <Registry state={state} setState={setState} /> : null}
          {section === "map" ? <MapLab /> : null}
          {section === "simulator" ? <Simulator /> : null}
        </div>
        <Assistant state={state} setState={setState} />
      </div>
    </main>
  );
}
