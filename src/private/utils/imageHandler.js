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

        // Download image
        const response = await axios({
            method: 'get',
            url,
            responseType: 'arraybuffer',
            timeout: 5000,
            validateStatus: status => status === 200
        });

        // Validate content type
        const contentType = response.headers['content-type'];
        if (!ALLOWED_MIME_TYPES.includes(contentType)) {
            throw new Error('Invalid content type');
        }

        let imageBuffer = response.data;
        const fileSize = imageBuffer.length;

        // Compress if file is larger than 50MB
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
            error: error.message
        });
        throw new Error(`Failed to process image: ${error.message}`);
    }
}

module.exports = {
    downloadAndSaveImage,
    ALLOWED_EXTENSIONS,
    ALLOWED_MIME_TYPES
}; 