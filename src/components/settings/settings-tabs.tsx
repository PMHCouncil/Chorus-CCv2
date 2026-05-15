"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Settings as SettingsIcon, Users, ShieldCheck } from "lucide-react";

const TABS = [
  { to: "/app/settings", label: "AI & Prompts", icon: SettingsIcon, exact: true },
  { to: "/app/settings/users", label: "Users", icon: Users, exact: false },
  { to: "/app/settings/roles", label: "Roles", icon: ShieldCheck, exact: false },
] as const;

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 border-b mb-6 -mt-2">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
        const Icon = t.icon;
        return (
          <Link
            key={t.to}
            href={t.to}
            className={cn(
              "flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
