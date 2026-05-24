import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import {
  getAuthRedirectTarget,
  parseAuthRedirectSearch,
} from "@/lib/auth-routing";

export const Route = createFileRoute("/_auth")({
  beforeLoad: async ({ search }) => {
    const session = await authClient.getSession();

    if (session.data?.user) {
      const authSearch = parseAuthRedirectSearch(
        search as Record<string, unknown>
      );

      throw redirect({
        to: getAuthRedirectTarget(authSearch.redirect),
      });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <main className="min-h-svh bg-background px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100svh-5rem)] w-full max-w-6xl items-center justify-center">
        <Outlet />
      </div>
    </main>
  );
}
