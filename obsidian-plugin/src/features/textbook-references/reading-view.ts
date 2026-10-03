import type { MarkdownPostProcessorContext } from "obsidian";
import type { FeatureContext } from "../../core/feature";
import type { CitationDocumentStore } from "./document-store";
import { createCitationButton } from "./ui";

export async function renderReadingView(element: HTMLElement, renderContext: MarkdownPostProcessorContext, context: FeatureContext, documents: CitationDocumentStore): Promise<void> {
  if (!context.settings.textbookReferences.enabled) return;
  const section = renderContext.getSectionInfo(element);
  const source = section ? {
    text: section.text,
    document: documents.parse(`${renderContext.sourcePath}#${renderContext.docId}`, section.text)
  } : await documents.read(context.plugin.app, renderContext.sourcePath);
  if (!source?.document.citations.size) return;
  const { document } = source;
  const cache = context.plugin.app.metadataCache.getCache(renderContext.sourcePath);
  const footnoteOrder = section ? document.footnoteOrder : (cache?.footnoteRefs?.length
    ? [...new Set(cache.footnoteRefs.map((reference) => reference.id))] : document.footnoteOrder);
  const nativeDefinitions = new Set<string>();
  for (const sup of element.querySelectorAll<HTMLElement>("sup.footnote-ref")) {
    // A Live Preview callout numbers its footnotes locally; the source ID remains
    // available on data-footref and must take precedence over the visible number.
    const link = sup.querySelector<HTMLAnchorElement>("a[data-footref]");
    const id = link?.dataset.footref;
    const citation = id ? document.citations.get(id) : undefined;
    if (citation) {
      if (link?.hash) nativeDefinitions.add(link.hash.slice(1));
      sup.replaceWith(createCitationButton(citation, context, element.ownerDocument));
    }
  }
  for (const definition of element.querySelectorAll<HTMLElement>("li[data-footnote-id]")) {
    const index = /^fn-(\d+)(?:-|$)/.exec(definition.dataset.footnoteId ?? "");
    const id = index ? footnoteOrder[Number(index[1]) - 1] : undefined;
    const citation = id ? document.citations.get(id) : undefined;
    const sourceLink = definition.querySelector<HTMLAnchorElement>("a.external-link");
    const matches = citation && sourceLink?.href === `${citation.reference.source_uri}#page=${citation.reference.pdf_page}` && sourceLink.textContent === citation.label;
    if (nativeDefinitions.has(definition.dataset.footnoteId ?? "") || matches) definition.classList.add("foresight-reference-definition");
  }
  for (const list of element.querySelectorAll<HTMLElement>(".footnotes")) {
    if (list.querySelectorAll("li").length && !list.querySelector("li:not(.foresight-reference-definition)")) list.classList.add("foresight-reference-definition");
  }
  if (!section) return;
  const firstOffset = section.text.split("\n").slice(0, section.lineStart).join("\n").length + (section.lineStart ? 1 : 0);
  const lastOffset = section.text.split("\n").slice(0, section.lineEnd + 1).join("\n").length;
  const definitions = [...document.citations.values()].filter((citation) => citation.legacy && citation.from >= firstOffset && citation.to <= lastOffset);
  const sourceLines = section.text.split("\n").slice(section.lineStart, section.lineEnd + 1);
  if (definitions.length && sourceLines.every((line, index) => !line.trim() || definitions.some((citation) => citation.line === section.lineStart + index + 1))) {
    element.classList.add("foresight-reference-definition");
    return;
  }
  const legacy = document.legacyMarkers.filter((marker) => marker.from >= firstOffset && marker.to <= lastOffset);
  if (!legacy.length) return;
  const nodes: Text[] = [];
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.parentElement?.closest("code, pre, a, button, svg, .math, .mermaid, li[data-footnote-id], .foresight-reference-definition")) nodes.push(node);
  }
  // Match in source order within this render section, rather than treating repeated [注N]
  // labels in different events as a global footnote ID.
  let next = 0;
  for (const node of nodes) {
    const text = node.textContent ?? "";
    const fragment = element.ownerDocument.createDocumentFragment();
    let cursor = 0;
    for (const match of text.matchAll(/\[(注\d+)\]/g)) {
      if (text[match.index! + match[0].length] === ":" || legacy[next]?.id !== match[1]) continue;
      const marker = legacy[next++];
      if (!marker.citation) continue;
      fragment.append(text.slice(cursor, match.index));
      fragment.append(createCitationButton(marker.citation, context, element.ownerDocument));
      cursor = match.index! + match[0].length;
    }
    if (cursor) { fragment.append(text.slice(cursor)); node.replaceWith(fragment); }
  }
}
