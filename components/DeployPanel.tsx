"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toaster";
import { trackEvent } from "@/lib/analytics";
import { DEPLOY_MIN_PLAN, canDeploy } from "@/lib/pricing";

// The "push it live" surface: connect the user's own Vercel and Supabase
// accounts, then ship the built site to them. Nothing here ever sees a token —
// the browser only learns whether a provider is connected.

interface IntegrationStatus {
  provider: "vercel" | "supabase";
  connected: boolean;
  accountName: string | null;
}

interface SupabaseProject {
  ref: string;
  name: string;
  status: string;
  organizationId: string;
}

interface DeploymentRow {
  id: string;
  provider: "vercel" | "supabase";
  target: string;
  status: string;
  url: string | null;
  error: string | null;
  created_at: string;
}

const NEW_PROJECT = "__new__";

export function DeployPanel({
  open,
  onClose,
  projectId,
  projectName,
  plan,
  liveUrl,
  supabaseRef,
  onLive,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  plan: string;
  liveUrl: string | null;
  supabaseRef: string | null;
  onLive: (url: string | null) => void;
}) {
  const allowed = canDeploy(plan);

  const [integrations, setIntegrations] = useState<IntegrationStatus[] | null>(null);
  const [supabaseProjects, setSupabaseProjects] = useState<SupabaseProject[] | null>(null);
  const [history, setHistory] = useState<DeploymentRow[]>([]);

  const [useVercel, setUseVercel] = useState(true);
  const [useSupabase, setUseSupabase] = useState(true);
  const [useStorage, setUseStorage] = useState(false);
  const [targetRef, setTargetRef] = useState<string>(supabaseRef ?? NEW_PROJECT);

  const [deploying, setDeploying] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(liveUrl);

  const vercel = integrations?.find((i) => i.provider === "vercel");
  const supabase = integrations?.find((i) => i.provider === "supabase");

  const loadIntegrations = useCallback(async () => {
    const res = await fetch("/api/integrations");
    if (!res.ok) return;
    const data = (await res.json()) as { integrations: IntegrationStatus[] };
    setIntegrations(data.integrations);
    // Default each target to "on if we can actually reach it" — a checkbox the
    // user cannot uncheck (it is disabled) must not send a doomed request.
    const connected = (provider: "vercel" | "supabase") =>
      Boolean(data.integrations.find((i) => i.provider === provider)?.connected);
    setUseVercel(connected("vercel"));
    setUseSupabase(connected("supabase"));
  }, []);

  const loadHistory = useCallback(async () => {
    const res = await fetch(`/api/deploy?projectId=${projectId}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      latest: { status: string; url: string | null } | null;
      deployments: DeploymentRow[];
    };
    setHistory(data.deployments);
    if (data.latest) {
      setStatus(data.latest.status);
      if (data.latest.url) setUrl(data.latest.url);
    }
  }, [projectId]);

  useEffect(() => {
    if (!open || !allowed) return;
    void (async () => {
      await Promise.all([loadIntegrations(), loadHistory()]);
    })();
  }, [open, allowed, loadIntegrations, loadHistory]);

  // Vercel reports a static bundle as READY within a few seconds; poll until
  // it settles so the panel can hand over a link that actually resolves.
  useEffect(() => {
    if (status !== "building") return;
    const timer = setInterval(loadHistory, 4000);
    return () => clearInterval(timer);
  }, [status, loadHistory]);

  useEffect(() => {
    if (!open || !supabase?.connected) return;
    void (async () => {
      const res = await fetch("/api/integrations/supabase/projects");
      if (!res.ok) return;
      const data = (await res.json()) as { projects: SupabaseProject[] };
      setSupabaseProjects(data.projects);
    })();
  }, [open, supabase?.connected]);

  async function disconnect(provider: "vercel" | "supabase") {
    await fetch(`/api/integrations?provider=${provider}`, { method: "DELETE" });
    toast(`${provider === "vercel" ? "Vercel" : "Supabase"} disconnected.`, "info");
    void loadIntegrations();
  }

  async function deploy() {
    if (deploying) return;
    if (!useVercel && !useSupabase) {
      toast("Pick where the site should go.", "error");
      return;
    }
    setDeploying(true);
    setStatus("building");
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          vercel: useVercel,
          supabase: useSupabase
            ? {
                ref: targetRef === NEW_PROJECT ? undefined : targetRef,
                name: projectName,
                storage: useStorage,
              }
            : null,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        vercel?: { url: string; status: string };
        supabase?: { storageUrl: string | null; ref: string };
      } | null;

      if (!res.ok) {
        setStatus(null);
        toast(data?.error ?? "The deploy failed — try again.", "error");
        return;
      }

      const live = data?.vercel?.url ?? data?.supabase?.storageUrl ?? null;
      setUrl(live);
      setStatus(data?.vercel ? (data.vercel.status === "READY" ? "ready" : "building") : "ready");
      onLive(live);
      trackEvent("site_deployed", {
        vercel: useVercel,
        supabase: useSupabase,
        storage: useStorage,
      });
      toast(live ? "Your site is going live." : "Supabase backend is ready.", "success");
      void loadHistory();
    } catch {
      setStatus(null);
      toast("The deploy failed — try again.", "error");
    } finally {
      setDeploying(false);
    }
  }

  const connectHref = (provider: "vercel" | "supabase") =>
    `/api/integrations/${provider}/connect?next=/studio/${projectId}`;

  return (
    <Modal open={open} onClose={onClose} eyebrow="SHIP IT" title="Publish your site">
      {!allowed ? (
        <div className="space-y-4">
          <p className="text-sm text-muted leading-relaxed">
            Pushing a site straight to your own Vercel and Supabase accounts is part of{" "}
            {DEPLOY_MIN_PLAN.name} and up. Your site stays yours either way — on any plan you can
            download the zip and host it wherever you like.
          </p>
          <Link href="/pricing" className="btn-primary w-full text-center block">
            See {DEPLOY_MIN_PLAN.name} — ${DEPLOY_MIN_PLAN.priceUsd}/mo
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {url && (
            <div className="card !rounded-lg p-4 bg-primary-soft/40">
              <p className="mono-label">{status === "building" ? "GOING LIVE…" : "LIVE AT"}</p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block break-all text-sm font-medium text-primary hover:text-primary-deep"
              >
                {url} ↗
              </a>
            </div>
          )}

          {/* ── Connected accounts ── */}
          <div className="space-y-2">
            {(["vercel", "supabase"] as const).map((provider) => {
              const info = provider === "vercel" ? vercel : supabase;
              const label = provider === "vercel" ? "Vercel" : "Supabase";
              const role = provider === "vercel" ? "hosting" : "database & forms";
              return (
                <div
                  key={provider}
                  className="flex items-center justify-between gap-3 rounded-lg border border-line px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {label} <span className="text-faint font-normal">· {role}</span>
                    </p>
                    <p className="text-xs text-muted truncate">
                      {info?.connected
                        ? info.accountName ?? "Connected"
                        : "Not connected"}
                    </p>
                  </div>
                  {info?.connected ? (
                    <button
                      onClick={() => disconnect(provider)}
                      className="btn-ghost !py-1.5 !px-3 !text-xs shrink-0"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <a href={connectHref(provider)} className="btn-primary !py-1.5 !px-3 !text-xs shrink-0">
                      Connect
                    </a>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── What to push ── */}
          <div className="space-y-3">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={useVercel}
                disabled={!vercel?.connected}
                onChange={(e) => setUseVercel(e.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="font-medium">Host it on Vercel</span>
                <span className="block text-xs text-muted">
                  Uploads the page and every video to a project in your own account.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={useSupabase}
                disabled={!supabase?.connected}
                onChange={(e) => setUseSupabase(e.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="font-medium">Wire the forms to Supabase</span>
                <span className="block text-xs text-muted">
                  Adds a submissions table to your project and points the site&apos;s forms at it.
                </span>
              </span>
            </label>

            {useSupabase && supabase?.connected && (
              <div className="ml-7 space-y-3">
                <label className="block">
                  <span className="mono-label">SUPABASE PROJECT</span>
                  <div className="mt-1">
                    <Select
                      value={targetRef}
                      onChange={setTargetRef}
                      ariaLabel="Supabase project"
                      groups={[
                        {
                          options: [
                            { value: NEW_PROJECT, label: "Create a new project" },
                            ...(supabaseProjects ?? []).map((p) => ({
                              value: p.ref,
                              label: p.name,
                              meta:
                                p.status === "ACTIVE_HEALTHY" ? null : p.status.toLowerCase(),
                            })),
                          ],
                        },
                      ]}
                    />
                  </div>
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={useStorage}
                    onChange={(e) => setUseStorage(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">Also host the files on Supabase Storage</span>
                    <span className="block text-xs text-muted">
                      A second public copy of the site, useful if you would rather not run Vercel.
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>

          <button
            onClick={deploy}
            disabled={deploying || (!vercel?.connected && !supabase?.connected)}
            className="btn-primary w-full"
          >
            {deploying ? "Shipping…" : url ? "Deploy the latest version" : "Deploy site"}
          </button>

          {history.length > 0 && (
            <div>
              <p className="mono-label">RECENT DEPLOYS</p>
              <ul className="mt-2 space-y-1.5">
                {history.slice(0, 4).map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted truncate">
                      {row.provider === "vercel" ? "Vercel" : "Supabase"} · {row.target}
                    </span>
                    <span
                      className={
                        row.status === "error"
                          ? "text-red-600 shrink-0"
                          : row.status === "ready"
                          ? "text-primary shrink-0"
                          : "text-faint shrink-0"
                      }
                      title={row.error ?? undefined}
                    >
                      {row.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-faint leading-relaxed">
            Everything lands in accounts you own. Disconnecting Reelform never takes a live site
            down — only your provider can do that.
          </p>
        </div>
      )}
    </Modal>
  );
}
