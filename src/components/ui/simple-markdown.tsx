import { cn, isSafeUrl } from '@/lib/utils';

interface SimpleMarkdownProps {
  content: string;
  className?: string;
}

type MarkdownListItem = {
  text: string;
  children: MarkdownListNode[];
};

type MarkdownListNode = {
  kind: 'ul' | 'ol';
  items: MarkdownListItem[];
  start?: number;
};

type MarkdownListToken = {
  indent: number;
  kind: 'ul' | 'ol';
  text: string;
  start?: number;
};

/**
 * A lightweight markdown renderer for basic formatting.
 * Supports: **bold**, *italic*, ### headers, ordered/unordered lists, [links](url), `code`, ```code blocks```, pipe tables
 */
export function SimpleMarkdown({ content, className }: SimpleMarkdownProps) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let codeBlockLines: string[] = [];
  let codeBlockKey = 0;
  let tableKey = 0;
  let listKey = 0;
  let inCodeBlock = false;

  const flushCodeBlock = () => {
    if (codeBlockLines.length > 0) {
      elements.push(
        <pre
          key={`code-${codeBlockKey++}`}
          className="my-3 w-full max-w-full overflow-x-auto rounded-lg bg-muted px-3 py-2 text-[0.9em] leading-relaxed"
        >
          <code className="block font-mono whitespace-pre-wrap break-words">
            {codeBlockLines.join('\n')}
          </code>
        </pre>,
      );
      codeBlockLines = [];
    }
  };

  const isTableRow = (line: string) => /^\|(?:[^|\n]*\|)+\s*$/.test(line.trim());
  const isListLine = (line: string) => /^(\s*)([-*]|\d+\.)\s+.+$/.test(line);
  const isHorizontalRule = (line: string) => /^-{3,}$/.test(line.trim());

  const isTableSeparator = (line: string) => {
    const cells = splitTableRow(line);
    return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Empty line
    if (!trimmed) {
      continue;
    }

    if (isTableRow(trimmed) && i + 1 < lines.length && isTableSeparator(lines[i + 1] ?? '')) {
      const headerCells = splitTableRow(trimmed);
      const bodyRows: string[][] = [];
      i += 2;

      while (i < lines.length) {
        const tableLine = lines[i]?.trim() ?? '';
        if (!tableLine || !isTableRow(tableLine)) {
          i -= 1;
          break;
        }

        bodyRows.push(splitTableRow(tableLine));
        i += 1;
      }

      elements.push(
        <div key={`table-${tableKey++}`} className="my-3 w-full max-w-full overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-xl border border-border/70 bg-background/40 text-left text-sm">
            <thead className="bg-muted/50">
              <tr>
                {headerCells.map((cell) => (
                  <th
                    key={`head-${cell}`}
                    className="border-b border-border/70 px-3 py-2 align-top font-semibold text-foreground"
                  >
                    {parseInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rowIndex) => (
                <tr key={`row-${row.join('|')}-${rowIndex}`} className="align-top">
                  {headerCells.map((_, cellIndex) => (
                    <td
                      key={`cell-${row[cellIndex] ?? ''}-${cellIndex}`}
                      className="border-t border-border/50 px-3 py-2 text-muted-foreground"
                    >
                      {parseInline(row[cellIndex] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (isListLine(line)) {
      const listLines = [line];
      let nextIndex = i + 1;

      while (nextIndex < lines.length) {
        const candidate = lines[nextIndex] ?? '';
        if (!candidate.trim() || !isListLine(candidate)) {
          break;
        }
        listLines.push(candidate);
        nextIndex += 1;
      }

      elements.push(
        <div key={`list-block-${listKey++}`} className="my-2">
          {renderListNodes(parseListBlock(listLines))}
        </div>,
      );
      i = nextIndex - 1;
      continue;
    }

    if (isHorizontalRule(trimmed)) {
      elements.push(
        <hr
          key={i}
          className="my-4 border-0 h-px bg-gradient-to-r from-transparent via-border/70 to-transparent"
        />,
      );
      continue;
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={i} className="mt-3 mb-1 break-words font-semibold text-foreground">
          {parseInline(trimmed.slice(4))}
        </h4>,
      );
      continue;
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={i} className="mt-3 mb-1 break-words font-semibold text-foreground">
          {parseInline(trimmed.slice(3))}
        </h3>,
      );
      continue;
    }
    if (trimmed.startsWith('# ')) {
      elements.push(
        <h2 key={i} className="mt-3 mb-1 break-words font-bold text-foreground">
          {parseInline(trimmed.slice(2))}
        </h2>,
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="my-1 min-w-0 break-words">
        {parseInline(trimmed)}
      </p>,
    );
  }

  flushCodeBlock();

  return (
    <div className={cn('min-w-0 max-w-full break-words text-inherit leading-relaxed', className)}>
      {elements}
    </div>
  );
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function parseListBlock(lines: string[]): MarkdownListNode[] {
  const tokens = lines
    .map(parseListToken)
    .filter((token): token is MarkdownListToken => token != null);
  const nodes: MarkdownListNode[] = [];
  let index = 0;

  while (index < tokens.length) {
    const [node, nextIndex] = consumeListNode(
      tokens,
      index,
      tokens[index].indent,
      tokens[index].kind,
    );
    nodes.push(node);
    index = nextIndex;
  }

  return nodes;
}

function parseListToken(line: string): MarkdownListToken | null {
  const normalizedLine = line.replace(/\t/g, '  ');
  const match = normalizedLine.match(/^(\s*)([-*]|\d+\.)\s+(.+)$/);
  if (!match) {
    return null;
  }

  return {
    indent: match[1].length,
    kind: /^\d+\.$/.test(match[2]) ? 'ol' : 'ul',
    text: match[3].trim(),
    start: /^\d+\.$/.test(match[2]) ? Number.parseInt(match[2], 10) : undefined,
  };
}

function consumeListNode(
  tokens: MarkdownListToken[],
  startIndex: number,
  indent: number,
  kind: 'ul' | 'ol',
): [MarkdownListNode, number] {
  const node: MarkdownListNode = { kind, items: [] };
  let index = startIndex;
  if (kind === 'ol') {
    node.start = tokens[startIndex]?.start;
  }

  while (index < tokens.length) {
    const token = tokens[index];

    if (token.indent < indent) {
      break;
    }

    if (token.indent > indent) {
      const lastItem = node.items.at(-1);
      if (!lastItem) {
        index += 1;
        continue;
      }

      const [childNode, nextIndex] = consumeListNode(tokens, index, token.indent, token.kind);
      lastItem.children.push(childNode);
      index = nextIndex;
      continue;
    }

    if (token.kind !== kind) {
      break;
    }

    node.items.push({
      text: token.text,
      children: [],
    });
    index += 1;
  }

  return [node, index];
}

function renderListNodes(nodes: MarkdownListNode[]): React.ReactNode {
  return nodes.map((node, nodeIndex) => {
    const ListTag = node.kind;
    const listClassName =
      node.kind === 'ol' ? 'list-decimal space-y-1 pl-5' : 'list-disc space-y-1 pl-5';

    return (
      <ListTag
        key={`markdown-list-${node.kind}-${nodeIndex}`}
        className={listClassName}
        start={node.kind === 'ol' && node.start && node.start > 1 ? node.start : undefined}
      >
        {node.items.map((item, itemIndex) => (
          <li
            key={`markdown-list-item-${node.kind}-${item.text}-${itemIndex}`}
            className="min-w-0 break-words text-inherit"
          >
            <span>{parseInline(item.text)}</span>
            {item.children.length > 0 ? (
              <div className="mt-1">{renderListNodes(item.children)}</div>
            ) : null}
          </li>
        ))}
      </ListTag>
    );
  });
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
        <code key={key++} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] break-all">
          {codeMatch[1]}
        </code>,
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Link: [text](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const linkUrl = linkMatch[2];
      parts.push(
        isSafeUrl(linkUrl) ? (
          <a
            key={key++}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            {linkMatch[1]}
          </a>
        ) : (
          <span key={key++} className="text-primary">
            {linkMatch[1]}
          </span>
        ),
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
