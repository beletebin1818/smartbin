import AppShell from "@/components/layout/AppShell";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import AgentDetailClient from "@/components/agents/AgentDetailClient";

export default function AgentDetailPage({ params }: { params: { agentId: string } }) {
  return (
    <ProtectedRoute>
      <AppShell breadcrumbs={[{ label: "Dashboard", href: "/agents" }, { label: "Agents", href: "/agents" }, { label: "Agent Detail" }]}>
        <div className="max-w-7xl mx-auto">
          <AgentDetailClient agentId={params.agentId} />
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
