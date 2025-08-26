import {
  TTSProviderConfig,
  GlobalTTSSettings,
  TTSProvider,
  ChapterAudioOptions,
} from "./types";
import { googleTTSConfig } from "./providers/google";
import { openaiTTSConfig } from "./providers/openai";

export class ConfigManager {
  private static providers = new Map<string, TTSProviderConfig>([
    ["google", googleTTSConfig],
    ["openai", openaiTTSConfig],
  ]);

  private static globalSettings: GlobalTTSSettings = {
    default_provider: "google",
    output_directory_structure: "book-first", // books/<book>/audio/<provider>/
    audio_processing: {
      normalize_volume: false,
      target_volume_db: -20,
      fade_in_ms: 100,
      fade_out_ms: 100,
      silence_detection: true,
      auto_split_chapters: true,
    },
    text_processing: {
      clean_markdown: true,
      remove_footnotes: true,
      normalize_whitespace: true,
      sentence_splitting: true,
      paragraph_splitting: false,
    },
    logging: {
      level: "info",
      log_api_requests: false,
      log_file_operations: true,
      save_processing_logs: true,
    },
  };

  /**
   * Get configuration for a specific TTS provider
   */
  static getProviderConfig(provider: TTSProvider): TTSProviderConfig {
    const config = this.providers.get(provider);
    if (!config) {
      throw new Error(
        `Provider '${provider}' not found. Available providers: ${this.getAvailableProviders().join(
          ", "
        )}`
      );
    }
    return config;
  }

  /**
   * Get list of available TTS providers
   */
  static getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get global TTS settings
   */
  static getGlobalSettings(): GlobalTTSSettings {
    return this.globalSettings;
  }

  /**
   * Get default provider
   */
  static getDefaultProvider(): TTSProvider {
    return this.globalSettings.default_provider as TTSProvider;
  }

  /**
   * Check if a provider is available
   */
  static isProviderAvailable(provider: string): boolean {
    return this.providers.has(provider);
  }

  /**
   * Get provider display information
   */
  static getProviderInfo(provider: TTSProvider) {
    const config = this.getProviderConfig(provider);
    return {
      name: config.provider.display_name,
      description: config.provider.description,
      version: config.provider.version,
      features: config.features,
      voices: config.voices.map((v) => ({
        id: v.id,
        name: v.name,
        description: v.description,
        language: v.language,
        gender: v.gender,
      })),
      models: config.models.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
      })),
      formats: config.audio.supported_formats.map((f) => ({
        format: f.format,
        extension: f.extension,
      })),
    };
  }

  /**
   * Get audio output directory for a provider and book
   */
  static getAudioOutputDir(bookPath: string, provider: TTSProvider): string {
    const structure = this.globalSettings.output_directory_structure;

    if (structure === "provider-first") {
      return `${bookPath}/audio/${provider}`;
    } else {
      return `${bookPath}/audio/${provider}`;
    }
  }

  /**
   * Get processing logs directory for a provider and book
   */
  static getLogsDir(bookPath: string, provider?: TTSProvider): string {
    if (provider) {
      return `${bookPath}/processing/logs/${provider}`;
    }
    return `${bookPath}/processing/logs`;
  }

  /**
   * Validate provider configuration
   */
  static validateProviderConfig(provider: TTSProvider): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    try {
      const config = this.getProviderConfig(provider);

      // Check API key
      const apiKey = process.env[config.auth.api_key_env];
      if (!apiKey) {
        errors.push(
          `Missing API key: Please set ${config.auth.api_key_env} environment variable`
        );
      }

      // Validate default settings
      const defaultVoice = config.voices.find(
        (v) => v.id === config.default_settings.voice
      );
      if (!defaultVoice) {
        errors.push(
          `Default voice '${config.default_settings.voice}' not found in available voices`
        );
      }

      const defaultModel = config.models.find(
        (m) => m.id === config.default_settings.model
      );
      if (!defaultModel) {
        errors.push(
          `Default model '${config.default_settings.model}' not found in available models`
        );
      }

      const defaultFormat = config.audio.supported_formats.find(
        (f) => f.format === config.default_settings.format
      );
      if (!defaultFormat) {
        errors.push(
          `Default format '${config.default_settings.format}' not found in supported formats`
        );
      }
    } catch (error) {
      errors.push(
        `Configuration error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Merge chapter audio options with provider defaults
   */
  static getEffectiveOptions(
    provider: TTSProvider,
    options: ChapterAudioOptions = {}
  ): Required<ChapterAudioOptions> {
    const config = this.getProviderConfig(provider);

    return {
      provider: options.provider || provider,
      voice: options.voice || config.default_settings.voice,
      model: options.model || config.default_settings.model,
      format: options.format || config.default_settings.format,
      force_regenerate: options.force_regenerate || false,
      chunk_size: options.chunk_size || config.processing.max_chunk_size,
      rate_limit_delay:
        options.rate_limit_delay || config.processing.rate_limit_delay,
    };
  }

  /**
   * Get API authentication headers for a provider
   */
  static getAuthHeaders(provider: TTSProvider): Record<string, string> {
    const config = this.getProviderConfig(provider);
    const apiKey = process.env[config.auth.api_key_env];

    if (!apiKey) {
      throw new Error(
        `Missing API key for ${provider}: Please set ${config.auth.api_key_env} environment variable`
      );
    }

    const headers = { ...config.auth.headers };

    if (provider === "google") {
      headers["x-goog-api-key"] = apiKey;
    } else if (provider === "openai") {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    return headers;
  }

  /**
   * Get API base URL for a provider
   */
  static getApiBaseUrl(provider: TTSProvider): string {
    const config = this.getProviderConfig(provider);
    return config.auth.base_url || "";
  }
}
