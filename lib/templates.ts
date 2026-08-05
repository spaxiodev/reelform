// Starter templates for the studio. Both kinds insert editable text — the
// user is always expected to replace the [bracketed] parts with their own
// details before generating.

export interface SiteTemplate {
  id: string;
  label: string;
  industry: string;
  brief: string;
}

export const SITE_TEMPLATES: SiteTemplate[] = [
  {
    id: "restaurant",
    label: "Café & Restaurant",
    industry: "Food & hospitality",
    brief:
      "A warm, inviting site for [restaurant name], a [type of cuisine] spot in [city]. Sections: hero with the video, a short story about the kitchen, a highlights menu (3–5 signature dishes with prices), opening hours and location with a reservation call-to-action, and reviews from happy guests. Tone: welcoming and confident, not stuffy.",
  },
  {
    id: "saas",
    label: "SaaS / Startup",
    industry: "Software",
    brief:
      "A crisp product site for [product name], which helps [target customer] to [core benefit]. Sections: hero with the video and a one-line pitch, 3 feature highlights with short benefit-first copy, social proof (logos or quotes), simple 3-tier pricing, and a closing call-to-action for a free trial. Tone: clear and direct, no jargon.",
  },
  {
    id: "portfolio",
    label: "Creative Portfolio",
    industry: "Creative services",
    brief:
      "A bold portfolio for [your name], a [discipline — e.g. photographer / designer / director] based in [city]. Sections: full-bleed hero with the video, a selected-work grid (use elegant placeholder tiles I can replace), a short bio with personality, services offered, and a contact section. Tone: confident, minimal, let the visuals lead.",
  },
  {
    id: "fitness",
    label: "Fitness Studio",
    industry: "Health & fitness",
    brief:
      "An energetic site for [studio name], a [type — e.g. strength / yoga / boxing] studio in [city]. Sections: high-impact hero with the video, class schedule overview, trainer intros (2–3), membership pricing with a first-class-free offer, and testimonials. Tone: motivating and human, never intimidating.",
  },
  {
    id: "realestate",
    label: "Real Estate",
    industry: "Real estate",
    brief:
      "A polished site for [agency or agent name] serving [area]. Sections: cinematic hero with the video, featured listings (3 placeholder property cards with price/beds/baths), a why-work-with-us section, recent-sales proof, and a contact/valuation call-to-action. Tone: trustworthy and premium.",
  },
  {
    id: "launch",
    label: "Product Launch",
    industry: "Consumer product",
    brief:
      "A single-purpose launch page for [product name], a [what it is] for [who it's for]. Sections: dramatic hero with the video and the product promise, 3 key benefits, how-it-works in 3 steps, early-bird pricing or waitlist signup, and an FAQ (4 questions). Tone: exciting but credible.",
  },
];

export interface VideoTemplate {
  id: string;
  label: string;
  hint: string;
  prompt: string;
}

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  {
    id: "dolly",
    label: "Slow interior dolly",
    hint: "Warm, intimate, premium",
    prompt:
      "Slow cinematic dolly shot moving through [your space — e.g. a sunlit café with espresso steam rising], warm natural window light, shallow depth of field, subtle floating dust particles, rich warm color grade, smooth gimbal movement",
  },
  {
    id: "aerial",
    label: "Aerial establishing",
    hint: "Grand, sweeping scale",
    prompt:
      "Sweeping aerial drone shot rising over [your location — e.g. a coastal town at golden hour], soft golden light, gentle forward glide revealing the landscape, cinematic wide angle, film-like color grade",
  },
  {
    id: "macro",
    label: "Product macro",
    hint: "Detail, craft, texture",
    prompt:
      "Extreme macro shot of [your product — e.g. coffee beans tumbling in slow motion], dramatic side lighting, glossy surface details, slow rotation on a dark background, shallow focus, luxurious commercial look",
  },
  {
    id: "urban",
    label: "Urban energy",
    hint: "Fast, modern, alive",
    prompt:
      "Dynamic tracking shot through [your setting — e.g. a busy city street at dusk], neon reflections on wet pavement, motion blur on passing crowds, handheld energy, cool teal-and-amber grade",
  },
  {
    id: "nature",
    label: "Calm nature",
    hint: "Organic, serene, spacious",
    prompt:
      "Serene slow pan across [your scene — e.g. morning mist over a forest lake], soft diffused light, gentle water ripples, birds in the far distance, muted natural palette, meditative pacing",
  },
  {
    id: "abstract",
    label: "Abstract motion",
    hint: "Brand-forward, artistic",
    prompt:
      "Abstract slow-motion fluid shapes in [your brand colors — e.g. deep blue and white], ink diffusing through water, silky ribbons of color folding over themselves, studio lighting, ultra smooth motion, elegant and modern",
  },
];
