import { createFileRoute } from "@tanstack/react-router";
import { AccountSettingsPage } from "./account.settings";

export const Route = createFileRoute("/_authenticated/committee/account/settings")({
  component: AccountSettingsPage,
});
