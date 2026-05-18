"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox,
  Layers,
  MessageSquareText,
  Gavel,
  ScrollText,
  Settings,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import type { AppRole } from "@/lib/auth";
import { usePspOpenCount } from "@/lib/submissions";
import { cn } from "@/lib/utils";

type Item = {
  title: string;
  to: string;
  icon: LucideIcon;
  roles: AppRole[];
};

const STAFF: AppRole[] = ["hr", "exec", "gm", "gm_ea", "director", "group_manager"];

const ITEMS: Item[] = [
  { title: "Inbox", to: "/app/inbox", icon: Inbox, roles: ["hr", "gm", "gm_ea", "director", "group_manager"] },
  { title: "PSP", to: "/app/psp-queue", icon: HelpCircle, roles: ["hr", "gm", "gm_ea", "director", "group_manager"] },
  { title: "Themes", to: "/app/themes", icon: Layers, roles: STAFF },
  { title: "Responses", to: "/app/responses", icon: MessageSquareText, roles: STAFF },
  { title: "Decisions", to: "/app/decisions", icon: Gavel, roles: STAFF },
  { title: "Audit", to: "/app/audit", icon: ScrollText, roles: ["admin", ...STAFF] },
  { title: "Settings", to: "/app/settings", icon: Settings, roles: ["admin"] },
];

export function MobileBottomNav({ roles }: { roles: AppRole[] }) {
  const pathname = usePathname();
  const visible = ITEMS.filter((i) => i.roles.some((r) => roles.includes(r)));
  const { data: pspOpenCount = 0 } = usePspOpenCount();

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 h-16 bg-card border-t flex items-stretch justify-around"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      {visible.map((item) => {
        const isActive = pathname.startsWith(item.to);
        const Icon = item.icon;
        const showPspBadge =
          item.to === "/app/psp-queue" && pspOpenCount > 0;
        return (
          <Link
            key={item.to}
            href={item.to}
            className={cn(
              "flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium relative",
              "border-t-2 border-transparent",
              isActive
                ? "border-primary bg-muted/60 text-foreground"
                : "text-muted-foreground active:bg-muted/40",
            )}
          >
            <div className="relative">
              <Icon className="h-5 w-5" />
              {showPspBadge && (
                <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-semibold grid place-items-center leading-none">
                  {pspOpenCount > 99 ? "99+" : pspOpenCount}
                </span>
              )}
            </div>
            <span className="leading-none truncate max-w-full px-1">{item.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}
