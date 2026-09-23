import { createFileRoute } from "@tanstack/react-router";
import { AccountSettingsPage } from "./account.settings";

export const Route = createFileRoute("/_authenticated/personnel/account/settings")({
  component: AccountSettingsPage,
});
