import React, { useRef, useState, useEffect } from 'react';
import TreeScene from './components/TreeScene';
import GestureController from './components/GestureController';
import { useTreeStore } from './store';
import { useTreeStore as useStoreSelector } from './store'; // Alias for clarity

const App: React.FC = () => {
  const setProgress = useStoreSelector(state => state.setProgress);
  const progress = useStoreSelector(state => state.progress);
  const addPhotos = useStoreSelector(state => state.addPhotos);
  const isHandDetected = useStoreSelector(state => state.isHandDetected);
  const gesture = useStoreSelector(state => state.gesture);
  const isMusicPlaying = useStoreSelector(state => state.isMusicPlaying);
  const toggleMusic = useStoreSelector(state => state.toggleMusic);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [showInstructions, setShowInstructions] = useState(true);

  // Sync Audio with State
  useEffect(() => {
      const audio = audioRef.current;
      if (audio) {
          audio.volume = 0.5; // Increased volume for better visibility
          
          if (isMusicPlaying) {
              const playPromise = audio.play();
              if (playPromise !== undefined) {
                  playPromise.catch(error => {
                      console.warn("Autoplay blocked/Audio Error:", error);
                      // Most browsers block audio until the user interacts with the page (click/tap).
                      // The interaction listener below will handle unblocking.
                  });
              }
          } else {
              audio.pause();
          }
      }
  }, [isMusicPlaying]);

  // Unlock Audio on First Interaction (Browser Autoplay Policy Fix)
  useEffect(() => {
    const handleInteraction = () => {
        const audio = audioRef.current;
        if (audio && isMusicPlaying && audio.paused) {
            audio.play().catch(e => console.warn("Audio play failed on interaction", e));
        }
        // Remove listeners once triggers
        document.removeEventListener('click', handleInteraction);
        document.removeEventListener('touchstart', handleInteraction);
        document.removeEventListener('keydown', handleInteraction);
    };

    document.addEventListener('click', handleInteraction);
    document.addEventListener('touchstart', handleInteraction);
    document.addEventListener('keydown', handleInteraction);

    return () => {
        document.removeEventListener('click', handleInteraction);
        document.removeEventListener('touchstart', handleInteraction);
        document.removeEventListener('keydown', handleInteraction);
    };
  }, [isMusicPlaying]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProgress(parseFloat(e.target.value));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    addPhotos(e.target.files);
  };

  return (
    <div className="w-full h-screen bg-black text-[#D4AF37] overflow-hidden relative selection:bg-[#D4AF37] selection:text-black">
      
      {/* Background Audio with Cross-Browser Compatibility (MP3 + OGG) */}
      <audio 
        ref={audioRef} 
        loop 
        preload="auto"
        crossOrigin="anonymous"
      >
        <source src="https://upload.wikimedia.org/wikipedia/commons/transcoded/e/e5/Kevin_MacLeod_-_Jingle_Bells.ogg/Kevin_MacLeod_-_Jingle_Bells.ogg.mp3" type="audio/mpeg" />
        <source src="https://upload.wikimedia.org/wikipedia/commons/e/e5/Kevin_MacLeod_-_Jingle_Bells.ogg" type="audio/ogg" />
      </audio>

      {/* 3D Scene Layer */}
      <div className="absolute inset-0 z-0">
        <TreeScene />
      </div>

      {/* UI Overlay Layer */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-6">
        
        {/* Header */}
        <header className="flex justify-end items-start pointer-events-auto">
          
          <div className="flex flex-col gap-2 items-end">
            <div className="flex gap-2">
                <button 
                    onClick={toggleMusic}
                    className={`px-4 py-3 font-bold uppercase tracking-widest transition-all duration-300 shadow-[0_0_10px_rgba(212,175,55,0.4)] ${isMusicPlaying ? 'bg-[#D4AF37] text-black' : 'bg-black/60 border border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37]/20'}`}
                >
                  {isMusicPlaying ? '♫ ON' : '♫ OFF'}
                </button>
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="px-6 py-3 bg-[#D4AF37] text-black font-bold uppercase tracking-widest hover:bg-white transition-all duration-300 shadow-[0_0_20px_rgba(212,175,55,0.4)]"
                >
                  Add Photos
                </button>
            </div>
            
            <input 
                type="file" 
                multiple 
                accept="image/*" 
                className="hidden" 
                ref={fileInputRef} 
                onChange={handleFileUpload}
            />
             <button 
                onClick={() => setShowInstructions(!showInstructions)}
                className="pointer-events-auto px-6 py-2 border border-[#D4AF37] text-[#D4AF37] text-xs uppercase tracking-widest hover:bg-[#D4AF37] hover:text-black transition-all"
            >
              {showInstructions ? 'Hide Help' : 'Show Help'}
            </button>
          </div>
        </header>

        {/* Instructions Panel */}
        {showInstructions && (
            <div className="absolute top-32 right-6 w-80 bg-black/60 backdrop-blur-md border-l-2 border-[#D4AF37] p-4 text-sm pointer-events-auto transition-opacity">
                <h3 className="serif text-xl mb-3 text-white">Controls</h3>
                <ul className="space-y-2 text-gray-300 font-light">
                    <li className="flex items-center gap-2">
                        <span className="text-[#D4AF37] font-bold">✋ OPEN PALM:</span> Scatter Tree
                    </li>
                    <li className="flex items-center gap-2">
                        <span className="text-[#D4AF37] font-bold">✊ FIST:</span> Restore Tree
                    </li>
                    <li className="flex items-center gap-2">
                        <span className="text-[#D4AF37] font-bold">✌️ VICTORY:</span> Toggle Decorations
                    </li>
                     <li className="flex items-center gap-2">
                        <span className="text-[#D4AF37] font-bold">👍 THUMB UP:</span> Toggle Music
                    </li>
                    <li className="flex items-center gap-2">
                        <span className="text-[#D4AF37] font-bold">↔️ MOVE HAND:</span> Rotate Camera
                    </li>
                </ul>
            </div>
        )}

        {/* Bottom Controls */}
        <footer className="w-full flex flex-col items-center pointer-events-auto pb-8">
            
            {/* Slider Control */}
            <div className="w-full max-w-2xl flex items-center gap-4 bg-black/40 backdrop-blur-md p-4 rounded-full border border-[#D4AF37]/30">
                <span className="text-xs font-bold text-[#D4AF37] w-12 text-center">TREE</span>
                <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.01" 
                    value={progress} 
                    onChange={handleSliderChange}
                    className="w-full h-1 bg-emerald-900 rounded-lg appearance-none cursor-pointer accent-[#D4AF37]"
                />
                <span className="text-xs font-bold text-[#D4AF37] w-12 text-center">CHAOS</span>
            </div>
        </footer>

      </div>

      {/* Hidden Logic Components */}
      <GestureController />
    </div>
  );
};

export default App;