import { createContext, useContext } from 'react';

export const BulkWorkoutSelectionContext = createContext<{
  /** Bulk selection exists for this calendar (coach, editable, one athlete). */
  available: boolean;
  selecting: boolean;
  busy: boolean;
  selected: Set<number>;
  eligible: Set<number>;
  toggle: (id: number) => void;
  start: () => void;
  /** Leaves selection mode and clears the selection. */
  cancel: () => void;
} | null>(null);

export const useBulkWorkoutSelection = () =>
  useContext(BulkWorkoutSelectionContext);
