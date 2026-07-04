export interface Template {
  id: string;
  name: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  borderColor: string;
  borderWidth: number;
  padding: number;
  gap: number;
  bottomSpace: number;
  borderRadius: number;
  description: string;
  frameOverlay?: string; // Optional overlay image URL
}

export interface Layout {
  id: string;
  name: string;
  photosCount: number;
  aspectRatio: number; // e.g., 4/3 or 1/1 or 16/9
  description: string;
}

export interface PhotoBoothState {
  photos: string[];
  layout: Layout;
  template: Template;
  capturingIndex: number | null;
  countdown: number;
  textCaption: string;
  subCaption: string;
  flashActive: boolean;
}
