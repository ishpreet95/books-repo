/**
 * TypeScript configuration types for multi-provider TTS system
 */

export interface Voice {
  id: string;
  name: string;
  language: string;
  gender?: "male" | "female" | "neutral";
  description?: string;
  preview_url?: string;
}

export interface AudioFormat {
  format: string;
  codec?: string;
  sample_rate?: number;
  bit_rate?: string;
  channels?: number;
  extension: string;
}

export interface ProcessingLimits {
  max_text_length: number;
  max_chunk_size: number;
  rate_limit_delay: number;
  max_concurrent_requests: number;
  retry_attempts: number;
  retry_delay: number;
}

export interface ProviderAuth {
  api_key_env: string;
  api_key?: string;
  base_url?: string;
  headers?: Record<string, string>;
}

export interface ProviderInfo {
  name: string;
  display_name: string;
  version: string;
  description: string;
  documentation_url?: string;
}

export interface TTSModel {
  id: string;
  name: string;
  description?: string;
  max_text_length?: number;
  supported_formats?: string[];
  languages?: string[];
}

export interface ProviderFeatures {
  supports_ssml: boolean;
  supports_multi_speaker: boolean;
  supports_voice_cloning: boolean;
  supports_speed_control: boolean;
  supports_pitch_control: boolean;
  supports_streaming: boolean;
  supports_emotions: boolean;
}

export interface TTSProviderConfig {
  provider: ProviderInfo;
  auth: ProviderAuth;
  models: TTSModel[];
  voices: Voice[];
  audio: {
    default_format: AudioFormat;
    supported_formats: AudioFormat[];
  };
  processing: ProcessingLimits;
  features: ProviderFeatures;
  default_settings: {
    model: string;
    voice: string;
    format: string;
    speed?: number;
    pitch?: number;
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
  // Provider-specific settings
  google_settings?: {
    multi_speaker?: boolean;
    speakers?: Array<{
      name: string;
      voice: string;
    }>;
    response_modalities?: string[];
  };
  openai_settings?: {
    response_format?: string;
    speed?: number;
  };
  elevenlabs_settings?: {
    model_id?: string;
    voice_settings?: {
      stability: number;
      similarity_boost: number;
      style?: number;
      use_speaker_boost?: boolean;
    };
  };
}

export interface GlobalTTSSettings {
  default_provider: string;
  output_directory_structure: "provider-first" | "book-first";
  audio_processing: {
    normalize_volume: boolean;
    target_volume_db: number;
    fade_in_ms: number;
    fade_out_ms: number;
    silence_detection: boolean;
    auto_split_chapters: boolean;
  };
  text_processing: {
    clean_markdown: boolean;
    remove_footnotes: boolean;
    normalize_whitespace: boolean;
    sentence_splitting: boolean;
    paragraph_splitting: boolean;
  };
  logging: {
    level: "debug" | "info" | "warn" | "error";
    log_api_requests: boolean;
    log_file_operations: boolean;
    save_processing_logs: boolean;
  };
}

export interface ProviderStorageConfig {
  provider: string;
  base_path: string;
  structure: {
    audio_dir: string;
    temp_dir: string;
    logs_dir: string;
  };
}

export type TTSProvider = "google" | "openai" | "elevenlabs";

export interface ChapterAudioOptions {
  provider?: TTSProvider;
  voice?: string;
  model?: string;
  format?: string;
  force_regenerate?: boolean;
  chunk_size?: number;
  rate_limit_delay?: number;
}
