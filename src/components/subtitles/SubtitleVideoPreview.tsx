import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { AlertTriangle, Eye, Loader2, Pause, Play, Video } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SubtitleWaveformTimeline } from '@/components/subtitles/SubtitleWaveformTimeline';
import { useSubtitle } from '@/contexts/SubtitleContext';
import { formatTimeDisplay } from '@/lib/subtitle-parser';
import type { VideoMetadata } from '@/lib/types';
import { cn } from '@/lib/utils';

export function SubtitleVideoPreview() {
  const { t } = useTranslation('subtitles');
  const subtitle = useSubtitle();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentSubText, setCurrentSubText] = useState('');
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [isUsingPreview, setIsUsingPreview] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const animFrameRef = useRef<number>(0);
  const metadataRef = useRef<VideoMetadata | null>(null);

  const loadVideoSrc = useCallback((filePath: string) => convertFileSrc(filePath), []);

  const loadVideo = useCallback(
    async (path: string) => {
      subtitle.setVideoPath(path);
      subtitle.setVideoCurrentTime(0);
      subtitle.setVideoDurationMs(0);
      subtitle.setIsVideoPlaying(false);
      setVideoError(null);
      setCurrentSubText('');
      setIsUsingPreview(false);
      setVideoSrc(null);
      setAudioSrc(null);
      metadataRef.current = null;
      setIsLoadingVideo(true);

      try {
        const metadata = await invoke<VideoMetadata>('get_video_metadata', { path });
        metadataRef.current = metadata;

        const codec = metadata.video_codec.toLowerCase();
        const format = metadata.format.toLowerCase();
        const supportedContainers = ['mp4', 'mov', 'm4v', 'm4a', '3gp'];
        const hasUnsupportedContainer = !supportedContainers.some((c) => format.includes(c));

        const isMacOS = /Mac/.test(navigator.platform);
        const problematicCodecs = isMacOS
          ? ['vp9', 'vp8', 'av1', 'theora']
          : ['vp9', 'vp8', 'av1', 'hevc', 'h265', 'theora'];
        const hasProblematicCodec = problematicCodecs.some((c) => codec.includes(c));

        const needsPreview = hasUnsupportedContainer || hasProblematicCodec;

        if (!needsPreview) {
          setVideoSrc(loadVideoSrc(path));
          return;
        }

        setIsGeneratingPreview(true);
        try {
          const [previewPath, audioPath] = await Promise.all([
            invoke<string>('generate_video_preview', {
              inputPath: path,
              videoCodec: metadata.video_codec,
              containerFormat: metadata.format,
            }),
            metadata.has_audio
              ? invoke<string>('generate_audio_preview', { inputPath: path })
              : Promise.resolve(null),
          ]);

          setVideoSrc(loadVideoSrc(previewPath));
          setAudioSrc(audioPath ? loadVideoSrc(audioPath) : null);
          setIsUsingPreview(true);
        } catch (previewErr) {
          console.error('Failed to generate subtitle preview video:', previewErr);
          setVideoSrc(loadVideoSrc(path));
          setAudioSrc(null);
        } finally {
          setIsGeneratingPreview(false);
        }
      } catch (err) {
        console.error('Failed to load video for subtitles:', err);
        setVideoError(String(err));
        setVideoSrc(null);
        setAudioSrc(null);
      } finally {
        setIsLoadingVideo(false);
      }
    },
    [loadVideoSrc, subtitle],
  );

  const handleLoadVideo = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Video Files',
            extensions: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'm4v'],
          },
        ],
      });

      if (!selected) return;
      const filePath = typeof selected === 'string' ? selected : selected;
      await loadVideo(filePath);
    } catch (err) {
      console.error('Failed to load video:', err);
    }
  }, [loadVideo]);

  // Sync video time to context
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTime = () => {
      const timeMs = video.currentTime * 1000;
      subtitle.setVideoCurrentTime(timeMs);

      // Find current subtitle
      const current = subtitle.entries.find((e) => timeMs >= e.startTime && timeMs <= e.endTime);
      setCurrentSubText(current?.text || '');

      if (!video.paused) {
        animFrameRef.current = requestAnimationFrame(updateTime);
      }
    };

    const onPlay = () => {
      subtitle.setIsVideoPlaying(true);
      if (audioRef.current?.paused && audioSrc) {
        audioRef.current.play().catch(() => {
          // Ignore autoplay errors
        });
      }
      animFrameRef.current = requestAnimationFrame(updateTime);
    };

    const onPause = () => {
      subtitle.setIsVideoPlaying(false);
      if (audioRef.current) {
        audioRef.current.pause();
      }
      cancelAnimationFrame(animFrameRef.current);
      updateTime();
    };

    const onSeeked = () => {
      if (audioRef.current && audioSrc) {
        audioRef.current.currentTime = video.currentTime;
      }
      updateTime();
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('timeupdate', updateTime);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('timeupdate', updateTime);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [subtitle, audioSrc]);

  const handlePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }, []);

  const handleSeekToEntry = useCallback(
    (timeMs: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = timeMs / 1000;
      if (audioRef.current && audioSrc) {
        audioRef.current.currentTime = timeMs / 1000;
      }
    },
    [audioSrc],
  );

  // Seek to active entry when it changes
  useEffect(() => {
    if (!subtitle.activeEntryId || !videoRef.current) return;
    const entry = subtitle.entries.find((e) => e.id === subtitle.activeEntryId);
    if (entry) {
      handleSeekToEntry(entry.startTime);
    }
  }, [subtitle.activeEntryId, subtitle.entries, handleSeekToEntry]);

  // External timeline seeks update `videoCurrentTime` in context.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const target = subtitle.videoCurrentTime / 1000;
    if (!Number.isFinite(target)) return;
    if (Math.abs(video.currentTime - target) < 0.12) return;
    video.currentTime = target;
    if (audioRef.current && audioSrc) {
      audioRef.current.currentTime = target;
    }
  }, [subtitle.videoCurrentTime, audioSrc]);

  const handleVideoError = useCallback(() => {
    const video = videoRef.current;
    const mediaError = video?.error;
    let errorMsg = t('video.previewPlaybackFailed');

    if (mediaError) {
      switch (mediaError.code) {
        case MediaError.MEDIA_ERR_DECODE:
          errorMsg = t('video.codecNotSupported');
          break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          errorMsg = t('video.formatNotSupported');
          break;
      }
    }

    const metadata = metadataRef.current;
    const diag = [
      `error=${mediaError?.code}`,
      `codec=${metadata?.video_codec ?? '?'}`,
      `format=${metadata?.format ?? '?'}`,
      `platform=${navigator.platform}`,
    ].join(', ');

    setVideoError(`${errorMsg} [${diag}]`);
  }, [t]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const durationMs = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0;
    subtitle.setVideoDurationMs(durationMs);
  }, [subtitle]);

  return (
    <div className="flex flex-col h-full">
      {/* Video Container */}
      <div className="relative bg-black flex-shrink-0">
        {isLoadingVideo || isGeneratingPreview ? (
          <div className="aspect-video flex flex-col items-center justify-center gap-3 text-white/70">
            <Loader2 className="w-7 h-7 animate-spin" />
            <span className="text-sm">
              {isGeneratingPreview ? t('video.generatingPreview') : t('video.loading')}
            </span>
          </div>
        ) : videoSrc && !videoError ? (
          <div className="relative">
            <video
              ref={videoRef}
              src={videoSrc}
              className="w-full aspect-video object-contain"
              playsInline
              onLoadedMetadata={handleLoadedMetadata}
              onError={handleVideoError}
            >
              <track kind="captions" />
            </video>
            {audioSrc && (
              <audio ref={audioRef} src={audioSrc} preload="auto">
                <track kind="captions" />
              </audio>
            )}

            {isUsingPreview && (
              <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-medium">
                <Eye className="w-3 h-3" />
                {t('video.previewMode')}
              </div>
            )}

            {/* Subtitle Overlay */}
            {currentSubText && (
              <div className="absolute bottom-4 left-4 right-4 text-center">
                <span
                  className={cn(
                    'inline-block px-3 py-1.5 rounded-md',
                    'bg-black/75 text-white text-sm leading-relaxed',
                    'max-w-full',
                  )}
                >
                  {currentSubText.split('\n').map((line, i) => (
                    <span key={`line-${i}-${line.slice(0, 10)}`}>
                      {i > 0 && <br />}
                      {line}
                    </span>
                  ))}
                </span>
              </div>
            )}
          </div>
        ) : videoError ? (
          <div className="aspect-video flex flex-col items-center justify-center gap-3 px-6 text-center">
            <AlertTriangle className="w-6 h-6 text-destructive" />
            <p className="text-sm text-muted-foreground">{videoError}</p>
            <button
              type="button"
              onClick={handleLoadVideo}
              className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent transition-colors"
            >
              {t('video.loadVideo')}
            </button>
          </div>
        ) : (
          <div className="aspect-video flex items-center justify-center bg-muted/30">
            <button
              type="button"
              onClick={handleLoadVideo}
              className={cn(
                'flex flex-col items-center gap-2 p-6 rounded-xl',
                'border border-dashed border-muted-foreground/30',
                'hover:bg-accent/50 transition-colors',
                'text-muted-foreground hover:text-foreground',
              )}
            >
              <Video className="w-8 h-8" />
              <span className="text-sm">{t('video.loadVideo')}</span>
            </button>
          </div>
        )}
      </div>

      {/* Controls */}
      {videoSrc && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
          <button
            type="button"
            onClick={handlePlayPause}
            className="p-1.5 rounded-md hover:bg-accent transition-colors"
            title={t('video.playPause')}
          >
            {subtitle.isVideoPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatTimeDisplay(subtitle.videoCurrentTime)}
          </span>
          {isUsingPreview && (
            <span className="text-[10px] text-amber-500 dark:text-amber-400">
              {t('video.previewHint')}
            </span>
          )}
        </div>
      )}

      {videoSrc && <SubtitleWaveformTimeline />}

      {/* Current subtitle info */}
      <div className="flex-1 overflow-auto p-3 min-h-[88px]">
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t('video.currentSubtitle')}
          </h4>
          {currentSubText ? (
            <p className="text-sm leading-relaxed">{currentSubText}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">—</p>
          )}
        </div>
      </div>
    </div>
  );
}
