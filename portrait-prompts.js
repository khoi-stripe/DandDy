// Shared helpers for building AI portrait prompt style instructions.
// Exposes PortraitPrompt on window so both builder and manager can use
// the same base text for image generation.

(function (global) {
  /**
   * Build the base list of style instructions for a portrait prompt.
   *
   * Options:
   * - characterDescription: optional, when present we say
   *   "illustration of a ${characterDescription}", otherwise a generic line.
   * - posePrompt: optional string, e.g. "Pose: ...".
   * - cameraPrompt: optional camera angle string.
   */
  function buildBasePortraitInstructions(options) {
    const {
      characterDescription,
      posePrompt,
      cameraPrompt,
    } = options || {};

    const parts = [];

    if (characterDescription) {
      parts.push(
        `Create a high-contrast black-and-white fantasy illustration of a ${characterDescription}.`,
      );
    } else {
      parts.push('Create a high-contrast black-and-white fantasy illustration.');
    }

    parts.push(
      'Use bold shadow shapes, strong silhouettes, and clean white highlights.',
    );
    parts.push(
      'Include some controlled, directional hatching to define form (light mid-tone texture only).',
    );

    if (posePrompt) {
      parts.push(`Pose: ${posePrompt}`);
    }

    if (cameraPrompt) {
      parts.push(cameraPrompt);
    }

    parts.push(
      'Background should be simple, entirely black, and free of symbols or text.',
    );
    parts.push(
      'Overall mood: classic fantasy ink illustration with a dramatic, mythic tone.',
    );
    parts.push('Aspect ratio 3:4.');

    return parts;
  }

  global.PortraitPrompt = global.PortraitPrompt || {};
  global.PortraitPrompt.buildBasePortraitInstructions =
    buildBasePortraitInstructions;
})(window);


