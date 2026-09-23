import { useState, useCallback, useRef } from "react";
import { HouseLayout } from "@/types/house";

export interface EditorHistoryState {
  past: HouseLayout[];
  present: HouseLayout;
  future: HouseLayout[];
}

export function useEditorHistory(initialLayout: HouseLayout) {
  const [history, setHistory] = useState<EditorHistoryState>({
    past: [],
    present: initialLayout,
    future: [],
  });

  // Track latest present for synchronous callbacks
  const presentRef = useRef(initialLayout);
  presentRef.current = history.present;

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const pushSnapshot = useCallback((newLayout: HouseLayout) => {
    setHistory((curr) => {
      // Don't record if identical by deep compare of critical geometry
      if (JSON.stringify(curr.present) === JSON.stringify(newLayout)) {
        return curr;
      }
      return {
        past: [...curr.past.slice(-30), curr.present], // Keep last 30 snapshots
        present: newLayout,
        future: [], // Clear redo stack on new action
      };
    });
  }, []);

  const setPresentDirectly = useCallback((layout: HouseLayout) => {
    setHistory((curr) => ({
      ...curr,
      present: layout,
    }));
  }, []);

  const undo = useCallback((): HouseLayout | null => {
    let restored: HouseLayout | null = null;
    setHistory((curr) => {
      if (curr.past.length === 0) return curr;
      const previous = curr.past[curr.past.length - 1];
      const newPast = curr.past.slice(0, curr.past.length - 1);
      restored = previous;
      return {
        past: newPast,
        present: previous,
        future: [curr.present, ...curr.future],
      };
    });
    return restored;
  }, []);

  const redo = useCallback((): HouseLayout | null => {
    let restored: HouseLayout | null = null;
    setHistory((curr) => {
      if (curr.future.length === 0) return curr;
      const next = curr.future[0];
      const newFuture = curr.future.slice(1);
      restored = next;
      return {
        past: [...curr.past, curr.present],
        present: next,
        future: newFuture,
      };
    });
    return restored;
  }, []);

  return {
    layout: history.present,
    canUndo,
    canRedo,
    undo,
    redo,
    pushSnapshot,
    setPresentDirectly,
  };
}
