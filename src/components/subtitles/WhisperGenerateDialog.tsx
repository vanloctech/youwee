import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Loader2, Mic, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAI } from '@/contexts/AIContext';
import { useSubtitle } from '@/contexts/SubtitleContext';
import { parseSubtitles } from '@/lib/subtitle-parser';
import type { SubtitleFormat } from '@/lib/types';
import { cn } from '@/lib/utils';

interface WhisperGenerateDialogProps {
  open: boolean;
  onClose: () => void;
}

const WHISPER_LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'whisper.autoDetect' },
  { value: 'en', label: 'English' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'es', label: 'Spanish' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
] as const;

export function WhisperGenerateDialog({ open: isOpen, onClose }: WhisperGenerateDialogProps) {
  const { t } = useTranslation('subtitles');
  const subtitle = useSubtitle();
  const ai = useAI();
  const activeRunIdRef = useRef(0);

  const [filePath, setFilePath] = useState('');
  const [language, setLanguage] = useState('');
  const [outputFormat, setOutputFormat] = useState<SubtitleFormat>('srt');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelGenerate = useCallback(() => {
    activeRunIdRef.current += 1;
    setIsGenerating(false);
  }, []);

  const handleClose = useCallback(() => {
    cancelGenerate();
    onClose();
  }, [cancelGenerate, onClose]);

  const handleSelectFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Media Files',
            extensions: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'mp3', 'm4a', 'wav', 'ogg', 'flac'],
          },
        ],
      });

      if (selected) {
        setFilePath(typeof selected === 'string' ? selected : selected);
      }
    } catch (err) {
      console.error('Failed to select file:', err);
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!filePath) return;

    // Check if whisper API key is configured
    const whisperApiKey =
      ai.config.whisper_api_key || (ai.config.provider === 'openai' ? ai.config.api_key : '');
    if (!whisperApiKey) {
      setError(t('whisper.noApiKey'));
      return;
    }

    setIsGenerating(true);
    setError(null);
    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;
    const isCancelled = () => activeRunIdRef.current !== runId;

    try {
      const content = await invoke<string>('transcribe_video_with_whisper', {
        videoPath: filePath,
        responseFormat: outputFormat,
        openaiApiKey: whisperApiKey,
        language: language || undefined,
        whisperEndpointUrl: ai.config.whisper_endpoint_url || undefined,
        whisperModel: ai.config.whisper_model || 'whisper-1',
      });
      if (isCancelled()) {
        return;
      }

      // Parse and load into editor
      const _result = parseSubtitles(content, outputFormat);
      const fileName = `whisper_${language || 'auto'}.${outputFormat}`;
      subtitle.loadFromContent(content, fileName, outputFormat);
      handleClose();
    } catch (err) {
      if (isCancelled()) {
        return;
      }
      setError(String(err));
    } finally {
      if (activeRunIdRef.current === runId) {
        setIsGenerating(false);
      }
    }
  }, [filePath, language, outputFormat, ai.config, subtitle, handleClose, t]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-2xl border border-border/50 w-[480px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Mic className="w-5 h-5 text-purple-500" />
            <h2 className="text-lg font-semibold">{t('whisper.title')}</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">{t('whisper.description')}</p>

          {/* File Selection */}
          <div className="space-y-2">
            <label htmlFor="whisper-file" className="text-sm font-medium">
              {t('whisper.videoFile')}
            </label>
            <div className="flex gap-2">
              <input
                id="whisper-file"
                type="text"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder={t('whisper.selectFile')}
                className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-lg truncate outline-none focus:ring-2 focus:ring-primary/50"
                readOnly
              />
              <button
                type="button"
                onClick={handleSelectFile}
                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-accent transition-colors"
              >
                {t('whisper.selectFile')}
              </button>
            </div>
          </div>

          {/* Language */}
          <div className="space-y-2">
            <label htmlFor="whisper-lang" className="text-sm font-medium">
              {t('whisper.language')}
            </label>
            <Select
              value={language || 'auto'}
              onValueChange={(value) => setLanguage(value === 'auto' ? '' : value)}
            >
              <SelectTrigger
                id="whisper-lang"
                className="h-10 rounded-lg border-border/60 bg-background/80 shadow-none focus:ring-2 focus:ring-primary/30"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-lg border-border/60">
                {WHISPER_LANGUAGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label === 'whisper.autoDetect' ? t(option.label) : option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Output Format */}
          <div className="space-y-2">
            <label htmlFor="whisper-format" className="text-sm font-medium">
              {t('whisper.outputFormat')}
            </label>
            <Select
              value={outputFormat}
              onValueChange={(value) => setOutputFormat(value as SubtitleFormat)}
            >
              <SelectTrigger
                id="whisper-format"
                className="h-10 rounded-lg border-border/60 bg-background/80 shadow-none focus:ring-2 focus:ring-primary/30"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-lg border-border/60">
                <SelectItem value="srt">{t('formats.srt')}</SelectItem>
                <SelectItem value="vtt">{t('formats.vtt')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 text-sm text-red-600 dark:text-red-400 bg-red-500/10 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/50">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm rounded-lg hover:bg-accent transition-colors"
          >
            {t('timing.cancel')}
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!filePath || isGenerating}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
              'bg-purple-600 text-white',
              'hover:bg-purple-700 transition-colors',
              'disabled:opacity-50 disabled:pointer-events-none',
            )}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('whisper.generating')}
              </>
            ) : (
              t('whisper.generate')
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
