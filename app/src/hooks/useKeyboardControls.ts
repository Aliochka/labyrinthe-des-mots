import { useEffect, useState } from 'react';

export interface Controls {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  boost: boolean;
}

export function useKeyboardControls(): Controls {
  const [keys, setKeys] = useState<Controls>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    boost: false,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          setKeys((k) => ({ ...k, forward: true }));
          break;
        case 's':
        case 'arrowdown':
          setKeys((k) => ({ ...k, backward: true }));
          break;
        case 'a':
        case 'arrowleft':
          setKeys((k) => ({ ...k, left: true }));
          break;
        case 'd':
        case 'arrowright':
          setKeys((k) => ({ ...k, right: true }));
          break;
        case ' ':
          setKeys((k) => ({ ...k, up: true }));
          break;
        case 'control':
          setKeys((k) => ({ ...k, down: true }));
          break;
        case 'shift':
          setKeys((k) => ({ ...k, boost: true }));
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          setKeys((k) => ({ ...k, forward: false }));
          break;
        case 's':
        case 'arrowdown':
          setKeys((k) => ({ ...k, backward: false }));
          break;
        case 'a':
        case 'arrowleft':
          setKeys((k) => ({ ...k, left: false }));
          break;
        case 'd':
        case 'arrowright':
          setKeys((k) => ({ ...k, right: false }));
          break;
        case ' ':
          setKeys((k) => ({ ...k, up: false }));
          break;
        case 'control':
          setKeys((k) => ({ ...k, down: false }));
          break;
        case 'shift':
          setKeys((k) => ({ ...k, boost: false }));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return keys;
}
