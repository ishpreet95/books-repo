import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as fs from "fs-extra";
import * as path from "path";
import axios from "axios";
import { OpenAI } from "openai";
import chalk from "chalk";
import ProgressBar from "progress";
import { ConfigManager } from "../config/config-manager";
import {
  TTSProvider,
  ChapterAudioOptions,
  TTSProviderConfig,
} from "../config/types";

interface Chapter {
  id: string;
  title: string;
  order: number;
  filename: string;
}

interface BookMetadata {
  title: string;
  author: string;
  language: string;
  totalChapters: number;
}

interface GoogleTTSRequest {
  contents: Array<{
    parts: Array<{
      text: string;
    }>;
  }>;
  generationConfig: {
    responseModalities: string[];
    speechConfig?: {
      multiSpeakerVoiceConfig?: {
        speakerVoiceConfigs: Array<{
          speaker: string;
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: string;
            };
          };
        }>;
      };
      voiceConfig?: {
        prebuiltVoiceConfig: {
          voiceName: string;
        };
      };
    };
  };
  model: string;
}

interface GoogleTTSResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        inlineData?: {
          mimeType: string;
          data: string;
        };
      }>;
    };
  }>;
}

export class UnifiedAudioGenerator {
  private provider: TTSProvider;
  private config: TTSProviderConfig;
  private bookDir: string;
  private logFile: string;
  private openai?: OpenAI;
  private options: Required<ChapterAudioOptions>;

  constructor(
    bookDir: string,
    provider: TTSProvider = "google",
    options: ChapterAudioOptions = {}
  ) {
    this.bookDir = bookDir;
    this.provider = provider;
    this.config = ConfigManager.getProviderConfig(provider);
    this.options = ConfigManager.getEffectiveOptions(provider, options);

    // Set up provider-specific logging
    const logsDir = ConfigManager.getLogsDir(bookDir, provider);
    this.logFile = path.join(logsDir, "audio-generation.log");

    // Ensure log directory exists
    fs.ensureDirSync(logsDir);

    // Initialize providers
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Initialize OpenAI client if this is the OpenAI provider
    if (this.provider === "openai") {
      const apiKey = process.env[this.config.auth.api_key_env];
      if (apiKey) {
        this.openai = new OpenAI({
          apiKey: apiKey,
        });
      }
    }
  }

  private async log(
    message: string,
    level: "info" | "error" | "warn" = "info"
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}\n`;

    await fs.appendFile(this.logFile, logMessage);

    // Console output with colors
    const coloredMessage =
      level === "error"
        ? chalk.red(message)
        : level === "warn"
        ? chalk.yellow(message)
        : chalk.blue(message);
    console.log(
      chalk.gray(`[${timestamp.split("T")[1].split(".")[0]}]`) +
        " " +
        coloredMessage
    );
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private normalizeTextForTTS(text: string): string {
    const globalSettings = ConfigManager.getGlobalSettings();

    if (!globalSettings.text_processing.clean_markdown) return text;

    let normalized = text;

    // Skip footnotes if configured
    if (globalSettings.text_processing.remove_footnotes) {
      normalized = normalized.replace(/\[\d+\]/g, "");
      normalized = normalized.replace(/\(\d+\)/g, "");
    }

    // Normalize whitespace if configured
    if (globalSettings.text_processing.normalize_whitespace) {
      normalized = normalized.replace(/\s+/g, " ");
    }

    // Clean up common issues for TTS
    normalized = normalized
      .replace(/\*\*(.*?)\*\*/g, "$1") // Remove bold
      .replace(/\*(.*?)\*/g, "$1") // Remove italic
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Links: keep text, remove URL
      .replace(/^\s*[-*+]\s+/gm, "") // Remove list markers
      .replace(/\n{3,}/g, "\n\n") // Normalize line breaks
      .replace(/([.!?])\s*\n\s*/g, "$1 ") // Join sentences properly
      .replace(/\n\s*\n/g, ". ") // Convert paragraph breaks to periods
      .trim();

    return normalized;
  }

  private splitTextIntoChunks(text: string): string[] {
    const maxChunkSize = this.options.chunk_size;

    if (text.length <= maxChunkSize) {
      return [text];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = start + maxChunkSize;

      // If we're not at the end, try to break at a sentence boundary
      if (end < text.length) {
        const sentenceEnds = [".", "!", "?"];
        let bestBreak = -1;

        // Look for sentence endings within the last 20% of the chunk
        const searchStart = Math.max(start + maxChunkSize * 0.8, start);
        for (let i = end; i >= searchStart; i--) {
          if (sentenceEnds.includes(text[i])) {
            bestBreak = i + 1;
            break;
          }
        }

        if (bestBreak > start) {
          end = bestBreak;
        }
      }

      const chunk = text.slice(start, end).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }

      start = end;
    }

    return chunks.filter((chunk) => chunk.length > 0);
  }

  // Google TTS Implementation
  private async generateAudioWithGoogle(
    text: string,
    outputPath: string
  ): Promise<void> {
    try {
      await this.log(
        `Generating audio with Google TTS: ${path.basename(outputPath)}`
      );

      const requestData: GoogleTTSRequest = {
        contents: [
          {
            parts: [
              {
                text: text,
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: this.config.google_settings
            ?.response_modalities || ["AUDIO"],
          speechConfig: {},
        },
        model: this.options.model,
      };

      // Configure voice settings based on multi-speaker support
      if (
        this.config.google_settings?.multi_speaker &&
        this.config.google_settings.speakers &&
        this.config.google_settings.speakers.length > 0
      ) {
        requestData.generationConfig.speechConfig!.multiSpeakerVoiceConfig = {
          speakerVoiceConfigs: this.config.google_settings.speakers.map(
            (speaker) => ({
              speaker: speaker.name,
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: speaker.voice,
                },
              },
            })
          ),
        };
      } else {
        requestData.generationConfig.speechConfig!.voiceConfig = {
          prebuiltVoiceConfig: {
            voiceName: this.options.voice,
          },
        };
      }

      const baseUrl = ConfigManager.getApiBaseUrl(this.provider);
      const headers = ConfigManager.getAuthHeaders(this.provider);

      const response = await axios.post<GoogleTTSResponse>(
        `${baseUrl}/models/${this.options.model}:generateContent`,
        requestData,
        { headers }
      );

      // Extract audio data from response
      if (response.data.candidates && response.data.candidates.length > 0) {
        const candidate = response.data.candidates[0];
        if (
          candidate.content &&
          candidate.content.parts &&
          candidate.content.parts.length > 0
        ) {
          const part = candidate.content.parts[0];
          if (part.inlineData && part.inlineData.data) {
            // Decode base64 audio data
            const audioBuffer = Buffer.from(part.inlineData.data, "base64");

            // Check MIME type to determine format
            const mimeType = part.inlineData.mimeType || "";
            await this.log(`Received audio format: ${mimeType}`);

            if (mimeType.includes("audio/L16") || mimeType.includes("pcm")) {
              // Google returns raw PCM data, need to convert to proper audio format
              await this.convertPCMToAudio(audioBuffer, outputPath, mimeType);
            } else {
              // Already in proper format
              await fs.writeFile(outputPath, audioBuffer);
            }

            await this.log(
              `Audio generated successfully: ${path.basename(outputPath)}`
            );
            return;
          }
        }
      }

      throw new Error("No audio data received from Google TTS API");
    } catch (error) {
      await this.log(
        `Error generating audio with Google TTS: ${error}`,
        "error"
      );
      throw error;
    }
  }

  // OpenAI TTS Implementation
  private async generateAudioWithOpenAI(
    text: string,
    outputPath: string
  ): Promise<void> {
    if (!this.openai) {
      throw new Error(
        "OpenAI client not initialized. Please set OPENAI_API_KEY environment variable."
      );
    }

    try {
      await this.log(
        `Generating audio with OpenAI TTS: ${path.basename(outputPath)}`
      );

      const response = await this.openai.audio.speech.create({
        model: this.options.model as "tts-1" | "tts-1-hd",
        voice: this.options.voice as
          | "alloy"
          | "echo"
          | "fable"
          | "onyx"
          | "nova"
          | "shimmer",
        input: text,
        response_format: this.options.format as
          | "mp3"
          | "opus"
          | "aac"
          | "flac"
          | "wav"
          | "pcm",
        speed: this.config.openai_settings?.speed || 1.0,
      });

      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(outputPath, buffer);

      await this.log(
        `Audio generated successfully: ${path.basename(outputPath)}`
      );
    } catch (error) {
      await this.log(`Error generating audio: ${error}`, "error");
      throw error;
    }
  }

  // PCM to Audio Conversion (for Google TTS)
  private async convertPCMToAudio(
    pcmBuffer: Buffer,
    outputPath: string,
    mimeType: string
  ): Promise<void> {
    try {
      // Parse sample rate from MIME type (e.g., "audio/L16;codec=pcm;rate=24000")
      const rateMatch = mimeType.match(/rate=(\d+)/);
      const sampleRate = rateMatch ? parseInt(rateMatch[1]) : 24000;

      await this.log(
        `Converting PCM to audio: ${sampleRate}Hz, ${pcmBuffer.length} bytes`
      );

      // Save as WAV (most compatible format)
      const wavPath = outputPath.replace(/\.[^.]+$/, ".wav");
      await this.createWavFile(pcmBuffer, wavPath, sampleRate);

      // If output path is not WAV, rename the file
      if (outputPath !== wavPath) {
        await fs.move(wavPath, outputPath, { overwrite: true });
      }
    } catch (error) {
      await this.log(`Error converting PCM: ${error}`, "error");
      throw error;
    }
  }

  private async createWavFile(
    pcmBuffer: Buffer,
    outputPath: string,
    sampleRate: number
  ): Promise<void> {
    // Create WAV header for 16-bit mono PCM
    const dataLength = pcmBuffer.length;
    const header = Buffer.alloc(44);

    // RIFF header
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + dataLength, 4);
    header.write("WAVE", 8);

    // Format chunk
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16); // Chunk size
    header.writeUInt16LE(1, 20); // Audio format (PCM)
    header.writeUInt16LE(1, 22); // Channels (mono)
    header.writeUInt32LE(sampleRate, 24); // Sample rate
    header.writeUInt32LE(sampleRate * 2, 28); // Byte rate
    header.writeUInt16LE(2, 32); // Block align
    header.writeUInt16LE(16, 34); // Bits per sample

    // Data chunk
    header.write("data", 36);
    header.writeUInt32LE(dataLength, 40);

    // Write header + PCM data
    const wavBuffer = Buffer.concat([header, pcmBuffer]);
    await fs.writeFile(outputPath, wavBuffer);
  }

  // Unified Audio Generation
  private async generateSingleAudio(
    text: string,
    outputPath: string
  ): Promise<void> {
    const normalizedText = this.normalizeTextForTTS(text);

    let retries = 0;
    const maxRetries = this.config.processing.retry_attempts;

    while (retries <= maxRetries) {
      try {
        switch (this.provider) {
          case "google":
            await this.generateAudioWithGoogle(normalizedText, outputPath);
            break;
          case "openai":
            await this.generateAudioWithOpenAI(normalizedText, outputPath);
            break;
          default:
            throw new Error(`Unsupported TTS provider: ${this.provider}`);
        }
        return; // Success, exit retry loop
      } catch (error) {
        retries++;
        if (retries > maxRetries) {
          throw error;
        }

        // Special handling for rate limit errors (429)
        const isRateLimit =
          (error as any)?.response?.status === 429 ||
          (error as any)?.message?.includes("429") ||
          (error as any)?.message?.includes("Too Many Requests");

        const baseDelay = isRateLimit
          ? this.config.processing.retry_delay
          : this.config.processing.retry_delay / 3;
        const backoffDelay = baseDelay * Math.pow(2, retries - 1); // Exponential backoff

        await this.log(
          `Retry ${retries}/${maxRetries} for ${path.basename(outputPath)} ${
            isRateLimit ? "(rate limited)" : ""
          } - waiting ${Math.round(backoffDelay / 1000)}s`,
          "warn"
        );
        await this.delay(backoffDelay);
      }
    }
  }

  private async generateAudioForText(
    text: string,
    outputPath: string,
    progressBar?: ProgressBar
  ): Promise<void> {
    const chunks = this.splitTextIntoChunks(text);
    const tempDir = path.join(this.bookDir, "temp");
    await fs.ensureDir(tempDir);

    if (chunks.length === 1) {
      // Single chunk, generate directly
      await this.generateSingleAudio(chunks[0], outputPath);
      if (progressBar) progressBar.tick();
    } else {
      // Multiple chunks, generate and concatenate
      const chunkPaths: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const extension = this.config.audio.default_format.extension;
        const chunkPath = path.join(
          tempDir,
          `chunk_${Date.now()}_${i}.${extension}`
        );
        await this.generateSingleAudio(chunks[i], chunkPath);
        chunkPaths.push(chunkPath);

        if (progressBar) progressBar.tick();

        // Rate limiting
        if (i < chunks.length - 1) {
          await this.delay(this.options.rate_limit_delay);
        }
      }

      // Concatenate chunks
      await this.concatenateAudioFiles(chunkPaths, outputPath);

      // Cleanup temp files
      for (const chunkPath of chunkPaths) {
        await fs.remove(chunkPath);
      }
    }
  }

  private async concatenateAudioFiles(
    inputPaths: string[],
    outputPath: string
  ): Promise<void> {
    try {
      // Simple concatenation for audio files
      const chunks: Buffer[] = [];

      for (const inputPath of inputPaths) {
        const chunk = await fs.readFile(inputPath);
        chunks.push(chunk);
      }

      const concatenated = Buffer.concat(chunks);
      await fs.writeFile(outputPath, concatenated);

      await this.log(`Concatenated ${inputPaths.length} audio chunks`);
    } catch (error) {
      await this.log(`Error concatenating audio files: ${error}`, "error");
      throw error;
    }
  }

  async generateChapterAudio(
    chapterPath: string,
    outputPath: string,
    chapterTitle: string,
    chapterNumber: number
  ): Promise<void> {
    await this.log(`Processing chapter: ${chapterTitle}`);

    const chapterContent = await fs.readFile(chapterPath, "utf-8");

    // For now, just use the content as-is
    // TODO: Add chapter announcements based on global settings
    const audioText = chapterContent;

    await this.generateAudioForText(audioText, outputPath);
  }

  async generateBookAudio(): Promise<void> {
    console.log(chalk.green("🎵 Starting audio generation for book"));
    console.log(
      chalk.cyan(
        `🤖 Using ${this.config.provider.display_name} with voice: ${this.options.voice}`
      )
    );
    await this.log("Starting audio generation for book");

    // Validate configuration
    await this.validateConfiguration();

    // Load book metadata and TOC
    const metadataPath = path.join(this.bookDir, "metadata.yml");
    const tocPath = path.join(this.bookDir, "toc.yml");

    if (
      !(await fs.pathExists(metadataPath)) ||
      !(await fs.pathExists(tocPath))
    ) {
      throw new Error("Book metadata or TOC not found. Run conversion first.");
    }

    // Use YAML parsing for now (can be migrated later)
    const YAML = require("yaml");
    const metadata: BookMetadata = YAML.parse(
      await fs.readFile(metadataPath, "utf-8")
    );
    const toc = YAML.parse(await fs.readFile(tocPath, "utf-8"));

    console.log(
      chalk.cyan(`📖 Processing: ${metadata.title} by ${metadata.author}`)
    );
    console.log(chalk.cyan(`📑 Chapters: ${metadata.totalChapters}`));

    // Create audio directories with provider-specific structure
    const audioDir = ConfigManager.getAudioOutputDir(
      this.bookDir,
      this.provider
    );
    const chaptersAudioDir = path.join(audioDir, "chapters");
    await fs.ensureDir(chaptersAudioDir);

    const chapterAudioPaths: string[] = [];

    // Calculate total chunks for progress bar
    let totalChunks = 0;
    for (const chapter of toc.chapters) {
      const chapterPath = path.join(
        this.bookDir,
        "content",
        "chapters",
        chapter.filename
      );
      if (await fs.pathExists(chapterPath)) {
        const content = await fs.readFile(chapterPath, "utf-8");
        const chunks = this.splitTextIntoChunks(content);
        totalChunks += chunks.length;
      }
    }

    // Create progress bar
    const progressBar = new ProgressBar(
      "Generating audio [:bar] :rate/cps :percent :etas",
      {
        complete: "=",
        incomplete: " ",
        width: 40,
        total: totalChunks,
      }
    );

    // Generate individual chapter audio files
    for (const chapter of toc.chapters) {
      const chapterPath = path.join(
        this.bookDir,
        "content",
        "chapters",
        chapter.filename
      );

      if (!(await fs.pathExists(chapterPath))) {
        await this.log(`Chapter file not found: ${chapter.filename}`, "warn");
        continue;
      }

      const audioExtension = this.config.audio.default_format.extension;
      const audioFilename = `${String(chapter.order).padStart(
        2,
        "0"
      )}-${this.sanitizeFilename(chapter.title)}.${audioExtension}`;
      const audioPath = path.join(chaptersAudioDir, audioFilename);
      chapterAudioPaths.push(audioPath);

      await this.generateChapterAudio(
        chapterPath,
        audioPath,
        chapter.title,
        chapter.order
      );

      // Rate limiting between chapters
      await this.delay(this.options.rate_limit_delay);
    }

    progressBar.terminate();
    console.log(chalk.green("\n✅ Audio generation completed successfully!"));
    console.log(
      chalk.blue(
        `🎵 Audio files available in: ${path.relative(process.cwd(), audioDir)}`
      )
    );
    await this.log("Audio generation completed successfully!");
  }

  private async validateConfiguration(): Promise<void> {
    const validation = ConfigManager.validateProviderConfig(this.provider);
    if (!validation.valid) {
      throw new Error(
        `Configuration validation failed:\n${validation.errors.join("\n")}`
      );
    }

    await this.log(`Configuration validated for ${this.provider} TTS`);
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

// CLI usage
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(
      chalk.blue(`
🎵 Unified Audio Generation Tool

Usage: ts-node audio-generator.ts <book-directory> [provider] [options]

Examples:
  ts-node audio-generator.ts ./books/mythos
  ts-node audio-generator.ts ./books/mythos google
  ts-node audio-generator.ts ./books/mythos openai --voice=nova

Supported TTS Providers:
  📱 Google TTS (Gemini 2.5 Flash) - Set GOOGLE_API_KEY
  🤖 OpenAI TTS - Set OPENAI_API_KEY  

Configure providers in config/providers/
        `)
    );
    return;
  }

  const bookDir = path.resolve(args[0]);
  const provider =
    (args[1] as TTSProvider) || ConfigManager.getDefaultProvider();

  if (!(await fs.pathExists(bookDir))) {
    console.error(chalk.red(`❌ Book directory not found: ${bookDir}`));
    process.exit(1);
  }

  try {
    const generator = new UnifiedAudioGenerator(bookDir, provider);
    await generator.generateBookAudio();
  } catch (error) {
    console.error(chalk.red(`\n❌ Audio generation failed:`), error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
