import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as fs from "fs-extra";
import * as path from "path";
import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import { UnifiedAudioGenerator } from "./audio-generator";
import { ConfigManager } from "../config/config-manager";
import { TTSProvider, ChapterAudioOptions } from "../config/types";

interface TestOptions {
  provider: TTSProvider;
  voice?: string;
  model?: string;
  format?: string;
  outputDir: string;
  interactive: boolean;
}

class TTSTestTool {
  private options: TestOptions;

  constructor(options: TestOptions) {
    this.options = options;
  }

  private async ensureOutputDir(): Promise<void> {
    await fs.ensureDir(this.options.outputDir);
  }

  private generateTestFilename(
    text: string,
    provider: TTSProvider,
    voice?: string
  ): string {
    // Create a short identifier from the text
    const textId = text
      .slice(0, 30)
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const voiceSuffix = voice ? `-${voice}` : "";
    const config = ConfigManager.getProviderConfig(provider);
    const extension = config.audio.default_format.extension;

    return `test-${provider}${voiceSuffix}-${textId}-${timestamp}.${extension}`;
  }

  private async createTempBook(text: string): Promise<string> {
    const tempDir = path.join(this.options.outputDir, ".temp-book");
    await fs.ensureDir(tempDir);

    // Create minimal book structure
    const dirs = [
      path.join(tempDir, "content", "chapters"),
      path.join(tempDir, "processing", "logs"),
    ];

    for (const dir of dirs) {
      await fs.ensureDir(dir);
    }

    // Create metadata
    const metadata = {
      title: "TTS Test",
      author: "Test User",
      totalChapters: 1,
      processingDate: new Date().toISOString(),
    };

    await fs.writeFile(
      path.join(tempDir, "metadata.yml"),
      `title: "${metadata.title}"\nauthor: "${metadata.author}"\ntotalChapters: ${metadata.totalChapters}\nprocessingDate: "${metadata.processingDate}"\n`
    );

    // Create chapter content
    const chapterContent = `# Test Chapter\n\n${text}`;
    await fs.writeFile(
      path.join(tempDir, "content", "chapters", "01-test.md"),
      chapterContent
    );

    // Create TOC
    const toc = {
      book: {
        title: metadata.title,
        author: metadata.author,
        totalChapters: metadata.totalChapters,
      },
      chapters: [
        {
          id: "test-chapter",
          title: "Test Chapter",
          order: 1,
          filename: "01-test.md",
        },
      ],
    };

    await fs.writeFile(
      path.join(tempDir, "toc.yml"),
      `book:\n  title: "${toc.book.title}"\n  author: "${toc.book.author}"\n  totalChapters: ${toc.book.totalChapters}\nchapters:\n  - id: "${toc.chapters[0].id}"\n    title: "${toc.chapters[0].title}"\n    order: ${toc.chapters[0].order}\n    filename: "${toc.chapters[0].filename}"\n`
    );

    return tempDir;
  }

  async generateTestAudio(text: string): Promise<void> {
    await this.ensureOutputDir();

    console.log(chalk.blue("\n🎵 TTS Test Tool"));
    console.log(
      chalk.cyan(
        `🤖 Provider: ${
          ConfigManager.getProviderConfig(this.options.provider).provider
            .display_name
        }`
      )
    );
    console.log(
      chalk.yellow(
        `📝 Text: "${text.slice(0, 50)}${text.length > 50 ? "..." : ""}"`
      )
    );

    const startTime = Date.now();

    try {
      // Create temporary book structure
      const tempBookDir = await this.createTempBook(text);

      // Generate audio
      const audioOptions: ChapterAudioOptions = {
        voice: this.options.voice,
        model: this.options.model,
        format: this.options.format,
        force_regenerate: true,
      };

      const generator = new UnifiedAudioGenerator(
        tempBookDir,
        this.options.provider,
        audioOptions
      );

      await generator.generateBookAudio();

      // Find and copy the generated audio file
      const tempAudioDir = path.join(
        ConfigManager.getAudioOutputDir(tempBookDir, this.options.provider),
        "chapters"
      );

      const audioFiles = await fs.readdir(tempAudioDir);
      if (audioFiles.length > 0) {
        const generatedFile = path.join(tempAudioDir, audioFiles[0]);
        const finalFilename = this.generateTestFilename(
          text,
          this.options.provider,
          this.options.voice
        );
        const finalPath = path.join(this.options.outputDir, finalFilename);

        await fs.copy(generatedFile, finalPath);

        const stats = await fs.stat(finalPath);
        const duration = Date.now() - startTime;

        console.log(chalk.green(`\n✅ Audio generated successfully!`));
        console.log(chalk.blue(`🎵 File: ${finalFilename}`));
        console.log(chalk.gray(`📁 Location: ${finalPath}`));
        console.log(chalk.gray(`📊 Size: ${Math.round(stats.size / 1024)}KB`));
        console.log(chalk.gray(`⏱️  Time: ${Math.round(duration / 1000)}s`));

        // Clean up temp directory
        await fs.remove(tempBookDir);
      } else {
        throw new Error("No audio file was generated");
      }
    } catch (error) {
      console.error(chalk.red(`❌ Error generating audio:`), error);
      throw error;
    }
  }

  async runInteractive(): Promise<void> {
    console.log(chalk.blue("🎵 Interactive TTS Test Tool\n"));

    while (true) {
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "text",
          message: "Enter text to convert to speech (or 'quit' to exit):",
          validate: (input: string) => {
            if (input.trim() === "") return "Please enter some text";
            if (input.length > 5000)
              return "Text is too long (max 5000 characters)";
            return true;
          },
        },
      ]);

      if (answers.text.toLowerCase() === "quit") {
        console.log(chalk.yellow("👋 Goodbye!"));
        break;
      }

      try {
        await this.generateTestAudio(answers.text);

        const continueAnswer = await inquirer.prompt([
          {
            type: "confirm",
            name: "continue",
            message: "Generate another audio test?",
            default: true,
          },
        ]);

        if (!continueAnswer.continue) {
          break;
        }
      } catch (error) {
        console.error(chalk.red("Failed to generate audio. Try again."));
      }

      console.log(); // Add spacing
    }
  }

  async runWithPresetTexts(): Promise<void> {
    const presetTexts = [
      "Hello, this is a test of the text-to-speech system. How does it sound?",
      "The quick brown fox jumps over the lazy dog. This pangram contains every letter of the alphabet.",
      "In the beginning was the Word, and the Word was with God, and the Word was God.",
      "To be, or not to be, that is the question: Whether 'tis nobler in the mind to suffer the slings and arrows of outrageous fortune.",
      "Four score and seven years ago our fathers brought forth on this continent, a new nation, conceived in Liberty, and dedicated to the proposition that all men are created equal.",
    ];

    console.log(chalk.blue("🎵 Running preset text tests...\n"));

    for (let i = 0; i < presetTexts.length; i++) {
      const text = presetTexts[i];
      console.log(
        chalk.cyan(`\n[${i + 1}/${presetTexts.length}] Testing preset text...`)
      );

      try {
        await this.generateTestAudio(text);

        // Small delay between tests
        if (i < presetTexts.length - 1) {
          console.log(chalk.gray("⏳ Waiting 2 seconds before next test..."));
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(chalk.red(`❌ Failed preset test ${i + 1}`));
      }
    }

    console.log(chalk.green("\n🎉 All preset tests completed!"));
  }
}

// CLI setup
const program = new Command();

program
  .name("test-tts")
  .description("Test TTS providers with custom text input")
  .version("1.0.0");

program
  .argument(
    "[text]",
    "Text to convert to speech (if not provided, runs interactively)"
  )
  .option(
    "-p, --provider <provider>",
    "TTS provider (google, openai)",
    "google"
  )
  .option("-v, --voice <voice>", "Voice to use for generation")
  .option("-m, --model <model>", "Model to use for generation")
  .option("-f, --format <format>", "Audio format")
  .option(
    "-o, --output <directory>",
    "Output directory for test files",
    "./tts-tests"
  )
  .option("-i, --interactive", "Run in interactive mode", false)
  .option("--presets", "Run tests with preset text samples", false)
  .action(async (text?: string, options?: any) => {
    const testOptions: TestOptions = {
      provider: options.provider as TTSProvider,
      voice: options.voice,
      model: options.model,
      format: options.format,
      outputDir: path.resolve(options.output),
      interactive: options.interactive,
    };

    // Validate provider
    if (!ConfigManager.isProviderAvailable(testOptions.provider)) {
      console.error(
        chalk.red(`❌ Provider '${testOptions.provider}' not available`)
      );
      console.log(
        chalk.yellow(
          `Available providers: ${ConfigManager.getAvailableProviders().join(
            ", "
          )}`
        )
      );
      process.exit(1);
    }

    // Validate configuration
    const validation = ConfigManager.validateProviderConfig(
      testOptions.provider
    );
    if (!validation.valid) {
      console.error(chalk.red("❌ Provider configuration invalid:"));
      validation.errors.forEach((error) =>
        console.error(chalk.red(`  • ${error}`))
      );
      process.exit(1);
    }

    try {
      const tester = new TTSTestTool(testOptions);

      if (options.presets) {
        await tester.runWithPresetTexts();
      } else if (text && !options.interactive) {
        await tester.generateTestAudio(text);
      } else {
        await tester.runInteractive();
      }
    } catch (error) {
      console.error(chalk.red("❌ TTS test failed:"), error);
      process.exit(1);
    }
  });

// Add examples to help
program.addHelpText(
  "after",
  `

Examples:
  $ npm run test-tts "Hello world"                    # Quick test with default provider
  $ npm run test-tts "Hello world" -p openai -v nova # Test with OpenAI and nova voice
  $ npm run test-tts -i                               # Interactive mode
  $ npm run test-tts --presets                        # Run preset text samples
  $ npm run test-tts -p google -v Kore -o ./my-tests  # Custom output directory

Interactive Mode:
  • Enter text and get instant audio
  • Test different phrases quickly
  • Perfect for voice comparison

Preset Mode:
  • Tests common phrases automatically
  • Good for provider comparison
  • Includes pangrams and famous quotes

Output:
  Files saved as: test-<provider>-<voice>-<text-snippet>-<timestamp>.<ext>
`
);

if (require.main === module) {
  program.parse();
}

export { TTSTestTool };
