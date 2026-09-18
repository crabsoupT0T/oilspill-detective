import { useRef, type PointerEvent } from "react";
import { WINDOW_H } from "@/lib/ais-buffer";

export function TimeDial({
  hoursBack,
  onChange,
  storedHours,
}: {
  hoursBack: number;
  onChange: (h: number) => void;
  storedHours: number;
}) {
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const live = hoursBack < 0.12;
  const progress = 1 - hoursBack / WINDOW_H;
  const stored = Math.min(1, storedHours / WINDOW_H);

  function setFromEvent(e: PointerEvent<HTMLDivElement>) {
    const node = track.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    onChange(Math.round((1 - x) * WINDOW_H * 4) / 4);
  }

  return (
    <div className="select-none rounded-xl border border-line bg-card/90 px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold tabular-nums text-fg">{live ? "LIVE" : `−${hoursBack.toFixed(1)} h`}</span>
        <span className="text-muted">
          {Math.min(WINDOW_H, storedHours).toFixed(0)}/{WINDOW_H}h stored · oldest dropped
        </span>
      </div>
      <div
        ref={track}
        className="group relative h-5 cursor-pointer"
        role="slider"
        aria-label="Rewind AIS routes"
        aria-valuemin={0}
        aria-valuemax={WINDOW_H}
        aria-valuenow={hoursBack}
        aria-valuetext={live ? "Live" : `${hoursBack.toFixed(1)} hours back`}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          setFromEvent(e);
        }}
        onPointerMove={(e) => {
          if (dragging.current) setFromEvent(e);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/20" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/35"
          style={{ width: `${stored * 100}%` }}
        />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-red-500"
          style={{ width: `${progress * 100}%` }}
        />
        <div
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 shadow group-hover:size-4"
          style={{ left: `${progress * 100}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>−{WINDOW_H}h</span>
        <span>−48h</span>
        <span>−24h</span>
        <span>NOW</span>
      </div>
    </div>
  );
}
