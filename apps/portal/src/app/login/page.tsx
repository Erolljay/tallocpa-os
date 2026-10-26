"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useState } from "react";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setState("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      // Invite-only: never create accounts from the login form.
      options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setState(error ? "error" : "sent");
  }

  return (
    <div className="sheet" style={{ maxWidth: 440 }}>
      <h1>Sign in</h1>
      {state === "sent" ? (
        <p className="lede">Check your email for a sign-in link.</p>
      ) : (
        <form onSubmit={send} style={{ display: "grid", gap: 14 }}>
          <p className="lede" style={{ margin: 0 }}>We&apos;ll email you a one-time sign-in link.</p>
          <label>
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button className="primary" disabled={state === "sending"}>
            {state === "sending" ? "Sending…" : "Email me a link"}
          </button>
          {state === "error" && (
            <p className="error" role="alert">
              We couldn&apos;t send a link to that address. Is it the email TalloCPA invited?
            </p>
          )}
        </form>
      )}
    </div>
  );
}
