export interface PdfTextItem { str: string; hasEOL?: boolean }
export type PdfSelection = [startItem: number, startOffset: number, endItem: number, endOffset: number];

function compact(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[\s\u00ad]/gu, "");
}

// PDF fragments use text-item indices and UTF-16 offsets, not invented screen coordinates.
export function findTextSelection(items: PdfTextItem[], anchor: string): PdfSelection | null {
  let text = "";
  const positions: { item: number; offset: number; end: number }[] = [];
  items.forEach((item, index) => {
    let offset = 0;
    for (const character of item.str) {
      const end = offset + character.length;
      const next = items[index + 1]?.str.trimStart();
      const lineHyphen = character === "-" && end === item.str.length && item.hasEOL && next && /^\p{L}/u.test(next);
      if (!lineHyphen) {
        const normalized = compact(character);
        text += normalized;
        for (let i = 0; i < normalized.length; i++) positions.push({ item: index, offset, end });
      }
      offset = end;
    }
  });
  const query = compact(anchor);
  const start = query ? text.indexOf(query) : -1;
  if (start < 0) return null;
  const first = positions[start];
  const last = positions[start + query.length - 1];
  return [first.item, first.offset, last.item, last.end];
}
