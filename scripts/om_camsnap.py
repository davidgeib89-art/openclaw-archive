import cv2
import sys
import os
import time

def capture_image(output_path):
    print("👁️ Opening Third Eye (Camera)...")
    
    # Initialize camera using DirectShow (faster on Windows)
    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    
    if not cap.isOpened():
        print("❌ Cannot open camera")
        return False
        
    # Set resolution (optional, default is usually fine)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    
    # Warm up camera (auto-exposure)
    for _ in range(5):
        cap.read()
        time.sleep(0.1)
        
    # Capture frame
    ret, frame = cap.read()
    
    # Release camera
    cap.release()
    
    if not ret:
        print("❌ Can't receive frame (stream end?). Exiting ...")
        return False
        
    # Save image
    cv2.imwrite(output_path, frame)
    print(f"✅ Vision Manifested: {output_path}")
    return True

if __name__ == "__main__":
    # Ensure stdout is utf-8
    sys.stdout.reconfigure(encoding='utf-8')
    
    if len(sys.argv) < 2:
        output_file = "temp/vision/snapshot.jpg"
    else:
        output_file = sys.argv[1]
        
    # Ensure directory exists
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    success = capture_image(output_file)
    if not success:
        sys.exit(1)
