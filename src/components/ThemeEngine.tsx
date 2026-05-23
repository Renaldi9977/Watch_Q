import { useEffect, useRef } from "react";
import { useStore } from "../store/useStore";
import { AnimatePresence, motion } from "motion/react";

export default function ThemeEngine() {
  const theme = useStore((state) => state.theme);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (theme !== "live" && theme !== "anime") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let lastTime = 0;
    // Throttle ke ~30fps agar tidak menguras CPU HP kentang
    const FPS_LIMIT = 30;
    const FRAME_INTERVAL = 1000 / FPS_LIMIT;

    const particles: Array<{
      x: number; y: number; r: number;
      dx: number; dy: number; color: string;
    }> = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener("resize", resize);
    resize();

    // HP kentang: kurangi jumlah partikel
    const isMobile = window.innerWidth <= 768;
    const pCount = isMobile ? 12 : 35;

    const colors =
      theme === "live"
        ? ["#38bdf8", "#818cf8", "#c084fc"]
        : ["#fda4af", "#f0abfc", "#fcd34d"];

    for (let i = 0; i < pCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 2.5 + 1,
        dx: (Math.random() - 0.5) * 1.2,
        dy: (Math.random() - 0.5) * 1.2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    const render = (timestamp: number) => {
      animationFrameId = requestAnimationFrame(render);
      const elapsed = timestamp - lastTime;
      if (elapsed < FRAME_INTERVAL) return; // skip frame jika terlalu cepat
      lastTime = timestamp - (elapsed % FRAME_INTERVAL);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 0.6;
      particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
      });
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [theme]);

  return (
    <div className="fixed inset-0 -z-50 pointer-events-none bg-slate-950 overflow-hidden transition-colors duration-800">
      <AnimatePresence mode="wait">
        {theme === "default" && (
          <motion.div
            key="default"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0 bg-[#05060a] bg-[radial-gradient(circle_at_30%_20%,#1e293b_0%,transparent_50%),radial-gradient(circle_at_80%_80%,#0f172a_0%,transparent_50%)]"
          />
        )}
        {theme === "random" && (
          <motion.div
            key="random"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0 bg-gradient-to-tr from-emerald-900 via-teal-900 to-cyan-900"
          />
        )}
        {(theme === "live" || theme === "anime") && (
          <motion.canvas
            key="canvas"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
          />
        )}
      </AnimatePresence>
    </div>
  );
}
