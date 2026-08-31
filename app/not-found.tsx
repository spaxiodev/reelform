import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { StatusScreen } from "@/components/ui/StatusScreen";

export const metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Deliberately NOT <SiteHeader />. That component reads the session,
          which touches cookies. Because the root not-found renders into
          every route's shell, one cookie read here forces the whole site to
          render dynamically. AppHeader reads nothing, so the marketing and
          legal pages stay prerendered. */}
      <AppHeader links={[
        { href: "/showcase", label: "Showcase" },
        { href: "/pricing", label: "Pricing" },
      ]}>
        <Link href="/dashboard" className="btn-primary !py-2 !px-3.5 sm:!px-4 !text-xs sm:!text-sm">
          Open studio
        </Link>
      </AppHeader>

      <StatusScreen
        code="404"
        eyebrow="TAKE NOT FOUND"
        title="This one ended up on the cutting-room floor."
        body={
          <>
            The page you asked for doesn&apos;t exist. It may have been renamed or unpublished, or
            the link may have a typo in it.
          </>
        }
        actions={
          <>
            <Link href="/" className="btn-primary">
              Back to home
            </Link>
            <Link href="/showcase" className="btn-ghost">
              Browse the showcase
            </Link>
          </>
        }
        detail={
          <>
            Looking for your own work? It&apos;s all in your{" "}
            <Link href="/dashboard" className="text-primary underline underline-offset-2">
              dashboard
            </Link>
            .
          </>
        }
      />
      <SiteFooter />
    </div>
  );
}
