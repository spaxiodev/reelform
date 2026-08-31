import { createSupabaseAdmin } from "./supabase/admin";
import { decryptSecret, encryptSecret } from "./crypto";
import { refreshSupabaseToken } from "./supabase-mgmt";

// The store for a user's connected Vercel / Supabase accounts.
//
// Rows live in `public.integrations`, which has RLS enabled and *no* policies:
// only the service-role client here can read them, so an access token can
// never leak through the browser client the way a normal project row could.

export type Provider = "vercel" | "supabase";

export interface Integration {
  provider: Provider;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  /** Vercel: team id (null for a personal account). Supabase: unused. */
  accountId: string | null;
  /** Human label for the connected account, shown in the UI. */
  accountName: string | null;
  createdAt: string;
}

/** The connection facts safe to hand to the browser — never a token. */
export interface IntegrationStatus {
  provider: Provider;
  connected: boolean;
  accountName: string | null;
  connectedAt: string | null;
}

interface Row {
  provider: Provider;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  account_id: string | null;
  account_name: string | null;
  created_at: string;
}

function fromRow(row: Row): Integration {
  return {
    provider: row.provider,
    accessToken: decryptSecret(row.access_token),
    refreshToken: row.refresh_token ? decryptSecret(row.refresh_token) : null,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    accountId: row.account_id,
    accountName: row.account_name,
    createdAt: row.created_at,
  };
}

export interface SaveInput {
  accessToken: string;
  refreshToken?: string | null;
  /** Seconds until the access token expires, as returned by the provider. */
  expiresIn?: number | null;
  accountId?: string | null;
  accountName?: string | null;
}

export async function saveIntegration(
  userId: string,
  provider: Provider,
  input: SaveInput
): Promise<void> {
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("integrations").upsert(
    {
      user_id: userId,
      provider,
      access_token: encryptSecret(input.accessToken),
      refresh_token: input.refreshToken ? encryptSecret(input.refreshToken) : null,
      expires_at: input.expiresIn
        ? new Date(Date.now() + input.expiresIn * 1000).toISOString()
        : null,
      account_id: input.accountId ?? null,
      account_name: input.accountName ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" }
  );
  if (error) throw new Error(`Could not save the ${provider} connection: ${error.message}`);
}

export async function deleteIntegration(userId: string, provider: Provider): Promise<void> {
  const admin = createSupabaseAdmin();
  await admin.from("integrations").delete().eq("user_id", userId).eq("provider", provider);
}

/**
 * The user's connection for `provider`, with the access token refreshed if it
 * is at or near expiry. Returns null when they have not connected the
 * provider — or when a refresh failed, which means the grant was revoked and
 * the stale row is dropped so the UI prompts a reconnect.
 */
export async function getIntegration(
  userId: string,
  provider: Provider
): Promise<Integration | null> {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("integrations")
    .select("provider, access_token, refresh_token, expires_at, account_id, account_name, created_at")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (!data) return null;

  let integration: Integration;
  try {
    integration = fromRow(data as Row);
  } catch {
    // Sealed with a different INTEGRATION_SECRET — unusable, so treat the
    // account as disconnected rather than failing every deploy from here on.
    return null;
  }

  // A minute of headroom: a token that expires mid-deploy is worse than one
  // refreshed a little early.
  const stale =
    integration.expiresAt !== null && integration.expiresAt.getTime() - Date.now() < 60_000;
  if (!stale) return integration;

  if (!integration.refreshToken) return null;

  try {
    // Vercel's OAuth access tokens do not expire, so only Supabase gets here.
    const refreshed = await refreshSupabaseToken(integration.refreshToken);
    await saveIntegration(userId, provider, {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? integration.refreshToken,
      expiresIn: refreshed.expires_in,
      accountId: integration.accountId,
      accountName: integration.accountName,
    });
    return {
      ...integration,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? integration.refreshToken,
      expiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null,
    };
  } catch {
    await deleteIntegration(userId, provider);
    return null;
  }
}

/** Connection status for both providers, for the account and studio screens. */
export async function listIntegrationStatus(userId: string): Promise<IntegrationStatus[]> {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("integrations")
    .select("provider, account_name, created_at")
    .eq("user_id", userId);

  const rows = (data ?? []) as { provider: Provider; account_name: string | null; created_at: string }[];
  return (["vercel", "supabase"] as Provider[]).map((provider) => {
    const row = rows.find((r) => r.provider === provider);
    return {
      provider,
      connected: Boolean(row),
      accountName: row?.account_name ?? null,
      connectedAt: row?.created_at ?? null,
    };
  });
}
