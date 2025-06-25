const logger = require('./logger');

class SlugGenerator {
  /**
   * Generate a URL-friendly slug from a title
   * @param {string} title - The title to convert to a slug
   * @param {number} maxLength - Maximum length of the slug (default: 50)
   * @returns {string} - URL-friendly slug
   */
  static generateSlug(title, maxLength = 50) {
    if (!title || typeof title !== 'string') {
      throw new Error('Title must be a non-empty string');
    }

    // Convert to lowercase and replace spaces and special characters
    let slug = title
      .toLowerCase()
      .trim()
      // Replace spaces and underscores with hyphens
      .replace(/[\s_]+/g, '-')
      // Remove special characters except hyphens and alphanumeric
      .replace(/[^a-z0-9-]/g, '')
      // Remove multiple consecutive hyphens
      .replace(/-+/g, '-')
      // Remove leading and trailing hyphens
      .replace(/^-+|-+$/g, '');

    // Truncate to max length while preserving word boundaries
    if (slug.length > maxLength) {
      slug = slug.substring(0, maxLength);
      // Find the last hyphen to avoid cutting words
      const lastHyphen = slug.lastIndexOf('-');
      if (lastHyphen > maxLength * 0.7) { // Only truncate at word boundary if it's not too short
        slug = slug.substring(0, lastHyphen);
      }
    }

    // Ensure slug is not empty
    if (!slug) {
      slug = 'untitled-board';
    }

    return slug;
  }

  /**
   * Generate a unique slug by checking against existing slugs
   * @param {string} title - The title to convert to a slug
   * @param {Function} checkExists - Function that returns true if slug exists
   * @param {number} maxAttempts - Maximum number of attempts to find unique slug
   * @returns {Promise<string>} - Unique URL-friendly slug
   */
  static async generateUniqueSlug(title, checkExists, maxAttempts = 100) {
    const baseSlug = this.generateSlug(title);
    let slug = baseSlug;
    let attempt = 0;

    while (attempt < maxAttempts) {
      try {
        const exists = await checkExists(slug);
        if (!exists) {
          logger.debug('Generated unique slug', { title, slug, attempts: attempt + 1 });
          return slug;
        }

        // Generate variant with number suffix
        attempt++;
        slug = `${baseSlug}-${attempt}`;
      } catch (error) {
        logger.error('Error checking slug existence', {
          error: error.message,
          slug,
          attempt
        });
        throw error;
      }
    }

    // If we can't find a unique slug, add timestamp
    const timestamp = Date.now().toString(36);
    slug = `${baseSlug}-${timestamp}`;
    
    logger.warn('Used timestamp fallback for slug generation', {
      title,
      slug,
      maxAttempts
    });

    return slug;
  }

  /**
   * Validate a slug format
   * @param {string} slug - The slug to validate
   * @returns {boolean} - True if slug is valid
   */
  static isValidSlug(slug) {
    if (!slug || typeof slug !== 'string') {
      return false;
    }

    // Check if slug matches expected pattern
    const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    return slugPattern.test(slug) && slug.length >= 1 && slug.length <= 50;
  }

  /**
   * Sanitize a slug to ensure it's valid
   * @param {string} slug - The slug to sanitize
   * @returns {string} - Sanitized slug
   */
  static sanitizeSlug(slug) {
    if (!slug || typeof slug !== 'string') {
      return 'untitled-board';
    }

    // Use the same logic as generateSlug but don't change case
    let sanitized = slug
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!sanitized) {
      sanitized = 'untitled-board';
    }

    return sanitized;
  }

  /**
   * Generate server board slug with configurable prefix
   * @param {string} title - Board title
   * @param {string} serverPrefix - Server prefix (default: 'server')
   * @returns {string} - Server board slug
   */
  static generateServerSlug(title, serverPrefix = 'server') {
    const baseSlug = this.generateSlug(title);
    return `${serverPrefix}-${baseSlug}`;
  }
}

module.exports = SlugGenerator; 