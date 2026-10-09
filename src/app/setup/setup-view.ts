export type SetupView =
  "migrate" | "edit" | "prep" | "schedule" | "manage" | "create" | "upsell";

// Explicit query intent takes precedence over the default plan-based view.
export function resolveSetupView({
  migrating,
  isEdit,
  prepping,
  scheduling,
  managing,
  canCreate,
}: {
  migrating: boolean;
  isEdit: boolean;
  prepping: boolean;
  scheduling: boolean;
  managing: boolean;
  canCreate: boolean;
}): SetupView {
  if (migrating) return "migrate";
  if (isEdit) return "edit";
  if (prepping) return "prep";
  if (scheduling) return "schedule";
  if (managing) return "manage";
  return canCreate ? "create" : "upsell";
}
