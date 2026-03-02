/**
 * Shared Framer Motion variants for consistent animations across all pages.
 */

export const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

export const fadeUpItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

export const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
};

export const pageTransition = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.15 } },
};

export const slideInLeft = {
  hidden: { x: -280, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { type: "spring", bounce: 0, duration: 0.3 } },
  exit: { x: -280, opacity: 0, transition: { duration: 0.2 } },
};
