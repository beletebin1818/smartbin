import AppShell from "@/components/layout/AppShell";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import GameSettingsClient from "@/components/game-settings/GameSettingsClient";

export default function GameSettingsPage() {
  return (
    <ProtectedRoute>
      <AppShell breadcrumbs={[{ label: "Dashboard" }, { label: "Game Settings" }]}>
        <div className="max-w-5xl mx-auto">
          <GameSettingsClient />
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
