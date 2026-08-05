// Seedance client — supports two providers behind one interface:
//  - "modelark":  official BytePlus ModelArk async task API
//  - "seedance2": seedance2.ai (unofficial third-party reseller of Seedance 2.0)
// The provider is auto-detected from SEEDANCE_API_BASE, or forced with
// SEEDANCE_PROVIDER=modelark|seedance2.

const BASE = (process.env.SEEDANCE_API_BASE ?? "https://ark.ap-southeast.bytepluses.com/api/v3").replace(/\/$/, "");

type Provider = "modelark" | "seedance2";

function provider(): Provider {
  const forced = process.env.SEEDANCE_PROVIDER;
  if (forced === "modelark" || forced === "seedance2") return forced;
  return BASE.includes("seedance2.ai") ? "seedance2" : "modelark";
}

function defaultModel(): string {
  if (process.env.SEEDANCE_MODEL_ID) return process.env.SEEDANCE_MODEL_ID;
  return provider() === "seedance2" ? "seedance-2-0" : "seedance-1-0-pro-250528";
}

export interface CreateVideoParams {
  prompt: string;
  resolution: "720p" | "1080p";
  duration: 5 | 10;
  ratio: "16:9" | "9:16" | "1:1" | "21:9";
}

export interface VideoTaskStatus {
  status: "queued" | "running" | "succeeded" | "failed";
  videoUrl?: string;
  error?: string;
}

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.SEEDANCE_API_KEY}`,
  };
}

export async function createVideoTask(params: CreateVideoParams): Promise<{ taskId: string }> {
  if (provider() === "seedance2") {
    const res = await fetch(`${BASE}/v1/videos/generations`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        model: defaultModel(),
        input: {
          prompt: params.prompt,
          generation_type: "text-to-video",
          duration: params.duration,
          aspect_ratio: params.ratio,
          resolution: params.resolution,
          generate_audio: false,
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`Seedance task creation failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    }
    const data = (await res.json()) as { taskId?: string; id?: string };
    const taskId = data.taskId ?? data.id;
    if (!taskId) throw new Error("Seedance response had no task id");
    return { taskId };
  }

  // ModelArk: parameters ride on the prompt as `--key value` flags.
  const text = `${params.prompt} --resolution ${params.resolution} --duration ${params.duration} --ratio ${params.ratio} --watermark false`;
  const res = await fetch(`${BASE}/contents/generations/tasks`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ model: defaultModel(), content: [{ type: "text", text }] }),
  });
  if (!res.ok) {
    throw new Error(`Seedance task creation failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as { id: string };
  return { taskId: data.id };
}

export async function getVideoTask(taskId: string): Promise<VideoTaskStatus> {
  if (provider() === "seedance2") {
    const res = await fetch(`${BASE}/v1/tasks/${taskId}`, { headers: headers(), cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Seedance task lookup failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      status?: string;
      data?: { results?: string[] };
      error?: { message?: string } | string;
    };
    const status = (data.status ?? "").toLowerCase();
    if (status === "completed" || status === "succeeded") {
      return { status: "succeeded", videoUrl: data.data?.results?.[0] };
    }
    if (status === "failed" || status === "error" || status === "canceled") {
      const msg = typeof data.error === "string" ? data.error : data.error?.message;
      return { status: "failed", error: msg ?? "Video generation failed" };
    }
    if (status === "pending" || status === "queued") return { status: "queued" };
    return { status: "running" };
  }

  const res = await fetch(`${BASE}/contents/generations/tasks/${taskId}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Seedance task lookup failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    status: string;
    content?: { video_url?: string };
    error?: { message?: string };
  };
  switch (data.status) {
    case "succeeded":
      return { status: "succeeded", videoUrl: data.content?.video_url };
    case "failed":
      return { status: "failed", error: data.error?.message ?? "Video generation failed" };
    case "running":
      return { status: "running" };
    default:
      return { status: "queued" };
  }
}
