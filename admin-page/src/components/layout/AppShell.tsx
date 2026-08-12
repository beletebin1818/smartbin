"use client";

import { useState } from "react";
import { Menu, LayoutDashboard, ChevronRight } from "lucide-react";
import AppSidebar from "./AppSidebar";

interface BreadcrumbSegment {
  label: string;
  href?: string;
}

interface AppShellProps {
  children: React.ReactNode;
  breadcrumbs: BreadcrumbSegment[];
}

export default function AppShell({ children, breadcrumbs }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-[#0B0F26] font-sans">
      <AppSidebar
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Breadcrumb bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[#29345E] bg-[#171D3D] px-4 sm:px-6 py-3.5">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-[#6C7285] hover:text-[#B9C0D3] mr-1 transition-colors"
            aria-label="Open navigation"
          >
            <Menu size={22} />
          </button>

          <div className="flex items-center gap-1.5 text-sm">
            <LayoutDashboard size={15} className="text-[#6C7285] shrink-0" />
            {breadcrumbs.map((seg, i) => {
              const isLast = i === breadcrumbs.length - 1;
              return (
                <span key={seg.label} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <ChevronRight size={13} className="text-[#29345E] shrink-0" />
                  )}
                  <span className={isLast
                    ? "font-semibold text-white"
                    : "text-[#6C7285]"
                  }>
                    {seg.label}
                  </span>
                </span>
              );
            })}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
