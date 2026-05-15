import { chunkDocument } from "./chunker";
import type { Chunk, ChunkOptions, Document } from "./types";

type MarkdownSection = {
  headingPath: string[];
  text: string;
};

const headingPattern = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";

const validateChunkOptions = (options: ChunkOptions): void => {
  if (options.maxChars <= 0) throw new Error("maxChars must be greater than 0");
  if (options.overlapChars < 0) throw new Error("overlapChars must be non-negative");
  if (options.overlapChars >= options.maxChars) {
    throw new Error("overlapChars must be smaller than maxChars");
  }
};

const parseMarkdownSections = (text: string): MarkdownSection[] => {
  const sections: MarkdownSection[] = [];
  const headingStack: string[] = [];
  let currentLines: string[] = [];
  let currentHeadingPath: string[] = [];

  const flush = (): void => {
    const sectionText = currentLines.join("\n").trim();
    if (!sectionText) return;

    sections.push({
      headingPath: [...currentHeadingPath],
      text: sectionText,
    });
  };

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(headingPattern);

    if (match) {
      flush();

      const level = match[1].length;
      const heading = match[2].trim();
      headingStack[level - 1] = heading;
      headingStack.length = level;
      currentHeadingPath = headingStack.slice();
      currentLines = [line];
      continue;
    }

    currentLines.push(line);
  }

  flush();
  return sections;
};

const withHeadingContext = (section: MarkdownSection): string => {
  if (section.headingPath.length <= 1) return section.text;
  return `# ${section.headingPath.join(" > ")}\n\n${section.text}`;
};

export const chunkMarkdownDocument = (doc: Document, options: ChunkOptions): Chunk[] => {
  validateChunkOptions(options);

  if (doc.extension !== ".md") {
    return chunkDocument(doc, options);
  }

  const sections = parseMarkdownSections(doc.text);
  if (sections.length === 0) {
    return chunkDocument(doc, options);
  }

  const chunks: Chunk[] = [];

  for (const section of sections) {
    const sectionText = withHeadingContext(section);
    const sectionSlug = section.headingPath.map(slugify).join("-") || "preamble";
    const sectionDoc: Document = { ...doc, text: sectionText };
    const sectionChunks = chunkDocument(sectionDoc, options);

    for (const sectionChunk of sectionChunks) {
      const index = chunks.length;
      chunks.push({
        ...sectionChunk,
        id: `${doc.sourcePath}#section-${sectionSlug}-chunk-${index}`,
        index,
        headingPath: section.headingPath.length > 0 ? [...section.headingPath] : undefined,
      });
    }
  }

  return chunks;
};
