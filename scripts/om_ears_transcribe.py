from faster_whisper import WhisperModel
import sys
import os
import time

# Ensure proper encoding for Windows console
sys.stdout.reconfigure(encoding='utf-8')

# Configuration
MODEL_SIZE = "tiny"
DEVICE = "cpu"       
COMPUTE_TYPE = "int8" 

def transcribe(audio_file):
    if not os.path.exists(audio_file):
        print(f"❌ File not found: {audio_file}", file=sys.stderr)
        return None

    print(f"🧠 Transcribing {audio_file}...", file=sys.stderr)
    start_time = time.time()
    
    try:
        # Load model (download on first run)
        model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)
        
        segments, info = model.transcribe(audio_file, beam_size=5)
        
        full_text = ""
        for segment in segments:
            full_text += segment.text + " "
            
        elapsed = time.time() - start_time
        # Print metadata to stderr so it doesn't pollute pipe
        print(f"✅ Transcribed in {elapsed:.2f}s ({info.language}):", file=sys.stderr)
        
        # Print ONLY text to stdout for piping
        text = full_text.strip()
        print(text)
        
        return text
        
    except Exception as e:
        print(f"❌ Transcription error: {e}", file=sys.stderr)
        return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        input_file = "temp/hearing/input.wav"
    else:
        input_file = sys.argv[1]
        
    text = transcribe(input_file)
