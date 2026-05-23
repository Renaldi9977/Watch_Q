import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useStore } from "../store/useStore";
import { Camera, ChevronRight } from "lucide-react";
import { cn, compressImage } from "../lib/utils";

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f43f5e",
];

export default function ProfileSetup() {
  const navigate = useNavigate();
  const setProfile = useStore((state) => state.setProfile);

  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [frameColor, setFrameColor] = useState(COLORS[0]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // Kompres avatar ke max 200px — cukup untuk tampil di chat
      const compressed = await compressImage(file, 200, 0.85);
      setAvatar(compressed);
    } catch {
      // Fallback ke reader biasa jika canvas gagal
      const reader = new FileReader();
      reader.onloadend = () => setAvatar(reader.result as string);
      reader.readAsDataURL(file);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    if (!name.trim()) return;
    setProfile({
      name: name.trim(),
      avatar: avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`,
      frameColor,
    });
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 md:p-8 shadow-2xl space-y-8"
      >
        <div className="text-center">
          <h2 className="text-xl font-bold tracking-tight text-white">
            WATCHPARTY<span className="text-cyan-400">.IO</span>
          </h2>
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mt-2">
            Profile Setup
          </p>
        </div>

        <div className="flex flex-col items-center space-y-6">
          <div
            className="relative group cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <div
              className="w-24 h-24 rounded-full p-1 overflow-hidden transition-all duration-300"
              style={{ background: frameColor, boxShadow: `0 0 20px ${frameColor}40` }}
            >
              <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center overflow-hidden">
                {uploading ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : avatar ? (
                  <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-8 h-8 text-slate-400 group-hover:text-white transition-colors" />
                )}
              </div>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />
          </div>

          <div className="w-full space-y-4">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2 block">
                Display Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                placeholder="Enter your name..."
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 transition-all"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-3 block">
                Profile Glow
              </label>
              <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setFrameColor(color)}
                    className={cn(
                      "w-8 h-8 rounded-full border-2 transition-transform hover:scale-110",
                      frameColor === color ? "border-white scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!name.trim() || uploading}
          className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl font-bold text-sm shadow-lg shadow-cyan-500/30 hover:brightness-110 transition-all text-white disabled:opacity-50 disabled:cursor-not-allowed border-0"
        >
          CONTINUE <ChevronRight className="w-4 h-4" />
        </button>
      </motion.div>
    </div>
  );
}
