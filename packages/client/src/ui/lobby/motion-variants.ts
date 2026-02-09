/**
 * Motion Variants - Framer Motion presets
 * 
 * Reusable animation variants for lobby components.
 * Import these into components using framer-motion.
 */

// =============================================================================
// SCREEN TRANSITIONS
// =============================================================================

export const screenVariants = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
};

export const screenTransition = {
    duration: 0.3,
    ease: 'easeOut',
};

// =============================================================================
// CARD / BUTTON INTERACTIONS
// =============================================================================

export const cardVariants = {
    idle: { scale: 1, y: 0 },
    hover: { scale: 1.02, y: -2 },
    tap: { scale: 0.98 },
};

export const buttonVariants = {
    idle: { scale: 1 },
    hover: { scale: 1.02 },
    tap: { scale: 0.97 },
};

// =============================================================================
// PLAYER SLOT ENTRY
// =============================================================================

export const slotVariants = {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9 },
};

export const slotTransition = {
    duration: 0.25,
    ease: 'easeOut',
};

// =============================================================================
// STAGGER CHILDREN
// =============================================================================

export const containerVariants = {
    initial: {},
    animate: {
        transition: {
            staggerChildren: 0.05,
        },
    },
};

export const itemVariants = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
};

// =============================================================================
// COUNTDOWN
// =============================================================================

export const countdownVariants = {
    initial: { scale: 1.2, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
};

export const countdownTransition = {
    duration: 0.5,
    ease: [0.16, 1, 0.3, 1], // easeOutExpo
};

// =============================================================================
// BADGE PULSE
// =============================================================================

export const badgePulseVariants = {
    animate: {
        opacity: [1, 0.7, 1],
        transition: {
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
        },
    },
};

// =============================================================================
// PLACEHOLDER PULSE
// =============================================================================

export const placeholderVariants = {
    animate: {
        opacity: [0.5, 0.7, 0.5],
        transition: {
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
        },
    },
};

// =============================================================================
// MODAL / OVERLAY
// =============================================================================

export const overlayVariants = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
};

export const modalVariants = {
    initial: { opacity: 0, scale: 0.95, y: 20 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: 20 },
};

// =============================================================================
// SPRING PRESETS
// =============================================================================

export const springSnappy = {
    type: 'spring',
    stiffness: 400,
    damping: 30,
};

export const springGentle = {
    type: 'spring',
    stiffness: 200,
    damping: 20,
};
