import { FileSystemAdapter, TFile, type App } from "obsidian";
import { isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { LearningSettings } from "../settings";

export class PdfSourceResolver {
  private hashes = new Map<string, { mtime: number; size: number; hash: Promise<string> }>();

  constructor(private app: App, private settings: LearningSettings) {}

  async fingerprint(file: TFile): Promise<string> {
    const cached = this.hashes.get(file.path);
    if (cached?.mtime === file.stat.mtime && cached.size === file.stat.size) return cached.hash;
    const hash = this.app.vault.readBinary(file).then(async (bytes) => {
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    });
    this.hashes.set(file.path, { mtime: file.stat.mtime, size: file.stat.size, hash });
    try { return await hash; }
    catch (error) { this.hashes.delete(file.path); throw error; }
  }

  async resolve(fingerprint: string, uri: string): Promise<TFile> {
    const candidates = new Set<TFile>();
    const binding = this.app.vault.getAbstractFileByPath(this.settings.pdfBindings[fingerprint] ?? "");
    if (binding instanceof TFile && binding.extension.toLowerCase() === "pdf") candidates.add(binding);
    const adapter = this.app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
      const path = relative(adapter.getBasePath(), fileURLToPath(uri));
      if (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`)) {
        const direct = this.app.vault.getAbstractFileByPath(path.split(sep).join("/"));
        if (direct instanceof TFile && direct.extension.toLowerCase() === "pdf") candidates.add(direct);
      }
    }
    // Lazy fingerprint lookup lets renamed/moved copies work without trusting their filenames.
    for (const file of this.app.vault.getFiles()) if (file.extension.toLowerCase() === "pdf") candidates.add(file);
    for (const file of candidates) if (await this.fingerprint(file) === fingerprint) return file;
    throw new Error("当前 vault 中未找到同版本教材。请将原书 PDF 放入 vault，或在引用菜单中绑定教材。");
  }

  clear(): void { this.hashes.clear(); }
}
