import { useEffect } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store/useStore";

export default function Landing() {
  const navigate = useNavigate();
  const profile = useStore((state) => state.profile);

  useEffect(() => {
    if (profile) {
      navigate("/dashboard", { replace: true });
    }
  }, [profile, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-2xl shadow-2xl space-y-8"
      >
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <span className="text-white font-bold text-3xl">W</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
            WATCHPARTY<span className="text-cyan-400">.IO</span>
          </h1>
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
            Real-time Video Sync
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={() => navigate("/profile")}
            className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl font-bold text-sm shadow-lg shadow-cyan-500/30 hover:brightness-110 transition-all text-white border-0 outline-none"
          >
            START WATCHING
          </button>
        </div>
      </motion.div>
    </div>
  );
}
