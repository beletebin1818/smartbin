"use client";

import { Hash } from "lucide-react";
import type { DrawnNumbersData } from "@/types";

interface DrawnNumbersProps {
  data: DrawnNumbersData;
}

export default function DrawnNumbers({ data }: DrawnNumbersProps) {
  const { drawn, total } = data;

  return (
    <div className="rounded-xl border border-[#29345E] bg-[#171D3D] p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Hash size={15} className="text-[#6C7285] shrink-0" />
          <span className="text-xs font-bold uppercase tracking-widest text-[#B9C0D3]">
            Drawn Numbers
          </span>
        </div>
        <span className="text-base font-bold text-white tabular-nums">
          {drawn.length}{" "}
          <span className="text-[#6C7285] font-normal">/ {total}</span>
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {drawn.map((num, idx) => (
          <div
            key={`${num}-${idx}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-sm shadow-[#2F7EFF]/20"
            style={{ background: 'linear-gradient(135deg, #2F7EFF 0%, #4DA3FF 100%)' }}
          >
            <span className="text-white text-xs font-bold leading-none select-none">
              {num}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
