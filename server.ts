import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import http from "http";
import { Server } from "socket.io";
import multer from "multer";
import fs from "fs";

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ─── Multer: batas ukuran 500 MB + validasi MIME type video saja ───
const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4", "video/webm", "video/ogg", "video/quicktime",
  "video/x-matroska", "video/x-msvideo", "video/mpeg",
]);

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const sanitizeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const hasExt = sanitizeName.includes(".");
    cb(null, uniqueSuffix + "-" + (hasExt ? sanitizeName : sanitizeName + ".mp4"));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB max
  fileFilter: (req, file, cb) => {
    if (ALLOWED_VIDEO_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Hanya file video yang diizinkan (mp4, webm, mkv, dll)"));
    }
  },
});

// ─── Periodic cleanup: hapus file upload > 2 jam ───
setInterval(() => {
  const now = Date.now();
  fs.readdir(uploadDir, (err, files) => {
    if (err) return;
    files.forEach((file) => {
      const filePath = path.join(uploadDir, file);
      fs.stat(filePath, (statErr, stats) => {
        if (statErr) return;
        if (now - stats.mtimeMs > 2 * 60 * 60 * 1000) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
}, 30 * 60 * 1000);

// ─── Simple chat rate limiter: max 5 pesan per detik per socket ───
const chatTimestamps = new Map<string, number[]>();
function isRateLimited(socketId: string): boolean {
  const now = Date.now();
  const times = (chatTimestamps.get(socketId) || []).filter(
    (t) => now - t < 1000
  );
  if (times.length >= 5) return true;
  times.push(now);
  chatTimestamps.set(socketId, times);
  return false;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use((req, res, next) => {
    res.setHeader(
      "Permissions-Policy",
      "camera=*, microphone=*, autoplay=*, encrypted-media=*"
    );
    res.setHeader("Feature-Policy", "camera *; microphone *; autoplay *");
    next();
  });

  // Serve uploads dengan support range request (penting untuk seek di mobile)
  app.use("/uploads", express.static(uploadDir, { acceptRanges: true }));

  app.post("/api/upload", (req, res) => {
    upload.single("video")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ error: "File terlalu besar. Maksimal 500 MB." });
        }
        return res.status(400).json({ error: err.message });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
      if (!req.file) {
        return res.status(400).json({ error: "Tidak ada file yang diupload" });
      }
      res.json({ url: `/uploads/${req.file.filename}` });
    });
  });

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: "*" },
    maxHttpBufferSize: 1e8,
  });

  const rooms: Record<
    string,
    {
      host: string;
      users: { id: string; name: string; avatar: string; frameColor: string }[];
      videoState: {
        url: string;
        playing: boolean;
        time: number;
        playStartServerTime: number | null;
        playStartOffset: number;
      };
    }
  > = {};

  // Helper: hitung posisi video aktual saat ini
  function getCurrentVideoTime(videoState: {
    playing: boolean;
    time: number;
    playStartServerTime: number | null;
    playStartOffset: number;
  }): number {
    if (videoState.playing && videoState.playStartServerTime !== null) {
      const elapsed = (Date.now() - videoState.playStartServerTime) / 1000;
      return videoState.playStartOffset + elapsed;
    }
    return videoState.time;
  }

  // Periodic cleanup: hapus rooms yang sudah lama kosong (>10 menit)
  const emptyRoomTimers = new Map<string, NodeJS.Timeout>();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", ({ roomId, user }) => {
      socket.join(roomId);

      // Batalkan timer hapus room jika ada
      if (emptyRoomTimers.has(roomId)) {
        clearTimeout(emptyRoomTimers.get(roomId)!);
        emptyRoomTimers.delete(roomId);
      }

      if (!rooms[roomId]) {
        rooms[roomId] = {
          host: socket.id,
          users: [],
          videoState: {
            url: "",
            playing: false,
            time: 0,
            playStartServerTime: null,
            playStartOffset: 0,
          },
        };
      }

      const room = rooms[roomId];
      if (!room.users.find((u) => u.id === socket.id)) {
        room.users.push({ ...user, id: socket.id });
      }

      const currentTime = getCurrentVideoTime(room.videoState);
      socket.emit("room-state", {
        ...room,
        videoState: { ...room.videoState, time: currentTime },
      });

      socket.to(roomId).emit("user-joined", { ...user, id: socket.id });
    });

    socket.on("video-load", ({ roomId, url }) => {
      if (!rooms[roomId]) return;
      // Hanya host yang boleh ganti video
      if (rooms[roomId].host !== socket.id) return;
      rooms[roomId].videoState = {
        url,
        playing: false,
        time: 0,
        playStartServerTime: null,
        playStartOffset: 0,
      };
      socket.to(roomId).emit("video-load", { url });
    });

    socket.on("video-play", ({ roomId, time }) => {
      if (!rooms[roomId] || rooms[roomId].host !== socket.id) return;
      rooms[roomId].videoState.playing = true;
      rooms[roomId].videoState.time = time;
      rooms[roomId].videoState.playStartServerTime = Date.now();
      rooms[roomId].videoState.playStartOffset = time;
      socket.to(roomId).emit("video-play", { time });
    });

    socket.on("video-pause", ({ roomId, time }) => {
      if (!rooms[roomId] || rooms[roomId].host !== socket.id) return;
      const actualTime = getCurrentVideoTime(rooms[roomId].videoState);
      rooms[roomId].videoState.playing = false;
      rooms[roomId].videoState.time = time ?? actualTime;
      rooms[roomId].videoState.playStartServerTime = null;
      rooms[roomId].videoState.playStartOffset = 0;
      socket.to(roomId).emit("video-pause", { time });
    });

    socket.on("video-seek", ({ roomId, time }) => {
      if (!rooms[roomId] || rooms[roomId].host !== socket.id) return;
      rooms[roomId].videoState.time = time;
      if (rooms[roomId].videoState.playing) {
        rooms[roomId].videoState.playStartServerTime = Date.now();
        rooms[roomId].videoState.playStartOffset = time;
      }
      socket.to(roomId).emit("video-seek", { time });
    });

    socket.on("chat-message", ({ roomId, message }) => {
      if (isRateLimited(socket.id)) return;
      socket.to(roomId).emit("chat-message", {
        ...message,
        id: Date.now() + Math.random().toString(),
      });
    });

    socket.on("chat-reply", ({ roomId, message }) => {
      if (isRateLimited(socket.id)) return;
      socket.to(roomId).emit("chat-reply", {
        ...message,
        id: Date.now() + Math.random().toString(),
      });
    });

    socket.on("transfer-admin", ({ roomId, newAdminId }) => {
      if (!rooms[roomId]) return;
      // Verifikasi: hanya host saat ini yang boleh transfer
      if (rooms[roomId].host !== socket.id) return;
      rooms[roomId].host = newAdminId;
      io.to(roomId).emit("admin-changed", newAdminId);
      io.to(roomId).emit("host-changed", newAdminId);
    });

    socket.on("sync-request", ({ roomId }) => {
      if (!rooms[roomId]) return;
      const currentTime = getCurrentVideoTime(rooms[roomId].videoState);
      socket.emit("video-sync", {
        ...rooms[roomId].videoState,
        time: currentTime,
      });
    });

    // WebRTC signaling
    socket.on("webrtc-offer", ({ target, offer, callerId }) => {
      io.to(target).emit("webrtc-offer", { offer, callerId });
    });
    socket.on("webrtc-answer", ({ target, answer, answererId }) => {
      io.to(target).emit("webrtc-answer", { answer, answererId });
    });
    socket.on("webrtc-ice-candidate", ({ target, candidate, senderId }) => {
      io.to(target).emit("webrtc-ice-candidate", { candidate, senderId });
    });

    socket.on("user-speaking", ({ roomId, userId, isSpeaking }) => {
      socket.to(roomId).emit("speaking-state", { userId, isSpeaking });
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      // Hapus rate limiter data
      chatTimestamps.delete(socket.id);

      Object.keys(rooms).forEach((roomId) => {
        const room = rooms[roomId];
        const userIndex = room.users.findIndex((u) => u.id === socket.id);
        if (userIndex === -1) return;

        room.users.splice(userIndex, 1);
        socket.to(roomId).emit("user-left", socket.id);

        if (room.host === socket.id) {
          if (room.users.length > 0) {
            room.host = room.users[0].id;
            io.to(roomId).emit("host-changed", room.host);
          }
        }

        // Jadwalkan penghapusan room jika kosong
        if (room.users.length === 0) {
          const timer = setTimeout(() => {
            delete rooms[roomId];
            emptyRoomTimers.delete(roomId);
          }, 10 * 60 * 1000); // 10 menit
          emptyRoomTimers.set(roomId, timer);
        }
      });
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log("Server running on port " + PORT);
  });
}

startServer();
