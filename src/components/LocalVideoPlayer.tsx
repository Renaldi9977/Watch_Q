import React, {
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";
import { Play, Pause, Volume2, VolumeX, Maximize } from "lucide-react";
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

    // Expose API kompatibel dengan YouTube IFrame API
    // Wajib ada playVideo/pauseVideo agar sync handler Room.tsx bekerja sama
    useImperativeHandle(ref, () => ({
      seekTo: (amount: number, type?: string | boolean) => {
        if (!videoRef.current) return;
        videoRef.current.currentTime =
          type === "fraction" ? amount * duration : amount;
      },
      getCurrentTime: () => videoRef.current?.currentTime ?? 0,
      getDuration: () => videoRef.current?.duration ?? 0,
      getInternalPlayer: () => videoRef.current,
      playVideo: () => { videoRef.current?.play().catch(() => {}); },
      pauseVideo: () => { videoRef.current?.pause(); },
    }), [duration]);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      if (playing) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    }, [playing, url]);

    const formatTime = useCallback((s: number) => {
      if (isNaN(s) || s < 0) return "0:00";
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = Math.floor(s % 60);
      return h > 0
        ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
        : `${m}:${String(sec).padStart(2, "0")}`;
    }, []);

    const togglePlay = useCallback(() => {
      if (!controls) return;
      if (playing) onPause(); else onPlay();
    }, [controls, playing, onPlay, onPause]);

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

    const handleBufferProgress = useCallback(() => {
      const video = videoRef.current;
      if (video && video.buffered.length > 0)
        setBuffered(video.buffered.end(video.buffered.length - 1));
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

    useEffect(() => {
      if (!isDragging) return;
      const onMove = (e: MouseEvent) => handleSeekClick(e);
      const onUp = () => setIsDragging(false);
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      return () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
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
      if (!document.fullscreenElement) wrapperRef.current.requestFullscreen().catch(() => {});
      else document.exitFullscreen();
    }, []);

    const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseFloat(e.target.value);
      setVolume(v);
      setMuted(v === 0);
      if (videoRef.current) videoRef.current.volume = v;
    }, []);

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
          onProgress={handleBufferProgress}
          onEnded={onPause}
          onSeeked={(e) => onSeek?.((e.target as HTMLVideoElement).currentTime)}
          onClick={togglePlay}
          playsInline
          muted={muted}
          preload="metadata"
        />

        {controls && (
          <div className="video-overlay" onClick={togglePlay}>
            <div className="overlay-play-btn">
              <Play className="w-10 h-10 ml-1 text-white fill-white" />
            </div>
          </div>
        )}

        {controls && (
          <div className="custom-controls" onClick={(e) => e.stopPropagation()}>
            <div
              className="progress-container"
              ref={progressContainerRef}
              onClick={handleSeekClick}
              onMouseDown={() => setIsDragging(true)}
            >
              <div className="progress-buffered" style={{ width: `${bufferedPercent}%` }} />
              <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
            </div>
            <div className="controls-row">
              <div className="controls-left">
                <button className="ctrl-btn" onClick={togglePlay}>
                  {playing
                    ? <Pause className="w-6 h-6 fill-white" />
                    : <Play className="w-6 h-6 fill-white" />}
                </button>
                <div className="volume-group ml-2">
                  <button className="ctrl-btn p-1" onClick={() => setMuted(m => !m)}>
                    {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                  <input
                    type="range" className="volume-slider"
                    min="0" max="1" step="0.05"
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
                <button className="ctrl-btn" onClick={toggleFullscreen}>
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
