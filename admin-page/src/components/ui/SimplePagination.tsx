"use client";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SimplePaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Simple "Previous / Page X of Y / Next" pagination strip.
 * Intended for large datasets where numbered page buttons aren't practical.
 */
export default function SimplePagination({
  currentPage,
  totalPages,
  onPageChange,
}: SimplePaginationProps) {
  const isFirst = currentPage <= 1;
  const isLast = currentPage >= totalPages;

  return (
    <div className="flex items-center justify-between border-t border-[#29345E] px-1 pt-4 mt-2">
      {/* Previous */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={isFirst}
        className="
          rounded-lg border border-[#29345E]
          bg-[#171D3D]
          px-4 py-1.5 text-sm font-medium
          text-[#B9C0D3]
          transition-colors
          hover:bg-[#29345E]/60 hover:text-white
          disabled:opacity-40 disabled:pointer-events-none
          focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F7EFF]/40
        "
      >
        Previous
      </button>

      {/* Page indicator */}
      <p className="text-sm text-[#6C7285] tabular-nums select-none">
        Page{" "}
        <span className="font-semibold text-[#B9C0D3]">
          {currentPage.toLocaleString()}
        </span>
        {" of "}
        <span className="font-semibold text-[#B9C0D3]">
          {totalPages.toLocaleString()}
        </span>
      </p>

      {/* Next */}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={isLast}
        className="
          rounded-lg border border-[#2F7EFF]
          bg-[#2F7EFF]/10
          px-4 py-1.5 text-sm font-medium
          text-[#4DA3FF]
          transition-colors
          hover:bg-[#2F7EFF]/20 hover:text-white
          disabled:opacity-40 disabled:pointer-events-none
          focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F7EFF]/40
        "
      >
        Next
      </button>
    </div>
  );
}
