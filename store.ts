import { create } from 'zustand';
import { TreeStore } from './types';

export const useTreeStore = create<TreeStore>((set) => ({
  progress: 0,
  rotationY: 0,
  rotationVelocity: 0,
  photos: [],
  isHandDetected: false,
  gesture: 'None',
  activePhotoIndex: null,
  cameraVerticalTarget: 0.5, // Default center
  decorationsVisible: true,
  isMusicPlaying: false, // Default off so user triggers it (browser policy)
  
  setProgress: (p) => set({ progress: Math.max(0, Math.min(1, p)) }),
  
  setRotationVelocity: (v) => set({ rotationVelocity: v }),
  
  addPhotos: (files) => {
    if (!files || files.length === 0) return;
    const newPhotos = Array.from(files).map((file: any) => URL.createObjectURL(file));
    set((state) => ({ photos: [...state.photos, ...newPhotos] }));
  },
  
  setHandStatus: (detected, gesture) => set({ isHandDetected: detected, gesture }),

  setActivePhotoIndex: (index) => set({ activePhotoIndex: index }),

  setCameraVerticalTarget: (target) => set({ cameraVerticalTarget: Math.max(0, Math.min(1, target)) }),

  toggleDecorations: () => set((state) => ({ decorationsVisible: !state.decorationsVisible })),
  
  toggleMusic: () => set((state) => ({ isMusicPlaying: !state.isMusicPlaying }))
}));