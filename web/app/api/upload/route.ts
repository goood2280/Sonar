import { env } from "cloudflare:workers";

const MAX_ALPHA_UPLOAD = 8 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_ALPHA_UPLOAD) {
      return Response.json(
        { error: "Alpha upload is limited to 8 MB. Register large raw data by S3 URI." },
        { status: 413 }
      );
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `manifests/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`;
    await env.RAW_BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
      customMetadata: { originalName: file.name },
    });
    return Response.json({ ok: true, uri: `r2://${key}`, name: file.name, size: file.size });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
