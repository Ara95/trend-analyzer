import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = {
  title: "Skapa konto — Orbit",
};

export default function RegisterPage() {
  return (
    <main className="grid min-h-full place-items-center px-5 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight text-ink">
            Orbit<span className="ml-0.5 inline-block size-1.5 rounded-full bg-signal align-middle" aria-hidden />
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Skapa ett konto för att spara dina inspirationer.
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-card p-6 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)]">
          <AuthForm mode="register" />
        </div>
      </div>
    </main>
  );
}
