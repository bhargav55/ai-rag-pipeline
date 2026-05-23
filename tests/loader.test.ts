import { describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { loadDocuments } from "../src/loader";

const writeDoc = async (root: string, relativePath: string, text: string) => {
  const fullPath = join(root, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, text, "utf8");
};

const tmpDocsDir = () => join(import.meta.dir, ".tmp", randomUUID());

describe("loadDocuments", () => {
  it("loads markdown and text files with metadata", async () => {
    const docsDir = tmpDocsDir();
    await writeDoc(docsDir, "perps/funding.md", "# Funding\nFunding aligns perp prices.");
    await writeDoc(docsDir, "risk/oracle.txt", "Oracle risk drives liquidation safety.");
    await writeDoc(docsDir, "risk/ignore.pdf", "unsupported");

    await expect(loadDocuments(docsDir)).resolves.toEqual([
      {
        sourcePath: "perps/funding.md",
        extension: ".md",
        sizeBytes: 37,
        domain: "perps",
        text: "# Funding\nFunding aligns perp prices.",
      },
      {
        sourcePath: "risk/oracle.txt",
        extension: ".txt",
        sizeBytes: 38,
        domain: "risk",
        text: "Oracle risk drives liquidation safety.",
      },
    ]);
  });

  it("recursively loads nested supported docs in stable order", async () => {
    const docsDir = tmpDocsDir();
    await writeDoc(docsDir, "zeta/liquidation.md", "Liquidation closes unsafe positions.");
    await writeDoc(docsDir, "alpha/margin.txt", "Margin backs leveraged positions.");

    const docs = await loadDocuments(docsDir);

    expect(docs.map((doc) => doc.sourcePath)).toEqual([
      "alpha/margin.txt",
      "zeta/liquidation.md",
    ]);
  });

  it("loads documents with tenant and site scope when provided", async () => {
    const docsDir = tmpDocsDir();
    await writeDoc(docsDir, "profile.md", "# Profile\nPortfolio summary.");

    await expect(loadDocuments(docsDir, { tenantId: "personal", siteId: "bhargav-portfolio" })).resolves.toEqual([
      {
        sourcePath: "personal/bhargav-portfolio/profile.md",
        extension: ".md",
        sizeBytes: 28,
        domain: "bhargav-portfolio",
        text: "# Profile\nPortfolio summary.",
        tenantId: "personal",
        siteId: "bhargav-portfolio",
      },
    ]);
  });

  it("throws a clean error for missing directories", async () => {
    await expect(loadDocuments("/definitely/missing/docs-dir")).rejects.toThrow(
      "Docs directory not found",
    );
  });
});
