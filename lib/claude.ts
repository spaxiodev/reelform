import Anthropic from "@anthropic-ai/sdk";
import type { ModelId, TokenUsage } from "./pricing";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are Reelform's website engineer. You build complete, production-quality marketing websites as a SINGLE self-contained HTML file around a hero video the user has already generated.

OUTPUT RULES (strict):
- Output ONLY the HTML document, starting with <!DOCTYPE html>. No markdown fences, no commentary before or after.
- Everything inline: <style> and <script> tags inside the one file. No external JS/CSS files. Google Fonts via <link> are allowed.
- The site must be responsive, accessible (semantic landmarks, alt text, focus states), and look polished on mobile and desktop.

DESIGN RULES:
- NEVER use generic AI-generated aesthetics: no Inter/Roboto/Arial/system font stacks, no purple-gradient-on-white cliches, no cookie-cutter hero-features-pricing-footer sameness. Choose distinctive fonts, a cohesive palette derived from the described brand/industry, and add micro-interactions and scroll effects that fit the tone.
- Write real, specific copy for the user's business — never lorem ipsum or [placeholder].
- Include a coherent set of sections appropriate to the brief (e.g. hero, value props, social proof, CTA, footer) — adapt to the industry rather than forcing a template.

VIDEO INTEGRATION:
The user's generated video URL and playback mode are provided in the brief. Use the video as the visual centerpiece (usually the hero background or a full-bleed feature panel).

If mode is "loop":
<video class="hero-video" autoplay muted loop playsinline preload="auto" src="VIDEO_URL"></video>
Cover the container (object-fit: cover), overlay text with a scrim gradient for contrast.

If mode is "scrub" (video scrubs with page scroll):
- Place the video inside a tall scroll section (e.g. height: 400vh) with a position: sticky full-viewport container.
- The <video> must be: muted playsinline preload="auto" disablepictureinpicture, with object-fit: cover. No autoplay, no loop, no controls.
- Use EXACTLY this scroll-scrub script (adjust only the two selectors). Do not replace it with a rAF/lerp version — that is what makes scrubbing feel laggy:
<script>
(function () {
  var v = document.querySelector('.scrub-video');
  var section = document.querySelector('.scrub-section');
  if (!v || !section) return;
  v.pause();

  var target = 0;    // scroll progress 0..1
  var applied = -1;  // progress of the seek currently in flight
  var range = 1, ready = false, busy = false;

  function measure() { range = Math.max(1, section.offsetHeight - window.innerHeight); }

  function onScroll() {
    target = Math.min(1, Math.max(0, -section.getBoundingClientRect().top / range));
    pump();
  }

  // Seek pump: issue the next seek ONLY once the previous one has completed,
  // and always to the newest scroll position. Writing currentTime on every
  // animation frame makes the browser coalesce and drop seeks, which is what
  // makes scroll-scrub stutter or stick. Smoothing/lerping the value also adds
  // latency, which reads as lag — drive straight from the scroll position.
  function pump() {
    if (!ready || busy || !v.duration) return;
    if (Math.abs(target - applied) < 0.0005) return;
    applied = target;
    busy = true;
    var t = target * (v.duration - 0.05);
    if (v.fastSeek) v.fastSeek(t); else v.currentTime = t;
  }

  v.addEventListener('seeked', function () { busy = false; pump(); });
  v.addEventListener('loadeddata', function () { ready = true; measure(); onScroll(); });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { measure(); onScroll(); });
  // Watchdog: if a 'seeked' event is ever missed, don't stall forever.
  setInterval(function () { if (busy && !v.seeking) { busy = false; pump(); } }, 250);
  measure();
})();
</script>
- Performance: never put backdrop-filter, blur(), box-shadow or CSS transitions/animations on the scrubbing video or on a full-screen layer stacked over it — per-frame compositing of those is a main cause of choppy scrubbing. A plain gradient scrim is fine. Overlay copy may fade in/out at scroll milestones, but animate only opacity/transform.

When the user asks for changes to an existing site, return the FULL updated HTML document (never a diff or fragment).`;

export interface GenerateSiteParams {
  model: ModelId;
  brief: string; // fully assembled brief or edit instruction with current html
  onText: (delta: string) => void;
}

export interface GenerateSiteResult {
  html: string;
  refused: boolean;
}

const MAX_TOKENS = 64000;

export async function generateSite({ model, brief, onText }: GenerateSiteParams): Promise<GenerateSiteResult> {
  const stream = client.messages.stream({
    model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: brief }],
  });

  let html = "";
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      html += event.delta.text;
      onText(event.delta.text);
    }
  }

  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    return { html: "", refused: true };
  }

  return { html: stripFences(html), refused: false };
}

// Defensive: models are told not to fence output, but strip if they do.
function stripFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/);
  return match ? match[1] : trimmed;
}

export function buildInitialBrief(opts: {
  name: string;
  industry: string;
  siteBrief: string;
  videoBrief: string;
  videoUrl: string;
  videoMode: "loop" | "scrub";
}): string {
  return [
    `Build a website for "${opts.name}".`,
    `Industry: ${opts.industry}`,
    `Website brief: ${opts.siteBrief}`,
    `The hero video was generated from this prompt (use it to inform tone/palette): ${opts.videoBrief}`,
    `Video URL: ${opts.videoUrl}`,
    `Video playback mode: ${opts.videoMode}`,
  ].join("\n\n");
}

export function buildEditBrief(opts: {
  instruction: string;
  currentHtml: string;
  videoUrl: string;
  videoMode: "loop" | "scrub";
}): string {
  return [
    `Here is the current website HTML:`,
    "-----BEGIN CURRENT HTML-----",
    opts.currentHtml,
    "-----END CURRENT HTML-----",
    `Video URL: ${opts.videoUrl}`,
    `Video playback mode: ${opts.videoMode}`,
    `Apply this change and return the full updated HTML document: ${opts.instruction}`,
  ].join("\n");
}

// ── Agentic, Claude-Code-style editing ───────────────────────────────────
// Instead of regenerating the whole document per change, Claude edits the
// current HTML with tools (surgical str_replace, or a full rewrite), narrating
// as it goes. The HTML is held here on the server and never re-sent between
// turns, and the initial prompt (system + tools + the document) is prompt-
// cached, so a small edit costs a small number of tokens — which is what makes
// per-change metered billing fair.

const EDIT_SYSTEM = `You are Reelform's website editor. You work like a code editor on a SINGLE self-contained HTML document — the user's marketing site, built around a hero video they already generated. Make the user's requested change by editing the current document, then briefly say what you changed.

TOOLS:
- str_replace: replace an exact, unique snippet of the current HTML with new HTML. Prefer this for targeted changes — it is precise and cheap. old_str must match the current document character-for-character (including whitespace) and appear EXACTLY once; if a snippet isn't unique, include more surrounding context. Call it multiple times for multiple edits.
- rewrite: replace the ENTIRE document. Use only for sweeping redesigns where targeted edits don't make sense.

RULES:
- Keep it one self-contained HTML file: inline <style>/<script>, Google Fonts <link> allowed, no external JS/CSS files. Keep it responsive and accessible.
- Preserve the hero <video> element and its playback wiring (including any scroll-scrub <script>) unless the user explicitly asks to change the video behaviour.
- Never introduce generic AI aesthetics (no Inter/Roboto/Arial/system fonts, no purple-gradient-on-white cliché). Match the site's existing palette, type, and tone unless asked otherwise.
- Write real, specific copy — never lorem ipsum or [placeholder].
- Narrate briefly as you work, and end with a 1–2 sentence summary of what changed. Never paste the full document back into the chat.`;

const EDIT_TOOLS: Anthropic.Tool[] = [
  {
    name: "str_replace",
    description:
      "Replace an exact, unique snippet of the current HTML document with new HTML. old_str must appear exactly once in the current document.",
    input_schema: {
      type: "object",
      properties: {
        old_str: {
          type: "string",
          description: "Exact text to find in the current document. Must be unique — include surrounding context if needed.",
        },
        new_str: { type: "string", description: "Replacement text." },
      },
      required: ["old_str", "new_str"],
    },
  },
  {
    name: "rewrite",
    description: "Replace the ENTIRE HTML document. Use only for sweeping changes where targeted edits don't fit.",
    input_schema: {
      type: "object",
      properties: {
        html: {
          type: "string",
          description: "The full new HTML document, starting with <!DOCTYPE html>.",
        },
      },
      required: ["html"],
    },
  },
];

const MAX_EDIT_ITERATIONS = 8;
const EDIT_TURN_MAX_TOKENS = 32000;

export interface EditSiteParams {
  model: ModelId;
  currentHtml: string;
  instruction: string;
  videoUrl: string;
  videoMode: "loop" | "scrub";
  outputBudget: number; // stop once cumulative output tokens exceed this
  onText: (delta: string) => void; // Claude's live narration
  onStep?: (label: string) => void; // e.g. "Edited a section" / "Rewrote the page"
}

export interface EditSiteResult {
  html: string;
  changed: boolean;
  refused: boolean;
  summary: string;
  usage: TokenUsage;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    count++;
    from = idx + needle.length;
  }
  return count;
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

export async function editSite(params: EditSiteParams): Promise<EditSiteResult> {
  const { model, instruction, videoUrl, videoMode, outputBudget, onText, onStep } = params;

  let html = params.currentHtml;
  let changed = false;
  let refused = false;
  let summary = "";
  const usage: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        // Cache the document prefix so subsequent turns (and quick successive
        // edits before the HTML changes) read it at ~0.1× instead of full price.
        {
          type: "text",
          text: `Current website HTML:\n-----BEGIN CURRENT HTML-----\n${html}\n-----END CURRENT HTML-----`,
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: `Hero video URL: ${videoUrl}\nVideo playback mode: ${videoMode}\n\nThe user wants this change:\n"""\n${instruction}\n"""\n\nApply it now using your tools, then summarise what you changed.`,
        },
      ],
    },
  ];

  for (let i = 0; i < MAX_EDIT_ITERATIONS; i++) {
    const stream = client.messages.stream({
      model,
      max_tokens: EDIT_TURN_MAX_TOKENS,
      system: EDIT_SYSTEM,
      tools: EDIT_TOOLS,
      messages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        onText(event.delta.text);
      }
    }

    const msg = await stream.finalMessage();
    usage.input += msg.usage.input_tokens ?? 0;
    usage.output += msg.usage.output_tokens ?? 0;
    usage.cacheRead = (usage.cacheRead ?? 0) + (msg.usage.cache_read_input_tokens ?? 0);
    usage.cacheWrite = (usage.cacheWrite ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0);

    if (msg.stop_reason === "refusal") {
      refused = true;
      break;
    }

    const turnText = textOf(msg.content);
    if (turnText) summary = turnText;

    messages.push({ role: "assistant", content: msg.content });

    const toolUses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) break; // model is done

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      if (tu.name === "str_replace") {
        const { old_str, new_str } = tu.input as { old_str: string; new_str: string };
        const n = countOccurrences(html, old_str);
        if (n === 0) {
          results.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: "old_str was not found in the current document. Re-read the HTML and match it exactly, including whitespace.",
            is_error: true,
          });
        } else if (n > 1) {
          results.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: `old_str appears ${n} times — it must be unique. Include more surrounding context so it matches exactly one place.`,
            is_error: true,
          });
        } else {
          // Function replacer so `$` sequences in new_str aren't treated as
          // special replacement patterns.
          html = html.replace(old_str, () => new_str);
          changed = true;
          onStep?.("Edited a section");
          results.push({ type: "tool_result", tool_use_id: tu.id, content: "Applied." });
        }
      } else if (tu.name === "rewrite") {
        const { html: fresh } = tu.input as { html: string };
        html = stripFences(fresh);
        changed = true;
        onStep?.("Rewrote the page");
        results.push({ type: "tool_result", tool_use_id: tu.id, content: "Replaced the document." });
      } else {
        results.push({ type: "tool_result", tool_use_id: tu.id, content: "Unknown tool.", is_error: true });
      }
    }

    messages.push({ role: "user", content: results });

    if ((usage.output ?? 0) >= outputBudget) {
      if (!summary) summary = "Reached the edit budget for this change — ask again to continue.";
      break;
    }
  }

  return { html, changed, refused, summary: summary.trim(), usage };
}

const SHOT_SYSTEM = `You are a cinematographer writing a single hero-video prompt for a website's opening shot.
Given a business, write ONE vivid shot description (1–2 sentences) that a text-to-video model can render.
Always name: a concrete subject, a camera movement, the lighting, and the mood/color grade.
Keep it grounded in what the business actually is — no logos, no on-screen text, no people talking.
Output ONLY the prompt text: no quotes, no label, no preamble, no markdown.`;

// Turns the user's plain brief into a ready-to-use cinematography prompt.
// Uses Haiku with a tight token budget so it can be offered for free.
export async function suggestShot(opts: {
  name: string;
  industry: string;
  siteBrief: string;
}): Promise<string> {
  const parts = [
    opts.name && `Business: ${opts.name}`,
    opts.industry && `Industry: ${opts.industry}`,
    opts.siteBrief && `What the site is about: ${opts.siteBrief}`,
  ].filter(Boolean);

  const message = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 200,
    system: SHOT_SYSTEM,
    messages: [{ role: "user", content: parts.join("\n") }],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  // Strip any stray surrounding quotes the model may add.
  return text.replace(/^["'`]+|["'`]+$/g, "").trim();
}
