import type { MarkdownPostProcessorContext } from "obsidian";
import type { FeatureContext } from "../../core/feature";
import type { HistoryDocuments } from "./source";
import type { HistoryUI } from "./ui";

export async function renderHistory(element: HTMLElement, renderContext: MarkdownPostProcessorContext, context: FeatureContext, documents: HistoryDocuments, ui: HistoryUI): Promise<void> {
  if (!context.settings.historyReferences.enabled || element.closest(".foresight-history-popover")) return;
  const section = renderContext.getSectionInfo(element);
  const file = context.plugin.app.vault.getFileByPath(renderContext.sourcePath);
  let document = section ? documents.parse(`${renderContext.sourcePath}#${renderContext.docId}`, section.text) : undefined;
  // Re-rendered sections and Live Preview callouts may omit definitions that
  // live elsewhere in the note. Resolve those from the actual full document.
  if (!document?.citations.size && file) document = (await documents.read(file)).document;
  if (!document?.citations.size) return;
  const definitions = new Set<string>();
  for (const sup of element.querySelectorAll<HTMLElement>("sup.footnote-ref")) {
    const link = sup.querySelector<HTMLAnchorElement>("a[data-footref]");
    const citation = link?.dataset.footref ? document.citations.get(link.dataset.footref) : undefined;
    if (!citation) continue;
    if (link?.hash) definitions.add(link.hash.slice(1));
    sup.replaceWith(ui.button(citation, renderContext.sourcePath, element.ownerDocument));
  }
  for (const definition of element.querySelectorAll<HTMLElement>("li[data-footnote-id]")) {
    const link = definition.querySelector<HTMLAnchorElement>("a.external-link");
    const matches = [...document.citations.values()].some((citation) => link?.textContent === citation.label && link.href === `${citation.reference.archive_uri}#mdlog-${citation.reference.event_ids[0]}`);
    if (definitions.has(definition.dataset.footnoteId ?? "") || matches) definition.classList.add("foresight-history-definition");
  }
  for (const list of element.querySelectorAll<HTMLElement>(".footnotes")) {
    if (list.querySelectorAll("li").length && !list.querySelector("li:not(.foresight-history-definition):not(.foresight-reference-definition)")) list.classList.add("foresight-history-definition");
  }
}
