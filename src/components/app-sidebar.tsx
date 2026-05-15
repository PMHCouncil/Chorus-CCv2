"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Inbox,
  LayoutDashboard,
  Layers,
  MessageSquareText,
  Gavel,
  ScrollText,
  ShieldCheck,
  Settings,
  BarChart3,
} from "lucide-react";
import type { AppRole } from "@/lib/auth";

type NavItem = {
  title: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: AppRole[];
};

const STAFF: AppRole[] = ["hr", "exec", "gm", "gm_ea", "director", "group_manager"];

const NAV: NavItem[] = [
  { title: "Dashboard", to: "/app", icon: LayoutDashboard, roles: STAFF },
  { title: "Inbox", to: "/app/inbox", icon: Inbox, roles: ["hr", "gm", "gm_ea", "director", "group_manager"] },
  { title: "Analytics", to: "/app/analytics", icon: BarChart3, roles: STAFF },
  { title: "Themes", to: "/app/themes", icon: Layers, roles: STAFF },
  { title: "Responses", to: "/app/responses", icon: MessageSquareText, roles: STAFF },
  { title: "Decisions", to: "/app/decisions", icon: Gavel, roles: STAFF },
  { title: "Audit", to: "/app/audit", icon: ScrollText, roles: ["admin", ...STAFF] },
  { title: "Settings", to: "/app/settings", icon: Settings, roles: ["admin"] },
];

export function AppSidebar({ roles }: { roles: AppRole[] }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = usePathname();
  const visible = NAV.filter((i) => i.roles.some((r) => roles.includes(r)));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="h-7 w-7 rounded-md bg-sidebar-primary grid place-items-center shrink-0">
            <ShieldCheck className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-sm font-semibold">Chorus Analyzer</div>
              <div className="text-[10px] text-sidebar-foreground/70">PMHC · Internal</div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visible.map((item) => {
                const isActive =
                  item.to === "/app" ? pathname === "/app" : pathname.startsWith(item.to);
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.to} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
