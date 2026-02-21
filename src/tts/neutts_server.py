import os
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
import soundfile as sf
import tempfile
from neutts import NeuTTS

app = FastAPI()

# Global TTS instance to keep models loaded in memory
# This avoids the slow initialization cost on every request
tts = None
ref_codes = None
ref_text = ""

class TTSRequest(BaseModel):
    text: str

@app.on_event("startup")
async def startup_event():
    global tts, ref_codes, ref_text
    print("Loading NeuTTS Nano German model... (This may take a minute)")
    
    tts = NeuTTS(
        backbone_repo="neuphonic/neutts-nano-german",
        backbone_device="cpu", # Change to cuda/mps if GPU support is needed
        codec_repo="neuphonic/neucodec",
        codec_device="cpu",
    )
    
    samples_dir = os.path.join(os.path.dirname(__file__), "samples")
    ref_audio_path = os.path.join(samples_dir, "greta.wav")
    ref_text_path = os.path.join(samples_dir, "greta.txt")
    
    if not os.path.exists(ref_audio_path) or not os.path.exists(ref_text_path):
        print(f"WARNING: Reference files not found in {samples_dir}!")
        return

    try:
        with open(ref_text_path, "r", encoding="utf-8") as f:
            ref_text = f.read().strip()
        print("Encoding reference audio...")
        ref_codes = tts.encode_reference(ref_audio_path)
        print("NeuTTS Nano German loaded successfully!")
    except Exception as e:
        print(f"Failed to load reference: {e}")

@app.post("/tts")
async def generate_speech(req: TTSRequest):
    global tts, ref_codes, ref_text
    
    if tts is None or ref_codes is None:
        raise HTTPException(status_code=503, detail="TTS model or reference not loaded")
        
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
        
    try:
        print(f"Synthesizing: '{req.text[:50]}...'")
        # Run inference
        wav = tts.infer(req.text.strip(), ref_codes, ref_text)
        
        # Save to temporary file
        fd, temp_path = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        
        sf.write(temp_path, wav, 24000)
        
        return FileResponse(
            temp_path, 
            media_type="audio/wav", 
            filename="response.wav",
            background=None # Using FileResponse removes the file automatically in Starlette usually, but we might want BackgroundTasks if it gets stuck
        )
    except Exception as e:
        print(f"Error during TTS generation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Make sure to run on 127.0.0.1 and a distinct port
    uvicorn.run(app, host="127.0.0.1", port=42890)
