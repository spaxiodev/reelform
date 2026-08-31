"use client";

import { useEffect, useState } from "react";
import {
  VIDEO_MODELS,
  resolveShot,
  type VideoModelId,
  type Resolution,
  type Ratio,
} from "@/lib/higgsfield";
import { videoCost, VIDEO_MODEL_USD_PER_SECOND } from "@/lib/pricing";
import { Select, type SelectOption } from "@/components/ui/Select";

export interface ShotSettings {
  model: VideoModelId;
  resolution: Resolution;
  duration: number;
  ratio: Ratio;
}

// The cheap models are listed first, everything dearer under "Other models".
// The line is drawn at the default model's rate: a threshold rather than a
// hand-kept list, so adding a model to the catalog can't leave it in the wrong
// group. Today that puts the two ~3× models on the far side of it.
const VALUE_CEILING = VIDEO_MODEL_USD_PER_SECOND["wan-2.5"];

const RATIOS: { value: Ratio; label: string }[] = [
  { value: "16:9", label: "Wide 16:9" },
  { value: "21:9", label: "Cinema 21:9" },
  { value: "1:1", label: "Square 1:1" },
  { value: "9:16", label: "Tall 9:16" },
];

// Model access is per Higgsfield account and barely ever changes, so one fetch
// per page load is plenty, and every control on the page shares it.
let accessPromise: Promise<Record<string, boolean>> | null = null;

function loadAccess(): Promise<Record<string, boolean>> {
  accessPromise ??= fetch("/api/video/models")
    .then((r) => r.json())
    .then((d: { available?: Record<string, boolean> }) => d.available ?? {})
    .catch(() => ({}));
  return accessPromise;
}

/**
 * The three controls that decide what a shot costs (model, quality and length),
 * plus the price. Shared by the create flow and the studio so the two can't
 * drift, and so the quoted cost always comes from the same place the server
 * charges from.
 */
export function ShotControls({
  value,
  onChange,
  showRatio = false,
  costLabel,
  isAdmin = false,
  className = "",
}: {
  value: ShotSettings;
  onChange: (patch: Partial<ShotSettings>) => void;
  showRatio?: boolean;
  /** How to phrase the price, the studio says "free" while a free shot lasts. */
  costLabel?: (credits: number) => string;
  /**
   * Admins can select a model Higgsfield hasn't enabled on our key. It will
   * still fail at the provider (that gate isn't ours to lift), but an admin
   * checking whether access has been granted shouldn't have to edit code to
   * try it.
   */
  isAdmin?: boolean;
  className?: string;
}) {
  const [available, setAvailable] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    loadAccess().then((a) => alive && setAvailable(a));
    return () => {
      alive = false;
    };
  }, []);

  const model = VIDEO_MODELS.find((m) => m.id === value.model) ?? VIDEO_MODELS[0];
  const shot = resolveShot(value.model, value);
  const cost = videoCost(value.model, shot.resolution ?? "720p", shot.duration);

  const valueTier = VIDEO_MODELS.filter(
    (m) => VIDEO_MODEL_USD_PER_SECOND[m.id as VideoModelId] <= VALUE_CEILING
  );
  const otherTier = VIDEO_MODELS.filter(
    (m) => VIDEO_MODEL_USD_PER_SECOND[m.id as VideoModelId] > VALUE_CEILING
  );

  const stops = model.durations;
  const stopIndex = Math.max(0, stops.indexOf(shot.duration));

  const option = (m: (typeof VIDEO_MODELS)[number]): SelectOption<VideoModelId> => {
    const reachable = available[m.id] !== false;
    return {
      value: m.id as VideoModelId,
      label: m.label,
      description: reachable || !isAdmin ? m.blurb : `${m.blurb} · not enabled on this key`,
      // Every model is priced on the same 5s/720p yardstick so the list can be
      // read as a price list; the summary below quotes the real shot.
      meta: `${videoCost(m.id as VideoModelId, "720p", 5)} cr`,
      disabled: !reachable && !isAdmin,
      disabledReason: "not enabled",
    };
  };

  // Admins can land here; everyone else can't select an unreachable model.
  const unreachable = available[value.model] === false;

  const resolutionOptions: SelectOption<Resolution>[] = (model.resolutions ?? []).map((r) => ({
    value: r,
    label: r,
    meta: r === "1080p" ? "sharpest" : r === "480p" ? "cheapest" : null,
  }));

  const ratioOptions: SelectOption<Ratio>[] = RATIOS.filter(
    (r) => model.ratios?.includes(r.value)
  ).map((r) => ({ value: r.value, label: r.label }));

  return (
    <div className={className}>
      <div className={`grid gap-4 sm:grid-cols-2 ${showRatio ? "" : "lg:grid-cols-3"}`}>
        <div>
          <label className="mono-label block mb-1.5" htmlFor="shot-model">
            VIDEO MODEL
          </label>
          <Select
            id="shot-model"
            value={value.model}
            onChange={(model) => onChange({ model })}
            groups={[
              { label: "Cheaper models", options: valueTier.map(option) },
              { label: "Other models", options: otherTier.map(option) },
            ]}
          />
          <p className="mt-1.5 text-xs leading-snug text-muted">{model.blurb}</p>
          {unreachable && (
            <p className="mt-1.5 text-xs leading-snug text-danger">
              Higgsfield hasn&apos;t enabled {model.label} on this API key, so the shot will fail
              until they do. Model access is granted per account by Higgsfield, not here.
            </p>
          )}
        </div>

        <div>
          <label className="mono-label block mb-1.5" htmlFor="shot-quality">
            QUALITY
          </label>
          <Select
            id="shot-quality"
            value={shot.resolution ?? ("" as Resolution)}
            onChange={(resolution) => onChange({ resolution })}
            disabled={!model.resolutions}
            placeholder="Model's own"
            groups={[{ options: resolutionOptions }]}
          />
          <p className="mt-1.5 text-xs text-muted leading-snug">
            {model.resolutions
              ? "Higher quality costs proportionally more."
              : `${model.label} picks its own resolution.`}
          </p>
        </div>

        {showRatio && (
          <div>
            <label className="mono-label block mb-1.5" htmlFor="shot-ratio">
              SHAPE
            </label>
            <Select
              id="shot-ratio"
              value={shot.ratio ?? ("" as Ratio)}
              onChange={(ratio) => onChange({ ratio })}
              disabled={!model.ratios}
              placeholder="Model's own"
              groups={[{ options: ratioOptions }]}
            />
            <p className="mt-1.5 text-xs text-muted leading-snug">
              {model.ratios ? "Framing of the finished clip." : `${model.label} picks its own framing.`}
            </p>
          </div>
        )}

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label className="mono-label" htmlFor="shot-length">
              LENGTH
            </label>
            <span className="text-sm font-medium tabular-nums">{shot.duration}s</span>
          </div>
          <input
            id="shot-length"
            type="range"
            className="range mt-2 w-full"
            min={0}
            max={Math.max(0, stops.length - 1)}
            step={1}
            value={stopIndex}
            disabled={stops.length < 2}
            onChange={(e) => onChange({ duration: stops[Number(e.target.value)] })}
            aria-valuetext={`${shot.duration} seconds`}
          />
          <div className="mt-1 flex justify-between text-xs text-faint tabular-nums">
            <span>{stops[0]}s</span>
            {stops.length > 1 && <span>{stops[stops.length - 1]}s</span>}
          </div>
          <p className="mt-1 text-xs text-muted leading-snug">
            {stops.length > 1
              ? `${model.label} shoots ${stops.join("s, ")}s takes.`
              : `${model.label} only shoots ${stops[0]}-second takes.`}
          </p>
        </div>
      </div>

      <p className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-line-strong bg-bg-raise px-3.5 py-2.5 text-sm">
        <span className="text-muted">
          {model.label} · {shot.resolution ?? "native"} · {shot.duration}s
        </span>
        <span className="font-medium">{costLabel ? costLabel(cost) : `${cost} credits`}</span>
      </p>
    </div>
  );
}
