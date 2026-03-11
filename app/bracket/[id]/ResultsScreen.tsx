"use client";

import { useEffect, useRef, useState } from "react";

type PodiumPlayer = { name: string; character?: string };

const CHARACTER_MAP: Record<string, string> = {
  chadmcbrad: "/peach-results.jpg",
  yoshapod: "/peach-results.jpg",
  chadmcbradly: "/peach-results.jpg",
  chaddad: "/peach-results.jpg",
  burly: "/fox-results.jpg",
  zell: "/falco-results.jpg",
};

function getCharacterImage(name: string): string {
  const normalized = name.replace(/\s*\[DQ\]$/i, "").toLowerCase();
  return CHARACTER_MAP[normalized] ?? "/defaults-results.png";
}

type Props = {
  first: PodiumPlayer;
  second: PodiumPlayer;
  third: PodiumPlayer;
  initialStage?: number;
  onClose: () => void;
};

// Stage 0=dark, 1=3rd in, 2=2nd in, 3=1st in+confetti, 4=split to thirds
const STAGE_DELAYS = [100, 3200, 2200, 2800];

const CONFETTI_COLORS = ["#f0c000", "#39ff14", "#e8001c", "#c084fc", "#ffffff"];

function useConfetti(canvasRef: React.RefObject<HTMLCanvasElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const pieces = Array.from({ length: 150 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      w: 6 + Math.random() * 8,
      h: 10 + Math.random() * 6,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      speed: 2 + Math.random() * 3,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.15,
      drift: (Math.random() - 0.5) * 1.5,
    }));
    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pieces) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
        p.y += p.speed; p.x += p.drift; p.angle += p.spin;
        if (p.y > canvas.height) { p.y = -20; p.x = Math.random() * canvas.width; }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [active, canvasRef]);
}

// In stage 4, panels are laid out left→right as: 3rd | 2nd | 1st
// Each panel needs to know its final left offset (0%, 33.33%, 66.66%)
const PLACEMENTS = [
  {
    key: "third"  as const,
    label: "3RD PLACE",
    color: "#cd7f32",
    enterFrom: "translateX(-100%)",
    visibleAt: 1,
    splitLeft: "0%",
  },
  {
    key: "second" as const,
    label: "2ND PLACE",
    color: "#c0c0c0",
    enterFrom: "translateX(100%)",
    visibleAt: 2,
    splitLeft: "66.666%",
  },
  {
    key: "first"  as const,
    label: "1ST PLACE",
    color: "#f0c000",
    enterFrom: "translateY(-100%)",
    visibleAt: 3,
    splitLeft: "33.333%",
  },
];

export default function ResultsScreen({ first, second, third, initialStage, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stage, setStage] = useState(initialStage ?? 0);

  useEffect(() => {
    if (initialStage) return;
    let t: ReturnType<typeof setTimeout>;
    const advance = (s: number) => {
      t = setTimeout(() => { setStage(s); if (s < 4) advance(s + 1); }, STAGE_DELAYS[s - 1]);
    };
    advance(1);
    return () => clearTimeout(t);
  }, []);

  useConfetti(canvasRef, stage >= 3);

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 639px)").matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const players: Record<string, PodiumPlayer> = { first, second, third };
  const split = stage >= 4;

  return (
    <div className="fixed inset-0 z-50 font-mono overflow-hidden" style={{ background: "#050810" }}>

      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }} />

      {PLACEMENTS.map(({ key, label, color, enterFrom, visibleAt, splitLeft }, i) => {
        const player = players[key];
        const visible = stage >= visibleAt;

        // Mobile split: 1st = full screen, 2nd/3rd = small bottom cards
        // Desktop split: 3 equal columns side by side
        const mobileSplitStyle = (() => {
          if (!split || !isMobile) return {};
          if (key === "first")  return { left: 0, top: 0, width: "100%", bottom: "260px", zIndex: 1 };
          if (key === "second") return { left: "50%", bottom: 0, top: "auto", width: "50%", height: "260px", zIndex: 2 };
          if (key === "third")  return { left: 0,     bottom: 0, top: "auto", width: "50%", height: "260px", zIndex: 2 };
          return {};
        })();

        const desktopSplitStyle = split && !isMobile ? {
          zIndex: 1, left: splitLeft, width: "33.333%",
        } : {};

        const baseStyle = !split ? {
          zIndex: visibleAt, left: 0, width: "100%",
        } : {};

        const isSmallCard = split && isMobile && key !== "first";

        return (
          <div
            key={key}
            className="absolute top-0 bottom-0 overflow-hidden"
            style={{
              ...baseStyle,
              ...desktopSplitStyle,
              ...mobileSplitStyle,
              background: "#050810",
              transition: "transform 0.75s cubic-bezier(0.22,1,0.36,1), left 0.8s cubic-bezier(0.22,1,0.36,1), width 0.8s cubic-bezier(0.22,1,0.36,1), height 0.8s cubic-bezier(0.22,1,0.36,1), bottom 0.8s cubic-bezier(0.22,1,0.36,1)",
              transform: visible ? "translate(0,0)" : enterFrom,
            }}
          >
            {/* Character image / placeholder */}
            <img
              src={getCharacterImage(player.name)}
              alt={player.name}
              className={`absolute inset-0 w-full h-full object-contain object-center char-float-${i + 1}`}
              style={{ filter: `brightness(0.85)` }}
            />

            {/* Bottom gradient */}
            {!isSmallCard && (
              <div className="absolute inset-x-0 bottom-0 pointer-events-none"
                style={{ height: "45%", background: "linear-gradient(to top, #050810f0 0%, transparent 100%)" }} />
            )}

            {/* Placement banner */}
            <div className={`absolute ${isSmallCard ? "inset-0 flex flex-col justify-center px-3" : "bottom-0 left-0 p-4 sm:p-8"}`}
              style={isSmallCard ? { background: `linear-gradient(160deg, ${color}18 0%, #050810ee 100%)`, borderTop: `1px solid ${color}66` } : {}}>
              <div className="text-xs tracking-[0.3em] mb-0.5" style={{ color, fontSize: split && !isSmallCard ? "clamp(0.75rem, 1.2vw, 1rem)" : undefined }}>{label}</div>
              <div className="font-bold tracking-widest"
                style={{
                  color,
                  textShadow: `0 0 16px ${color}, 0 0 40px ${color}66`,
                  fontSize: isSmallCard ? "0.85rem" : split ? "clamp(1.5rem, 3.5vw, 3rem)" : "clamp(1.5rem, 5vw, 3.5rem)",
                  transition: "font-size 0.8s ease",
                }}>
                {player.name}
              </div>
            </div>

            {/* Divider line between panels in split mode */}
            {split && !isMobile && splitLeft !== "66.666%" && (
              <div className="absolute top-0 bottom-0 right-0 pointer-events-none"
                style={{ width: 2, background: color, boxShadow: `0 0 12px 2px ${color}`, opacity: 0.5 }} />
            )}
            {/* Divider between small cards on mobile */}
            {isSmallCard && key === "second" && (
              <div className="absolute top-0 bottom-0 left-0 pointer-events-none"
                style={{ width: 1, background: color, opacity: 0.4 }} />
            )}
          </div>
        );
      })}

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 flex flex-col items-center pt-6 pointer-events-none"
        style={{ zIndex: 20, transition: "opacity 0.8s ease", opacity: stage >= 3 ? 1 : 0 }}>
        <div className="text-xs tracking-[0.5em] text-[var(--text-dim)] mb-1">TOURNAMENT COMPLETE</div>
        <div className="text-3xl sm:text-4xl font-bold tracking-widest text-[#f0c000]"
          style={{ textShadow: "0 0 20px #f0c000, 0 0 60px #f0c00066" }}>
          RESULTS
        </div>
      </div>

      {/* Back button */}
      <div className="absolute top-6 left-6"
        style={{ zIndex: 20, transition: "opacity 0.8s ease", opacity: stage >= 3 ? 1 : 0 }}>
        <button onClick={onClose}
          className="px-2 py-1 sm:px-6 sm:py-2 text-sm sm:text-sm tracking-widest border border-[var(--border)] text-[var(--text-dim)] hover:border-[#39ff14] hover:text-[#39ff14] transition-colors"
          style={{ background: "#050810cc" }}>
          <span className="sm:hidden">◀</span>
          <span className="hidden sm:inline">◀ BACK TO BRACKET</span>
        </button>
      </div>
    </div>
  );
}
