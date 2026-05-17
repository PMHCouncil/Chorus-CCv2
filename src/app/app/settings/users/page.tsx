"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users as UsersIcon, Loader2, MoreHorizontal } from "lucide-react";
import { format } from "date-fns";

import { useAuth, hasAnyRole, ALL_ROLES, ROLE_LABELS, type AppRole } from "@/lib/auth";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import {
  listUsers,
  inviteUser,
  updateUser,
  setUserActive,
  forcePasswordReset,
} from "@/lib/actions/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function UsersPage() {
  const { roles, loading } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !hasAnyRole(roles, ["admin"])) {
      router.replace("/app");
    }
  }, [loading, roles, router]);

  const usersQ = useQuery({ queryKey: ["managed_users"], queryFn: () => listUsers() });

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<null | {
    id: string;
    display_name: string;
    role: AppRole;
  }>(null);

  const inviteMut = useMutation({
    mutationFn: (input: {
      email: string;
      display_name: string;
      role: AppRole;
      password: string;
      notes?: string;
    }) => inviteUser(input),
    onSuccess: () => {
      toast.success("User created");
      setInviteOpen(false);
      qc.invalidateQueries({ queryKey: ["managed_users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const updateMut = useMutation({
    mutationFn: (input: { user_id: string; display_name?: string; role?: AppRole }) =>
      updateUser(input),
    onSuccess: () => {
      toast.success("User updated");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["managed_users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const activeMut = useMutation({
    mutationFn: (input: { user_id: string; active: boolean }) => setUserActive(input),
    onSuccess: (_d, v) => {
      toast.success(v.active ? "User reactivated" : "User deactivated");
      qc.invalidateQueries({ queryKey: ["managed_users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const resetMut = useMutation({
    mutationFn: (user_id: string) => forcePasswordReset({ user_id }),
    onSuccess: () => toast.success("Password reset link generated"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!hasAnyRole(roles, ["admin"])) return null;

  const users = usersQ.data?.users ?? [];
  const filtered = users.filter((u) => {
    if (roleFilter !== "all" && !u.roles.includes(roleFilter as AppRole)) return false;
    const isInactive = !!u.banned_until && new Date(u.banned_until) > new Date();
    if (statusFilter === "active" && isInactive) return false;
    if (statusFilter === "inactive" && !isInactive) return false;
    if (statusFilter === "invited" && u.last_sign_in_at) return false;
    if (search) {
      const t = search.toLowerCase();
      if (!u.email.toLowerCase().includes(t) && !(u.display_name ?? "").toLowerCase().includes(t))
        return false;
    }
    return true;
  });

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-muted p-2">
          <UsersIcon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">User accounts and roles.</p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>Create user</Button>
      </div>

      <SettingsTabs />

      {usersQ.data?.debug && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <p className="font-semibold mb-1">listUsers debug</p>
          <pre className="whitespace-pre-wrap text-xs">{usersQ.data.debug}</pre>
        </div>
      )}

      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            placeholder="Search name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {ALL_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Deactivated</SelectItem>
              <SelectItem value="invited">Pending (never signed in)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {usersQ.isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin inline" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-8 text-sm text-muted-foreground"
                >
                  No users match.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((u) => {
                const isInactive = !!u.banned_until && new Date(u.banned_until) > new Date();
                const isInvited = !u.last_sign_in_at;
                const role = u.roles[0];
                return (
                  <TableRow key={u.id}>
                    <TableCell>{u.display_name ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{u.email}</TableCell>
                    <TableCell>
                      {u.roles.length === 0 ? (
                        <span className="text-muted-foreground text-xs">none</span>
                      ) : (
                        u.roles.map((r) => (
                          <Badge key={r} variant="secondary" className="mr-1">
                            {ROLE_LABELS[r] ?? r}
                          </Badge>
                        ))
                      )}
                    </TableCell>
                    <TableCell>
                      {isInactive ? (
                        <Badge variant="destructive">Inactive</Badge>
                      ) : isInvited ? (
                        <Badge variant="outline">Pending</Badge>
                      ) : (
                        <Badge variant="default">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {u.last_sign_in_at
                        ? format(new Date(u.last_sign_in_at), "d MMM yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {format(new Date(u.created_at), "d MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              setEditing({
                                id: u.id,
                                display_name: u.display_name ?? "",
                                role: role ?? "hr",
                              })
                            }
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              activeMut.mutate({ user_id: u.id, active: isInactive })
                            }
                          >
                            {isInactive ? "Reactivate" : "Deactivate"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => resetMut.mutate(u.id)}>
                            Send password reset
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSubmit={(v) => inviteMut.mutate(v)}
        pending={inviteMut.isPending}
      />

      <EditDialog
        editing={editing}
        onClose={() => setEditing(null)}
        onSubmit={(v) => updateMut.mutate(v)}
        pending={updateMut.isPending}
      />
    </div>
  );
}

function InviteDialog({
  open,
  onClose,
  onSubmit,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (v: {
    email: string;
    display_name: string;
    role: AppRole;
    password: string;
    notes?: string;
  }) => void;
  pending: boolean;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<AppRole>("hr");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) {
      setEmail("");
      setName("");
      setRole("hr");
      setPassword("");
      setNotes("");
    }
  }, [open]);

  const passwordTooShort = password.length > 0 && password.length < 8;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>
            Sets a temporary password you can share with them. Once Microsoft
            SSO is enabled, signing in with the same email will link their
            Microsoft account to this user automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Full name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Temporary password</Label>
            <Input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              autoComplete="off"
            />
            {passwordTooShort && (
              <p className="text-xs text-destructive">
                Must be at least 8 characters.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Share this with the user out-of-band (in person, Teams, etc.).
              They&rsquo;ll use it for testing until SSO is wired up.
            </p>
          </div>
          <div className="space-y-1">
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={pending || !email || !name || password.length < 8}
            onClick={() =>
              onSubmit({
                email,
                display_name: name,
                role,
                password,
                notes: notes || undefined,
              })
            }
          >
            {pending ? "Creating…" : "Create user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  editing,
  onClose,
  onSubmit,
  pending,
}: {
  editing: null | { id: string; display_name: string; role: AppRole };
  onClose: () => void;
  onSubmit: (v: { user_id: string; display_name?: string; role?: AppRole }) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<AppRole>("hr");

  useEffect(() => {
    if (editing) {
      setName(editing.display_name);
      setRole(editing.role);
    }
  }, [editing]);

  return (
    <Dialog open={!!editing} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            Email is immutable. Delete and re-invite if it must change.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Display name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={pending || !editing}
            onClick={() =>
              editing &&
              onSubmit({
                user_id: editing.id,
                display_name: name,
                role,
              })
            }
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
