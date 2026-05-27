# lewd-search

A custom NSFW search engine for DeGoog that aggregates results from real porn sites.

## Features

- **Real porn sites** - Queries actual adult video platforms, not just anime boards
- **Multi-source aggregation** - Searches Eporner and Gelbooru in parallel
- **Privacy-first** - No Google tracking, uses public APIs
- **HD video content** - Eporner provides 3M+ HD videos with ratings and metadata
- **Optional API key** - For higher rate limits on Eporner

## Supported Sources

| Source | Type | Content | API Access |
|--------|------|---------|-----------|
| Eporner | Porn tube | Real adult videos (3M+ HD) | Free public API |
| Gelbooru | Image board | Anime/Hentai images | Free, no key required |

## Usage

### Basic Search

Use the `!lewd` bang shortcut or select "lewd-search" as the engine:

```
!lewd milf
```

### Search Examples

| Query | Description |
|-------|-------------|
| `!lewd milf` | MILF content |
| `!lewd teen` | Young performers |
| `!lewd anal` | Anal content |
| `!lewd japanese` | Japanese adult content |
| `!lewd lesbian` | Lesbian content |
| `!lewd big ass` | Specific fetishes |
| `!lewd 4k` | High definition videos |

### Pagination

```
!lewd milf 2
```

## Configuration

### Eporner API Key (Optional)

Eporner provides a free public API. For higher rate limits:

1. Visit [Eporner API](https://www.eporner.com/api/v2/)
2. Get your API key (if available)
3. Enter it in the engine settings

## Response Format

```json
{
  "title": "Hot MILF Takes BBC [15:32]",
  "url": "https://www.eporner.com/hd-porn/abc123/Hot-MILF-Takes-BBC/",
  "snippet": "milf, bbc, interracial, 4k, pov... | Views: 1,234,567 | Rating: 4.5/5",
  "source": "Eporner",
  "thumbnail": "https://static-eporner.com/thumbs/..."
}
```

## Architecture

```
lewd-search engine
    │
    ├── Eporner API (real porn videos)
    │       └── 3M+ HD videos, ratings, categories
    │
    └── Gelbooru API (anime/hentai images)
            └── Tag-based image search

            └── Ranked & deduplicated results
```

## Legal Notice

This engine aggregates publicly available content from third-party sites. Users are responsible for ensuring compliance with applicable laws and terms of service in their jurisdiction.