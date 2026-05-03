import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { Loader2, LogOut, Search, ShieldCheck, Star } from "lucide-react";
import { Panel, SyncBrand, Tag } from "@/components/ui";
import { useAuth } from "@/lib/auth";

type AuthGateProps = {
  children: ReactNode;
};

function AuthShell({
  eyebrow,
  title,
  detail,
  aside,
  children,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="auth-screen">
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />
      <div className="auth-layout">
        <Panel className="auth-panel auth-panel--hero">
          <SyncBrand />

          <div className="stack">
            <Tag tone="primary">{eyebrow}</Tag>
            <h1>{title}</h1>
            <p>{detail}</p>
          </div>

          {aside ? <div className="auth-grid">{aside}</div> : null}
        </Panel>

        <Panel className="auth-panel">{children}</Panel>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="auth-loading-screen" aria-live="polite" aria-busy="true">
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />
      <div className="auth-loading auth-loading--minimal">
        <div className="auth-loading__spinner">
          <Loader2 className="spin" size={22} />
        </div>
        <span>Checking your authentication...</span>
      </div>
    </div>
  );
}

function SignInScreen() {
  const { authError, requestPasswordReset, signIn } = useAuth();
  const [mode, setMode] = useState<"sign-in" | "reset-password">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    try {
      if (mode === "sign-in") {
        await signIn(email, password);
      } else {
        await requestPasswordReset(email);
        setMessage("If this email has access, we sent a secure password reset link.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Employer access"
      title={mode === "sign-in" ? "Sign in to the talent platform." : "Reset your password."}
      detail="Search the shared CV pool, review candidate profiles, and manage your shortlist."
      aside={
        <>
          <div className="auth-feature">
            <ShieldCheck size={18} />
            <div>
              <strong>Approved access</strong>
              <p>Only invited employer accounts can enter the platform.</p>
            </div>
          </div>
          <div className="auth-feature">
            <Search size={18} />
            <div>
              <strong>AI-powered search</strong>
              <p>Find profiles by role, skills, experience, location, or company.</p>
            </div>
          </div>
          <div className="auth-feature auth-feature--wide">
            <Star size={18} />
            <div>
              <strong>Your shortlist</strong>
              <p>Save candidates to your account and export them when you are ready.</p>
            </div>
          </div>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="stack">
          <h2>{mode === "sign-in" ? "Welcome back" : "Password reset"}</h2>
          <p>{mode === "sign-in" ? "Use the email approved for your employer account." : "Enter your approved email and we will send a reset link."}</p>
        </div>

        <label className="panel__section">
          <span>Email</span>
          <input className="form-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" required />
        </label>

        {mode === "sign-in" ? (
          <label className="panel__section">
            <span>Password</span>
            <input className="form-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" required />
          </label>
        ) : null}

        {message || authError ? <div className="status-banner">{message ?? authError}</div> : null}

        <button className="button button--primary button--full" type="submit" disabled={pending}>
          {pending ? <Loader2 className="spin" size={16} /> : null}
          {mode === "sign-in" ? "Sign in" : "Send reset link"}
        </button>

        <button
          className="button button--secondary button--full"
          type="button"
          onClick={() => {
            setMode((value) => (value === "sign-in" ? "reset-password" : "sign-in"));
            setMessage(null);
          }}
        >
          {mode === "sign-in" ? "Forgot your password?" : "Remembered it?"}
          <strong>{mode === "sign-in" ? "Reset password" : "Back to sign in"}</strong>
        </button>
      </form>
    </AuthShell>
  );
}

function PasswordRecoveryScreen() {
  const { authError, signOut, updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setPending(true);

    try {
      await updatePassword(password);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Password reset"
      title="Set a new password."
      detail="Create a new password to continue to the talent platform."
      aside={
        <>
          <div className="auth-feature">
            <ShieldCheck size={18} />
            <div>
              <strong>Secure account</strong>
              <p>Your new password protects your candidate search and shortlist access.</p>
            </div>
          </div>
          <div className="auth-feature">
            <Star size={18} />
            <div>
              <strong>Back to hiring</strong>
              <p>After saving it, we will take you back into the platform.</p>
            </div>
          </div>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="stack">
          <h2>Choose password</h2>
          <p>Use at least 8 characters.</p>
        </div>

        <label className="panel__section">
          <span>New password</span>
          <input className="form-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" minLength={8} required />
        </label>

        <label className="panel__section">
          <span>Confirm password</span>
          <input className="form-input" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat password" minLength={8} required />
        </label>

        {message || authError ? <div className="status-banner">{message ?? authError}</div> : null}

        <button className="button button--primary button--full" type="submit" disabled={pending}>
          {pending ? <Loader2 className="spin" size={16} /> : null}
          Save password
        </button>

        <button className="button button--secondary button--full" type="button" onClick={() => void signOut()}>
          <LogOut size={16} />
          Use another account
        </button>
      </form>
    </AuthShell>
  );
}

function AccessPendingScreen() {
  const { authError, signOut, userEmail } = useAuth();

  return (
    <AuthShell
      eyebrow="Access required"
      title="Your account is not active yet."
      detail="You are signed in, but this email has not been added to the shared CV platform."
      aside={
        <>
          <div className="auth-feature">
            <ShieldCheck size={18} />
            <div>
              <strong>Ask your admin</strong>
              <p>Request access for this email before continuing.</p>
            </div>
          </div>
          <div className="auth-feature">
            <Search size={18} />
            <div>
              <strong>Shared CV pool</strong>
              <p>Approved accounts can search the same indexed candidate database.</p>
            </div>
          </div>
        </>
      }
    >
      <div className="auth-form">
        <div className="stack">
          <h2>Access pending</h2>
          <p>Signed in as {userEmail ?? "unknown user"}.</p>
        </div>

        {authError ? <div className="status-banner">{authError}</div> : null}

        <button className="button button--secondary button--full" type="button" onClick={() => void signOut()}>
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </AuthShell>
  );
}

export function AuthGate({ children }: AuthGateProps) {
  const { enabled, isAdmin, loading, memberships, passwordRecovery, session } = useAuth();

  if (!enabled) {
    return <>{children}</>;
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <SignInScreen />;
  }

  if (passwordRecovery) {
    return <PasswordRecoveryScreen />;
  }

  if (!memberships.length && !isAdmin) {
    return <AccessPendingScreen />;
  }

  return <>{children}</>;
}
