/**
 * ASCII Art utility for loading and displaying character portraits
 * Uses Base64 encoding to safely handle special characters (backslashes, etc.)
 */

const ASCII_BASE_PATH = '/generated_portraits/ascii';

/**
 * Safely decode ASCII art that may contain special characters
 * For pre-encoded Base64 strings, decode them
 * For raw strings, return as-is (for backwards compatibility)
 */
export function safeDecodeAscii(content: string): string {
  // Check if content is Base64 encoded
  // Base64 strings only contain: A-Z, a-z, 0-9, +, /, = (padding)
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  
  if (base64Regex.test(content)) {
    try {
      return atob(content);
    } catch {
      // If decode fails, return as-is
      return content;
    }
  }
  
  return content;
}

/**
 * Load ASCII art for a given race and optional class
 * @param race - Character race (e.g., "Human", "Elf")
 * @param characterClass - Optional character class (e.g., "Fighter", "Wizard")
 * @returns Promise with ASCII art string or null if not found
 */
export async function loadAsciiArt(
  race: string,
  characterClass?: string
): Promise<string | null> {
  const raceLower = race.toLowerCase().replace(/-/g, '-');
  
  // Try race + class combination first if class is provided
  if (characterClass) {
    const classLower = characterClass.toLowerCase();
    const combinedPath = `${ASCII_BASE_PATH}/${raceLower}-${classLower}.txt`;
    
    try {
      const response = await fetch(combinedPath);
      if (response.ok) {
        const content = await response.text();
        return content; // Return raw ASCII art
      }
    } catch (error) {
      console.warn(`Failed to load ${combinedPath}`, error);
    }
  }
  
  // Fall back to race-only portrait
  const racePath = `${ASCII_BASE_PATH}/${raceLower}.txt`;
  try {
    const response = await fetch(racePath);
    if (response.ok) {
      const content = await response.text();
      return content; // Return raw ASCII art
    }
  } catch (error) {
    console.warn(`Failed to load ${racePath}`, error);
  }
  
  return null;
}

/**
 * Get a placeholder ASCII art for initial display
 */
export function getPlaceholderAscii(): string {
  return `
    ╔════════════════════════════════════════╗
    ║                                        ║
    ║          SELECT A RACE TO BEGIN        ║
    ║                                        ║
    ║      Your character portrait will      ║
    ║         appear here as you             ║
    ║        make your selections            ║
    ║                                        ║
    ╚════════════════════════════════════════╝
  `;
}

