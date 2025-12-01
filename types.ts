export interface TreeStore {
  progress: number; // 0 = Tree, 1 = Scattered
  rotationY: number;
  rotationVelocity: number;
  photos: string[];
  isHandDetected: boolean;
  gesture: string;
  activePhotoIndex: number | null; // Track which photo is zoomed
  
  // New State for Interactions
  cameraVerticalTarget: number; // 0 to 1, controlled by hand Y position for camera tilt
  decorationsVisible: boolean; // Toggled by gesture
  isMusicPlaying: boolean; // Background music state

  setProgress: (p: number) => void;
  setRotationVelocity: (v: number) => void;
  addPhotos: (files: FileList | null) => void;
  setHandStatus: (detected: boolean, gesture: string) => void;
  setActivePhotoIndex: (index: number | null) => void;
  setCameraVerticalTarget: (target: number) => void;
  toggleDecorations: () => void;
  toggleMusic: () => void;
}

export enum Decorations {
  GIFT = 'GIFT',
  ORB = 'ORB',
  LIGHT = 'LIGHT'
}