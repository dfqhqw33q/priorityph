import { createFileRoute } from "@tanstack/react-router";
import { AccountSettingsPage } from "./account.settings";

export const Route = createFileRoute("/_authenticated/supervisor/account/settings")({
  component: AccountSettingsPage,
});
