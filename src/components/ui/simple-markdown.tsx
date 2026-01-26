import { cn } from '@/lib/utils';

interface SimpleMarkdownProps {
  content: string;
  className?: string;
}

/**
 * A lightweight markdown renderer for basic formatting.
 * Supports: **bold**, *italic*, ### headers, - lists, [links](url), `code`
 */
export function SimpleMarkdown({ content, className }: SimpleMarkdownProps) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let listKey = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${listKey++}`} className="list-disc list-inside space-y-1 my-2">
          {listItems.map((item) => (
            <li key={`${listKey}-${item}`} className="text-inherit">
              {parseInline(item)}
            </li>
          ))}
        </ul>,
      );
      listItems = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty line
    if (!trimmed) {
      flushList();
      continue;
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(
        <h4 key={i} className="font-semibold text-foreground mt-3 mb-1">
          {parseInline(trimmed.slice(4))}
        </h4>,
      );
      continue;
    }
    if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(
        <h3 key={i} className="font-semibold text-foreground mt-3 mb-1">
          {parseInline(trimmed.slice(3))}
        </h3>,
      );
      continue;
    }
    if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(
        <h2 key={i} className="font-bold text-foreground mt-3 mb-1">
          {parseInline(trimmed.slice(2))}
        </h2>,
      );
      continue;
    }

    // List items (- or *)
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      listItems.push(trimmed.slice(2));
      continue;
    }

    // Numbered list (1. 2. etc)
    const numberedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (numberedMatch) {
      listItems.push(numberedMatch[1]);
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={i} className="my-1">
        {parseInline(trimmed)}
      </p>,
    );
  }

  flushList();

  return <div className={cn('text-inherit leading-relaxed', className)}>{elements}</div>;
}

/**
 * Parse inline markdown: **bold**, *italic*, `code`, [link](url)
 */
function parseInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold: **text**
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      parts.push(
        <strong key={key++} className="font-semibold">
          {parseInline(boldMatch[1])}
        </strong>,
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic: *text* (but not **)
    const italicMatch = remaining.match(/^\*([^*]+?)\*/);
    if (italicMatch) {
      parts.push(
        <em key={key++} className="italic">
          {parseInline(italicMatch[1])}
        </em>,
      );
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Code: `text`
    const codeMatch = remaining.match(/^`([^`]+?)`/);
    if (codeMatch) {
      parts.push(
        <code key={key++} className="px-1 py-0.5 bg-muted rounded text-[0.9em] font-mono">
          {codeMatch[1]}
        </code>,
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Link: [text](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      parts.push(
        <a
          key={key++}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          {linkMatch[1]}
        </a>,
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Regular text - take until next special char
    const nextSpecial = remaining.search(/[*`[]/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    } else if (nextSpecial === 0) {
      // Special char but no match - treat as regular text
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      parts.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return parts.length === 1 ? parts[0] : parts;
}
