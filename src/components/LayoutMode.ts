import { createContext, useContext } from 'react';

/** How album lists are shown: a wall of tiles, or one record at a time. */
export type LayoutMode = 'grid' | 'single';

type LayoutState = {
  mode: LayoutMode;
  /** Key of the album open in the detail overlay, so one-at-a-time view can follow ← → in it. */
  selectedKey: string | null;
};

export const LayoutModeContext = createContext<LayoutState>({ mode: 'grid', selectedKey: null });
export const useLayoutMode = () => useContext(LayoutModeContext);
