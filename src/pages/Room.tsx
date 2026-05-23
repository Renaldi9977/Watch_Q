import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import YouTube from "react-youtube";
import { useSocket } from "../store/useSocket";
import { useStore } from "../store/useStore";
import {
  ArrowLeft,
  Copy,
  Mic,
  MicOff,
  Send,
  Users,
  Youtube,
  Upload,
  Reply,
  Crown,
  X,
  FolderOpen,
  UploadCloud,
  Smile,
  Image as ImageIcon,
  CheckCheck,
  SendHorizonal,
  Plus,
} from "lucide-react";
import { cn, compressImage } from "../lib/utils";
import Peer from "simple-peer";
import { LocalVideoPlayer } from "../components/LocalVideoPlayer";

// ─── Konstanta ──────────────────────────────────────────────────
// Batasi jumlah pesan di memory agar tidak bocor pada sesi panjang
const MAX_MESSAGES = 300;

// STUN servers untuk WebRTC — wajib agar voice chat bekerja lewat internet
const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

// ─── Pure helper (di luar komponen agar tidak re-create tiap render) ─
function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const regex =
    /(?:(?:www\.|m\.|music\.)?youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// ─── Types ──────────────────────────────────────────────────────
interface User {
  id: string;
  name: string;
  avatar: string;
  frameColor: string;
}

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  time: string;
  avatar?: string;
  frameColor?: string;
  replyTo?: { id: string; sender: string; text: string; imageUrl?: string };
  imageUrl?: string;
  isSticker?: boolean;
}

// ─── Komponen utama ─────────────────────────────────────────────
export default function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { socketRef, socket } = useSocket(roomId);
  const profile = useStore((state) => state.profile);

  // State
  const [participants, setParticipants] = useState<User[]>([]);
  const [hostId, setHostId] = useState<string>("");
  const [isHost, setIsHost] = useState(false);

  // Video State
  const [videoUrl, setVideoUrl] = useState("");
  const [inputUrl, setInputUrl] = useState("");
  const [playing, setPlaying] = useState(false);
  const [isValidUrl, setIsValidUrl] = useState<boolean | null>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const playerRef = useRef<any>(null);
  const isSyncing = useRef(false);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Form state
  const [replyingTo, setReplyingTo] = useState<{
    id: string; sender: string; text: string; imageUrl?: string;
  } | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [customStickers, setCustomStickers] = useState<string[]>([]);
  const [chatWallpaper, setChatWallpaper] = useState<string | null>(null);
  const [wallpaperOpacity, setWallpaperOpacity] = useState<number>(0.3);
  const [previewWallpaper, setPreviewWallpaper] = useState<string | null>(null);
  const [previewOpacity, setPreviewOpacity] = useState<number>(0.3);
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null);

  // Audio/WebRTC State
  const [micEnabled, setMicEnabled] = useState(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Record<string, Peer.Instance>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});

  // Voice activity detection
  const [speakingUsers, setSpeakingUsers] = useState<Record<string, boolean>>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Record<string, AnalyserNode>>({});
  const dataArraysRef = useRef<Record<string, Uint8Array>>({});
  const checkAudioIntervalRef = useRef<any>(null);
  const speakingTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
  const localSpeakingStateRef = useRef<Record<string, boolean>>({});

  // ─── Load stickers on mount ──────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem("customStickers");
      if (saved) setCustomStickers(JSON.parse(saved));
    } catch {}
  }, []);

  const saveSticker = useCallback((dataUrl: string) => {
    setCustomStickers((prev) => {
      const next = [...prev, dataUrl];
      try { localStorage.setItem("customStickers", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const removeSticker = useCallback((idx: number) => {
    setCustomStickers((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      try { localStorage.setItem("customStickers", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Kompres sticker sebelum disimpan
  const handleCreateSticker = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const compressed = await compressImage(file, 200, 0.8);
        saveSticker(compressed);
      } catch {
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (ev.target?.result) saveSticker(ev.target.result as string);
        };
        reader.readAsDataURL(file);
      }
    },
    [saveSticker]
  );

  // Kompres wallpaper sebelum preview
  const handleWallpaperUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const compressed = await compressImage(file, 1280, 0.8);
        setPreviewWallpaper(compressed);
        setPreviewOpacity(wallpaperOpacity);
      } catch {
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (ev.target?.result) {
            setPreviewWallpaper(ev.target.result as string);
            setPreviewOpacity(wallpaperOpacity);
          }
        };
        reader.readAsDataURL(file);
      }
      e.target.value = "";
    },
    [wallpaperOpacity]
  );

  const applyWallpaper = useCallback(() => {
    setChatWallpaper(previewWallpaper);
    setWallpaperOpacity(previewOpacity);
    setPreviewWallpaper(null);
  }, [previewWallpaper, previewOpacity]);

  const resetWallpaper = useCallback(() => {
    setChatWallpaper(null);
    setPreviewWallpaper(null);
  }, []);

  // ─── Helper: tambah pesan dengan cap MAX_MESSAGES ────────────
  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      const next = [...prev, msg];
      return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next;
    });
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "auto" }), 10);
  }, []);

  // ─── Socket event listeners ──────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    socket.on("room-state", (state) => {
      setParticipants(state.users);
      setHostId(state.host);
      if (state.host === socket.id) setIsHost(true);

      if (state.videoState.url) {
        setVideoUrl(state.videoState.url);
        setTimeout(() => {
          if (playerRef.current?.seekTo) {
            playerRef.current.seekTo(state.videoState.time, true);
            if (state.videoState.playing) playerRef.current.playVideo?.();
            else playerRef.current.pauseVideo?.();
          }
          setPlaying(state.videoState.playing);
        }, 1000);
      }
    });

    socket.on("user-joined", (user: User) => {
      setParticipants((prev) =>
        prev.find((p) => p.id === user.id) ? prev : [...prev, user]
      );
      if (localStreamRef.current) {
        const peer = createPeer(user.id, socket.id!, localStreamRef.current);
        peersRef.current[user.id] = peer;
      }
    });

    socket.on("user-left", (id: string) => {
      setParticipants((prev) => prev.filter((u) => u.id !== id));
      if (peersRef.current[id]) {
        peersRef.current[id].destroy();
        delete peersRef.current[id];
      }
      if (audioRefs.current[id]) {
        audioRefs.current[id].pause();
        audioRefs.current[id].srcObject = null;
        audioRefs.current[id].remove();
        delete audioRefs.current[id];
      }
    });

    socket.on("host-changed", (newHostId: string) => {
      setHostId(newHostId);
      setIsHost(newHostId === socket.id);
    });

    socket.on("webrtc-offer", ({ offer, callerId }: any) => {
      if (peersRef.current[callerId]) peersRef.current[callerId].destroy();
      const peer = addPeer(offer, callerId, localStreamRef.current || undefined);
      peersRef.current[callerId] = peer;
    });

    socket.on("webrtc-answer", ({ answer, answererId }: any) => {
      peersRef.current[answererId]?.signal(answer);
    });

    socket.on("webrtc-ice-candidate", ({ candidate, senderId }: any) => {
      peersRef.current[senderId]?.signal(candidate);
    });

    // Video Sync
    socket.on("video-load", ({ url }: { url: string }) => {
      setVideoUrl(url);
      setPlaying(false);
    });

    socket.on("video-play", ({ time }: { time: number }) => {
      isSyncing.current = true;
      setPlaying(true);
      if (playerRef.current?.getCurrentTime) {
        if (Math.abs((playerRef.current.getCurrentTime() || 0) - time) > 2) {
          playerRef.current.seekTo(time, true);
        }
        playerRef.current.playVideo?.();
      }
      setTimeout(() => { isSyncing.current = false; }, 1000);
    });

    socket.on("video-pause", ({ time }: { time: number }) => {
      isSyncing.current = true;
      setPlaying(false);
      if (playerRef.current?.getCurrentTime) {
        if (Math.abs((playerRef.current.getCurrentTime() || 0) - time) > 2) {
          playerRef.current.seekTo(time, true);
        }
        playerRef.current.pauseVideo?.();
      }
      setTimeout(() => { isSyncing.current = false; }, 1000);
    });

    socket.on("video-seek", ({ time }: { time: number }) => {
      isSyncing.current = true;
      playerRef.current?.seekTo?.(time, true);
      setTimeout(() => { isSyncing.current = false; }, 1000);
    });

    // Chat
    socket.on("chat-message", (msg: ChatMessage) => addMessage(msg));
    socket.on("chat-reply", (msg: ChatMessage) => addMessage(msg));

    socket.on("speaking-state", ({ userId, isSpeaking }: any) => {
      setSpeakingUsers((prev) => ({ ...prev, [userId]: isSpeaking }));
    });

    socket.on("admin-changed", (newAdminId: string) => {
      setHostId(newAdminId);
      setIsHost(socket.id === newAdminId);
    });

    return () => {
      socket.off("room-state");
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("host-changed");
      socket.off("video-load");
      socket.off("video-play");
      socket.off("video-pause");
      socket.off("video-seek");
      socket.off("chat-message");
      socket.off("chat-reply");
      socket.off("webrtc-offer");
      socket.off("webrtc-answer");
      socket.off("webrtc-ice-candidate");
      socket.off("speaking-state");
      socket.off("admin-changed");

      Object.values(peersRef.current).forEach((peer) => peer.destroy());
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      Object.values(audioRefs.current).forEach((audio) => {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
      });
      audioRefs.current = {};
      if (checkAudioIntervalRef.current) clearInterval(checkAudioIntervalRef.current);
      Object.values(speakingTimeoutsRef.current).forEach(clearTimeout);
    };
  }, [socket, addMessage]);

  // ─── WebRTC helpers ──────────────────────────────────────────
  const createPeer = useCallback(
    (userToSignal: string, callerID: string, stream: MediaStream | undefined) => {
      const peer = new Peer({ initiator: true, trickle: true, stream, config: ICE_SERVERS });

      peer.on("signal", (signal) => {
        if (signal.type === "offer") {
          socketRef.current?.emit("webrtc-offer", { target: userToSignal, callerId: callerID, offer: signal });
        } else if ((signal as any).candidate) {
          socketRef.current?.emit("webrtc-ice-candidate", { target: userToSignal, senderId: callerID, candidate: signal });
        }
      });

      peer.on("stream", (receivedStream) => connectAudioStream(userToSignal, receivedStream));
      return peer;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const addPeer = useCallback(
    (incomingSignal: Peer.SignalData, callerID: string, stream: MediaStream | undefined) => {
      const peer = new Peer({ initiator: false, trickle: true, stream, config: ICE_SERVERS });

      peer.on("signal", (signal) => {
        if (signal.type === "answer") {
          socketRef.current?.emit("webrtc-answer", { target: callerID, answererId: socketRef.current?.id, answer: signal });
        } else if ((signal as any).candidate) {
          socketRef.current?.emit("webrtc-ice-candidate", { target: callerID, senderId: socketRef.current?.id, candidate: signal });
        }
      });

      peer.on("stream", (receivedStream) => connectAudioStream(callerID, receivedStream));
      peer.signal(incomingSignal);
      return peer;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const setupVoiceDetection = useCallback((userId: string, stream: MediaStream) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const audioCtx = audioContextRef.current;
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    analysersRef.current[userId] = analyser;
    dataArraysRef.current[userId] = new Uint8Array(analyser.frequencyBinCount);

    if (!checkAudioIntervalRef.current) {
      // 150ms interval — cukup responsif, lebih hemat CPU dari 100ms
      checkAudioIntervalRef.current = setInterval(checkAudioLevels, 150);
    }
  }, []); // eslint-disable-line

  const checkAudioLevels = () => {
    let hasChanged = false;
    Object.entries(analysersRef.current).forEach(([userId, analyser]) => {
      const dataArray = dataArraysRef.current[userId];
      if (!dataArray) return;
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, v) => a + v, 0) / dataArray.length;
      const isSpeakingNow = average > 4;
      const wasSpeaking = localSpeakingStateRef.current[userId] || false;

      if (isSpeakingNow) {
        if (!wasSpeaking) { localSpeakingStateRef.current[userId] = true; hasChanged = true; }
        if (speakingTimeoutsRef.current[userId]) {
          clearTimeout(speakingTimeoutsRef.current[userId]);
          delete speakingTimeoutsRef.current[userId];
        }
      } else if (wasSpeaking && !speakingTimeoutsRef.current[userId]) {
        speakingTimeoutsRef.current[userId] = setTimeout(() => {
          if (localSpeakingStateRef.current[userId]) {
            localSpeakingStateRef.current[userId] = false;
            setSpeakingUsers((prev) => {
              if (userId === socketRef.current?.id) {
                socketRef.current?.emit("user-speaking", { roomId, userId, isSpeaking: false });
              }
              return { ...prev, [userId]: false };
            });
          }
          delete speakingTimeoutsRef.current[userId];
        }, 400);
      }
    });

    if (hasChanged) {
      setSpeakingUsers((prev) => {
        const next = { ...prev };
        Object.entries(localSpeakingStateRef.current).forEach(([uid, isSpk]) => {
          if (isSpk && !prev[uid]) {
            next[uid] = true;
            if (uid === socketRef.current?.id) {
              socketRef.current?.emit("user-speaking", { roomId, userId: uid, isSpeaking: true });
            }
          }
        });
        if (audioContextRef.current?.state === "suspended") audioContextRef.current.resume();
        return next;
      });
    }
  };

  const connectAudioStream = useCallback((userId: string, stream: MediaStream) => {
    if (!audioRefs.current[userId]) {
      const audio = new Audio();
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      audioRefs.current[userId] = audio;
      document.body.appendChild(audio);
    }
    const audioEl = audioRefs.current[userId];
    audioEl.srcObject = stream;
    const p = audioEl.play();
    if (p !== undefined) {
      p.catch(() => {
        const enableAudio = () => {
          audioEl.play().catch(() => {});
          document.removeEventListener("click", enableAudio);
        };
        document.addEventListener("click", enableAudio);
      });
    }
  }, []);

  const toggleMic = useCallback(async () => {
    if (micEnabled) {
      setMicEnabled(false);
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      Object.values(peersRef.current).forEach((p) => p.destroy());
      peersRef.current = {};

      const myId = socketRef.current?.id;
      if (myId) {
        delete analysersRef.current[myId];
        delete dataArraysRef.current[myId];
        if (speakingTimeoutsRef.current[myId]) {
          clearTimeout(speakingTimeoutsRef.current[myId]);
          delete speakingTimeoutsRef.current[myId];
        }
        localSpeakingStateRef.current[myId] = false;
        setSpeakingUsers((prev) => ({ ...prev, [myId]: false }));
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        localStreamRef.current = stream;
        setMicEnabled(true);

        const myId = socketRef.current?.id;
        if (myId) {
          setupVoiceDetection(myId, stream);
          audioContextRef.current?.state === "suspended" && audioContextRef.current.resume();
        }

        participants.forEach((user) => {
          if (user.id !== myId) {
            peersRef.current[user.id]?.destroy();
            peersRef.current[user.id] = createPeer(user.id, myId || "", stream);
          }
        });
      } catch {
        alert("Gagal mengakses mikrofon. Pastikan Anda memberikan izin.");
      }
    }
  }, [micEnabled, participants, setupVoiceDetection, createPeer]);

  // ─── URL / Video handlers ────────────────────────────────────
  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setInputUrl(url);
    setIsValidUrl(!url.trim() ? null : extractYouTubeId(url) !== null);
  }, []);

  const handleLoadVideo = useCallback(() => {
    const youtubeId = extractYouTubeId(inputUrl.trim());
    if (!inputUrl.trim() || !youtubeId) return;
    setIsLoadingVideo(true);
    const cleanUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
    socketRef.current?.emit("video-load", { roomId, url: cleanUrl });
    setVideoUrl(cleanUrl);
    setInputUrl(cleanUrl);
    setTimeout(() => setIsLoadingVideo(false), 800);
  }, [inputUrl, roomId]);

  const fileUploadRef = useRef<HTMLInputElement>(null);
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!isHost) return;
      const file = e.target.files?.[0];
      if (!file) return;
      setIsLoadingVideo(true);
      try {
        const formData = new FormData();
        formData.append("video", file);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(err.error || `Server error: ${res.status}`);
        }
        const { url } = await res.json();
        socketRef.current?.emit("video-load", { roomId, url });
        setVideoUrl(url);
      } catch (err: any) {
        alert(`Gagal upload video. ${err.message}`);
      } finally {
        setIsLoadingVideo(false);
        if (fileUploadRef.current) fileUploadRef.current.value = "";
      }
    },
    [isHost, roomId]
  );

  // ─── Video control handlers ──────────────────────────────────
  const handlePlay = useCallback(() => {
    if (isSyncing.current || !isHost) return;
    setPlaying(true);
    socketRef.current?.emit("video-play", { roomId, time: playerRef.current?.getCurrentTime?.() || 0 });
  }, [isHost, roomId]);

  const handlePause = useCallback(() => {
    if (isSyncing.current || !isHost) return;
    setPlaying(false);
    socketRef.current?.emit("video-pause", { roomId, time: playerRef.current?.getCurrentTime?.() || 0 });
  }, [isHost, roomId]);

  const handleYouTubeStateChange = useCallback((e: any) => {
    if (e.data === 1) handlePlay();
    if (e.data === 2) handlePause();
  }, [handlePlay, handlePause]);

  const handleYouTubeReady = useCallback((e: any) => {
    playerRef.current = e.target;
    if (playing) e.target.playVideo();
  }, [playing]);

  const handleSeek = useCallback((time: number) => {
    if (isSyncing.current || !isHost) return;
    socketRef.current?.emit("video-seek", { roomId, time });
  }, [isHost, roomId]);

  // ─── Chat handlers ───────────────────────────────────────────
  const handleSendChat = useCallback(
    (e?: React.FormEvent, customText?: string, imageUrl?: string, isSticker?: boolean) => {
      if (e) e.preventDefault();
      const val = customText ?? (chatInputRef.current?.value || "");
      if (!val.trim() && !imageUrl) return;

      const msg: ChatMessage = {
        id: Math.random().toString(36).substring(7),
        sender: profile?.name || "Anonymous",
        text: val,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        avatar: profile?.avatar,
        frameColor: profile?.frameColor,
        replyTo: replyingTo || undefined,
        imageUrl,
        isSticker,
      };

      addMessage(msg);
      socketRef.current?.emit(replyingTo ? "chat-reply" : "chat-message", { roomId, message: msg });

      if (chatInputRef.current && !customText) {
        chatInputRef.current.value = "";
        chatInputRef.current.style.height = "auto";
      }
      setReplyingTo(null);
    },
    [profile, replyingTo, roomId, addMessage]
  );

  // Kompres gambar chat sebelum kirim — sangat penting untuk HP kentang
  const handleChatImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const compressed = await compressImage(file, 600, 0.72);
        handleSendChat(undefined, "", compressed);
      } catch {
        const reader = new FileReader();
        reader.onload = (ev) => handleSendChat(undefined, "", ev.target?.result as string);
        reader.readAsDataURL(file);
      }
      e.target.value = "";
    },
    [handleSendChat]
  );

  const copyRoomId = useCallback(() => {
    navigator.clipboard.writeText(roomId || "");
  }, [roomId]);

  const transferAdmin = useCallback(
    (targetId: string) => {
      if (!isHost) return;
      socketRef.current?.emit("transfer-admin", { roomId, newAdminId: targetId });
      setSelectedParticipant(null);
    },
    [isHost, roomId]
  );

  // ─── Memoized renders ────────────────────────────────────────
  const videoPlayer = useMemo(() => {
    if (!videoUrl) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center space-y-3 p-4 text-slate-500 bg-black/40">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10 transition-transform">
            <Youtube className="w-8 h-8 text-white/50" />
          </div>
          <p className="text-[10px] uppercase tracking-widest font-bold mt-2">No video loaded</p>
        </div>
      );
    }
    return (
      <div className="w-full h-full pointer-events-auto transition-opacity duration-1000 opacity-100 flex items-center justify-center">
        {!extractYouTubeId(videoUrl) ? (
          <LocalVideoPlayer
            url={videoUrl}
            playing={playing}
            controls={isHost}
            onPlay={handlePlay}
            onPause={handlePause}
            onProgress={() => {}}
            onSeek={handleSeek}
            ref={playerRef as any}
          />
        ) : (
          <YouTube
            videoId={extractYouTubeId(videoUrl) || undefined}
            opts={{
              width: "100%",
              height: "100%",
              playerVars: {
                playsinline: 1,
                controls: isHost ? 1 : 0,
                disablekb: isHost ? 0 : 1,
                modestbranding: 1,
                rel: 0,
                origin: window.location.origin,
              },
            }}
            onReady={handleYouTubeReady}
            onStateChange={handleYouTubeStateChange}
            className="w-full h-full absolute inset-0"
            iframeClassName="w-full h-full"
          />
        )}
        {!isHost && (
          <div
            className="absolute inset-0 z-20 cursor-default"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
          />
        )}
      </div>
    );
  }, [videoUrl, playing, isHost, handlePlay, handlePause, handleSeek, handleYouTubeReady, handleYouTubeStateChange]);

  const renderedParticipants = useMemo(
    () =>
      participants.map((p) => {
        const isSpeaking = speakingUsers[p.id];
        const baseColor = p.frameColor || "#38bdf8";
        return (
          <div
            key={p.id}
            className={cn("flex flex-col items-center gap-2 shrink-0 group", isSpeaking && "speaking")}
          >
            <div className="relative avatar-wrapper" style={{ "--color": baseColor } as any}>
              <div
                onClick={() => setSelectedParticipant((prev) => (prev === p.id ? null : p.id))}
                className={cn(
                  "avatar cursor-pointer w-14 h-14 md:w-16 md:h-16 rounded-full border-[3px] transition-all duration-300 flex items-center justify-center bg-[#0a0f1a] relative z-10",
                  selectedParticipant === p.id ? "ring-2 ring-white ring-offset-2 ring-offset-[#0f172a]" : ""
                )}
                style={{ borderColor: `${baseColor}40` }}
              >
                {p.avatar ? (
                  <img src={p.avatar} alt={p.name} className="w-[calc(100%-6px)] h-[calc(100%-6px)] rounded-full object-cover" />
                ) : (
                  <span className="text-xl font-bold" style={{ color: baseColor }}>
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="sound-waves">
                <div className="wave" /><div className="wave" /><div className="wave" />
              </div>
              {p.id === hostId && (
                <div className="absolute -bottom-2 lg:-bottom-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-[9px] font-extrabold px-3 py-0.5 rounded-full border-[1.5px] border-[#161c2d] z-10 uppercase whitespace-nowrap shadow-sm tracking-wider">
                  Host
                </div>
              )}
              {selectedParticipant === p.id && isHost && p.id !== hostId && (
                <div className="absolute top-full mt-3 left-1/2 -translate-x-1/2 z-50 bg-[#161c2d] border border-[#2e3c5a] shadow-xl rounded-xl p-2 w-max animate-in fade-in zoom-in duration-200">
                  <button
                    onClick={(e) => { e.stopPropagation(); transferAdmin(p.id); }}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-200 hover:text-white hover:bg-white/5 rounded-lg transition-colors whitespace-nowrap w-full"
                  >
                    <Crown className="w-4 h-4 text-cyan-400" />
                    Alihkan sebagai host
                  </button>
                </div>
              )}
            </div>
            <div className="text-[11px] font-semibold text-slate-300 xl:text-[12px] truncate w-20 text-center mt-1">
              {p.name.split(" ")[0]}
            </div>
          </div>
        );
      }),
    [participants, speakingUsers, selectedParticipant, isHost, hostId, transferAdmin]
  );

  const renderedMessages = useMemo(
    () =>
      messages.map((msg, index) => {
        const isMe = msg.sender === profile?.name;
        const bubbleFrameColor = isMe ? profile?.frameColor || "#3b82f6" : msg.frameColor || "#333";
        const prevMsg = messages[index - 1];
        const nextMsg = messages[index + 1];
        const isGroupStart = !prevMsg || prevMsg.sender !== msg.sender;
        const isGroupEnd = !nextMsg || nextMsg.sender !== msg.sender;

        const avatarContent = msg.avatar ? (
          <div
            className={cn("w-[42px] h-[42px] rounded-full p-[1.5px] shrink-0 flex-none", isMe ? "ml-2.5" : "mr-2.5")}
            style={{ background: bubbleFrameColor }}
          >
            <img src={msg.avatar} alt={msg.sender} className="w-full h-full rounded-full object-cover bg-black/50 aspect-square" />
          </div>
        ) : (
          <div
            className={cn("w-[42px] h-[42px] rounded-full shrink-0 flex-none bg-[#1e293b] flex items-center justify-center border-2 border-white/5", isMe ? "ml-2.5" : "mr-2.5")}
            style={{ borderColor: bubbleFrameColor }}
          >
            <span className="text-[16px] font-bold text-slate-300">
              {msg.sender.charAt(0).toUpperCase()}
            </span>
          </div>
        );

        return (
          <div
            key={msg.id}
            className={cn("flex items-start", isMe ? "justify-end" : "justify-start", isGroupEnd ? "mb-5" : "mb-2")}
          >
            {!isMe && avatarContent}

            <div className={cn("flex flex-col min-w-0 max-w-[80%]", isMe ? "items-end" : "items-start")}>
              {isGroupStart && (
                <span
                  className={cn("text-[13px] font-bold truncate leading-none mb-1.5 drop-shadow-sm", isMe ? "mr-1" : "ml-1")}
                  style={{ color: bubbleFrameColor }}
                >
                  {msg.sender}
                </span>
              )}
              <div className={cn("flex items-center gap-2", isMe ? "flex-row-reverse" : "flex-row")}>
                <div
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setReplyingTo({ id: msg.id, sender: msg.sender, text: msg.isSticker ? "Sticker" : msg.text || "Photo", imageUrl: msg.imageUrl });
                  }}
                  onDoubleClick={() =>
                    setReplyingTo({ id: msg.id, sender: msg.sender, text: msg.isSticker ? "Sticker" : msg.text || "Photo", imageUrl: msg.imageUrl })
                  }
                  className={cn(
                    "relative group w-fit max-w-full cursor-pointer transition-transform active:scale-[0.98]",
                    msg.isSticker && !msg.text
                      ? "bg-transparent p-0"
                      : cn(
                          "shadow-sm",
                          isMe
                            ? "bg-[#1e293b] text-slate-100 rounded-[20px] rounded-tr-none after:absolute after:top-0 after:-right-[6px] after:w-[6px] after:h-[10px] after:bg-[#1e293b] after:[clip-path:polygon(0_0,100%_0,0_100%)]"
                            : "bg-[#28353e] text-slate-100 rounded-[20px] rounded-tl-none before:absolute before:top-0 before:-left-[6px] before:w-[6px] before:h-[10px] before:bg-[#28353e] before:[clip-path:polygon(100%_0,0_0,100%_100%)]"
                        ),
                    !msg.text && msg.imageUrl && !msg.isSticker ? "p-1.5" : msg.isSticker && !msg.text ? "" : "py-[9px] px-[14px]"
                  )}
                >
                  {msg.replyTo && (
                    <div
                      className={cn(
                        "mb-2 pl-2.5 border-l-[3px] py-1 px-2 flex justify-between gap-2 items-center",
                        msg.isSticker && !msg.text ? "rounded-lg bg-black/40 border-slate-500" : "rounded-md bg-black/20"
                      )}
                      style={!msg.isSticker || msg.text ? { borderColor: bubbleFrameColor } : {}}
                    >
                      <div className="flex flex-col truncate flex-1 min-w-0">
                        <span className="text-[10.5px] font-bold text-cyan-400 leading-tight">{msg.replyTo.sender}</span>
                        <span className="text-[12px] text-slate-300 truncate h-[16px] overflow-hidden leading-tight mt-0.5">{msg.replyTo.text}</span>
                      </div>
                      {msg.replyTo.imageUrl && (
                        <img src={msg.replyTo.imageUrl} className="w-7 h-7 object-cover rounded-[4px] opacity-80 shrink-0 ml-1" alt="reply-thumb" />
                      )}
                    </div>
                  )}

                  <div className={cn("flex flex-col w-full max-w-full", isMe ? "items-end" : "items-start")}>
                    {msg.imageUrl && (
                      <img
                        src={msg.imageUrl}
                        loading="lazy"
                        className={cn(
                          "object-contain",
                          msg.isSticker && !msg.text
                            ? "max-w-[120px] md:max-w-[140px] drop-shadow-xl"
                            : "rounded-[12px] max-w-[150px] md:max-w-[200px]"
                        )}
                        alt={msg.isSticker ? "sticker" : "photo"}
                      />
                    )}
                    {msg.text && (
                      <div className={cn("flex items-end gap-2 flex-wrap", isMe ? "justify-end" : "justify-start")}>
                        <p className="text-[14.5px] leading-[1.4] whitespace-pre-wrap break-words font-[400]">{msg.text}</p>
                        <div className="flex items-center justify-end gap-0.5 shrink-0 h-4 mt-1 opacity-70">
                          <span className="text-[10px] font-mono leading-none pt-1">{msg.time}</span>
                          {isMe && <CheckCheck className="w-[14px] h-[14px] text-cyan-400 ml-0.5 pt-0.5" />}
                        </div>
                      </div>
                    )}
                  </div>

                  {!msg.text && (
                    <div
                      className={cn(
                        "flex items-center justify-end gap-1 mt-1 opacity-70",
                        msg.isSticker && !msg.text
                          ? "absolute bottom-0 right-0 translate-x-1/4 translate-y-1/4 drop-shadow-md bg-black/60 rounded-full px-1.5 py-[2px] w-fit z-10"
                          : "px-0.5"
                      )}
                    >
                      <span className="text-[10px] font-mono leading-none">{msg.time}</span>
                      {isMe && <CheckCheck className="w-[14px] h-[14px] text-cyan-400" />}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {isMe && avatarContent}
          </div>
        );
      }),
    [messages, profile?.name, profile?.frameColor]
  );

  // ─── JSX RENDER ──────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[100dvh] bg-[#0A0F1A] overflow-hidden md:p-3">
      <div className="flex flex-col flex-1 overflow-hidden md:grid md:grid-cols-12 md:gap-4">
        {/* Left Column: Video & Controls */}
        <div className="md:col-span-8 flex flex-col md:bg-white/5 md:border md:border-white/10 md:rounded-3xl shrink-0 md:h-full w-full relative">
          {/* Back Button Floating on Video (Mobile Only) */}
          <button
            onClick={() => navigate("/dashboard")}
            className="md:hidden absolute top-4 left-4 z-50 p-2 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Header for Desktop */}
          <div className="hidden md:flex p-4 items-center justify-between border-b border-white/5 shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/dashboard")}
                className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors text-white"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 bg-white/5 px-4 py-1.5 rounded-full border border-white/10">
              <div
                className={cn(
                  "w-2 h-2 rounded-full",
                  socket?.connected ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-red-500 animate-pulse"
                )}
                title={socket?.connected ? "Connected" : "Disconnected"}
              />
              <span className="text-xs font-mono text-slate-500 tracking-widest uppercase ml-1">Room:</span>
              <span className="font-mono font-bold tracking-widest text-cyan-400 uppercase">{roomId}</span>
              <button onClick={copyRoomId} className="ml-2 hover:text-white transition-colors text-slate-400">
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <div className="w-10">
              {isHost && (
                <span className="text-[9px] border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 font-bold px-1.5 py-0.5 rounded uppercase tracking-widest">
                  HOST
                </span>
              )}
            </div>
          </div>

          {/* Video Player */}
          <div className="w-full aspect-video bg-black shrink-0 relative z-10 shadow-[0_10px_30px_rgba(0,0,0,0.5)] md:shadow-none">
            {videoPlayer}
          </div>

          {/* Controls & Actions */}
          <div className="flex flex-col p-3 md:p-5 gap-4 shrink-0 transition-all z-20 md:border-none border-t border-white/5">
            <div className="bg-[#161c2d] border border-[#2e3c5a] shadow-lg rounded-[24px] p-4 flex flex-col gap-4">
              <div className="flex flex-row gap-3 items-center w-full">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={inputUrl}
                    onChange={handleUrlChange}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleLoadVideo(); } }}
                    placeholder="Paste link YouTube..."
                    disabled={!isHost}
                    className={cn(
                      "w-full bg-[#0f1521] border rounded-xl px-4 py-3 text-[13px] text-slate-200 focus:outline-none transition-all duration-300 font-mono placeholder:text-slate-500 disabled:opacity-50 disabled:cursor-not-allowed",
                      isValidUrl === null
                        ? "border-[#2e3c5a] focus:border-cyan-500/50"
                        : isValidUrl
                        ? "border-[#059669] focus:border-[#10b981] border-[1.5px]"
                        : "border-red-500/50 focus:border-red-400 border-[1.5px]"
                    )}
                  />
                </div>
                <button
                  onClick={handleLoadVideo}
                  disabled={!isHost || !inputUrl.trim() || isValidUrl !== true || isLoadingVideo}
                  className="py-3 px-4 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl font-bold text-[11px] uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all duration-200 text-white shrink-0 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center"
                >
                  {isLoadingVideo && inputUrl.trim() ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : "LOAD"}
                </button>

                <button
                  onClick={() => isHost && fileUploadRef.current?.click()}
                  disabled={!isHost || isLoadingVideo}
                  className="p-3 bg-[#0f1521] border border-[#2e3c5a] rounded-xl text-slate-400 hover:text-white hover:bg-[#1e293b] active:scale-95 transition-all duration-200 shrink-0 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center"
                  title={isHost ? "Upload File Video" : "Hanya host yang bisa upload"}
                >
                  {isLoadingVideo && !inputUrl.trim() ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <FolderOpen className="w-5 h-5" />
                  )}
                </button>
                <input type="file" ref={fileUploadRef} accept="video/*" className="hidden" onChange={handleFileUpload} />

                <button
                  onClick={toggleMic}
                  className={cn(
                    "p-3 shrink-0 rounded-xl border transition-all flex items-center justify-center",
                    micEnabled
                      ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                      : "bg-[#0f1521] border-[#2e3c5a] text-slate-400 hover:bg-[#1e293b] hover:text-white"
                  )}
                  title="Voice Chat"
                >
                  {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </button>
              </div>

              {/* Participants Section */}
              <div className="flex flex-col gap-3">
                <span className="text-[11px] uppercase tracking-widest text-[#38bdf8] font-bold">
                  Participants ({participants.length})
                </span>
                <div className="flex gap-4 overflow-x-auto py-3 px-2 -mx-2 no-scrollbar items-center">
                  {renderedParticipants}
                  {participants.length === 0 && (
                    <div className="text-slate-500 text-xs italic opacity-50 py-4">Waiting to connect...</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Chat */}
        <div className="md:col-span-4 flex flex-col flex-1 overflow-hidden bg-transparent pb-4 md:pb-0 z-20">
          <div className="flex-1 overflow-hidden relative flex flex-col md:bg-[#0a0f1a]/80 md:backdrop-blur-xl md:border md:border-[#2e3c5a]/50 md:rounded-[24px] md:shadow-2xl bg-[#0a0f1a]">
            {/* Chat Header */}
            <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between z-30 shrink-0 bg-[#0a0f1a] md:bg-transparent backdrop-blur-md">
              <span className="text-[10px] uppercase tracking-widest text-[#7dd3fc] font-bold">Live Chat</span>
              <div className="flex items-center gap-2">
                <label className="text-slate-400 hover:text-cyan-400 cursor-pointer p-1 rounded-md hover:bg-white/5 transition-colors" title="Change Background">
                  <ImageIcon className="w-3.5 h-3.5" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleWallpaperUpload} />
                </label>
                <div className="md:hidden flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded-[12px] border border-white/10">
                  <div
                    className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0",
                      socket?.connected ? "bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.6)]" : "bg-red-500 animate-pulse"
                    )}
                  />
                  <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest ml-0.5">Room:</span>
                  <span className="text-[11px] font-mono font-bold tracking-widest text-cyan-400">{roomId}</span>
                  <button onClick={copyRoomId} className="ml-1 text-slate-400 hover:text-white transition-colors active:scale-90 flex-shrink-0 p-1 outline-none">
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 relative flex flex-col overflow-hidden w-full bg-[#090d14] md:bg-transparent">
              {chatWallpaper && (
                <div className="absolute inset-0 z-0 pointer-events-none">
                  <img
                    src={chatWallpaper}
                    style={{ opacity: wallpaperOpacity }}
                    className="w-full h-full object-cover object-center transition-opacity"
                    alt="chat-wallpaper"
                    loading="lazy"
                  />
                </div>
              )}

              <div className="flex-1 overflow-y-auto overflow-x-hidden relative z-10 w-full">
                <div className="px-5 py-4 md:px-8 md:py-6 relative z-10 min-h-full">
                  {renderedMessages}
                  <div ref={chatEndRef} />
                </div>
              </div>

              <div className="flex flex-col shrink-0 z-20 relative bg-transparent md:border-t border-white/5 pb-1 md:pb-0">
                {replyingTo && (
                  <div className="px-3 py-1.5 flex items-center justify-between bg-[#0f1521]/90 backdrop-blur-md border-l-4 border-cyan-500 relative">
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-[10px] text-cyan-400 font-bold leading-tight">{replyingTo.sender}</span>
                      <span className="text-[12px] text-slate-300 truncate leading-tight">{replyingTo.text}</span>
                    </div>
                    {replyingTo.imageUrl && (
                      <img src={replyingTo.imageUrl} className="w-7 h-7 object-cover rounded mx-2 shrink-0" alt="reply-thumb" />
                    )}
                    <button onClick={() => setReplyingTo(null)} className="p-1.5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors shrink-0 outline-none">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {showStickers && (
                  <div className="h-48 md:h-64 bg-[#1e293b] border-t border-slate-700/50 flex flex-col">
                    <div className="flex-1 p-2 overflow-y-auto w-full">
                      <div className="flex items-center justify-between mb-2 px-1">
                        <span className="text-xs font-bold text-slate-400">Custom Stickers</span>
                      </div>
                      <div className="flex flex-wrap gap-2 px-1">
                        {customStickers.map((sticker, idx) => (
                          <div key={idx} className="relative group w-[72px] h-[72px] rounded overflow-hidden">
                            <img
                              src={sticker}
                              alt={`sticker-${idx}`}
                              loading="lazy"
                              className="w-full h-full object-contain cursor-pointer hover:opacity-80 transition-opacity drop-shadow-md"
                              onClick={() => { handleSendChat(undefined, "", sticker, true); setShowStickers(false); }}
                            />
                            <button
                              onClick={(e) => { e.stopPropagation(); removeSticker(idx); }}
                              className="absolute top-1 right-1 bg-red-500/80 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity outline-none"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="h-12 bg-[#0f1521] flex items-center px-3 gap-3 overflow-x-auto shrink-0 border-t border-slate-800">
                      <div className="p-1.5 bg-[#1e293b] rounded text-slate-300">
                        <Smile className="w-4 h-4" />
                      </div>
                      <div className="w-px h-5 bg-slate-700 mx-1" />
                      <label className="p-1 text-cyan-400 hover:text-cyan-300 cursor-pointer flex items-center flex-1 justify-center">
                        <div className="p-1 bg-cyan-500/10 rounded-lg flex items-center justify-center w-full">
                          <span className="text-[11px] font-bold">+ Tambah Paket Baru</span>
                        </div>
                        <input type="file" accept="image/*" className="hidden" onChange={handleCreateSticker} />
                      </label>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSendChat} className="p-2 md:p-3 w-full flex items-end gap-2 bg-transparent">
                  <div className="flex-1 bg-[#1e293b]/70 backdrop-blur-md border border-slate-700/50 rounded-[24px] flex items-center pr-2 pl-1 relative z-10 transition-colors focus-within:border-cyan-500/40 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setShowStickers((s) => !s)}
                      className={cn("p-2 text-slate-400 hover:text-white shrink-0 active:scale-95 transition-all", showStickers && "text-cyan-400")}
                    >
                      <Smile className="w-6 h-6" />
                    </button>
                    <textarea
                      ref={chatInputRef}
                      placeholder="Message..."
                      rows={1}
                      className="flex-1 bg-transparent border-none py-3 text-[14px] focus:outline-none text-slate-200 placeholder:text-slate-500 min-w-0 resize-none max-h-[100px] overflow-y-auto leading-[1.4]"
                      onFocus={() => setShowStickers(false)}
                      onInput={(e) => {
                        const t = e.target as HTMLTextAreaElement;
                        t.style.height = "auto";
                        t.style.height = `${Math.min(t.scrollHeight, 100)}px`;
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendChat(e); }
                      }}
                    />
                    <label className="p-2 text-slate-400 hover:text-white shrink-0 cursor-pointer active:scale-95 transition-all">
                      <ImageIcon className="w-[22px] h-[22px]" />
                      <input type="file" accept="image/*" className="hidden" onChange={handleChatImageUpload} />
                    </label>
                  </div>
                  <button
                    type="submit"
                    className="w-11 h-11 md:w-12 md:h-12 rounded-full border flex items-center justify-center transition-colors disabled:opacity-50 border-cyan-500/40 bg-gradient-to-tr from-cyan-600 to-cyan-400 text-[#090d14] hover:brightness-110 shrink-0 shadow-[0_0_20px_rgba(6,182,212,0.3)] mb-0.5 active:scale-95"
                  >
                    <SendHorizonal className="w-[18px] h-[18px] md:w-[20px] md:h-[20px] -ml-0.5" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>

        {/* Wallpaper Preview Modal */}
        {previewWallpaper && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-[#0f1521] border border-[#2e3c5a] rounded-2xl w-full max-w-sm overflow-hidden flex flex-col shadow-2xl relative">
              <div className="relative w-full h-[55dvh] bg-[#090d14] overflow-hidden">
                <img
                  src={previewWallpaper}
                  style={{ opacity: previewOpacity }}
                  className="absolute inset-0 w-full h-full object-cover object-center transition-opacity"
                  alt="preview"
                />
              </div>
              <div className="p-4 space-y-5 bg-[#0f1521] border-t border-[#2e3c5a]">
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-semibold text-slate-300">Opacity (Kecerahan)</span>
                    <span className="text-xs text-slate-400">{Math.round(previewOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range" min="0" max="1" step="0.05"
                    value={previewOpacity}
                    onChange={(e) => setPreviewOpacity(parseFloat(e.target.value))}
                    className="w-full accent-cyan-500 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div className="flex gap-2 pt-1 border-t border-slate-800/50">
                  <button onClick={() => setPreviewWallpaper(null)} className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-white/5 hover:bg-white/10 text-white transition-colors">
                    Cancel
                  </button>
                  <button onClick={resetWallpaper} className="flex-none px-4 py-2.5 rounded-xl font-bold text-sm bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors">
                    Reset
                  </button>
                  <button onClick={applyWallpaper} className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-tr from-cyan-600 to-cyan-400 hover:brightness-110 text-[#090d14] transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
