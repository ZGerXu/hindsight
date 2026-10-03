import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFootnoteFromMarkdown } from "mdast-util-gfm-footnote";
import { gfmFootnote } from "micromark-extension-gfm-footnote";
import type { Nodes } from "mdast";
import type { CitationDocument, TextbookReference } from "./model";

function walk(node: Nodes, visit: (node: Nodes, ancestors: Nodes[]) => void, ancestors: Nodes[] = []): void {
  visit(node, ancestors);
  if ("children" in node) for (const child of node.children) walk(child, visit, [...ancestors, node]);
}

function validate(value: unknown): TextbookReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("引用数据必须是 JSON 对象");
  const ref = value as Record<string, unknown>;
  if (typeof ref.source_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(ref.source_sha256)) throw new Error("教材指纹无效");
  if (typeof ref.source_uri !== "string") throw new Error("缺少教材 URI");
  if (!/^file:(?:\/\/[^/]*\/|\/)/.test(ref.source_uri) || ref.source_uri.includes("\\")) throw new Error("教材 URI 必须使用绝对 file: 地址");
  const url = new URL(ref.source_uri);
  if (url.protocol !== "file:" || url.hash || url.search || !decodeURIComponent(url.pathname).toLowerCase().endsWith(".pdf")) {
    throw new Error("教材 URI 必须是无 fragment 的绝对 PDF file: URI");
  }
  if (!Number.isSafeInteger(ref.pdf_page) || (ref.pdf_page as number) < 1) throw new Error("PDF 物理页码必须是正整数");
  if (ref.pdf_page_end !== undefined && (!Number.isSafeInteger(ref.pdf_page_end) || (ref.pdf_page_end as number) < (ref.pdf_page as number))) {
    throw new Error("PDF 末页必须不小于起始页");
  }
  for (const field of ["printed_page", "locator", "quote"]) {
    if (ref[field] !== undefined && (typeof ref[field] !== "string" || !(ref[field] as string).trim())) throw new Error(`${field} 必须是非空字符串`);
  }
  if (typeof ref.quote === "string" && Array.from(ref.quote).length > 120) throw new Error("短引文超过 120 个字符");
  return ref as unknown as TextbookReference;
}

function plainText(node: Nodes): string {
  if ("value" in node) return node.value;
  return "children" in node ? node.children.map(plainText).join("") : "";
}

// The AST supplies footnote association and excludes code, escaped markers, and HTML examples.
// Historical [注N] markers are accepted only with valid metadata in the same md-log event.
export function parseCitations(markdown: string): CitationDocument {
  const tree = fromMarkdown(markdown, { extensions: [gfmFootnote()], mdastExtensions: [gfmFootnoteFromMarkdown()] });
  const result: CitationDocument = { citations: new Map(), occurrences: [], issues: [], footnoteOrder: [], legacyMarkers: [] };
  const events: { from: number; id: string }[] = [];
  walk(tree, (node) => {
    if (node.type !== "html") return;
    const event = /^<!-- md-log:event:([a-f0-9]{64}) -->$/.exec(node.value.trim());
    if (event) events.push({ from: node.position!.start.offset!, id: event[1] });
  });
  const scopeAt = (offset: number) => {
    for (let i = events.length - 1; i >= 0; i--) if (events[i].from < offset) return events[i].id;
    return "document";
  };
  const duplicates = new Set<string>();
  const addDefinition = (node: Nodes, id: string, legacy: boolean, from: number, to: number) => {
    const key = legacy ? `${scopeAt(from)}:${id}` : id;
    const line = markdown.slice(0, from).split("\n").length;
    let metadata: string | undefined;
    let url: string | undefined;
    let label = "原书";
    walk(node, (child) => {
      const offset = child.position?.start.offset ?? -1;
      if (offset < from || offset >= to) return;
      if (child.type === "html" && child.value.trim().startsWith("<!-- textbook-ref:")) metadata = child.value.trim();
      if (child.type === "link") { url = child.url; label = plainText(child); }
    });
    if (!metadata) return;
    try {
      const match = /^<!--\s*textbook-ref:v(\d+)\s+(\{.*\})\s*-->$/s.exec(metadata);
      if (!match || match[1] !== "1") throw new Error("不支持的教材引用版本或注释格式");
      const reference = validate(JSON.parse(match[2]));
      if (!url) throw new Error("缺少可读 PDF 链接");
      const link = new URL(url);
      if (link.hash !== `#page=${reference.pdf_page}`) throw new Error("链接与引用数据的 PDF 页码不一致");
      link.hash = "";
      if (link.href !== new URL(reference.source_uri).href) throw new Error("链接与引用数据的教材 URI 不一致");
      if (result.citations.has(key) || duplicates.has(key)) {
        result.citations.delete(key);
        duplicates.add(key);
        throw new Error("同一范围内引用编号重复，保留原始显示");
      }
      result.citations.set(key, { key, id, label, reference, from, to, line, legacy });
    } catch (error) {
      result.issues.push({ line, message: `${id}：${error instanceof Error ? error.message : String(error)}` });
    }
  };
  walk(tree, (node) => {
    if (node.type === "footnoteDefinition" && /^book-[a-z0-9][a-z0-9-]*$/.test(node.identifier)) {
      addDefinition(node, node.identifier, false, node.position!.start.offset!, node.position!.end.offset!);
    }
    if (node.type !== "paragraph") return;
    // The line is inside a parsed paragraph, so fenced/indented code and HTML blocks never enter here.
    let offset = node.position!.start.offset!;
    for (const line of markdown.slice(offset, node.position!.end.offset!).split(/(?<=\n)/)) {
      const match = /^(?:[ \t]*>[ \t]?)*[ \t]*\[(注\d+)\]:/.exec(line);
      if (match) addDefinition(node, match[1], true, offset, offset + line.length);
      offset += line.length;
    }
  });
  walk(tree, (node, ancestors) => {
    const from = node.position?.start.offset;
    const to = node.position?.end.offset;
    if (from === undefined || to === undefined) return;
    if (node.type === "footnoteReference") {
      if (!result.footnoteOrder.includes(node.identifier)) result.footnoteOrder.push(node.identifier);
      const citation = result.citations.get(node.identifier);
      if (citation) result.occurrences.push({ from, to, citation });
    }
    if (node.type !== "text" || ancestors.some((parent) => ["link", "linkReference", "footnoteDefinition", "definition"].includes(parent.type))) return;
    const raw = markdown.slice(from, to);
    for (const match of raw.matchAll(/\[(注\d+)\]/g)) {
      const start = from + match.index!;
      let escapes = 0;
      for (let i = start - 1; i >= 0 && markdown[i] === "\\"; i--) escapes++;
      if (markdown[start + match[0].length] === ":") continue;
      const citation = escapes % 2 ? undefined : result.citations.get(`${scopeAt(start)}:${match[1]}`);
      result.legacyMarkers.push({ from: start, to: start + match[0].length, id: match[1], citation });
      if (citation) result.occurrences.push({ from: start, to: start + match[0].length, citation });
    }
  });
  result.occurrences.sort((a, b) => a.from - b.from);
  return result;
}
