import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useStore } from "./useStore";

export function useSocket(roomId: string | undefined) {
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const profile = useStore((state) => state.profile);

  // Gunakan ref untuk profile agar perubahan referensi objek (zustand rehydrate)
  // tidak memicu reconnect yang tidak perlu
  const profileRef = useRef(profile);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  // Jadikan profile stable dengan stringify — hanya reconnect kalau data benar-benar berubah
  const profileKey = profile ? `${profile.name}|${profile.avatar}|${profile.frameColor}` : null;

  useEffect(() => {
    if (!roomId || !profileRef.current) return;

    const url = import.meta.env.VITE_APP_URL || window.location.origin;
    const s = io(url, {
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      // Gunakan websocket dulu, fallback ke polling — lebih cepat connect
      transports: ["websocket", "polling"],
    });

    socketRef.current = s;
    setSocket(s);

    s.on("connect", () => {
      s.emit("join-room", { roomId, user: profileRef.current });
    });

    // Pada reconnect otomatis, re-join room agar state disinkronkan ulang
    s.on("reconnect", () => {
      if (profileRef.current) {
        s.emit("join-room", { roomId, user: profileRef.current });
      }
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, profileKey]);

  return { socketRef, socket };
}
