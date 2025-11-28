import { useEffect, useRef } from 'react';

export const motionTokens = {
  durations: {
    instant: 120,
    fast: 220,
    base: 320,
    slow: 480
  },
  easings: {
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
    entrance: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)'
  },
  shadows: {
    card: '0 25px 45px rgba(15, 23, 42, 0.18)',
    floating: '0 35px 55px rgba(30, 64, 175, 0.35)'
  }
};

export function useParallaxHover(strength = 12) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const handlePointerMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      const rotateX = (-y / rect.height) * strength;
      const rotateY = (x / rect.width) * strength;
      element.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
    };
    const handlePointerLeave = () => {
      element.style.transform = 'rotateX(0deg) rotateY(0deg) scale(1)';
    };
    element.addEventListener('pointermove', handlePointerMove);
    element.addEventListener('pointerleave', handlePointerLeave);
    return () => {
      element.removeEventListener('pointermove', handlePointerMove);
      element.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [strength]);

  return ref;
}

export function useAutoReveal(delay = 0) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.opacity = '0';
    element.style.transform = 'translateY(30px) scale(0.98)';
    element.style.transition = `opacity ${motionTokens.durations.base}ms ${motionTokens.easings.standard}, transform ${motionTokens.durations.base}ms ${motionTokens.easings.entrance}`;
    const timeout = setTimeout(() => {
      element.style.opacity = '1';
      element.style.transform = 'translateY(0px) scale(1)';
    }, delay);
    return () => clearTimeout(timeout);
  }, [delay]);
  return ref;
}

