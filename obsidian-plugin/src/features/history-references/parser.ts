import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFootnoteFromMarkdown } from "mdast-util-gfm-footnote";
import { gfmFootnote } from "micromark-extension-gfm-footnote";
import type { Nodes } from "mdast";

export interface HistoryReference {
  archive_id: string;
  archive_uri: string;
  event_ids: string[];
  quote?: string;
}
export interface HistoryCitation { id: string; label: string; reference: HistoryReference; from: number; to: number }
export interface HistoryEvent { id: string; archiveId: string; from: number; to: number; line: number; markdown: string }
export interface HistoryDocument {
  citations: Map<string, HistoryCitation>;
  occurrences: { from: number; to: number; citation: HistoryCitation }[];
  events: Map<string, HistoryEvent>;
  issues: { line: number; message: string }[];
}

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const eventId = /^[a-f0-9]{64}$/;
export const eventKey = (archiveId: string, id: string): string => `${archiveId}:${id}`;

function walk(node: Nodes, visit: (node: Nodes) => void): void {
  visit(node);
  if ("children" in node) for (const child of node.children) walk(child, visit);
}
function plainText(node: Nodes): string {
  return "value" in node ? node.value : "children" in node ? node.children.map(plainText).join("") : "";
}
function validate(value: unknown): HistoryReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("历史引用数据必须是 JSON 对象");
  const ref = value as Record<string, unknown>;
  if (typeof ref.archive_id !== "string" || !uuid.test(ref.archive_id)) throw new Error("转录 UUID 无效");
  if (typeof ref.archive_uri !== "string" || !/^file:(?:\/\/[^/]*\/|\/)/.test(ref.archive_uri) || ref.archive_uri.includes("\\")) throw new Error("转录 URI 必须是绝对 file: 地址");
  const url = new URL(ref.archive_uri);
  if (url.protocol !== "file:" || url.hash || url.search || !decodeURIComponent(url.pathname).toLowerCase().endsWith(".md")) throw new Error("转录 URI 必须指向 Markdown 原本且不带 fragment");
  if (!Array.isArray(ref.event_ids) || !ref.event_ids.length || ref.event_ids.some((id) => typeof id !== "string" || !eventId.test(id)) || new Set(ref.event_ids).size !== ref.event_ids.length) throw new Error("事件 ID 必须完整、非空且不重复");
  if (ref.quote !== undefined && (typeof ref.quote !== "string" || !ref.quote.trim() || Array.from(ref.quote).length > 120)) throw new Error("原文锚点须为不超过 120 字符的非空字符串");
  return ref as unknown as HistoryReference;
}

export function parseHistory(markdown: string): HistoryDocument {
  const tree = fromMarkdown(markdown, { extensions: [gfmFootnote()], mdastExtensions: [gfmFootnoteFromMarkdown()] });
  const result: HistoryDocument = { citations: new Map(), occurrences: [], events: new Map(), issues: [] };
  const lineAt = (offset: number) => markdown.slice(0, offset).split("\n").length - 1;
  const markers = tree.children.filter((node) => node.type === "html" && /^<!-- md-log:(?:archive:|event:|[a-f0-9-]+:end)/.test(node.value.trim()));
  let archiveId: string | undefined;
  const duplicateEvents = new Set<string>();
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    if (marker.type !== "html") continue;
    const archive = /^<!-- md-log:archive:([a-f0-9-]+) -->$/.exec(marker.value.trim());
    if (archive) { archiveId = uuid.test(archive[1]) ? archive[1] : undefined; continue; }
    if (/^<!-- md-log:[a-f0-9-]+:end -->$/.test(marker.value.trim())) { archiveId = undefined; continue; }
    const event = /^<!-- md-log:event:([a-f0-9]{64}) -->$/.exec(marker.value.trim());
    if (!event || !archiveId) continue;
    let from = marker.position!.end.offset!;
    const to = markers[i + 1]?.position!.start.offset ?? markdown.length;
    while (from < to && /\s/.test(markdown[from])) from++;
    const key = eventKey(archiveId, event[1]);
    if (result.events.has(key) || duplicateEvents.has(key)) { result.events.delete(key); duplicateEvents.add(key); continue; }
    result.events.set(key, { id: event[1], archiveId, from, to, line: lineAt(from), markdown: markdown.slice(from, to).trimEnd() });
  }
  const duplicateCitations = new Set<string>();
  walk(tree, (node) => {
    if (node.type !== "footnoteDefinition" || !/^history-[a-z0-9][a-z0-9-]*$/.test(node.identifier)) return;
    let metadata: string | undefined;
    let url: string | undefined;
    let label = "";
    walk(node, (child) => {
      if (child.type === "html" && child.value.trim().startsWith("<!-- history-ref:")) metadata = child.value.trim();
      if (child.type === "link") { url = child.url; label = plainText(child); }
    });
    if (!metadata) return;
    const from = node.position!.start.offset!;
    try {
      const match = /^<!--\s*history-ref:v(\d+)\s+(\{.*\})\s*-->$/s.exec(metadata);
      if (!match || match[1] !== "1") throw new Error("不支持的历史引用版本或注释格式");
      const reference = validate(JSON.parse(match[2]));
      if (!url || !label.startsWith("回顾·") || !label.slice(3).trim()) throw new Error("缺少回顾标签或转录链接");
      const link = new URL(url);
      if (link.hash !== `#mdlog-${reference.event_ids[0]}`) throw new Error("链接与首个事件 ID 不一致");
      link.hash = "";
      if (link.href !== new URL(reference.archive_uri).href) throw new Error("链接与转录 URI 不一致");
      if (result.citations.has(node.identifier) || duplicateCitations.has(node.identifier)) {
        result.citations.delete(node.identifier); duplicateCitations.add(node.identifier);
        throw new Error("历史脚注编号重复");
      }
      result.citations.set(node.identifier, { id: node.identifier, label, reference, from, to: node.position!.end.offset! });
    } catch (error) {
      result.issues.push({ line: lineAt(from) + 1, message: `${node.identifier}：${error instanceof Error ? error.message : String(error)}` });
    }
  });
  walk(tree, (node) => {
    if (node.type !== "footnoteReference") return;
    const citation = result.citations.get(node.identifier);
    if (citation) result.occurrences.push({ from: node.position!.start.offset!, to: node.position!.end.offset!, citation });
  });
  return result;
}

export function locateHistory(document: HistoryDocument, reference: HistoryReference): HistoryEvent[] {
  const events = reference.event_ids.map((id) => document.events.get(eventKey(reference.archive_id, id)));
  if (events.some((event) => !event)) throw new Error("被引用的历史记录缺失，或转录 UUID／事件 ID 不匹配。");
  const found = events as HistoryEvent[];
  if (found.some((event, i) => i > 0 && event.from <= found[i - 1].from)) throw new Error("被引用事件的顺序与原记录不一致。");
  if (reference.quote && !found[0].markdown.includes(reference.quote)) throw new Error("原文锚点与历史记录不匹配，未定位到其他文字。");
  return found;
}

export function historyPosition(text: string, event: HistoryEvent, quote?: string): { from: number; to: number; line: number } {
  const from = event.from + (quote ? event.markdown.indexOf(quote) : 0);
  const to = quote ? from + quote.length : from;
  return { from, to, line: text.slice(0, from).split("\n").length - 1 };
}
