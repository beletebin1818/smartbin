import AppShell from "@/components/layout/AppShell";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

export default function TransactionsPage() {
  return (
    <ProtectedRoute>
      <AppShell breadcrumbs={[{ label: "Dashboard" }, { label: "Transactions" }]}>
        <div className="flex items-center justify-center h-64 rounded-xl border border-dashed border-gray-200 text-gray-400">
          Transactions — coming soon
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
