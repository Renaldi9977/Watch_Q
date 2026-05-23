import React, {
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
} from "lucide-react";
import { cn } from "../lib/utils";

export interface LocalVideoPlayerProps {
  url: string;
  playing: boolean;
  controls: boolean;
  onPlay: () => void;
  onPause: () => void;
  onProgress: (state: { playedSeconds: number; played: number }) => void;
  onSeek?: (time: number) => void;
}

export const LocalVideoPlayer = forwardRef<any, LocalVideoPlayerProps>(
  ({ url, playing, controls, onPlay, onPause, onProgress, onSeek }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const progressContainerRef = useRef<HTMLDivElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const progressThrottleRef = useRef<number>(0);

    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [showControls, setShowControls] = useState(true);

    // Expose imperative API ke parent (Room.tsx)
    useImperativeHandle(ref, () => ({
      seekTo: (amount: number, type?: string | boolean) => {
        if (!videoRef.current) return;
        if (type === "seconds" || type === true || type === undefined) {
          videoRef.current.currentTime = amount;
        } else {
          videoRef.current.currentTime = amount * duration;
        }
      },
      getCurrentTime: () => videoRef.current?.currentTime ?? 0,
      getDuration: () => videoRef.current?.duration ?? 0,
      getInternalPlayer: () => videoRef.current,
    }), [duration]);

    // Play/pause saat prop berubah
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      if (playing) {
        const p = video.play();
        if (p !== undefined) {
          p.catch((e) => console.log("Autoplay prevented", e));
        }
      } else {
        video.pause();
      }
    }, [playing, url]);

    const formatTime = useCallback((seconds: number) => {
      if (isNaN(seconds) || seconds < 0) return "0:00";
      const hrs = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
      }
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    }, []);

    const togglePlay = useCallback(() => {
      if (!controls) return;
      if (playing) onPause(); else onPlay();
    }, [controls, playing, onPlay, onPause]);

    // Throttle progress event — kirim ke parent max setiap 500ms
    const handleTimeUpdate = useCallback(() => {
      const video = videoRef.current;
      if (!video || isDragging) return;
      setCurrentTime(video.currentTime);
      const now = Date.now();
      if (now - progressThrottleRef.current >= 500) {
        progressThrottleRef.current = now;
        onProgress({
          playedSeconds: video.currentTime,
          played: duration ? video.currentTime / duration : 0,
        });
      }
    }, [isDragging, duration, onProgress]);

    const handleLoadedMetadata = useCallback(() => {
      if (videoRef.current) setDuration(videoRef.current.duration);
    }, []);

    const handleProgress = useCallback(() => {
      const video = videoRef.current;
      if (video && video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    }, []);

    const handleSeekClick = useCallback(
      (e: React.MouseEvent | MouseEvent) => {
        if (!controls || !progressContainerRef.current || !videoRef.current) return;
        const rect = progressContainerRef.current.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        videoRef.current.currentTime = pos * duration;
        setCurrentTime(pos * duration);
        onProgress({ playedSeconds: pos * duration, played: pos });
      },
      [controls, duration, onProgress]
    );

    // Mouse drag untuk progress bar
    useEffect(() => {
      if (!isDragging) return;
      const handleMouseMove = (e: MouseEvent) => handleSeekClick(e);
      const handleMouseUp = () => setIsDragging(false);
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }, [isDragging, handleSeekClick]);

    const resetControlsTimeout = useCallback(() => {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => {
        if (videoRef.current && !videoRef.current.paused) setShowControls(false);
      }, 3000);
    }, []);

    useEffect(() => {
      resetControlsTimeout();
      return () => { if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); };
    }, [playing, resetControlsTimeout]);

    const toggleFullscreen = useCallback(() => {
      if (!wrapperRef.current) return;
      if (!document.fullscreenElement) {
        wrapperRef.current.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen();
      }
    }, []);

    const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseFloat(e.target.value);
      setVolume(v);
      setMuted(v === 0);
      if (videoRef.current) videoRef.current.volume = v;
    }, []);

    const toggleMute = useCallback(() => setMuted((m) => !m), []);

    const percent = duration ? (currentTime / duration) * 100 : 0;
    const bufferedPercent = duration ? (buffered / duration) * 100 : 0;

    return (
      <div
        ref={wrapperRef}
        className={cn(
          "custom-video-wrapper absolute inset-0 w-full h-full",
          (!playing || showControls) && "show-controls",
          !playing && "paused"
        )}
        onClick={resetControlsTimeout}
        onMouseMove={resetControlsTimeout}
        onMouseLeave={() => playing && setShowControls(false)}
      >
        <video
          ref={videoRef}
          src={url}
          className="w-full h-full object-contain bg-black cursor-pointer"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onProgress={handleProgress}
          onEnded={onPause}
          onSeeked={(e) => {
            if (onSeek) onSeek((e.target as HTMLVideoElement).currentTime);
          }}
          onClick={togglePlay}
          playsInline
          muted={muted}
          // Preload metadata saja agar tidak menguras data mobile saat load awal
          preload="metadata"
        />

        {controls && (
          <div
            className="video-overlay"
            onClick={togglePlay}
            style={{ opacity: playing ? 0 : "", pointerEvents: playing ? "none" : "auto" }}
          >
            <div className="overlay-play-btn">
              <Play className="w-10 h-10 ml-1 text-white fill-white" />
            </div>
          </div>
        )}

        {controls && (
          <div className="custom-controls" onClick={(e) => e.stopPropagation()}>
            {/* Progress Bar */}
            <div
              className="progress-container"
              ref={progressContainerRef}
              onClick={handleSeekClick}
              onMouseDown={() => setIsDragging(true)}
            >
              <div className="progress-buffered" style={{ width: `${bufferedPercent}%` }} />
              <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
            </div>

            {/* Controls Row */}
            <div className="controls-row">
              <div className="controls-left">
                <button className="ctrl-btn play-btn" onClick={togglePlay} title="Play / Pause">
                  {playing
                    ? <Pause className="w-6 h-6 fill-white" />
                    : <Play className="w-6 h-6 fill-white" />
                  }
                </button>

                <div className="volume-group ml-2">
                  <button className="ctrl-btn p-1" onClick={toggleMute} title="Mute">
                    {muted || volume === 0
                      ? <VolumeX className="w-5 h-5" />
                      : <Volume2 className="w-5 h-5" />
                    }
                  </button>
                  <input
                    type="range"
                    className="volume-slider"
                    min="0"
                    max="1"
                    step="0.05"
                    value={muted ? 0 : volume}
                    onChange={handleVolumeChange}
                  />
                </div>

                <div className="time-display">
                  <span className="current">{formatTime(currentTime)}</span>
                  <span> / </span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              <div className="controls-right">
                <button className="ctrl-btn" onClick={toggleFullscreen} title="Fullscreen">
                  <Maximize className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);
