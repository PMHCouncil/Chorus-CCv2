import Link from "next/link";

export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <div className="text-center space-y-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          The page you&rsquo;re looking for doesn&rsquo;t exist.
        </p>
        <Link
          href="/app"
          className="inline-block text-sm font-medium text-primary hover:underline"
        >
          Back to Chorus
        </Link>
      </div>
    </div>
  );
}
