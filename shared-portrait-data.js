// ========================================
// SHARED PORTRAIT POSE & CAMERA DATA
// ========================================
// Provides pose and camera angle selection for portrait generation.
// Data is sourced from the admin UI (prompt-style-admin.html) via PortraitPrompt.
//
// The admin UI is the single source of truth. Use "Load defaults" button
// in the admin to populate with built-in poses/cameras.

const PortraitPoseData = (window.PortraitPoseData = {
  /**
   * Get a random pose for a given class.
   * Reads from admin-configured poses via PortraitPrompt.
   * @param {string} classKey - The character class (lowercase)
   * @returns {string} A random pose description
   */
  getRandomPose(classKey) {
    const normalizedKey = (classKey || 'default').toLowerCase();

    if (window.PortraitPrompt && typeof PortraitPrompt.getPoseVariants === 'function') {
      // Try class-specific first, then fall back to "default" key
      let poses = PortraitPrompt.getPoseVariants(normalizedKey);
      if (!poses || !poses.length) {
        poses = PortraitPrompt.getPoseVariants('default');
      }
      if (poses && poses.length) {
        return poses[Math.floor(Math.random() * poses.length)];
      }
    }

    // No poses configured - return a generic fallback
    console.warn(
      `PortraitPoseData: No poses configured for "${normalizedKey}". ` +
      'Use the admin UI (prompt-style-admin.html) to load defaults.',
    );
    return 'standing in a heroic pose';
  },

  /**
   * Get a random camera angle for a given class.
   * Reads from admin-configured cameras via PortraitPrompt.
   * @param {string} classKey - The character class (lowercase)
   * @returns {string} A random camera angle description
   */
  getRandomCamera(classKey) {
    const normalizedKey = (classKey || 'default').toLowerCase();

    if (window.PortraitPrompt && typeof PortraitPrompt.getCameraVariants === 'function') {
      // Try class-specific first, then fall back to "default" key
      let cameras = PortraitPrompt.getCameraVariants(normalizedKey);
      if (!cameras || !cameras.length) {
        cameras = PortraitPrompt.getCameraVariants('default');
      }
      if (cameras && cameras.length) {
        return cameras[Math.floor(Math.random() * cameras.length)];
      }
    }

    // No cameras configured - return a generic fallback
    console.warn(
      `PortraitPoseData: No cameras configured for "${normalizedKey}". ` +
      'Use the admin UI (prompt-style-admin.html) to load defaults.',
    );
    return 'Camera angle: three-quarter view';
  },

  /**
   * Get both pose and camera for a class in one call.
   * @param {string} classKey - The character class (lowercase)
   * @returns {{ pose: string, camera: string }}
   */
  getRandomPoseAndCamera(classKey) {
    return {
      pose: this.getRandomPose(classKey),
      camera: this.getRandomCamera(classKey),
    };
  },

  /**
   * Check if poses are configured for a class (or default).
   * @param {string} classKey
   * @returns {boolean}
   */
  hasPoses(classKey) {
    const normalizedKey = (classKey || 'default').toLowerCase();
    if (window.PortraitPrompt && typeof PortraitPrompt.getPoseVariants === 'function') {
      let poses = PortraitPrompt.getPoseVariants(normalizedKey);
      if (!poses || !poses.length) {
        poses = PortraitPrompt.getPoseVariants('default');
      }
      return poses && poses.length > 0;
    }
    return false;
  },

  /**
   * Check if cameras are configured for a class (or default).
   * @param {string} classKey
   * @returns {boolean}
   */
  hasCameras(classKey) {
    const normalizedKey = (classKey || 'default').toLowerCase();
    if (window.PortraitPrompt && typeof PortraitPrompt.getCameraVariants === 'function') {
      let cameras = PortraitPrompt.getCameraVariants(normalizedKey);
      if (!cameras || !cameras.length) {
        cameras = PortraitPrompt.getCameraVariants('default');
      }
      return cameras && cameras.length > 0;
    }
    return false;
  },
});
