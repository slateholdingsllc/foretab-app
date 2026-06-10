import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Read-only profile summary. Email + account status only. Business
 * Location (legal-floor input) now lives in StateManagementSection
 * alongside Trial State, so the page surfaces two clearly distinct
 * location-related fields in one section rather than splitting them
 * across Profile + States and reading as a duplicate.
 */
export function ProfileSection({
  email,
  status,
}: {
  email: string | null;
  status: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <Row label="Email" value={email ?? "—"} valueClassName="lowercase" />
        <Row label="Status" value={status ? status.replace(/_/g, " ") : "—"} />
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  valueClassName = "capitalize",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-input/60 py-2 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${valueClassName}`}>{value}</span>
    </div>
  );
}
