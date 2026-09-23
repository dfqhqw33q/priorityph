import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PasswordField } from "@/components/shared/password-field";
import { PageHeader, LoadingBlock } from "@/components/shared/shared-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  changeMyAccountPassword,
  getMyAccountSettings,
  recordEmailSecurityEvent,
  syncMyConfirmedEmail,
  updateMyProfile,
} from "@/lib/access.functions";
import { ROLE_LABELS, type AppRole } from "@/lib/domain";
import { userErrorMessage } from "@/lib/validation";

export const Route = createFileRoute("/_authenticated/account/settings")({
  head: () => ({
    meta: [
      { title: "Profile and account settings | Priority Handling Logistics, Inc." },
      { name: "description", content: "Manage your own profile and account security settings." },
    ],
  }),
  component: AccountSettingsPage,
});

export function AccountSettingsPage() {
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getMyAccountSettings);
  const saveProfile = useServerFn(updateMyProfile);
  const changePassword = useServerFn(changeMyAccountPassword);
  const recordEmailEvent = useServerFn(recordEmailSecurityEvent);
  const syncEmail = useServerFn(syncMyConfirmedEmail);
  const [fullName, setFullName] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const settingsQuery = useQuery({
    queryKey: ["account-settings"],
    queryFn: fetchSettings,
    retry: false,
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    setFullName(settingsQuery.data.fullName);
    setEmail(settingsQuery.data.email);
  }, [settingsQuery.data]);

  const profileMutation = useMutation({
    mutationFn: () => saveProfile({ data: { fullName } }),
    onSuccess: async () => {
      toast.success("Profile updated");
      await queryClient.invalidateQueries({ queryKey: ["account-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["access"] });
    },
    onError: (error: Error) => toast.error(userErrorMessage(error, "Profile update failed")),
  });

  const passwordMutation = useMutation({
    mutationFn: () =>
      changePassword({ data: { currentPassword, password: newPassword, confirmPassword } }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed. Other sessions were signed out.");
    },
    onError: (error: Error) => toast.error(userErrorMessage(error, "Password change failed")),
  });

  async function requestEmailChange() {
    const nextEmail = email.trim().toLowerCase();
    if (!nextEmail || nextEmail === settingsQuery.data?.email.toLowerCase()) {
      toast.error("Enter a different email address.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ email: nextEmail });
    if (error) {
      toast.error(error.message);
      return;
    }
    await recordEmailEvent({ data: { event: "EMAIL_CHANGE_REQUESTED" } });
    setPendingEmail(nextEmail);
    toast.success("Confirmation email sent to the new address.");
  }

  async function refreshEmailState() {
    await syncEmail();
    const { data } = await supabase.auth.getUser();
    if (data.user?.email && data.user.email !== settingsQuery.data?.email) {
      await recordEmailEvent({ data: { event: "EMAIL_VERIFIED" } });
      await queryClient.invalidateQueries({ queryKey: ["account-settings"] });
      toast.success("Email address verified.");
    } else {
      toast.message("The new email is still awaiting confirmation.");
    }
  }

  if (settingsQuery.isLoading) return <LoadingBlock rows={8} variant="detail" />;
  if (!settingsQuery.data) {
    return <p className="text-sm text-destructive">Account settings are unavailable.</p>;
  }
  const settings = settingsQuery.data;
  const role = settings.roles[0] as AppRole | undefined;
  const status = settings.isLocked ? "Locked" : settings.isActive ? "Active" : "Inactive";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile and account settings"
        description="Manage your own profile and security."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personal information</CardTitle>
            <CardDescription>Only your display name can be changed here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="profile-full-name">Full name</Label>
              <Input
                id="profile-full-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                {settings.email}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <p className="text-sm">{role ? ROLE_LABELS[role] : "No role assigned"}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Account status</Label>
              <Badge variant={status === "Active" ? "secondary" : "destructive"}>{status}</Badge>
            </div>
            <div className="space-y-1.5">
              <Label>Last login</Label>
              <p className="text-sm text-muted-foreground">
                {settings.lastLoginAt
                  ? new Date(settings.lastLoginAt).toLocaleString()
                  : "Not available"}
              </p>
            </div>
            <Button
              onClick={() => profileMutation.mutate()}
              disabled={profileMutation.isPending || fullName.trim().length < 2}
            >
              {profileMutation.isPending ? "Saving..." : "Save profile"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Password</CardTitle>
              <CardDescription>Changing your password signs out other sessions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <PasswordField
                id="current-password"
                label="Current password"
                value={currentPassword}
                onChange={setCurrentPassword}
                autoComplete="current-password"
              />
              <PasswordField
                id="account-new-password"
                label="New password"
                value={newPassword}
                identifiers={[settings.fullName, settings.email]}
                onChange={setNewPassword}
              />
              <PasswordField
                id="account-confirm-password"
                label="Confirm new password"
                value={confirmPassword}
                onChange={setConfirmPassword}
              />
              <Button
                onClick={() => passwordMutation.mutate()}
                disabled={
                  passwordMutation.isPending || !currentPassword || !newPassword || !confirmPassword
                }
              >
                {passwordMutation.isPending ? "Changing..." : "Change password"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Email and verification</CardTitle>
              <CardDescription>
                Email confirmation is required for address changes. Email OTP cannot be disabled.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="account-email">Email address</Label>
                <Input
                  id="account-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {settings.emailConfirmedAt
                    ? `Verified ${new Date(settings.emailConfirmedAt).toLocaleString()}`
                    : "Email verification is pending."}
                </p>
              </div>
              {pendingEmail ? (
                <p className="text-sm text-muted-foreground">
                  Pending confirmation: {pendingEmail}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void requestEmailChange()}>
                  Request email change
                </Button>
                <Button variant="ghost" onClick={() => void refreshEmailState()}>
                  Refresh verification status
                </Button>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                <p className="font-medium">Email OTP authentication</p>
                <p className="text-muted-foreground">
                  {settings.otpRequired
                    ? "Required and active for this account."
                    : "Not available."}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent security activity</CardTitle>
            </CardHeader>
            <CardContent>
              {settings.recentSecurityActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent security activity.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {settings.recentSecurityActivity.map((event, index) => (
                    <li
                      key={`${event.occurredAt}-${index}`}
                      className="flex justify-between gap-3 py-2"
                    >
                      <span>{event.action}</span>
                      <span className="text-xs text-muted-foreground">
                        {event.result} · {new Date(event.occurredAt).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
