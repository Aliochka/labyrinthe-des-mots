/**
 * Keyboard event handling hook for Map2D
 * Manages SPACE and ESC key handlers for galaxy exploration
 */

import { useEffect, useRef } from "react";
import { KEY_ENTER_GALAXY, KEY_RETURN_MACRO, KEYBOARD_DEBOUNCE } from "../constants";

/**
 * Keyboard handlers interface
 */
export interface KeyboardHandlers {
  /** Called when SPACE is pressed (enter galaxy-stars mode) */
  onSpace: () => void;
  /** Called when ESC is pressed (return to all-galaxies mode) */
  onEscape: () => void;
}

/**
 * Hook for managing keyboard controls in Map2D
 * Listens for SPACE and ESC keys with debouncing to prevent rapid triggers
 *
 * @param handlers - Object with onSpace and onEscape callbacks
 */
export function useKeyboardControls(handlers: KeyboardHandlers): void {
  const { onSpace, onEscape } = handlers;
  const lastTriggerRef = useRef<{ space: number; escape: number }>({
    space: 0,
    escape: 0,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();

      // Check for SPACE key
      if (KEY_ENTER_GALAXY.includes(e.key) || KEY_ENTER_GALAXY.includes(e.code)) {
        e.preventDefault(); // Prevent page scroll

        // Debounce
        if (now - lastTriggerRef.current.space < KEYBOARD_DEBOUNCE) {
          return;
        }

        lastTriggerRef.current.space = now;
        onSpace();
      }

      // Check for ESC key
      else if (KEY_RETURN_MACRO.includes(e.key)) {
        e.preventDefault();

        // Debounce
        if (now - lastTriggerRef.current.escape < KEYBOARD_DEBOUNCE) {
          return;
        }

        lastTriggerRef.current.escape = now;
        onEscape();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSpace, onEscape]);
}
