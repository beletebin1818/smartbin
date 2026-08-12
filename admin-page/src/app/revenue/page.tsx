"use client";

import { useState, useEffect, useCallback } from "react";
import AppShell from "@/components/layout/AppShell";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import RevenueSummaryCards from "@/components/revenue/RevenueSummaryCards";
import WalletLedger from "@/components/revenue/WalletLedger";
import { getRevenueSummary } from "@/lib/api/revenueClient";
import { getSocket } from "@/lib/socket";
import type { RevenueSummaryCard } from "@/types";

export default function RevenuePage() {
  const [summaryCards, setSummaryCards] = useState<RevenueSummaryCard[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getRevenueSummary();
      setSummaryCards(data);
    } catch (err) {
      console.error("Failed to fetch revenue summary:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();

    // ── Real-time: listen for revenue:updated events from the backend ──
    // Any transaction, game completion, card claim, or wallet update
    // will trigger a refresh of the summary cards.
    const socket = getSocket();
    const handleRevenueUpdate = () => {
      fetchSummary();
    };
    socket.on("revenue:updated", handleRevenueUpdate);

    return () => {
      socket.off("revenue:updated", handleRevenueUpdate);
    };
  }, [fetchSummary]);

  return (
    <ProtectedRoute>
      <AppShell breadcrumbs={[{ label: "Dashboard" }, { label: "Platform Revenue" }]}>
        <div className="space-y-6 max-w-7xl mx-auto">

          {/* ── Section 1: Summary cards ── */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-5">
              Platform Revenue
            </h1>
            <RevenueSummaryCards cards={summaryCards} loading={loading} />
          </div>

          {/* ── Section 2: Platform Wallet Ledger ── */}
          <WalletLedger />

        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
