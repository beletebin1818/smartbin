import AppShell from "@/components/layout/AppShell";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import BroadcastCenter from "@/components/messages/BroadcastCenter";

export default function MessagesPage() {
  return (
    <ProtectedRoute>
      <AppShell breadcrumbs={[{ label: "Dashboard" }, { label: "Messages" }]}>
        <div className="max-w-7xl mx-auto">
          <BroadcastCenter />
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
