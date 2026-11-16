import type { ReactNode } from "react";
import { safeSourceUrl, type AssignmentView } from "@/lib/team-agent-contract";

// Deliberately small Markdown subset. Raw HTML and remote images are never rendered.
function inline(text: string): ReactNode[] {
  const pattern = /\*\*([^*\n]+)\*\*|`([^`\n]+)`|\[([^\]\n]+)\]\(([^\s)]+)\)/g;
  const nodes: ReactNode[] = [];
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    nodes.push(text.slice(offset, match.index));
    if (match[1]) nodes.push(<strong key={match.index}>{match[1]}</strong>);
    else if (match[2]) nodes.push(<code key={match.index}>{match[2]}</code>);
    else {
      const url = safeSourceUrl(match[4]);
      nodes.push(
        url ? (
          <a
            key={match.index}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {match[3]}
          </a>
        ) : (
          match[0]
        ),
      );
    }
    offset = match.index! + match[0].length;
  }
  nodes.push(text.slice(offset));
  return nodes;
}
export function TeamAssignmentResult({
  run,
}: {
  run: Pick<AssignmentView, "result" | "sources">;
}) {
  let cursor = 0;
  let text = "";
  for (const [i, source] of [...run.sources]
    .sort((a, b) => a.start - b.start)
    .entries()) {
    const url = safeSourceUrl(source.url);
    if (
      !url ||
      source.start < cursor ||
      source.end > run.result.length ||
      source.end <= source.start
    )
      continue;
    text +=
      run.result.slice(cursor, source.start) +
      `[Source ${i + 1}](${url.replaceAll(")", "%29")})`;
    cursor = source.end;
  }
  text += run.result.slice(cursor);
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const heading = line.match(/^#{1,6}\s+(.+)/);
    if (heading) {
      blocks.push(<h3 key={i}>{inline(heading[1])}</h3>);
      continue;
    }
    const ordered = /^\s*\d+[.)]\s+/.test(line);
    const unordered = /^\s*[-*+]\s+/.test(line);
    if (ordered || unordered) {
      const start = i;
      const items: ReactNode[] = [];
      const pattern = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
      while (i < lines.length && pattern.test(lines[i])) {
        items.push(<li key={i}>{inline(lines[i].replace(pattern, ""))}</li>);
        i++;
      }
      i--;
      blocks.push(
        ordered ? <ol key={start}>{items}</ol> : <ul key={start}>{items}</ul>,
      );
      continue;
    }
    blocks.push(<p key={i}>{inline(line)}</p>);
  }
  return <div className="assignment-formatted">{blocks}</div>;
}
