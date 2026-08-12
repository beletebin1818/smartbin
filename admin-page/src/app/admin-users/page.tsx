import AppShell from "@/components/layout/AppShell";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import AdminUsersClient from "@/components/admin-users/AdminUsersClient";

export default function AdminUsersPage() {
  return (
    <ProtectedRoute>
      <AppShell breadcrumbs={[{ label: "Dashboard" }, { label: "Admin Users" }]}>
        <AdminUsersClient />
      </AppShell>
    </ProtectedRoute>
  );
}
