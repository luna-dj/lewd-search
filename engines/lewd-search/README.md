# lewd-search

NSFW search engine for DeGoog - aggregates from 9 real porn sites.

## Sources (9)

| Source | Type | Method |
|--------|------|--------|
| Eporner | HD Porn | JSON API |
| Iwara | Video | JSON API |
| XVideos | Porn tube | HTML scrape |
| Pornhub | Porn tube | HTML scrape |
| xHamster | Porn tube | HTML scrape |
| XNXX | Porn tube | HTML scrape |
| YouPorn | Porn tube | HTML scrape |
| RedTube | Porn tube | HTML scrape |
| TGTube | Trans porn | HTML scrape |

## Usage

```
!lewd milf
!lewd teen 2
!lewd shemale
```

## Notes

- Rotating user-agents
- Parallel fetching with Promise.allSettled
- Interleaved results from each source
- Failures don't break the search