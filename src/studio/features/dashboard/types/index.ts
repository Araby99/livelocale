export interface SelectedElement {
  key: string;
  fallbackValue: string;
  currentValue: string;
  /**
   * The stored value the page shows for the key, when it differs from `currentValue`: a
   * translation the edited locale lacks shows its fallback's value. The live preview finds
   * the text on the page by it. Absent, `currentValue` is what the page shows.
   */
  pageValue?: string;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';
