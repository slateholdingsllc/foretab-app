export const metadata = {
  title: "Account Notice — Foretab",
};

export default function AccountNoticePage() {
  return (
    <div className="mx-auto max-w-sm pt-24">
      <div className="rounded-2xl border border-border bg-card px-8 py-10 text-center">
        <p className="text-[15px] font-medium text-foreground">
          We&apos;ve hit a hiccup with your account access.
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-foreground-muted">
          Please check your email for details, or contact{" "}
          <a
            href="mailto:support@foretab.com"
            className="text-foreground underline underline-offset-4 hover:opacity-80"
          >
            support@foretab.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}
