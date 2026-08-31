// Single source of truth for the support address. Lives in lib/ (not in the
// footer component) so server-only modules like lib/seo.tsx can read it
// without pulling a React component into their graph.
export const CONTACT_EMAIL = "admin@polidori.dev";
