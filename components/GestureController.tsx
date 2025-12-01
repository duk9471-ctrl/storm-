import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';
import { useTreeStore } from '../store';

const GestureController: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const requestRef = useRef<number>(0);
  const [loading, setLoading] = useState(true);
  const lastGestureRef = useRef<string>('None');
  const toggleCooldownRef = useRef<number>(0);
  
  // Use store selectors for setting state
  const setHandStatus = useTreeStore(state => state.setHandStatus);
  const setProgress = useTreeStore(state => state.setProgress);
  const setRotationVelocity = useTreeStore(state => state.setRotationVelocity);
  const setCameraVerticalTarget = useTreeStore(state => state.setCameraVerticalTarget);
  const toggleDecorations = useTreeStore(state => state.toggleDecorations);
  const toggleMusic = useTreeStore(state => state.toggleMusic);

  // Initialize MediaPipe
  useEffect(() => {
    const initMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        
        recognizerRef.current = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1
        });
        
        setLoading(false);
        startWebcam();
      } catch (error) {
        console.error("MediaPipe Init Error:", error);
        setLoading(false);
      }
    };

    initMediaPipe();
  }, []);

  const startWebcam = async () => {
    try {
      // Mobile Support: Prefer front-facing camera ('user')
      const constraints = {
        video: {
            facingMode: 'user',
            width: { ideal: 640 }, // Lower resolution is sufficient for gesture and faster on mobile
            height: { ideal: 480 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Strict check: Ensure the ref is still valid after the async call
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.addEventListener('loadeddata', predictWebcam);
      } else {
        // If the component unmounted or ref is null, stop the stream tracks to avoid leaks
        stream.getTracks().forEach(track => track.stop());
      }
    } catch (err) {
      console.error("Webcam Error:", err);
    }
  };

  const predictWebcam = () => {
    if (!recognizerRef.current || !videoRef.current) return;

    try {
        const nowInMs = Date.now();
        // Check if video is ready
        if (videoRef.current.readyState < 2) {
             requestRef.current = requestAnimationFrame(predictWebcam);
             return;
        }

        const result = recognizerRef.current.recognizeForVideo(videoRef.current, nowInMs);

        if (result.gestures.length > 0 && result.landmarks.length > 0) {
            const gestureName = result.gestures[0][0].categoryName;
            const handX = result.landmarks[0][0].x; // Wrist x-coordinate normalized [0,1]
            const handY = result.landmarks[0][0].y; // Wrist y-coordinate normalized [0,1] (Top is 0)

            setHandStatus(true, gestureName);

            // Access fresh state directly to avoid closure staleness
            const currentProgress = useTreeStore.getState().progress;

            // --- Gesture Logic ---

            // 1. Open_Palm -> Scatter (Target 1)
            if (gestureName === 'Open_Palm') {
                setProgress(currentProgress + 0.02); 
            } 
            // 2. Closed_Fist -> Aggregate (Target 0)
            else if (gestureName === 'Closed_Fist') {
                setProgress(currentProgress - 0.02);
            }
            // 3. Victory (Peace Sign) -> Toggle Decorations
            // Implemented with cooldown/debounce to act as a trigger switch
            else if (gestureName === 'Victory') {
                if (lastGestureRef.current !== 'Victory' && nowInMs - toggleCooldownRef.current > 1000) {
                    toggleDecorations();
                    toggleCooldownRef.current = nowInMs;
                }
            }
            // 4. Thumb_Up -> Toggle Music
            else if (gestureName === 'Thumb_Up') {
                 if (lastGestureRef.current !== 'Thumb_Up' && nowInMs - toggleCooldownRef.current > 1000) {
                     toggleMusic();
                     toggleCooldownRef.current = nowInMs;
                 }
            }

            // 5. Horizontal Rotation based on X position
            // Left side (< 0.3) -> Rotate Left
            // Right side (> 0.7) -> Rotate Right
            if (handX < 0.3) {
                setRotationVelocity(-0.3); 
            } else if (handX > 0.7) {
                setRotationVelocity(0.3); 
            } else {
                setRotationVelocity(0);
            }

            // 6. Vertical Camera Angle based on Y position (Height)
            // Map Hand Y directly to vertical target (0 = Top, 1 = Bottom)
            // Use smoothing or direct mapping
            setCameraVerticalTarget(handY);

            lastGestureRef.current = gestureName;

        } else {
            setHandStatus(false, 'None');
            setRotationVelocity(0);
            lastGestureRef.current = 'None';
        }
    } catch (e) {
        console.warn("Prediction error", e);
    }

    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  useEffect(() => {
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  return (
    <div className="fixed bottom-4 left-4 z-50 overflow-hidden rounded-lg border-2 border-[#D4AF37] shadow-[0_0_15px_rgba(212,175,55,0.5)] w-24 h-18 md:w-32 md:h-24 bg-black/80">
      {loading && <div className="text-white text-[10px] md:text-xs p-2 text-center">Loading AI...</div>}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className={`w-full h-full object-cover transform scale-x-[-1] ${loading ? 'opacity-0' : 'opacity-100'}`} 
      />
    </div>
  );
};

export default GestureController;