import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { OrbitMark } from "@/components/orbit-mark";

export const metadata: Metadata = {
  title: "Skapa konto — Orbit",
};

export default function RegisterPage() {
  return (
    <main className="hero-wash grid min-h-full place-items-center px-5 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <OrbitMark size={34} className="mx-auto text-ink" />
          <h1 className="mt-2 font-display text-2xl font-bold tracking-[-0.025em] text-ink">
            Orbit
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Skapa ett konto för att spara dina inspirationer.
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-card p-6 shadow-[0_18px_44px_-22px_rgba(60,45,30,0.25)]">
          <AuthForm mode="register" />
        </div>
      </div>
    </main>
  );
}
