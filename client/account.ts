import type { Profile } from "../shared/types";

export type AccountStatus =
  | { mode: "loading" | "local" | "closed"; account: null }
  | { mode: "google"; account: { id: string; profile: Profile | null; rewards: string[] } | null };

export async function readAccount(signal?: AbortSignal): Promise<AccountStatus> {
  const response = await fetch("/api/auth/session", { cache: "no-store", signal });
  if (!response.ok) throw new Error("auth-unavailable");
  return response.json();
}

export async function saveAccountProfile(id: string, profile: Profile): Promise<Profile> {
  const response = await fetch("/api/account/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, profile }),
  });
  if (!response.ok) throw Error(
    response.status === 401 || response.status === 409 ? "login-required" : "profile-save-failed",
  );
  return (await response.json()).profile;
}
