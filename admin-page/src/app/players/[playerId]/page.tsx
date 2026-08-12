import AppShell from "@/components/layout/AppShell";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import PlayerDetailClient from "@/components/players/PlayerDetailClient";

interface PlayerDetailPageProps {
  params: {
    playerId: string;
  };
}

export default function PlayerDetailPage({ params }: PlayerDetailPageProps) {
  const playerIdNum = parseInt(params.playerId, 10);

  return (
    <ProtectedRoute>
      <AppShell breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Players", href: "/players" }, { label: "Game Check" }]}>
        <div className="max-w-7xl mx-auto">
          <PlayerDetailClient playerId={playerIdNum} />
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
