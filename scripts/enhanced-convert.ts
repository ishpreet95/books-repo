import EPub from "epub";
import * as fs from "fs-extra";
import * as path from "path";
import TurndownService from "turndown";
import * as YAML from "yaml";

interface Chapter {
  id: string;
  title?: string;
  order: number;
  filename: string;
}

interface BookMetadata {
  title: string;
  author: string;
  language: string;
  publicationDate?: string;
  description?: string;
  isbn?: string;
  genre?: string;
  totalChapters: number;
  processingDate: string;
}

interface TableOfContents {
  book: {
    title: string;
    author: string;
    totalChapters: number;
  };
  chapters: Chapter[];
}

interface ProcessingConfig {
  outputFormats: string[];
  chapterNaming: "numbered" | "titled" | "both";
  includeFullText: boolean;
  cleanupTemp: boolean;
}

class BookProcessor {
  private turndownService: TurndownService;
  private config: ProcessingConfig;

  constructor(config: Partial<ProcessingConfig> = {}) {
    this.turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
    });

    this.config = {
      outputFormats: ["markdown", "text"],
      chapterNaming: "both",
      includeFullText: true,
      cleanupTemp: true,
      ...config,
    };
  }

  private sanitizeFilename(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "") // Remove special characters
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .replace(/-+/g, "-") // Replace multiple hyphens with single
      .trim();
  }

  private generateChapterFilename(chapter: any, index: number): string {
    const chapterNum = String(index + 1).padStart(2, "0");
    let filename = chapterNum;

    if (
      this.config.chapterNaming === "titled" ||
      this.config.chapterNaming === "both"
    ) {
      const title = chapter.title || `chapter-${index + 1}`;
      const sanitizedTitle = this.sanitizeFilename(title);

      if (this.config.chapterNaming === "both") {
        filename = `${chapterNum}-${sanitizedTitle}`;
      } else {
        filename = sanitizedTitle;
      }
    }

    return `${filename}.md`;
  }

  private async createDirectoryStructure(bookDir: string): Promise<void> {
    const dirs = [
      path.join(bookDir, "source"),
      path.join(bookDir, "content", "chapters"),
      path.join(bookDir, "audio", "chapters"),
      path.join(bookDir, "processing", "logs"),
      path.join(bookDir, "processing", "temp"),
    ];

    for (const dir of dirs) {
      await fs.ensureDir(dir);
    }
  }

  private async logProcessing(
    bookDir: string,
    message: string,
    level: "info" | "error" | "warn" = "info"
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}\n`;

    const logFile = path.join(bookDir, "processing", "logs", "conversion.log");
    await fs.appendFile(logFile, logMessage);

    console.log(logMessage.trim());
  }

  async convertEpubToMarkdown(
    epubPath: string,
    customBookName?: string
  ): Promise<string> {
    if (!(await fs.pathExists(epubPath))) {
      throw new Error(`EPUB file not found: ${epubPath}`);
    }

    const epub = new EPub(epubPath);
    const bookName =
      customBookName || path.basename(epubPath, path.extname(epubPath));
    const bookSlug = this.sanitizeFilename(bookName);
    const bookDir = path.join(process.cwd(), "books", bookSlug);

    // Create directory structure
    await this.createDirectoryStructure(bookDir);
    await this.logProcessing(bookDir, `Starting conversion of: ${bookName}`);

    // Copy original epub to source directory if not already there
    const sourceEpubPath = path.join(bookDir, "source", `${bookSlug}.epub`);
    if (path.resolve(epubPath) !== path.resolve(sourceEpubPath)) {
      await fs.copy(epubPath, sourceEpubPath);
      await this.logProcessing(
        bookDir,
        `Copied source EPUB to: ${sourceEpubPath}`
      );
    } else {
      await this.logProcessing(
        bookDir,
        `Source EPUB already in place: ${sourceEpubPath}`
      );
    }

    return new Promise((resolve, reject) => {
      epub.on("end", async () => {
        try {
          // Extract and save metadata
          const metadata: BookMetadata = {
            title: epub.metadata.title || bookName,
            author: epub.metadata.creator || "Unknown Author",
            language: epub.metadata.language || "en",
            publicationDate: epub.metadata.date,
            description: epub.metadata.description,
            isbn: (epub.metadata as any).ISBN,
            totalChapters: epub.flow.length,
            processingDate: new Date().toISOString(),
          };

          await fs.writeFile(
            path.join(bookDir, "metadata.yml"),
            YAML.stringify(metadata, { indent: 2 })
          );

          // Process chapters
          const chapters: Chapter[] = [];
          const fullTextParts: string[] = [];

          for (let i = 0; i < epub.flow.length; i++) {
            const chapterData = epub.flow[i];
            const filename = this.generateChapterFilename(chapterData, i);

            chapters.push({
              id: chapterData.id,
              title: chapterData.title || `Chapter ${i + 1}`,
              order: i + 1,
              filename: filename,
            });
          }

          // Create table of contents
          const toc: TableOfContents = {
            book: {
              title: metadata.title,
              author: metadata.author,
              totalChapters: metadata.totalChapters,
            },
            chapters: chapters,
          };

          await fs.writeFile(
            path.join(bookDir, "toc.yml"),
            YAML.stringify(toc, { indent: 2 })
          );

          // Process each chapter
          const chapterPromises = epub.flow.map((chapterData, i) => {
            return new Promise<void>((chapterResolve, chapterReject) => {
              epub.getChapter(
                chapterData.id,
                async (error: Error | null, html: string) => {
                  if (error) {
                    await this.logProcessing(
                      bookDir,
                      `Error processing chapter ${chapterData.id}: ${error.message}`,
                      "error"
                    );
                    chapterReject(error);
                    return;
                  }

                  try {
                    // Convert HTML to Markdown
                    const markdown = this.turndownService.turndown(html);
                    const chapterFileName = chapters[i].filename;

                    // Add chapter header
                    const chapterContent = `# ${chapters[i].title}\n\n${markdown}`;

                    // Save individual chapter
                    const chapterPath = path.join(
                      bookDir,
                      "content",
                      "chapters",
                      chapterFileName
                    );
                    await fs.writeFile(chapterPath, chapterContent);

                    // Add to full text if enabled
                    if (this.config.includeFullText) {
                      fullTextParts[i] = chapterContent;
                    }

                    await this.logProcessing(
                      bookDir,
                      `Processed chapter: ${chapterFileName}`
                    );
                    chapterResolve();
                  } catch (processingError) {
                    await this.logProcessing(
                      bookDir,
                      `Error processing chapter content: ${processingError}`,
                      "error"
                    );
                    chapterReject(processingError);
                  }
                }
              );
            });
          });

          // Wait for all chapters to be processed
          await Promise.all(chapterPromises);

          // Create full text file if enabled
          if (this.config.includeFullText && fullTextParts.length > 0) {
            const fullText = fullTextParts.join("\n\n---\n\n");
            const fullTextHeader = `# ${metadata.title}\n*by ${metadata.author}*\n\n---\n\n`;

            await fs.writeFile(
              path.join(bookDir, "content", "full-text.md"),
              fullTextHeader + fullText
            );

            await this.logProcessing(bookDir, "Created full-text.md");
          }

          // Generate plain text versions if requested
          if (this.config.outputFormats.includes("text")) {
            await this.generateTextVersions(bookDir, chapters);
          }

          // Cleanup temp files if enabled
          if (this.config.cleanupTemp) {
            await fs.remove(path.join(bookDir, "processing", "temp"));
            await fs.ensureDir(path.join(bookDir, "processing", "temp"));
          }

          await this.logProcessing(
            bookDir,
            "Conversion completed successfully!"
          );
          resolve(bookDir);
        } catch (error) {
          await this.logProcessing(
            bookDir,
            `Conversion failed: ${error}`,
            "error"
          );
          reject(error);
        }
      });

      epub.on("error", async (error) => {
        await this.logProcessing(
          bookDir,
          `EPUB parsing error: ${error}`,
          "error"
        );
        reject(error);
      });

      epub.parse();
    });
  }

  private async generateTextVersions(
    bookDir: string,
    chapters: Chapter[]
  ): Promise<void> {
    const textDir = path.join(bookDir, "content", "text");
    await fs.ensureDir(textDir);

    // Convert each markdown chapter to plain text
    for (const chapter of chapters) {
      const markdownPath = path.join(
        bookDir,
        "content",
        "chapters",
        chapter.filename
      );
      const textPath = path.join(
        textDir,
        chapter.filename.replace(".md", ".txt")
      );

      if (await fs.pathExists(markdownPath)) {
        const markdown = await fs.readFile(markdownPath, "utf-8");
        // Simple markdown to text conversion (remove markdown syntax)
        const plainText = markdown
          .replace(/^#{1,6}\s+/gm, "") // Remove headers
          .replace(/\*\*(.*?)\*\*/g, "$1") // Remove bold
          .replace(/\*(.*?)\*/g, "$1") // Remove italic
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Remove links, keep text
          .replace(/```[\s\S]*?```/g, "") // Remove code blocks
          .replace(/`([^`]+)`/g, "$1") // Remove inline code
          .replace(/^\s*[-*+]\s+/gm, "• ") // Convert list markers
          .replace(/\n{3,}/g, "\n\n"); // Normalize line breaks

        await fs.writeFile(textPath, plainText);
      }
    }

    await this.logProcessing(bookDir, "Generated plain text versions");
  }
}

// CLI usage
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage: ts-node enhanced-convert.ts <epub-path> [book-name]

Examples:
  ts-node enhanced-convert.ts ./books/mythos/source/mythos.epub
  ts-node enhanced-convert.ts ./source.epub "Custom Book Name"
        `);
    return;
  }

  const epubPath = path.resolve(args[0]);
  const customBookName = args[1];

  const processor = new BookProcessor({
    outputFormats: ["markdown", "text"],
    chapterNaming: "both",
    includeFullText: true,
    cleanupTemp: true,
  });

  try {
    const bookDir = await processor.convertEpubToMarkdown(
      epubPath,
      customBookName
    );
    console.log(`\n✅ Book successfully processed!`);
    console.log(`📁 Output directory: ${bookDir}`);
    console.log(`📖 Ready for TTS processing!`);
  } catch (error) {
    console.error(`\n❌ Conversion failed:`, error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { BookProcessor, BookMetadata, TableOfContents, ProcessingConfig };
