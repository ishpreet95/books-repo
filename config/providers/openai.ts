import { TTSProviderConfig } from "../types";

export const openaiTTSConfig: TTSProviderConfig = {
  provider: {
    name: "openai",
    display_name: "OpenAI TTS",
    version: "1.0",
    description: "OpenAI Text-to-Speech API with high-quality voices",
    documentation_url: "https://platform.openai.com/docs/guides/text-to-speech",
  },

  auth: {
    api_key_env: "OPENAI_API_KEY",
    base_url: "https://api.openai.com/v1",
    headers: {
      "Content-Type": "application/json",
    },
  },

  models: [
    {
      id: "tts-1",
      name: "TTS-1",
      description: "Standard quality text-to-speech model",
      max_text_length: 4096,
      supported_formats: ["mp3", "opus", "aac", "flac"],
      languages: [
        "en",
        "es",
        "fr",
        "de",
        "it",
        "pt",
        "ru",
        "ja",
        "ko",
        "zh",
        "ar",
        "hi",
      ],
    },
    {
      id: "tts-1-hd",
      name: "TTS-1-HD",
      description: "High definition text-to-speech model with superior quality",
      max_text_length: 4096,
      supported_formats: ["mp3", "opus", "aac", "flac"],
      languages: [
        "en",
        "es",
        "fr",
        "de",
        "it",
        "pt",
        "ru",
        "ja",
        "ko",
        "zh",
        "ar",
        "hi",
      ],
    },
  ],

  voices: [
    {
      id: "alloy",
      name: "Alloy",
      language: "en",
      gender: "neutral",
      description: "Neutral, balanced voice",
    },
    {
      id: "echo",
      name: "Echo",
      language: "en",
      gender: "male",
      description: "Clear, professional male voice",
    },
    {
      id: "fable",
      name: "Fable",
      language: "en",
      gender: "neutral",
      description: "Storytelling voice with character",
    },
    {
      id: "onyx",
      name: "Onyx",
      language: "en",
      gender: "male",
      description: "Deep, authoritative male voice",
    },
    {
      id: "nova",
      name: "Nova",
      language: "en",
      gender: "female",
      description: "Clear, pleasant female voice",
    },
    {
      id: "shimmer",
      name: "Shimmer",
      language: "en",
      gender: "female",
      description: "Bright, engaging female voice",
    },
  ],

  audio: {
    default_format: {
      format: "mp3",
      codec: "mp3",
      sample_rate: 22050,
      bit_rate: "64k",
      channels: 1,
      extension: "mp3",
    },
    supported_formats: [
      {
        format: "mp3",
        codec: "mp3",
        sample_rate: 22050,
        bit_rate: "64k",
        channels: 1,
        extension: "mp3",
      },
      {
        format: "opus",
        codec: "opus",
        sample_rate: 24000,
        bit_rate: "64k",
        channels: 1,
        extension: "opus",
      },
      {
        format: "aac",
        codec: "aac",
        sample_rate: 22050,
        bit_rate: "64k",
        channels: 1,
        extension: "aac",
      },
      {
        format: "flac",
        codec: "flac",
        sample_rate: 44100,
        channels: 1,
        extension: "flac",
      },
    ],
  },

  processing: {
    max_text_length: 4096,
    max_chunk_size: 3000,
    rate_limit_delay: 1000, // 1 second
    max_concurrent_requests: 5,
    retry_attempts: 3,
    retry_delay: 2000,
  },

  features: {
    supports_ssml: false,
    supports_multi_speaker: false,
    supports_voice_cloning: false,
    supports_speed_control: true,
    supports_pitch_control: false,
    supports_streaming: false,
    supports_emotions: false,
  },

  default_settings: {
    model: "tts-1",
    voice: "alloy",
    format: "mp3",
    speed: 1.0,
  },

  openai_settings: {
    response_format: "mp3",
    speed: 1.0,
  },
};
