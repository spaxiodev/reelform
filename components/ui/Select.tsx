"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  /** Second line under the label — what this choice means. */
  description?: string | null;
  /** Right-hand chip: a price, a size, a status. */
  meta?: string | null;
  disabled?: boolean;
  /** Replaces `meta` when disabled — why this one can't be picked. */
  disabledReason?: string | null;
}

export interface SelectGroup<T extends string = string> {
  label?: string;
  options: SelectOption<T>[];
}

// A dropdown we own, rather than the operating system's. A native <select>
// renders its list outside the page — the OS decides the type, spacing and
// colours, and it can't show a price chip, a second line of explanation or a
// greyed-out reason. This one is a button plus a listbox, so it looks the same
// on every platform and can carry everything a choice needs to be understood.
//
// The list is portalled to <body> and positioned against the trigger, because
// several of the cards it sits inside clip their overflow.

const MAX_PANEL_HEIGHT = 320;
/** Above this many options, a filter box earns its place. */
const SEARCH_THRESHOLD = 8;

export function Select<T extends string = string>({
  value,
  onChange,
  groups,
  id,
  disabled = false,
  placeholder = "Select…",
  ariaLabel,
  className = "",
}: {
  value: T;
  onChange: (value: T) => void;
  groups: SelectGroup<T>[];
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const listboxId = `${selectId}-listbox`;

  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; up: boolean } | null>(
    null
  );

  const all = useMemo(() => groups.flatMap((g) => g.options), [groups]);
  const selected = all.find((o) => o.value === value);
  const searchable = all.length > SEARCH_THRESHOLD;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return groups;
    return groups
      .map((g) => ({
        ...g,
        options: g.options.filter((o) =>
          `${o.label} ${o.description ?? ""}`.toLowerCase().includes(needle)
        ),
      }))
      .filter((g) => g.options.length > 0);
  }, [groups, query]);

  const flat = useMemo(() => visible.flatMap((g) => g.options), [visible]);

  // Options carry their position in the flat list so the keyboard and the
  // rendered rows agree on what "the third one" is, without a counter that
  // mutates during render.
  const rows = useMemo(() => {
    let i = -1;
    return visible.map((group, gi) => ({
      key: group.label ?? `group-${gi}`,
      label: group.label,
      options: group.options.map((option) => ({ option, index: ++i })),
    }));
  }, [visible]);

  // Where the panel goes. Fixed to the viewport, flipped above the trigger when
  // there isn't room below.
  const place = () => {
    const el = trigger.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const below = window.innerHeight - box.bottom;
    const up = below < Math.min(MAX_PANEL_HEIGHT, 240) && box.top > below;
    setRect({
      top: up ? box.top : box.bottom + 6,
      left: box.left,
      width: box.width,
      up,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onScroll = (e: Event) => {
      // Scrolling the list itself must not close it.
      if (panel.current?.contains(e.target as Node)) return;
      close();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  // preventScroll matters: the panel is fixed, but focusing something inside it
  // can still scroll the document, and a document scroll closes the panel.
  useEffect(() => {
    if (open) search.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panel.current?.contains(target) || trigger.current?.contains(target)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the highlighted row in view as the arrows move it. `rect` is a
  // dependency because the panel only exists once it has been placed — without
  // it, opening a long list would start at the top rather than at the current
  // choice.
  useEffect(() => {
    if (!open || !rect) return;
    panel.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, rect]);

  // Opening resets the filter and highlights whatever is currently chosen, so
  // the list always opens on the user's own answer.
  function openMenu() {
    setQuery("");
    setActive(Math.max(0, all.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function close() {
    setOpen(false);
  }

  function step(delta: number) {
    if (flat.length === 0) return;
    let next = active;
    for (let i = 0; i < flat.length; i++) {
      next = (next + delta + flat.length) % flat.length;
      if (!flat[next].disabled) break;
    }
    setActive(next);
  }

  function commit(option: SelectOption<T> | undefined) {
    if (!option || option.disabled) return;
    onChange(option.value);
    close();
    trigger.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        close();
        trigger.current?.focus();
        break;
      case "ArrowDown":
        e.preventDefault();
        step(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        step(-1);
        break;
      case "Home":
        e.preventDefault();
        setActive(flat.findIndex((o) => !o.disabled));
        break;
      case "End":
        e.preventDefault();
        setActive(flat.length - 1);
        break;
      case "Enter":
        e.preventDefault();
        commit(flat[active]);
        break;
      case "Tab":
        close();
        break;
    }
  }

  return (
    <>
      <button
        type="button"
        id={selectId}
        ref={trigger}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={`w-full flex items-center justify-between gap-2 rounded-[10px] border bg-bg px-4 py-3 text-left text-[0.925rem] transition-colors disabled:cursor-default disabled:text-faint disabled:bg-bg-raise ${
          open ? "border-primary" : "border-line-strong hover:border-primary/50"
        } ${className}`}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <span className="flex items-center gap-2 shrink-0">
          {selected?.meta && !disabled && (
            <span className="text-xs text-muted tabular-nums">{selected.meta}</span>
          )}
          <Chevron open={open} />
        </span>
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={panel}
            className="fixed z-50 rounded-xl border border-line-strong bg-panel p-1.5 shadow-[var(--shadow-lift)]"
            style={{
              top: rect.up ? undefined : rect.top,
              bottom: rect.up ? window.innerHeight - rect.top + 6 : undefined,
              left: rect.left,
              width: rect.width,
              maxHeight: MAX_PANEL_HEIGHT,
              overflowY: "auto",
            }}
            onKeyDown={onKeyDown}
          >
            {searchable && (
              <div className="sticky -top-1.5 z-10 bg-panel px-1 pb-1.5 pt-1">
                <div className="flex items-center gap-2 rounded-lg border border-line-strong px-2.5 py-1.5 transition-colors focus-within:border-primary">
                  <Magnifier />
                  <input
                    ref={search}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActive(0);
                    }}
                    onKeyDown={onKeyDown}
                    placeholder="Search"
                    aria-label="Filter options"
                    className="w-full bg-transparent text-sm placeholder:text-faint focus-visible:!outline-none"
                  />
                </div>
              </div>
            )}

            <div role="listbox" id={listboxId} aria-activedescendant={`${selectId}-opt-${active}`}>
              {visible.length === 0 && (
                <p className="px-2.5 py-3 text-sm text-faint">Nothing matches that.</p>
              )}
              {rows.map((group) => (
                <div key={group.key}>
                  {group.label && (
                    <p className="px-2.5 pb-1 pt-2 text-xs font-medium text-faint">{group.label}</p>
                  )}
                  {group.options.map(({ option, index: i }) => {
                    const isSelected = option.value === value;
                    return (
                      <div
                        key={option.value}
                        id={`${selectId}-opt-${i}`}
                        data-index={i}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={option.disabled}
                        onClick={() => commit(option)}
                        onPointerMove={() => !option.disabled && setActive(i)}
                        className={`flex items-start justify-between gap-3 rounded-lg px-2.5 py-2 ${
                          option.disabled
                            ? "cursor-default text-faint"
                            : `cursor-pointer ${
                                isSelected
                                  ? "bg-primary-soft/60 text-primary-deep"
                                  : i === active
                                    ? "bg-bg-raise"
                                    : ""
                              }`
                        }`}
                      >
                        <span className="min-w-0">
                          <span
                            className={`block truncate text-sm ${isSelected ? "font-medium" : ""}`}
                          >
                            {option.label}
                          </span>
                          {option.description && (
                            <span className="mt-0.5 block text-xs leading-snug text-muted">
                              {option.description}
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
                          {(option.disabled ? option.disabledReason : option.meta) && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[0.7rem] tabular-nums ${
                                option.disabled ? "bg-bg-raise text-faint" : "bg-bg-raise text-muted"
                              }`}
                            >
                              {option.disabled ? option.disabledReason : option.meta}
                            </span>
                          )}
                          {isSelected && <Check />}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={`text-faint transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path
        d="M4 6.5 8 10.5 12 6.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Magnifier() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="text-faint">
      <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
