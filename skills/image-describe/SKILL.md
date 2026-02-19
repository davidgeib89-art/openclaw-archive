---
name: image-describe
description: Analyze a generated image via OpenRouter vision and return structured JSON (description, mood, symbols, style).
user-invocable: true
metadata:
  {
    "openclaw":
      {
        "emoji": "eye",
        "requires": { "bins": ["node"] },
      },
  }
---

# Image Describe

Describe a local image in detail using OpenRouter vision.

## Use

```bash
node {baseDir}/../image-describe.js --image "C:/Users/holyd/.openclaw/workspace/creations/comfyui/example.png"
```

If no `--image` is provided, it uses the latest image from:
`~/.openclaw/workspace/creations/comfyui/`

## Output

JSON shape:

```json
{
  "description": "...",
  "mood": "...",
  "symbols": ["..."],
  "style": "..."
}
```
