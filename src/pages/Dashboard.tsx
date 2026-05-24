import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useStore } from "../store/useStore";
import { Settings2, Plus, LogOut, Sparkles } from "lucide-react";
import { cn } from "../lib/utils";

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile, theme, setTheme, logout } = useStore();
  const [joinCode, setJoinCode] = useState("");

  const handleCreateRoom = () => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    navigate(`/room/${roomId}`);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim()) {
      navigate(`/room/${joinCode.toUpperCase()}`);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col md:flex-row gap-6 max-w-7xl mx-auto">
      {/* Sidebar / Top Nav */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="w-full md:w-80 space-y-6 shrink-0"
      >
        {/* Profile Card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl text-center relative overflow-hidden">
          <div className="absolute top-4 right-4 flex gap-2">
            <button
              onClick={logout}
              className="p-2 bg-white/5 rounded-full hover:bg-white/10 text-slate-300 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          <div
            className="w-20 h-20 rounded-full mx-auto p-1 mb-4"
            style={{ background: profile?.frameColor }}
          >
            <img
              src={profile?.avatar}
              alt={profile?.name}
              className="w-full h-full rounded-full object-cover bg-slate-800"
            />
          </div>
          <h3 className="text-[10px] uppercase tracking-widest text-white font-bold mb-1">
            {profile?.name}
          </h3>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-4">
            Ready to watch
          </p>
        </div>

        {/* Theme Switcher */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
              Background Theme
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(["default", "live", "anime", "random"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={cn(
                  "px-3 py-2 rounded-xl text-sm transition-all border capitalize",
                  theme === t
                    ? "bg-white/10 border-white/30 text-white"
                    : "border-transparent text-slate-400 hover:bg-white/5",
                )}
              >
                {t === "default" ? "Default" : t === "live" ? "Live Particles" : t === "anime" ? "Anime Glow" : "Emerald"}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-1 space-y-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Create Room */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl flex flex-col justify-between h-64">
            <div className="space-y-2">
              <div className="w-10 h-10 bg-cyan-500/20 rounded-xl flex items-center justify-center border border-cyan-500/40 mb-4">
                <Plus className="w-5 h-5 text-cyan-400" />
              </div>
              <h2 className="text-[10px] uppercase tracking-widest text-white font-bold">
                Create Room
              </h2>
              <p className="text-xs text-slate-400">
                Start a new watch party session.
              </p>
            </div>
            <button
              onClick={handleCreateRoom}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl font-bold text-sm shadow-lg shadow-cyan-500/30 hover:brightness-110 transition-all text-white border-0"
            >
              CREATE ROOM
            </button>
          </div>

          {/* Join Room */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl flex flex-col justify-between h-64">
            <div className="space-y-2">
              <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-white/10 mb-4">
                <Settings2 className="w-5 h-5 text-slate-400" />
              </div>
              <h2 className="text-[10px] uppercase tracking-widest text-white font-bold">
                Join Room
              </h2>
              <p className="text-xs text-slate-400">
                Enter a code from a friend.
              </p>
            </div>
            <form onSubmit={handleJoinRoom} className="flex flex-col gap-3 mt-4">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="ROOM CODE"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 transition-all font-mono uppercase truncate text-center tracking-widest"
              />
              <button
                type="submit"
                disabled={!joinCode.trim()}
                className="w-full py-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl font-bold text-[10px] uppercase tracking-widest text-white transition-all disabled:opacity-50"
              >
                JOIN
              </button>
            </form>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
