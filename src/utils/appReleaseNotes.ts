/** A short, plain-text excerpt of the published notes; never render remote Markdown as HTML. */
export function releaseNotesBrief(body: string): string[] {
  const lines = body.split(/\r?\n/).map(line => line.trim());
  const end = lines.findIndex(line => /^(?:\*\*)?Full Changelog|^#+\s*New Contributors/i.test(line));
  const content = (end < 0 ? lines : lines.slice(0, end)).filter(line => line && !/^#+\s|^<!--|^-->/.test(line));
  const bullets = content.filter(line => /^[-*+]\s/.test(line));

  return (bullets.length ? bullets : content).slice(0, 3).map(line => {
    const text = line
      .replace(/^[-*+]\s+/, "")
      .replace(/\s+by @\S+ in https:\/\/github\.com\/\S+\s*$/i, "")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]*>/g, "")
      .replace(/[*`]/g, "")
      .trim();

    return text.length > 240 ? `${text.slice(0, 237).trimEnd()}...` : text;
  }).filter(Boolean);
}
