import AppShell from "@/components/layout/AppShell";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import PendingRequestClient from "@/components/pending-request/PendingRequestClient";

export default function PendingRequestPage() {
  return (
    <ProtectedRoute>
      <AppShell breadcrumbs={[{ label: "Dashboard" }, { label: "Pending Requests" }]}>
        <div className="max-w-7xl mx-auto">
          <PendingRequestClient />
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
