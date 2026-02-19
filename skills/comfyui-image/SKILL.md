---
name: comfyui-image
description: Generate an image via local ComfyUI (127.0.0.1:8188), then return the created file path.
user-invocable: true
metadata:
  {
    "openclaw":
      {
        "emoji": "image",
        "requires": { "bins": ["node"] },
      },
  }
---

# ComfyUI Image

Generate images with your local ComfyUI server using a prompt and a workflow JSON.

## What this skill does

1. Sends workflow payload to `POST /prompt`
2. Polls `GET /history/{prompt_id}` until image output is ready
3. Fetches image via `GET /view?...`
4. Saves image to `~/.openclaw/workspace/creations/comfyui` by default
5. Runs an automatic reflection loop (`image-describe`) and returns structured image analysis JSON when available

## Use

```bash
node {baseDir}/../comfyui-image.js --prompt "fractal neon cathedral in rain" --return path
```

Optional flags:

```bash
--negative "blurry, low quality"
--baseUrl "http://127.0.0.1:8188"
--host "127.0.0.1"
--port 8188
--timeoutMs 180000
--pollMs 1000
--save true
--outDir "C:/Users/holyd/.openclaw/workspace/creations/comfyui"
--return json
--describe true
--visionModel "meta-llama/llama-4-maverick:free"
```

Default workflow: `{baseDir}/../flux_workflow.json` (Flux.1 Dev template with `{{prompt}}`).

Fallback mode (if no workflow file):

```bash
node {baseDir}/../comfyui-image.js --prompt "dreamy geometric pattern" --checkpoint "your_model.safetensors" --return path
```

## Reflection loop (recommended)

After image generation, run the `image` tool on the produced file path to let Om describe and reflect on the result.

## Natural language trigger

When the user asks in plain language (for example: `generiere ein Bild von X` or `generate an image of X`), call this skill and pass the full user text as `--prompt`; the script extracts the visual subject automatically.
