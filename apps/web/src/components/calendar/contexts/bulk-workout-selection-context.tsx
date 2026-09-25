import { createContext, useContext } from 'react';

export const BulkWorkoutSelectionContext = createContext<{
  selecting: boolean;
  busy: boolean;
  selected: Set<number>;
  eligible: Set<number>;
  toggle: (id: number) => void;
} | null>(null);

export const useBulkWorkoutSelection = () =>
  useContext(BulkWorkoutSelectionContext);
