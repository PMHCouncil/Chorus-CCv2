import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between bg-sidebar text-sidebar-foreground p-12">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-sidebar-primary grid place-items-center">
            <ShieldCheck className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          <span className="font-semibold tracking-tight">Chorus Analyzer</span>
        </div>
        <div className="space-y-4">
          <h1 className="text-3xl font-semibold leading-tight max-w-md">
            Listening with care.
          </h1>
        </div>
        <p className="text-xs text-sidebar-foreground/60">
          Confidential. Authorised personnel only.
        </p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-8">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Use your council account to continue.
            </p>
          </div>

          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
