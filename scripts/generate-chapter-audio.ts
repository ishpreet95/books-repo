import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as fs from "fs-extra";
import * as path from "path";
import * as YAML from "yaml";
import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import { UnifiedAudioGenerator } from "./audio-generator";
import { ConfigManager } from "../config/config-manager";
import { TTSProvider, ChapterAudioOptions } from "../config/types";

interface Chapter {
  id: string;
  title: string;
  order: number;
  filename: string;
}

interface BookMetadata {
  title: string;
  author: string;
  totalChapters: number;
}

interface TableOfContents {
  book: BookMetadata;
  chapters: Chapter[];
}

class ChapterAudioGenerator {
  private bookDir: string;
  private provider: TTSProvider;
  private options: ChapterAudioOptions;

  constructor(
    bookDir: string,
    provider?: TTSProvider,
    options: ChapterAudioOptions = {}
  ) {
    this.bookDir = path.resolve(bookDir);
    this.provider = provider || ConfigManager.getDefaultProvider();
    this.options = options;
  }

  async validateBook(): Promise<void> {
    if (!(await fs.pathExists(this.bookDir))) {
      throw new Error(`Book directory not found: ${this.bookDir}`);
    }

    const metadataPath = path.join(this.bookDir, "metadata.yml");
    const tocPath = path.join(this.bookDir, "toc.yml");

    if (!(await fs.pathExists(metadataPath))) {
      throw new Error(
        `Book metadata not found: ${metadataPath}\nRun conversion first with: npm run convert`
      );
    }

    if (!(await fs.pathExists(tocPath))) {
      throw new Error(
        `Table of contents not found: ${tocPath}\nRun conversion first with: npm run convert`
      );
    }
  }

  async loadBookData(): Promise<{
    metadata: BookMetadata;
    toc: TableOfContents;
  }> {
    const metadataPath = path.join(this.bookDir, "metadata.yml");
    const tocPath = path.join(this.bookDir, "toc.yml");

    const metadata: BookMetadata = YAML.parse(
      await fs.readFile(metadataPath, "utf-8")
    );
    const toc: TableOfContents = YAML.parse(
      await fs.readFile(tocPath, "utf-8")
    );

    return { metadata, toc };
  }

  async listChapters(): Promise<void> {
    await this.validateBook();
    const { metadata, toc } = await this.loadBookData();

    console.log(chalk.blue(`\n📚 ${metadata.title} by ${metadata.author}`));
    console.log(
      chalk.cyan(`📑 ${metadata.totalChapters} chapters available:\n`)
    );

    // Check which chapters already have audio
    const audioDir = path.join(this.bookDir, "audio", "chapters");
    const existingAudio = (await fs.pathExists(audioDir))
      ? await fs.readdir(audioDir)
      : [];

    for (const chapter of toc.chapters) {
      const chapterNumber = String(chapter.order).padStart(2, "0");
      const hasAudio = existingAudio.some((file) =>
        file.startsWith(chapterNumber)
      );

      const status = hasAudio ? chalk.green("🎵") : chalk.gray("⚪");
      const chapterInfo = `${chapterNumber}. ${chapter.title}`;

      console.log(`  ${status} ${chapterInfo}`);
    }

    console.log(chalk.gray(`\n🎵 = Audio available, ⚪ = No audio`));
    console.log(
      chalk.magenta(
        `🤖 Current provider: ${
          ConfigManager.getProviderConfig(this.provider).provider.display_name
        }`
      )
    );
    console.log(
      chalk.yellow(
        `\nGenerate audio: npm run chapter-audio ${path.relative(
          process.cwd(),
          this.bookDir
        )} <chapter-number> --provider=${this.provider}`
      )
    );
  }

  async findChapter(identifier: string): Promise<Chapter | null> {
    const { toc } = await this.loadBookData();

    // Try to find by chapter number
    const chapterNum = parseInt(identifier);
    if (!isNaN(chapterNum)) {
      return toc.chapters.find((ch) => ch.order === chapterNum) || null;
    }

    // Try to find by partial title match
    const lowerIdentifier = identifier.toLowerCase();
    return (
      toc.chapters.find((ch) =>
        ch.title.toLowerCase().includes(lowerIdentifier)
      ) || null
    );
  }

  async generateChapterAudio(chapterIdentifier: string): Promise<void> {
    await this.validateBook();
    const { metadata } = await this.loadBookData();

    console.log(chalk.blue(`\n🎵 Chapter Audio Generator`));
    console.log(chalk.cyan(`📚 Book: ${metadata.title}`));
    console.log(
      chalk.magenta(
        `🤖 Provider: ${
          ConfigManager.getProviderConfig(this.provider).provider.display_name
        }`
      )
    );

    // Find the chapter
    const chapter = await this.findChapter(chapterIdentifier);
    if (!chapter) {
      console.error(
        chalk.red(
          `❌ Chapter not found: "${chapterIdentifier}"\nTry: npm run chapter-audio ${path.relative(
            process.cwd(),
            this.bookDir
          )} list`
        )
      );
      return;
    }

    console.log(
      chalk.yellow(
        `🎯 Generating audio for: ${chapter.order}. ${chapter.title}`
      )
    );

    // Check if chapter content exists
    const chapterPath = path.join(
      this.bookDir,
      "content",
      "chapters",
      chapter.filename
    );
    if (!(await fs.pathExists(chapterPath))) {
      throw new Error(`Chapter content not found: ${chapterPath}`);
    }

    // Create a temporary TOC with just this chapter
    const singleChapterToc = {
      book: {
        title: metadata.title,
        author: metadata.author,
        totalChapters: 1,
      },
      chapters: [chapter],
    };

    // Backup original TOC and create single-chapter version
    const originalTocPath = path.join(this.bookDir, "toc.yml");
    const backupTocPath = path.join(
      this.bookDir,
      `.toc-backup-${Date.now()}.yml`
    );

    await fs.copy(originalTocPath, backupTocPath);
    await fs.writeFile(originalTocPath, YAML.stringify(singleChapterToc));

    try {
      // Generate audio using the unified generator
      const generator = new UnifiedAudioGenerator(
        this.bookDir,
        this.provider,
        this.options
      );
      await generator.generateBookAudio();

      console.log(chalk.green(`\n✅ Audio generated successfully!`));

      // Show the generated file
      const audioDir = path.join(
        ConfigManager.getAudioOutputDir(this.bookDir, this.provider),
        "chapters"
      );
      const audioFiles = await fs.readdir(audioDir);
      const chapterAudio = audioFiles.find((file) =>
        file.startsWith(String(chapter.order).padStart(2, "0"))
      );

      if (chapterAudio) {
        const audioPath = path.join(audioDir, chapterAudio);
        const stats = await fs.stat(audioPath);
        console.log(
          chalk.blue(
            `🎵 Generated: ${chapterAudio} (${Math.round(stats.size / 1024)}KB)`
          )
        );
        console.log(chalk.gray(`📁 Location: ${audioPath}`));
      }
    } finally {
      // Restore original TOC
      await fs.move(backupTocPath, originalTocPath, { overwrite: true });
    }
  }

  async generateMultipleChapters(chapterIdentifiers: string[]): Promise<void> {
    console.log(
      chalk.blue(
        `\n🎵 Generating audio for ${chapterIdentifiers.length} chapters`
      )
    );

    for (let i = 0; i < chapterIdentifiers.length; i++) {
      const identifier = chapterIdentifiers[i];
      console.log(
        chalk.cyan(
          `\n[${i + 1}/${
            chapterIdentifiers.length
          }] Processing chapter: ${identifier}`
        )
      );

      try {
        await this.generateChapterAudio(identifier);

        // Add delay between chapters to respect rate limits
        if (i < chapterIdentifiers.length - 1) {
          console.log(
            chalk.gray("⏳ Waiting 3 seconds before next chapter...")
          );
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      } catch (error) {
        console.error(
          chalk.red(`❌ Failed to generate audio for chapter ${identifier}:`),
          error
        );
      }
    }

    console.log(chalk.green(`\n🎉 Batch processing completed!`));
  }

  private sanitizeFilename(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  }
}

// CLI setup
const program = new Command();

program
  .name("generate-chapter-audio")
  .description("Generate TTS audio for individual book chapters")
  .version("1.0.0");

program
  .command("list")
  .description("List all chapters in a book")
  .argument("<book-directory>", "Path to the book directory")
  .option(
    "-p, --provider <provider>",
    "TTS provider (google, openai)",
    "google"
  )
  .action(async (bookDir: string, options: any) => {
    try {
      const generator = new ChapterAudioGenerator(bookDir, options.provider);
      await generator.listChapters();
    } catch (error) {
      console.error(chalk.red("❌ Error:"), error);
      process.exit(1);
    }
  });

program
  .command("generate")
  .description("Generate audio for specific chapter(s)")
  .argument("<book-directory>", "Path to the book directory")
  .argument("<chapters...>", "Chapter number(s) or title(s) to generate")
  .option(
    "-p, --provider <provider>",
    "TTS provider (google, openai)",
    "google"
  )
  .option("-v, --voice <voice>", "Voice to use for generation")
  .option("-m, --model <model>", "Model to use for generation")
  .option("-f, --format <format>", "Audio format")
  .option("--force", "Force regeneration even if audio exists")
  .action(async (bookDir: string, chapters: string[], options: any) => {
    try {
      const audioOptions: ChapterAudioOptions = {
        voice: options.voice,
        model: options.model,
        format: options.format,
        force_regenerate: options.force,
      };

      const generator = new ChapterAudioGenerator(
        bookDir,
        options.provider,
        audioOptions
      );

      if (chapters.length === 1) {
        await generator.generateChapterAudio(chapters[0]);
      } else {
        await generator.generateMultipleChapters(chapters);
      }
    } catch (error) {
      console.error(chalk.red("❌ Error:"), error);
      process.exit(1);
    }
  });

// Default command (for backwards compatibility)
program
  .argument("[book-directory]", "Path to the book directory")
  .argument("[chapter]", "Chapter number or 'list' to show all chapters")
  .option(
    "-p, --provider <provider>",
    "TTS provider (google, openai)",
    "google"
  )
  .option("-v, --voice <voice>", "Voice to use for generation")
  .action(async (bookDir?: string, chapter?: string, options?: any) => {
    if (!bookDir) {
      const availableProviders = ConfigManager.getAvailableProviders();
      console.log(
        chalk.blue(`
🎵 Chapter Audio Generator

Usage:
  npm run chapter-audio <book-dir> list                    # List all chapters
  npm run chapter-audio <book-dir> <chapter-num>           # Generate single chapter
  npm run chapter-audio <book-dir> <ch1> <ch2>...          # Generate multiple chapters

Examples:
  npm run chapter-audio books/mythos list
  npm run chapter-audio books/mythos 10
  npm run chapter-audio books/mythos "out of chaos"
  npm run chapter-audio books/mythos 1 5 10

Options:
  -p, --provider <provider>  TTS provider (${availableProviders.join(", ")})
  -v, --voice <voice>        Voice to use for generation

TTS Providers:
  📱 Google TTS (Gemini 2.5 Flash) - Set GOOGLE_API_KEY
  🤖 OpenAI TTS - Set OPENAI_API_KEY  

Configure providers in config/providers/
        `)
      );
      return;
    }

    try {
      const audioOptions: ChapterAudioOptions = {
        voice: options?.voice,
      };

      const generator = new ChapterAudioGenerator(
        bookDir,
        options?.provider,
        audioOptions
      );

      if (chapter === "list" || !chapter) {
        await generator.listChapters();
      } else {
        await generator.generateChapterAudio(chapter);
      }
    } catch (error) {
      console.error(chalk.red("❌ Error:"), error);
      process.exit(1);
    }
  });

if (require.main === module) {
  program.parse();
}

export { ChapterAudioGenerator };
