import { X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  removeLabel?: (tag: string) => string;
  normalizeTag?: (tag: string) => string;
  validateTag?: (tag: string) => boolean;
  splitPattern?: RegExp;
}

export function TagInput({
  value,
  onChange,
  id,
  placeholder,
  disabled = false,
  className,
  inputClassName,
  removeLabel,
  normalizeTag = (tag) => tag.trim(),
  validateTag = (tag) => tag.length > 0,
  splitPattern = /[\s,]+/,
}: TagInputProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedValues = useMemo(() => new Set(value.map((tag) => tag.toLowerCase())), [value]);

  const addTags = (raw: string) => {
    const nextTags = raw
      .split(splitPattern)
      .map(normalizeTag)
      .filter((tag) => tag.length > 0 && validateTag(tag));

    if (nextTags.length === 0) return false;

    const next = [...value];
    const seen = new Set(normalizedValues);

    for (const tag of nextTags) {
      const key = tag.toLowerCase();
      if (!seen.has(key)) {
        next.push(tag);
        seen.add(key);
      }
    }

    if (next.length === value.length) return false;

    onChange(next);
    return true;
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((tag) => tag.toLowerCase() !== tagToRemove.toLowerCase()));
  };

  const commitDraft = () => {
    if (addTags(draft)) {
      setDraft('');
    }
  };

  return (
    <fieldset
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
          inputRef.current?.focus();
        }
      }}
      className={cn(
        'flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm',
        'focus-within:ring-1 focus-within:ring-ring',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex max-w-full items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
        >
          <span className="truncate">{tag}</span>
          <button
            type="button"
            onClick={() => removeTag(tag)}
            disabled={disabled}
            className="rounded p-0.5 text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary disabled:pointer-events-none"
            aria-label={removeLabel?.(tag)}
            title={removeLabel?.(tag)}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      <input
        ref={inputRef}
        id={id}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',' || event.key === ' ') {
            event.preventDefault();
            commitDraft();
            return;
          }

          if (event.key === 'Backspace' && draft.length === 0 && value.length > 0) {
            event.preventDefault();
            onChange(value.slice(0, -1));
          }
        }}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData('text');
          if (pasted.split(splitPattern).length > 1) {
            event.preventDefault();
            if (addTags(pasted)) {
              setDraft('');
            }
          }
        }}
        onBlur={commitDraft}
        placeholder={value.length === 0 ? placeholder : undefined}
        className={cn(
          'min-w-24 flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed',
          inputClassName,
        )}
      />
    </fieldset>
  );
}
