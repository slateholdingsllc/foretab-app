import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getStateName } from "@/lib/constants";

/**
 * Read-only profile summary. Email + business state come from the
 * customers row. No edit form yet — email changes route through Supabase
 * Auth (separate flow), business_state is collected at /state-selection
 * and shouldn't change post-onboarding (it's a legal-floor input).
 */
export function ProfileSection({
  email,
  businessState,
  status,
}: {
  email: string | null;
  businessState: string | null;
  status: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <Row label="Email" value={email ?? "—"} />
        <Row
          label="Business state"
          value={
            businessState
              ? `${getStateName(businessState) ?? businessState} (${businessState})`
              : "—"
          }
        />
        <Row label="Status" value={status ? status.replace(/_/g, " ") : "—"} />
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-input/60 py-2 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium capitalize">{value}</span>
    </div>
  );
}
