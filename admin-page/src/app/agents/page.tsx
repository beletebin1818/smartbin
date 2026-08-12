import AppShell from "@/components/layout/AppShell";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import AgentsClient from "@/components/agents/AgentsClient";

export default function AgentsPage() {
  return (
    <ProtectedRoute>
      <AppShell breadcrumbs={[{ label: "Dashboard" }, { label: "Agents" }]}>
        <div className="max-w-7xl mx-auto">
          <AgentsClient />
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
