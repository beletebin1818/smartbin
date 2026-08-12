import AppShell from "@/components/layout/AppShell";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import PlayersClient from "@/components/players/PlayersClient";

export default function PlayersPage() {
  return (
    <ProtectedRoute>
      <AppShell breadcrumbs={[{ label: "Dashboard" }, { label: "Players" }]}>
        <div className="max-w-7xl mx-auto">
          <PlayersClient />
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
