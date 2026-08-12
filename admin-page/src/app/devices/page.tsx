import AppShell from "@/components/layout/AppShell";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DevicesClient from "@/components/devices/DevicesClient";

export default function DevicesPage() {
  return (
    <ProtectedRoute>
      <AppShell breadcrumbs={[{ label: "Dashboard" }, { label: "Device Management" }]}>
        <DevicesClient />
      </AppShell>
    </ProtectedRoute>
  );
}
