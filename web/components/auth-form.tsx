"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

/**
 * Shared email/password form for /login and /register. Talks to the browser Supabase client
 * (@supabase/ssr), which persists the session to cookies so the server (middleware + Server
 * Components) sees it on the next navigation. Email confirmations are off locally, so signUp
 * returns an active session and we can go straight to /search.
 */
export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isRegister = mode === "register";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const supabase = createClient();

    const { error } = isRegister
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(translateError(error.message));
      setPending(false);
      return;
    }

    // Session is set in cookies — land on search. refresh() so server components re-read auth state.
    router.push("/search");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium text-ink">
          E-post
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-[11px] border border-input bg-white px-3 py-2.5 text-sm text-ink outline-none transition-[colors,box-shadow] focus:border-signal focus:ring-4 focus:ring-signal-soft"
          placeholder="du@exempel.se"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium text-ink">
          Lösenord
        </label>
        <input
          id="password"
          type="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-[11px] border border-input bg-white px-3 py-2.5 text-sm text-ink outline-none transition-[colors,box-shadow] focus:border-signal focus:ring-4 focus:ring-signal-soft"
          placeholder="••••••••"
        />
        {isRegister && (
          <p className="text-xs text-muted-foreground">Minst 6 tecken.</p>
        )}
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-[10px] border border-[#ebcdc8] bg-[#f8eae7] px-3 py-2.5 text-sm text-fall">
          <AlertCircle size={15} className="shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Ett ögonblick…" : isRegister ? "Skapa konto" : "Logga in"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {isRegister ? (
          <>
            Har du redan ett konto?{" "}
            <Link href="/login" className="font-semibold text-signal hover:underline">
              Logga in
            </Link>
          </>
        ) : (
          <>
            Inget konto?{" "}
            <Link href="/register" className="font-semibold text-signal hover:underline">
              Registrera
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

// Supabase returns English auth errors — map the common ones to Swedish.
function translateError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Fel e-post eller lösenord.";
  if (m.includes("user already registered")) return "Ett konto med den e-posten finns redan.";
  if (m.includes("password should be at least")) return "Lösenordet är för kort (minst 6 tecken).";
  if (m.includes("unable to validate email")) return "Ogiltig e-postadress.";
  return "Något gick fel. Försök igen.";
}
