import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/navigation/Sidebar";
import { Topbar } from "@/components/navigation/Topbar";

export function AppShell() {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setNavigationOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />
      <Sidebar open={navigationOpen} onClose={() => setNavigationOpen(false)} />
      {navigationOpen ? <button className="sidebar-scrim" onClick={() => setNavigationOpen(false)} aria-label="Close navigation" type="button" /> : null}
      <div className="app-shell__main">
        <Topbar onOpenNavigation={() => setNavigationOpen(true)} />
        <main className="app-shell__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
