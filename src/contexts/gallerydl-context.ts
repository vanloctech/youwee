import { createContext, useContext } from 'react';
import type { GalleryDlContextType } from './GalleryDlContext';

export const GalleryDlContext = createContext<GalleryDlContextType | null>(null);

export function useGalleryDl() {
  const context = useContext(GalleryDlContext);
  if (!context) {
    throw new Error('useGalleryDl must be used within a GalleryDlProvider');
  }
  return context;
}
