import { useState, useRef } from 'react';
import { Vector3 } from 'three';
import type { Controls } from './useKeyboardControls';

const ACCEL = 200; // units/s² (adjusted to match 10x scale)
const MAX_SPEED = 100; // units/s (adjusted to match 10x scale)
const FRICTION = 0.95; // damping coefficient
const BOOST_MULTIPLIER = 2;

export interface PlayerPhysics {
  position: Vector3;
  velocity: Vector3;
  update: (controls: Controls, deltaTime: number, cameraDirection: Vector3) => Vector3;
}

export function usePlayerPhysics(initialPosition: Vector3 = new Vector3(0, 0, 0)): PlayerPhysics {
  const [position, setPosition] = useState(() => initialPosition.clone());
  const velocityRef = useRef(new Vector3(0, 0, 0));

  const update = (controls: Controls, deltaTime: number, cameraDirection: Vector3) => {
    const dt = deltaTime;
    const velocity = velocityRef.current;

    // Stop command - immediately set velocity to zero
    if (controls.stop) {
      velocity.set(0, 0, 0);
      return position; // Return current position when stopped
    }

    // Calculate forward and right directions based on camera
    const forward = new Vector3(cameraDirection.x, 0, cameraDirection.z).normalize();
    const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();
    const up = new Vector3(0, 1, 0); // World up direction

    // Calculate acceleration based on controls
    const acceleration = new Vector3(0, 0, 0);
    const accelMagnitude = controls.boost ? ACCEL * BOOST_MULTIPLIER : ACCEL;

    if (controls.forward) {
      acceleration.add(forward.clone().multiplyScalar(accelMagnitude));
    }
    if (controls.backward) {
      acceleration.add(forward.clone().multiplyScalar(-accelMagnitude));
    }
    if (controls.left) {
      acceleration.add(right.clone().multiplyScalar(-accelMagnitude));
    }
    if (controls.right) {
      acceleration.add(right.clone().multiplyScalar(accelMagnitude));
    }
    if (controls.up) {
      acceleration.add(up.clone().multiplyScalar(accelMagnitude));
    }
    if (controls.down) {
      acceleration.add(up.clone().multiplyScalar(-accelMagnitude));
    }

    // Update velocity with acceleration
    velocity.add(acceleration.multiplyScalar(dt));

    // Apply friction
    velocity.multiplyScalar(FRICTION);

    // Clamp to max speed
    const speed = velocity.length();
    if (speed > MAX_SPEED) {
      velocity.normalize().multiplyScalar(MAX_SPEED);
    }

    // Update position
    const newPosition = position.clone().add(velocity.clone().multiplyScalar(dt));
    setPosition(newPosition);

    // Return new position immediately for synchronous camera tracking
    return newPosition;
  };

  return {
    position,
    velocity: velocityRef.current,
    update,
  };
}
