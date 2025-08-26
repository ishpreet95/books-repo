import { TTSProviderConfig } from "../types";

export const googleTTSConfig: TTSProviderConfig = {
  provider: {
    name: "google",
    display_name: "Google Gemini TTS",
    version: "2.5-flash-preview",
    description:
      "Google Gemini 2.5 Flash Preview TTS with multi-speaker support",
    documentation_url: "https://ai.google.dev/gemini-api/docs/text-to-speech",
  },

  auth: {
    api_key_env: "GOOGLE_API_KEY",
    base_url: "https://generativelanguage.googleapis.com/v1beta",
    headers: {
      "Content-Type": "application/json",
    },
  },

  models: [
    {
      id: "gemini-2.5-flash-preview-tts",
      name: "Gemini 2.5 Flash Preview TTS",
      description: "Latest Google TTS model with multi-speaker capabilities",
      max_text_length: 5000,
      supported_formats: ["audio/wav", "audio/mp3", "audio/L16"],
      languages: ["en", "es", "fr", "de", "it", "pt", "ru", "ja", "ko", "zh"],
    },
  ],

  voices: [
    {
      id: "Kore",
      name: "Kore",
      language: "en",
      gender: "neutral",
      description: "Neutral, clear voice suitable for narration",
    },
    {
      id: "Puck",
      name: "Puck",
      language: "en",
      gender: "neutral",
      description: "Expressive voice with character",
    },
    {
      id: "Charon",
      name: "Charon",
      language: "en",
      gender: "male",
      description: "Deep, authoritative male voice",
    },
    {
      id: "Fenrir",
      name: "Fenrir",
      language: "en",
      gender: "male",
      description: "Strong, commanding male voice",
    },
    {
      id: "Aoede",
      name: "Aoede",
      language: "en",
      gender: "female",
      description: "Melodic female voice",
    },
  ],

  audio: {
    default_format: {
      format: "audio/wav",
      codec: "pcm",
      sample_rate: 24000,
      channels: 1,
      extension: "wav",
    },
    supported_formats: [
      {
        format: "audio/wav",
        codec: "pcm",
        sample_rate: 24000,
        channels: 1,
        extension: "wav",
      },
      {
        format: "audio/mp3",
        codec: "mp3",
        sample_rate: 24000,
        bit_rate: "128k",
        channels: 1,
        extension: "mp3",
      },
      {
        format: "audio/L16",
        codec: "pcm",
        sample_rate: 24000,
        channels: 1,
        extension: "wav",
      },
    ],
  },

  processing: {
    max_text_length: 5000,
    max_chunk_size: 3000,
    // Conservative rate limiting for Gemini 2.5 Flash Preview TTS
    // Preview APIs typically have stricter limits than production APIs
    rate_limit_delay: 10000, // 10 seconds between requests
    max_concurrent_requests: 1, // Sequential processing only
    retry_attempts: 5, // More attempts for rate-limited requests
    retry_delay: 30000, // 30 seconds base retry delay with exponential backoff
  },

  features: {
    supports_ssml: false,
    supports_multi_speaker: true,
    supports_voice_cloning: false,
    supports_speed_control: false,
    supports_pitch_control: false,
    supports_streaming: false,
    supports_emotions: false,
  },

  default_settings: {
    model: "gemini-2.5-flash-preview-tts",
    voice: "Kore",
    format: "audio/wav",
  },

  google_settings: {
    multi_speaker: false,
    speakers: [
      {
        name: "Joe",
        voice: "Kore",
      },
      {
        name: "Jane",
        voice: "Puck",
      },
    ],
    response_modalities: ["AUDIO"],
  },
};
