# 📚 Books Repository Manager

A streamlined book repository manager that converts EPUBs to structured Markdown and generates high-quality TTS audio using **Google Gemini TTS**, OpenAI, or ElevenLabs.

## ✨ Key Features

- **📖 EPUB to Markdown**: Convert EPUBs to clean, structured Markdown perfect for AI processing
- **🎵 Per-Chapter Audio**: Generate TTS audio for individual chapters on-demand
- **🤖 Multiple TTS Providers**: Google Gemini 2.5 Flash TTS (recommended), OpenAI TTS, ElevenLabs
- **📁 Organized Structure**: Clean, hierarchical organization with metadata and logs
- **⚡ Efficient Processing**: Generate audio only for chapters you need
- **🔧 Easy Configuration**: TypeScript-based configuration with IntelliSense support

## 🏗️ Book Structure

Each processed book follows this organized structure:

```
books/[book-slug]/
├── metadata.yml              # Book metadata (title, author, etc.)
├── toc.yml                  # Table of contents
├── source/                  # Original files
│   └── book.epub           # Original EPUB
├── content/                 # Processed content
│   ├── chapters/           # Individual chapter markdown files
│   │   ├── 01-chapter-title.md
│   │   └── ...
│   ├── text/               # Plain text versions
│   └── full-text.md        # Complete book in single file
├── audio/                   # Generated audio files (provider-specific)
│   ├── google/             # Google TTS audio
│   │   └── chapters/       # Individual chapter audio
│   │       ├── 01-chapter-title.wav
│   │       └── ...
│   └── openai/             # OpenAI TTS audio
│       └── chapters/       # Individual chapter audio
│           ├── 01-chapter-title.mp3
│           └── ...
└── processing/             # Processing logs and temp files
    ├── logs/
    └── temp/
```

## 🚀 Quick Start

### 1. Installation

```bash
git clone <your-repo-url>
cd books-repo
npm install
```

### 2. Environment Setup

Set your TTS provider API key:

```bash
# For Google TTS (Recommended - best quality & speed)
export GOOGLE_API_KEY="your-google-api-key"

# OR for OpenAI TTS
export OPENAI_API_KEY="your-openai-api-key"

# OR for ElevenLabs TTS
export ELEVENLABS_API_KEY="your-elevenlabs-api-key"
```

### 3. Convert a Book

```bash
# Convert EPUB to structured Markdown
npm run convert path/to/book.epub "Book Title"

# Example
npm run convert books/mythos/source/mythos.epub "Mythos"
```

### 4. Generate Audio Per Chapter

```bash
# List all chapters (default: Google TTS)
npm run chapter-audio books/mythos list

# Generate audio for specific chapter
npm run chapter-audio books/mythos 10

# Use specific provider and voice
npm run chapter-audio books/mythos 10 --provider=openai --voice=nova

# Generate audio for multiple chapters
npm run chapter-audio books/mythos 1 5 10

# Find chapter by title
npm run chapter-audio books/mythos "out of chaos"
```

## 📋 Available Commands

| Command                  | Description                | Example                                                   |
| ------------------------ | -------------------------- | --------------------------------------------------------- |
| `npm run convert`        | Convert EPUB to Markdown   | `npm run convert book.epub "Title"`                       |
| `npm run chapter-audio`  | Generate audio per chapter | `npm run chapter-audio books/mythos 10 --provider=google` |
| `npm run generate-audio` | Generate full book audio   | `npm run generate-audio books/mythos google`              |
| `npm run batch-process`  | Process multiple books     | `npm run batch-process ./source-books`                    |

## 🎵 Chapter Audio Generation

The **chapter audio** feature is the main way to generate TTS audio efficiently:

### List Available Chapters

```bash
npm run chapter-audio books/mythos list --provider=google
```

Shows all chapters with status indicators for each provider:

- 🎵 = Audio available
- ⚪ = No audio yet
- Current provider is highlighted

### Generate Single Chapter

```bash
# By chapter number (default provider: Google)
npm run chapter-audio books/mythos 10

# With specific provider and voice
npm run chapter-audio books/mythos 10 --provider=openai --voice=nova

# By partial title (case-insensitive)
npm run chapter-audio books/mythos "chaos"
```

### Generate Multiple Chapters

```bash
# Multiple chapters at once
npm run chapter-audio books/mythos 1 5 10 15

# With specific provider
npm run chapter-audio books/mythos 1 5 10 --provider=google --voice=Kore

# Sequential processing with rate limiting
```

### Why Per-Chapter Generation?

- **⚡ Faster**: Generate only what you need
- **💰 Cost-effective**: Pay only for chapters you use
- **🔄 Flexible**: Re-generate individual chapters if needed
- **⏱️ Time-efficient**: No need to wait for entire book processing

## ⚙️ Configuration

### TypeScript Configuration System

The new configuration system uses TypeScript for type safety and better IntelliSense support:

#### Provider Configurations

- **`config/providers/google.ts`** - Google TTS settings
- **`config/providers/openai.ts`** - OpenAI TTS settings
- **`config/config-manager.ts`** - Central configuration manager

#### Example Google Configuration

```typescript
export const googleTTSConfig: TTSProviderConfig = {
  provider: {
    name: "google",
    display_name: "Google Gemini TTS",
    version: "2.5-flash-preview",
  },
  voices: [
    { id: "Kore", name: "Kore", language: "en", gender: "neutral" },
    { id: "Puck", name: "Puck", language: "en", gender: "neutral" },
    // ... more voices
  ],
  default_settings: {
    model: "gemini-2.5-flash-preview-tts",
    voice: "Kore",
    format: "audio/wav",
  },
};
```

#### Global Settings

```typescript
const globalSettings = {
  default_provider: "google",
  text_processing: {
    clean_markdown: true,
    remove_footnotes: true,
    normalize_whitespace: true,
  },
  logging: {
    level: "info",
    save_processing_logs: true,
  },
};
```

## 🌟 TTS Providers

### 🥇 Google Gemini TTS (Recommended)

**Why Google TTS?**

- 🎯 **Highest Quality**: Latest AI technology with natural voices
- ⚡ **Fastest**: Quick processing with good rate limits
- 💰 **Cost-effective**: Competitive pricing
- 🔧 **Easy Setup**: Simple API key configuration
- 🎭 **Multi-speaker**: Support for character dialogues

**Available Voices:**

- **Kore** - Natural, clear narrator voice (default)
- **Puck** - Expressive, character voice
- **Charon** - Deep, authoritative voice
- **Aoede** - Melodic, storytelling voice

**Setup:**

```bash
export GOOGLE_API_KEY="your-google-api-key"
```

### 🤖 OpenAI TTS

**Available Voices:** alloy, echo, fable, onyx, nova, shimmer

**Setup:**

```bash
export OPENAI_API_KEY="your-openai-api-key"
```

### 🎭 ElevenLabs TTS

**Premium voice quality** with extensive voice library.

**Setup:**

```bash
export ELEVENLABS_API_KEY="your-elevenlabs-api-key"
```

## 📖 Usage Examples

### Basic Workflow

```bash
# 1. Convert book
npm run convert ./source/mythos.epub "Mythos"

# 2. List chapters
npm run chapter-audio books/mythos list

# 3. Generate audio for interesting chapters
npm run chapter-audio books/mythos 10    # "Out of Chaos"
npm run chapter-audio books/mythos 17    # "Prometheus"
npm run chapter-audio books/mythos 29    # "Sisyphus"

# 4. Listen to generated audio files
# Files saved as: books/mythos/audio/chapters/XX-chapter-name.wav
```

### Batch Processing

```bash
# Process multiple books at once
npm run batch-process ./source-books

# With audio generation
npm run batch-process ./source-books --audio
```

### Advanced Chapter Selection

```bash
# Generate multiple chapters
npm run chapter-audio books/mythos 1 10 20 30

# Find chapters by partial title
npm run chapter-audio books/mythos "prometheus"
npm run chapter-audio books/mythos "zeus"
npm run chapter-audio books/mythos "chaos"
```

## 🔧 Advanced Features

### Custom Configuration

Create custom TTS configs for different use cases:

```bash
# Use custom config
npm run chapter-audio books/mythos 10 --config ./my-tts-config.yml
```

### Multi-Speaker Support (Google TTS)

```yaml
# In config/tts-config.yml
google:
  multi_speaker: true
  speakers:
    - name: "Narrator"
      voice: "Kore"
    - name: "Zeus"
      voice: "Charon"
    - name: "Hermes"
      voice: "Puck"
```

## 🐛 Troubleshooting

### Common Issues

**"API key not configured"**

- Set the environment variable for your TTS provider
- Check the key is valid and has proper permissions

**"Chapter not found"**

- Use `npm run chapter-audio books/mythos list` to see available chapters
- Try partial title matching: `"chaos"` instead of `"Out of Chaos"`

**"Book metadata not found"**

- Run conversion first: `npm run convert book.epub "Title"`
- Ensure the book directory exists

**Audio sounds like noise**

- This was fixed in v2.0.0 with proper PCM to audio conversion
- Re-generate the chapter if you have old audio files

### Getting Help

1. Check logs in `books/[book]/processing/logs/`
2. Verify API keys are set correctly
3. Ensure book was converted properly
4. Try with a different chapter to isolate issues

## 🎯 Why This Structure?

This repository is optimized for:

- **🤖 AI Compatibility**: Clean markdown perfect for AI processing
- **🎵 Efficient TTS**: Per-chapter generation saves time and money
- **📱 Human-Friendly**: Easy navigation and clear organization
- **🔄 Version Control**: Separate source, processed, and generated content
- **⚡ Performance**: Smart caching and processing
- **📊 Transparency**: Comprehensive logging and metadata

## 📈 Performance Tips

1. **Use Google TTS** - Fastest and highest quality
2. **Generate chapters on-demand** - Only create audio you'll use
3. **Adjust rate limiting** - Increase `rate_limit_delay` if hitting limits
4. **Use partial titles** - Faster than typing full chapter names
5. **Batch similar chapters** - Process related content together

## 🚀 Next Steps

1. **Convert your first book**: `npm run convert path/to/book.epub`
2. **Explore chapters**: `npm run chapter-audio books/book-name list`
3. **Generate sample audio**: `npm run chapter-audio books/book-name 1`
4. **Customize configuration**: Edit `config/tts-config.yml`
5. **Generate more chapters**: Use the convenient per-chapter commands

---

**Happy reading and listening! 📚🎵**

_Perfect for creating audiobooks, AI training data, or just enjoying your favorite books in audio format._
