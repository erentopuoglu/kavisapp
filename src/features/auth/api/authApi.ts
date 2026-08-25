import * as QueryParams from "expo-auth-session/build/QueryParams";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import type { Profile, ProfileUpdate } from "@/features/auth/types";
import { supabase } from "@/lib/supabase/client";

WebBrowser.maybeCompleteAuthSession();

const redirectTo = Linking.createURL("auth-callback");

export async function signUpWithEmail(email: string, password: string, username: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (error) throw error;
  return data;
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Kullanıcı adıyla giriş — e-postayı hiç görmüyoruz, login-with-username
// Edge Function'ı username'i sunucu içinde e-postaya çözüp şifreyi orada
// doğruluyor, bize sadece session token'larını dönüyor (bkz. fonksiyonun
// kendi yorumları — timing-attack koruması dahil).
export async function signInWithUsername(username: string, password: string) {
  const { data, error } = await supabase.functions.invoke("login-with-username", {
    body: { username, password },
  });
  if (error) {
    throw new Error(await extractFunctionErrorMessage(error, "Kullanıcı adı veya şifre hatalı."));
  }
  if (data?.error || !data?.access_token || !data?.refresh_token) {
    throw new Error((data?.error as string) ?? "Kullanıcı adı veya şifre hatalı.");
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (sessionError) throw sessionError;
}

export async function sendPasswordResetEmail(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

async function createSessionFromUrl(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(errorCode);

  const { access_token, refresh_token } = params;
  if (!access_token || !refresh_token) return null;

  const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
  return data.session;
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error("Google giriş URL'si alınamadı.");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type === "success" && result.url) {
    await createSessionFromUrl(result.url);
    return;
  }

  throw new Error("Google ile giriş tamamlanmadı.");
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

async function extractFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const withContext = error as { context?: Response; message?: string };
  if (withContext.context) {
    try {
      const body = (await withContext.context.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // gövde okunamadı, aşağıdaki genel mesaja düş
    }
  }
  return withContext.message ?? fallback;
}

// Hesabı ve tüm verilerini kalıcı olarak siler — delete-account Edge
// Function'ı (service_role) çağırır, gerçek silme kararı orada verilir.
export async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke("delete-account");
  if (error) {
    throw new Error(await extractFunctionErrorMessage(error, "Hesap silinemedi."));
  }
  if (data?.error) throw new Error(data.error as string);
}

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}

export async function updateProfile(userId: string, changes: ProfileUpdate): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .update(changes)
    .eq("id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
