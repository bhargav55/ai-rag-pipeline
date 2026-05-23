import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import type { Document, SupportedExtension } from "./types";

const SUPPORTED_EXTENSIONS = new Set<string>([".md", ".txt"]);

export type LoadDocumentsOptions = {
  tenantId?: string;
  siteId?: string;
};

const normalizePath = (path: string) => path.split(/[\\/]+/).join("/");

const inferDomain = (sourcePath: string): string => {
  const [firstPart] = sourcePath.split("/");
  return firstPart.includes(".") ? "general" : firstPart;
};

const scopedSourcePath = (sourcePath: string, { tenantId, siteId }: LoadDocumentsOptions): string => {
  if (!tenantId && !siteId) return sourcePath;
  if (!tenantId || !siteId) {
    throw new Error("tenantId and siteId must be provided together when loading scoped documents");
  }
  return normalizePath(`${tenantId}/${siteId}/${sourcePath}`);
};

const walk = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) return walk(fullPath);
      return [fullPath];
    }),
  );

  return paths.flat();
};

export const loadDocuments = async (docsDir: string, options: LoadDocumentsOptions = {}): Promise<Document[]> => {
  try {
    const info = await stat(docsDir);
    if (!info.isDirectory()) throw new Error("not a directory");
  } catch {
    throw new Error(`Docs directory not found: ${docsDir}`);
  }

  const files = await walk(docsDir);
  const supportedFiles = files
    .filter((file) => SUPPORTED_EXTENSIONS.has(extname(file)))
    .sort((a, b) => normalizePath(relative(docsDir, a)).localeCompare(normalizePath(relative(docsDir, b))));

  return Promise.all(
    supportedFiles.map(async (file) => {
      const text = await readFile(file, "utf8");
      const relativePath = normalizePath(relative(docsDir, file));
      const sourcePath = scopedSourcePath(relativePath, options);
      const extension = extname(file) as SupportedExtension;

      return {
        sourcePath,
        extension,
        sizeBytes: Buffer.byteLength(text, "utf8"),
        domain: options.siteId ?? inferDomain(sourcePath),
        text,
        ...(options.tenantId ? { tenantId: options.tenantId } : {}),
        ...(options.siteId ? { siteId: options.siteId } : {}),
      };
    }),
  );
};
