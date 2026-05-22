"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth, isAdminOnly } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, ShieldCheck, UserCircle2 } from "lucide-react";

const ADMIN_ALLOWED_PREFIXES = ["/app/settings", "/app/audit"];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading, user, roles, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    // Defence in depth: middleware auth-walls /app, but a statically
    // prerendered shell can be served from the CDN without middleware
    // running. Never render the app for an unauthenticated visitor.
    if (!user) {
      const next = pathname?.startsWith("/app") ? pathname : "/app";
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    if (
      isAdminOnly(roles) &&
      pathname.startsWith("/app") &&
      !ADMIN_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))
    ) {
      router.replace("/app/settings");
    }
  }, [loading, user, roles, pathname, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const onSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <div className="hidden md:contents">
          <AppSidebar roles={roles} />
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="hidden md:flex h-14 border-b items-center justify-between px-4 gap-2 bg-card">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <div className="text-sm text-muted-foreground hidden sm:block">
                Clause 42 Consultation · 12 May – 12 Jun 2026
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground hidden sm:inline">{user?.email}</span>
              <div className="flex gap-1">
                {roles.map((r) => (
                  <span
                    key={r}
                    className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent text-accent-foreground"
                  >
                    {r}
                  </span>
                ))}
              </div>
              <button
                onClick={onSignOut}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Sign out
              </button>
            </div>
          </header>

          <header className="md:hidden h-11 border-b flex items-center justify-between px-3 bg-card sticky top-0 z-30">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-6 w-6 rounded-md bg-primary grid place-items-center shrink-0">
                <ShieldCheck className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <span className="text-sm font-semibold truncate">Chorus</span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="h-11 w-11 -mr-2 grid place-items-center text-muted-foreground"
                aria-label="Account"
              >
                <UserCircle2 className="h-5 w-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="text-sm font-medium truncate">{user?.email}</div>
                  {roles.length > 0 && (
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
                      {roles.join(" · ")}
                    </div>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onSignOut}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          <main className="flex-1 overflow-y-auto pb-20 md:pb-0">{children}</main>

          <MobileBottomNav roles={roles} />
        </div>
      </div>
    </SidebarProvider>
  );
}
