"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function buildPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "…")[] = [1];
  if (current > 3) pages.push("…");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push("…");
  pages.push(total);
  return pages;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  from: number;
  to: number;
  total: number;
  onPageChange: (page: number) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Pagination({
  currentPage,
  totalPages,
  from,
  to,
  total,
  onPageChange,
}: PaginationProps) {
  const pages = useMemo(
    () => buildPageNumbers(currentPage, totalPages),
    [currentPage, totalPages],
  );

  const btnBase =
    "inline-flex items-center justify-center rounded-lg border text-sm font-medium " +
    "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F7EFF]/40 " +
    "disabled:opacity-40 disabled:pointer-events-none";
  const btnSize = "h-8 min-w-[2rem] px-2";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
      {/* Showing X – Y of Z */}
      <p className="text-xs text-[#6C7285] shrink-0">
        Showing{" "}
        <span className="font-semibold text-[#B9C0D3]">{from}</span>
        {" – "}
        <span className="font-semibold text-[#B9C0D3]">{to}</span>
        {" of "}
        <span className="font-semibold text-[#B9C0D3]">{total}</span>
      </p>

      {/* Controls */}
      <div className="flex items-center gap-1 flex-wrap">
        {/* Prev */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Previous page"
          className={`${btnBase} ${btnSize} gap-1
            border-[#29345E]
            bg-[#171D3D]
            text-[#B9C0D3]
            hover:bg-[#29345E]/60 hover:text-white`}
        >
          <ChevronLeft size={14} />
          <span className="hidden sm:inline">Prev</span>
        </button>

        {/* Numbers */}
        {pages.map((p, idx) =>
          p === "…" ? (
            <span
              key={`ellipsis-${idx}`}
              className="inline-flex h-8 w-6 items-center justify-center text-xs text-[#6C7285] select-none"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              aria-label={`Page ${p}`}
              aria-current={p === currentPage ? "page" : undefined}
              className={`${btnBase} ${btnSize} ${p === currentPage
                  ? "border-[#2F7EFF] bg-[#2F7EFF] text-white hover:opacity-90"
                  : "border-[#29345E] bg-[#171D3D] text-[#B9C0D3] hover:bg-[#29345E]/60 hover:text-white"
                }`}
            >
              {p}
            </button>
          ),
        )}

        {/* Next */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Next page"
          className={`${btnBase} ${btnSize} gap-1
            border-[#29345E]
            bg-[#171D3D]
            text-[#B9C0D3]
            hover:bg-[#29345E]/60 hover:text-white`}
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
