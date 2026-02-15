import sounddevice as sd
import numpy as np
import scipy.io.wavfile as wav
import time
import sys
import os
import queue

# Configuration
SAMPLE_RATE = 16000  # 16kHz for Whisper
CHANNELS = 1
SILENCE_THRESHOLD = 0.02  # RMS threshold
SILENCE_DURATION = 2.0    # Stop after 2s silence
MAX_DURATION = 30.0       # Max recording length
MIN_DURATION = 0.5        # Min duration to avoid instant stops

def record_audio(filename):
    print(f"👂 Listening... (Speak now)")
    print(f"📊 Config: Threshold={SILENCE_THRESHOLD}, Max={MAX_DURATION}s")
    
    try:
        device_info = sd.query_devices(kind='input')
        # print(f"🎤 Device: {device_info['name']}")
    except Exception as e:
        print(f"❌ No input device found: {e}")
        return False

    q = queue.Queue()

    def callback(indata, frames, time_info, status):
        if status:
            print(status, file=sys.stderr)
        q.put(indata.copy())

    audio_data = []
    start_time = time.time()
    last_sound_time = start_time
    is_recording = True
    
    try:
        # Open stream
        with sd.InputStream(samplerate=SAMPLE_RATE, channels=CHANNELS, callback=callback):
            while is_recording:
                current_time = time.time()
                total_duration = current_time - start_time
                silence_duration = current_time - last_sound_time
                
                # Retrieve all available chunks
                try:
                    # Block briefly to wait for data, but allow loop to cycle for time checks
                    indata = q.get(timeout=0.1)
                    audio_data.append(indata)
                    
                    # RMS Calculation
                    rms = np.sqrt(np.mean(indata**2))
                    
                    if rms > SILENCE_THRESHOLD:
                        last_sound_time = current_time
                        # print(f"🔊", end="", flush=True) 
                    
                except queue.Empty:
                    pass

                # Check Constraints
                if total_duration > MIN_DURATION and silence_duration > SILENCE_DURATION:
                    print(f"\n🛑 Silence detected ({silence_duration:.1f}s).")
                    is_recording = False
                
                if total_duration > MAX_DURATION:
                    print(f"\n🛑 Max duration reached.")
                    is_recording = False
                    
    except Exception as e:
        print(f"\n❌ Recording error: {e}")
        return False

    # Save
    if not audio_data:
        print("❌ No audio recorded.")
        return False
        
    print(f"💾 processing...")
    recording = np.concatenate(audio_data, axis=0)
    
    # Normalize to 16-bit PCM for generic compatibility (optional, but good for WAV)
    # output is float32, wavfile.write handles it, but 16-bit int is standard for speech
    # wav.write handles float32 (-1.0 to 1.0) fine usually.
    wav.write(filename, SAMPLE_RATE, recording)
    print(f"✅ Saved to {filename}")
    return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        output_file = "temp/hearing/input.wav"
    else:
        output_file = sys.argv[1]
        
    dir_name = os.path.dirname(output_file)
    if dir_name:
        os.makedirs(dir_name, exist_ok=True)
    
    record_audio(output_file)
