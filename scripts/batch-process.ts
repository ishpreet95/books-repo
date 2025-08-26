import * as fs from "fs-extra";
import * as path from "path";
import { glob } from "glob";
import chalk from "chalk";
import { Command } from "commander";
import { BookProcessor } from "./enhanced-convert";
import { UnifiedAudioGenerator } from "./audio-generator";

interface BatchOptions {
  sourceDir: string;
  outputDir?: string;
  audioGeneration: boolean;
  skipExisting: boolean;
  configPath?: string;
  fileTypes: string[];
  parallel: boolean;
  maxConcurrent: number;
}

class BatchProcessor {
  private options: BatchOptions;

  constructor(options: BatchOptions) {
    this.options = options;
  }

  private async findBookFiles(): Promise<string[]> {
    const patterns = this.options.fileTypes.map((ext) =>
      path.join(this.options.sourceDir, "**", `*.${ext}`)
    );

    const files: string[] = [];
    for (const pattern of patterns) {
      const matches = await new Promise<string[]>((resolve, reject) => {
        glob(pattern, (err, files) => {
          if (err) reject(err);
          else resolve(files);
        });
      });
      files.push(...matches);
    }

    return files.filter((file) => fs.existsSync(file));
  }

  private async processBook(bookPath: string): Promise<string | null> {
    const bookName = path.basename(bookPath, path.extname(bookPath));
    const bookSlug = bookName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const outputDir =
      this.options.outputDir || path.join(process.cwd(), "books");
    const bookDir = path.join(outputDir, bookSlug);

    console.log(chalk.blue(`\n📖 Processing: ${bookName}`));

    // Check if book already processed
    if (this.options.skipExisting && (await fs.pathExists(bookDir))) {
      const metadataPath = path.join(bookDir, "metadata.yml");
      if (await fs.pathExists(metadataPath)) {
        console.log(
          chalk.yellow(`⏭️  Skipping ${bookName} (already processed)`)
        );
        return bookDir;
      }
    }

    try {
      // Convert book to markdown
      const processor = new BookProcessor({
        outputFormats: ["markdown", "text"],
        chapterNaming: "both",
        includeFullText: true,
        cleanupTemp: true,
      });

      const processedBookDir = await processor.convertEpubToMarkdown(
        bookPath,
        bookName
      );
      console.log(chalk.green(`✅ Converted: ${bookName}`));

      // Generate audio if requested
      if (this.options.audioGeneration) {
        try {
          const audioGenerator = new UnifiedAudioGenerator(
            processedBookDir,
            "google"
          );
          await audioGenerator.generateBookAudio();
          console.log(chalk.green(`🎵 Audio generated: ${bookName}`));
        } catch (audioError) {
          console.error(
            chalk.red(`❌ Audio generation failed for ${bookName}:`),
            audioError
          );
        }
      }

      return processedBookDir;
    } catch (error) {
      console.error(chalk.red(`❌ Processing failed for ${bookName}:`), error);
      return null;
    }
  }

  private async processBooksConcurrently(bookPaths: string[]): Promise<void> {
    const results: Array<Promise<string | null>> = [];
    const semaphore = new Array(this.options.maxConcurrent).fill(null);

    for (let i = 0; i < bookPaths.length; i += this.options.maxConcurrent) {
      const batch = bookPaths.slice(i, i + this.options.maxConcurrent);
      const batchPromises = batch.map((bookPath) => this.processBook(bookPath));
      results.push(...batchPromises);

      // Wait for current batch to complete before starting next
      await Promise.allSettled(batchPromises);
    }

    const finalResults = await Promise.allSettled(results);

    // Summary
    const successful = finalResults.filter(
      (r) => r.status === "fulfilled" && r.value !== null
    ).length;
    const failed = finalResults.length - successful;

    console.log(chalk.green(`\n🎉 Batch processing completed!`));
    console.log(
      chalk.blue(`📊 Results: ${successful} successful, ${failed} failed`)
    );
  }

  private async processBooksSequentially(bookPaths: string[]): Promise<void> {
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < bookPaths.length; i++) {
      const bookPath = bookPaths[i];
      console.log(chalk.cyan(`\n[${i + 1}/${bookPaths.length}]`));

      const result = await this.processBook(bookPath);
      if (result) {
        successful++;
      } else {
        failed++;
      }
    }

    console.log(chalk.green(`\n🎉 Batch processing completed!`));
    console.log(
      chalk.blue(`📊 Results: ${successful} successful, ${failed} failed`)
    );
  }

  async run(): Promise<void> {
    console.log(chalk.blue("🚀 Starting batch processing..."));
    console.log(chalk.cyan(`📂 Source directory: ${this.options.sourceDir}`));
    console.log(
      chalk.cyan(`📁 Output directory: ${this.options.outputDir || "books/"}`)
    );
    console.log(
      chalk.cyan(
        `🎵 Audio generation: ${
          this.options.audioGeneration ? "enabled" : "disabled"
        }`
      )
    );

    // Find all book files
    const bookFiles = await this.findBookFiles();

    if (bookFiles.length === 0) {
      console.log(chalk.yellow("⚠️  No book files found"));
      return;
    }

    console.log(chalk.green(`📚 Found ${bookFiles.length} book files`));
    bookFiles.forEach((file, index) => {
      console.log(
        chalk.gray(
          `  ${index + 1}. ${path.relative(this.options.sourceDir, file)}`
        )
      );
    });

    // Process books
    if (this.options.parallel && bookFiles.length > 1) {
      await this.processBooksConcurrently(bookFiles);
    } else {
      await this.processBooksSequentially(bookFiles);
    }
  }
}

// CLI setup
const program = new Command();

program
  .name("batch-process")
  .description(
    "Batch process multiple books (EPUB, PDF, etc.) to markdown and audio"
  )
  .version("1.0.0");

program
  .argument("<source-directory>", "Directory containing book files")
  .option(
    "-o, --output <directory>",
    "Output directory for processed books",
    "books"
  )
  .option("-a, --audio", "Generate audio files using TTS", false)
  .option(
    "-s, --skip-existing",
    "Skip books that have already been processed",
    false
  )
  .option("-c, --config <path>", "Path to TTS configuration file")
  .option(
    "-t, --types <types>",
    "File types to process (comma-separated)",
    "epub,pdf"
  )
  .option(
    "-p, --parallel",
    "Process books in parallel (faster but more resource intensive)",
    false
  )
  .option("-m, --max-concurrent <number>", "Maximum concurrent processes", "2")
  .action(async (sourceDirectory: string, options: any) => {
    const batchOptions: BatchOptions = {
      sourceDir: path.resolve(sourceDirectory),
      outputDir: options.output ? path.resolve(options.output) : undefined,
      audioGeneration: options.audio,
      skipExisting: options.skipExisting,
      configPath: options.config ? path.resolve(options.config) : undefined,
      fileTypes: options.types.split(",").map((t: string) => t.trim()),
      parallel: options.parallel,
      maxConcurrent: parseInt(options.maxConcurrent),
    };

    // Validate source directory
    if (!(await fs.pathExists(batchOptions.sourceDir))) {
      console.error(
        chalk.red(`❌ Source directory not found: ${batchOptions.sourceDir}`)
      );
      process.exit(1);
    }

    // Validate config file if provided
    if (
      batchOptions.configPath &&
      !(await fs.pathExists(batchOptions.configPath))
    ) {
      console.error(
        chalk.red(`❌ Config file not found: ${batchOptions.configPath}`)
      );
      process.exit(1);
    }

    try {
      const processor = new BatchProcessor(batchOptions);
      await processor.run();
    } catch (error) {
      console.error(chalk.red("❌ Batch processing failed:"), error);
      process.exit(1);
    }
  });

// Add examples to help
program.addHelpText(
  "after",
  `

Examples:
  $ npm run batch-process ./my-books                    # Process all books in ./my-books
  $ npm run batch-process ./my-books -a                 # Process books and generate audio
  $ npm run batch-process ./my-books -o ./processed     # Custom output directory
  $ npm run batch-process ./my-books -t epub,pdf -p     # Process EPUB and PDF files in parallel
  $ npm run batch-process ./my-books -a -c ./my-tts.yml # Custom TTS config

Supported file types: epub, pdf (more coming soon)

Environment Variables:
  OPENAI_API_KEY     - Required for OpenAI TTS
  ELEVENLABS_API_KEY - Required for ElevenLabs TTS
`
);

if (require.main === module) {
  program.parse();
}

export { BatchProcessor, BatchOptions };
