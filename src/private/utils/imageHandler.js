const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const axios = require('axios');
const sharp = require('sharp');
const logger = require('./logger');
const {
    IMAGES_DIR,
    ALLOWED_EXTENSIONS,
    ALLOWED_MIME_TYPES,
    MAX_FILE_SIZE
} = require('../config/constants');

// Ensure images directory exists
if (!fsSync.existsSync(IMAGES_DIR)) {
    fsSync.mkdirSync(IMAGES_DIR, { recursive: true });
}

async function compressImage(inputBuffer, extension) {
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();

    // Compress based on extension
    if (extension === '.png') {
        return image
            .png({ quality: 80, compressionLevel: 9 })
            .toBuffer();
    } else if (extension === '.webp') {
        return image
            .webp({ quality: 80 })
            .toBuffer();
    } else if (extension === '.gif') {
        return image
            .gif()
            .toBuffer();
    } else {
        return image
            .jpeg({ quality: 80, progressive: true })
            .toBuffer();
    }
}

async function downloadAndSaveImage(url) {
    try {
        logger.debug('Starting image download', { url });
        
        // Validate URL format
        if (!isValidImageUrl(url)) {
            logger.warn('Invalid image URL format', { url });
            throw new Error('Invalid image URL format');
        }

        // Get extension
        const extension = path.extname(url.split('?')[0].toLowerCase());
        if (!ALLOWED_EXTENSIONS.includes(extension)) {
            throw new Error(`Invalid image format. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
        }

        // Generate unique filename
        const hash = crypto.createHash('sha256')
            .update(url + Date.now())
            .digest('hex')
            .slice(0, 16);
        const filename = `${hash}${extension}`;
        const filepath = path.join(IMAGES_DIR, filename);

        // Check if image already exists
        if (fsSync.existsSync(filepath)) {
            logger.debug('Image already exists', { filepath });
            return `/images/cells/${filename}`;
        }

        // Download image with retry logic
        let response;
        let retryCount = 0;
        const maxRetries = 2;
        
        while (retryCount <= maxRetries) {
            try {
                response = await axios({
                    method: 'get',
                    url,
                    responseType: 'arraybuffer',
                    timeout: 5000, // 5 second timeout
                    validateStatus: status => status === 200,
                    maxContentLength: MAX_FILE_SIZE * 1.2, // Allow slightly larger for compression
                    maxRedirects: 3
                });
                break; // Success, exit retry loop
            } catch (err) {
                retryCount++;
                if (retryCount > maxRetries || 
                    (err.response && err.response.status >= 400)) {
                    // Don't retry if we get a 4xx/5xx status code or max retries reached
                    throw err;
                }
                logger.warn(`Retry ${retryCount}/${maxRetries} for image download`, {
                    url,
                    error: err.message
                });
                // Wait before retrying (exponential backoff)
                await new Promise(r => setTimeout(r, 1000 * retryCount));
            }
        }

        // Validate content type
        const contentType = response.headers['content-type'];
        if (!ALLOWED_MIME_TYPES.includes(contentType)) {
            throw new Error(`Invalid content type: ${contentType}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`);
        }

        let imageBuffer = response.data;
        const fileSize = imageBuffer.length;

        // Reject overly large files before compression attempt
        if (fileSize > MAX_FILE_SIZE * 2) {
            throw new Error(`Image too large (${Math.round(fileSize/1024/1024)}MB). Maximum size: ${Math.round(MAX_FILE_SIZE/1024/1024)}MB`);
        }

        // Compress if file is larger than MAX_FILE_SIZE
        if (fileSize > MAX_FILE_SIZE) {
            logger.debug('Compressing image', { 
                originalSize: fileSize,
                maxSize: MAX_FILE_SIZE 
            });
            imageBuffer = await compressImage(imageBuffer, extension);
        }

        // Save the image
        await fs.writeFile(filepath, imageBuffer);
        
        const finalSize = (await fs.stat(filepath)).size;
        logger.info('Image processed successfully', {
            originalSize: fileSize,
            finalSize,
            compression: Math.round((1 - finalSize/fileSize) * 100) + '%'
        });

        return `/images/cells/${filename}`;

    } catch (error) {
        logger.error('Image processing failed', {
            url,
            error: error.message,
            stack: error.stack
        });
        throw new Error(`Failed to process image: ${error.message}`);
    }
}

// Helper function to validate image URLs
function isValidImageUrl(url) {
    try {
        // Basic URL structure validation
        const urlObj = new URL(url);
        
        // Must be http or https
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
            return false;
        }
        
        // Check for disallowed patterns
        const disallowedPatterns = [
            /^(localhost|127\.0\.0\.1|\[::1\])/i,  // Localhost
            /^192\.168\./,                          // Private IP
            /^10\./,                                // Private IP
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./,       // Private IP
            /^file:/i                               // File protocol
        ];
        
        if (disallowedPatterns.some(pattern => pattern.test(urlObj.hostname))) {
            return false;
        }
        
        return true;
    } catch (error) {
        // Not a valid URL
        return false;
    }
}

module.exports = {
    downloadAndSaveImage,
    ALLOWED_EXTENSIONS,
    ALLOWED_MIME_TYPES
}; 