import { useMotionValue, useSpring, useTransform } from 'framer-motion';

const spring = { stiffness: 260, damping: 22, mass: 0.6 };

/**
 * Pointer-driven 3D tilt + moving glare, shared by grid tiles and the detail view.
 * Spread `handlers` on the element that tracks the pointer, put `rotateX/rotateY`
 * on the element that tilts, and `glare` as the background of an overlay span.
 */
export function useTilt(maxDeg = 9) {
  const px = useMotionValue(0); // -0.5..0.5 across the element
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-maxDeg, maxDeg]), spring);
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [maxDeg, -maxDeg]), spring);
  const glareX = useTransform(px, [-0.5, 0.5], ['0%', '100%']);
  const glareY = useTransform(py, [-0.5, 0.5], ['0%', '100%']);
  const glare = useTransform(
    [glareX, glareY],
    ([x, y]) => `radial-gradient(circle at ${x} ${y}, rgba(255,255,255,0.28), transparent 55%)`,
  );

  const reset = () => {
    px.set(0);
    py.set(0);
  };

  const handlers = {
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      px.set((e.clientX - r.left) / r.width - 0.5);
      py.set((e.clientY - r.top) / r.height - 0.5);
    },
    onPointerLeave: reset,
  };

  return { rotateX, rotateY, glare, handlers, reset };
}
