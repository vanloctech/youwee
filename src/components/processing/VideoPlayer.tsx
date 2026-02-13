import {
  AlertTriangle,
  Eye,
  Film,
  Loader2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import type { TimelineSelection, VideoMetadata } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface VideoPlayerProps {
  videoSrc: string | null;
  audioSrc: string | null;
  thumbnailSrc: string | null;
  videoPath: string | null;
  metadata: VideoMetadata | null;
  videoError: string | null;
  isLoadingVideo: boolean;
  isGeneratingPreview: boolean;
  isUsingPreview: boolean;
  selection: TimelineSelection | null;
  onSelectVideo: () => void;
  onVideoError: (error: string) => void;
}

export const VideoPlayer = memo(function VideoPlayer({
  videoSrc,
  audioSrc,
  thumbnailSrc,
  videoPath,
  metadata,
  videoError,
  isLoadingVideo,
  isGeneratingPreview,
  isUsingPreview,
  selection,
  onSelectVideo,
  onVideoError,
}: VideoPlayerProps) {
  const { t } = useTranslation('pages');
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const driftIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevVideoSrcRef = useRef<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [videoFailed, setVideoFailed] = useState(false);

  // Reset videoFailed when a new video source is loaded
  if (videoSrc !== prevVideoSrcRef.current) {
    prevVideoSrcRef.current = videoSrc;
    if (videoFailed) setVideoFailed(false);
  }

  // Auto-hide controls after 2.5 seconds of no interaction
  const resetHideTimer = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    setShowControls(true);
    hideTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 2500);
  }, [isPlaying]);

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      if (driftIntervalRef.current) {
        clearInterval(driftIntervalRef.current);
      }
    };
  }, []);

  // Sync audio element with video element to correct drift
  // Runs every 500ms while playing, corrects if drift exceeds 0.15s
  useEffect(() => {
    if (isPlaying && audioSrc && audioRef.current && videoRef.current) {
      driftIntervalRef.current = setInterval(() => {
        const video = videoRef.current;
        const audio = audioRef.current;
        if (video && audio && !video.paused && !audio.paused) {
          const drift = Math.abs(video.currentTime - audio.currentTime);
          if (drift > 0.15) {
            audio.currentTime = video.currentTime;
          }
        }
      }, 500);
    } else {
      if (driftIntervalRef.current) {
        clearInterval(driftIntervalRef.current);
        driftIntervalRef.current = null;
      }
    }

    return () => {
      if (driftIntervalRef.current) {
        clearInterval(driftIntervalRef.current);
        driftIntervalRef.current = null;
      }
    };
  }, [isPlaying, audioSrc]);

  // Helper: sync audio to video state (play/pause/seek/volume)
  const syncAudio = useCallback(
    (action: 'play' | 'pause' | 'seek' | 'volume' | 'mute', value?: number) => {
      const audio = audioRef.current;
      if (!audio || !audioSrc) return;

      switch (action) {
        case 'play':
          audio.play().catch(() => {
            // Autoplay may be blocked; ignore silently
          });
          break;
        case 'pause':
          audio.pause();
          break;
        case 'seek':
          if (value !== undefined) {
            audio.currentTime = value;
          }
          break;
        case 'volume':
          if (value !== undefined) {
            audio.volume = value;
          }
          break;
        case 'mute':
          audio.muted = !audio.muted;
          break;
      }
    },
    [audioSrc],
  );

  // Show controls when paused
  useEffect(() => {
    if (!isPlaying) {
      setShowControls(true);
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    } else {
      resetHideTimer();
    }
  }, [isPlaying, resetHideTimer]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) setDuration(videoRef.current.duration);
  }, []);

  const handlePlayPause = useCallback(() => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        syncAudio('play');
      } else {
        videoRef.current.pause();
        syncAudio('pause');
      }
    }
  }, [syncAudio]);

  const handleSeek = useCallback(
    (value: number[]) => {
      if (videoRef.current) {
        videoRef.current.currentTime = value[0];
        setCurrentTime(value[0]);
        syncAudio('seek', value[0]);
      }
    },
    [syncAudio],
  );

  const handleVolumeChange = useCallback(
    (value: number[]) => {
      const vol = value[0];
      if (videoRef.current) {
        videoRef.current.volume = vol;
      }
      setVolume(vol);
      setIsMuted(vol === 0);
      syncAudio('volume', vol);
    },
    [syncAudio],
  );

  const handleToggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
    syncAudio('mute');
  }, [syncAudio]);

  const formatTime = (seconds: number): string => {
    if (!seconds || !Number.isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleVideoError = useCallback(() => {
    const video = videoRef.current;
    const mediaError = video?.error;
    let errorMsg = 'Video playback failed';
    if (mediaError) {
      switch (mediaError.code) {
        case MediaError.MEDIA_ERR_ABORTED:
          errorMsg = 'Playback aborted';
          break;
        case MediaError.MEDIA_ERR_NETWORK:
          errorMsg = 'Network error while loading video';
          break;
        case MediaError.MEDIA_ERR_DECODE:
          errorMsg = 'Video codec not supported. On Linux, install gstreamer1.0-libav';
          break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          errorMsg = 'Video format not supported by this system';
          break;
      }
    }

    // Build diagnostic info for debugging
    const diag = [
      `error=${mediaError?.code}`,
      `codec=${metadata?.video_codec ?? '?'}`,
      `format=${metadata?.format ?? '?'}`,
      `src=${video?.src?.slice(0, 80) ?? '?'}`,
      `platform=${navigator.platform}`,
    ].join(', ');
    console.warn(`[VIDEO_PLAYER] ${errorMsg} | ${diag}`);

    // If a thumbnail fallback is available, switch to it silently
    // instead of showing an error (common on Linux with GStreamer issues)
    if (thumbnailSrc) {
      console.warn('[VIDEO_PLAYER] Falling back to thumbnail (silent fallback)');
      setVideoFailed(true);
      return;
    }

    // Append diagnostic info so user can copy-paste for bug reports
    onVideoError(`${errorMsg}\n[${diag}]`);
  }, [onVideoError, thumbnailSrc, metadata]);

  const videoAspectRatio = metadata ? metadata.width / metadata.height : 16 / 9;
  const hasMedia = videoSrc || thumbnailSrc;

  return (
    <section
      className={cn(
        'relative rounded-xl overflow-hidden w-full',
        'bg-black',
        !hasMedia && 'aspect-video flex items-center justify-center border border-white/10',
        videoSrc && !showControls && 'cursor-none',
      )}
      style={
        hasMedia
          ? {
              aspectRatio: videoAspectRatio,
              maxHeight: '70vh',
            }
          : undefined
      }
      onMouseMove={resetHideTimer}
      onMouseEnter={resetHideTimer}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      aria-label="Video player"
    >
      {isLoadingVideo || isGeneratingPreview ? (
        <div className="flex flex-col items-center gap-3 text-white/70">
          <Loader2 className="w-10 h-10 animate-spin" />
          <p className="text-sm">
            {isGeneratingPreview
              ? t('processing.player.generatingPreview')
              : t('processing.player.loading')}
          </p>
        </div>
      ) : videoSrc && !videoError && !videoFailed ? (
        <>
          <video
            ref={videoRef}
            src={videoSrc}
            className="absolute inset-0 w-full h-full object-contain"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={() => {
              setIsPlaying(true);
              syncAudio('play');
            }}
            onPause={() => {
              setIsPlaying(false);
              syncAudio('pause');
            }}
            onEnded={() => {
              setIsPlaying(false);
              syncAudio('pause');
            }}
            onError={handleVideoError}
            onClick={handlePlayPause}
          >
            <track kind="captions" src="data:text/vtt,WEBVTT" srcLang="en" label="English" />
          </video>

          {/* Hidden audio element for synced playback (used when video preview has no audio track) */}
          {audioSrc && (
            <audio ref={audioRef} src={audioSrc} preload="auto">
              <track kind="captions" />
            </audio>
          )}

          {/* Top bar with video title */}
          <div
            className={cn(
              'absolute inset-x-0 top-0 p-3 pb-8',
              'bg-gradient-to-b from-black/70 to-transparent',
              'transition-opacity duration-300 flex items-start justify-between',
              showControls ? 'opacity-100' : 'opacity-0',
            )}
          >
            {videoPath && (
              <>
                <div className="flex-1 min-w-0 mr-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white truncate">
                      {videoPath.split('/').pop()}
                    </p>
                    {isUsingPreview && (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 flex-shrink-0">
                        <Eye className="w-3 h-3 text-amber-400" />
                        <span className="text-[10px] font-medium text-amber-400">
                          {t('processing.player.preview')}
                        </span>
                      </div>
                    )}
                  </div>
                  {isUsingPreview && (
                    <p className="text-[10px] text-white/50 mt-0.5">
                      {t('processing.player.previewHint')}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-white/70 hover:text-white hover:bg-white/20 flex-shrink-0"
                  onClick={onSelectVideo}
                >
                  <Upload className="w-3 h-3 mr-1" />
                  {t('processing.player.change')}
                </Button>
              </>
            )}
          </div>

          {/* Video Controls Overlay */}
          <div
            className={cn(
              'absolute inset-x-0 bottom-0 p-3 pt-12',
              'bg-gradient-to-t from-black/80 via-black/40 to-transparent',
              'transition-opacity duration-300',
              showControls ? 'opacity-100' : 'opacity-0',
            )}
          >
            {/* Timeline */}
            <div className="relative mb-3">
              {/* Selection range */}
              {selection && duration > 0 && (
                <div
                  className="absolute h-1 bg-primary/50 rounded top-1/2 -translate-y-1/2 pointer-events-none z-10"
                  style={{
                    left: `${(selection.start / duration) * 100}%`,
                    width: `${((selection.end - selection.start) / duration) * 100}%`,
                  }}
                />
              )}
              <Slider
                value={[currentTime]}
                min={0}
                max={duration || 100}
                step={0.1}
                onValueChange={handleSeek}
                className="cursor-pointer"
              />
            </div>

            {/* Controls Row */}
            <div className="flex items-center gap-2">
              {/* Play/Pause */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={handlePlayPause}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>

              {/* Skip */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white/70 hover:bg-white/20 hover:text-white"
                onClick={() => handleSeek([currentTime - 10])}
              >
                <SkipBack className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white/70 hover:bg-white/20 hover:text-white"
                onClick={() => handleSeek([currentTime + 10])}
              >
                <SkipForward className="w-4 h-4" />
              </Button>

              {/* Time */}
              <span className="text-xs text-white/70 font-mono min-w-[80px]">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>

              <div className="flex-1" />

              {/* Volume */}
              <div className="flex items-center gap-1 ml-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white/70 hover:bg-white/20 hover:text-white"
                  onClick={handleToggleMute}
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </Button>
                <Slider
                  value={[isMuted ? 0 : volume]}
                  min={0}
                  max={1}
                  step={0.1}
                  onValueChange={handleVolumeChange}
                  className="w-20"
                />
              </div>
            </div>
          </div>
        </>
      ) : thumbnailSrc && !videoError ? (
        /* Thumbnail-only mode: static image preview for codecs that crash WebKitGTK */
        <div className="relative w-full h-full flex items-center justify-center">
          <img
            src={thumbnailSrc}
            alt={videoPath || 'Video thumbnail'}
            className="absolute inset-0 w-full h-full object-contain"
          />
          {/* Overlay with info badge */}
          <div className="absolute inset-x-0 top-0 p-3 pb-8 bg-gradient-to-b from-black/70 to-transparent">
            <div className="flex items-center gap-2">
              {videoPath && (
                <p className="text-xs text-white/80 font-medium truncate flex-1">
                  {videoPath.split('/').pop()?.split('\\').pop()}
                </p>
              )}
              {isUsingPreview && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-medium shrink-0">
                  <Eye className="w-3 h-3" />
                  Thumbnail
                </span>
              )}
            </div>
          </div>
          {/* Bottom info: no playback controls for thumbnail mode */}
          <div className="absolute inset-x-0 bottom-0 p-3 pt-8 bg-gradient-to-t from-black/70 to-transparent">
            <p className="text-xs text-white/60 text-center">
              {videoFailed
                ? t('processing.player.thumbnailFallback')
                : t('processing.player.thumbnailOnly')}
            </p>
          </div>
        </div>
      ) : videoError ? (
        <div className="flex flex-col items-center gap-4 text-muted-foreground p-8">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <div className="text-center">
            <p className="font-medium text-destructive">{t('processing.player.videoError')}</p>
            <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">{videoError}</p>
          </div>
          <Button onClick={onSelectVideo} variant="outline" className="mt-2">
            <Upload className="w-4 h-4 mr-2" />
            {t('processing.player.tryAnother')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 text-muted-foreground p-8">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
            <Film className="w-8 h-8 opacity-50" />
          </div>
          <div className="text-center">
            <p className="font-medium">{t('processing.player.noVideoLoaded')}</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {t('processing.player.selectVideoHint')}
            </p>
          </div>
          <Button onClick={onSelectVideo} className="mt-2">
            <Upload className="w-4 h-4 mr-2" />
            {t('processing.player.selectVideo')}
          </Button>
        </div>
      )}
    </section>
  );
});
