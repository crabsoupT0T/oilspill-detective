import { createRouter, createRoute, createRootRoute, Outlet } from "@tanstack/react-router";
import { Dashboard } from "@/components/dashboard";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Dashboard,
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const getRouter = () =>
  createRouter({
    routeTree,
    defaultPreload: "intent",
  });

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
