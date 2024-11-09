const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png'];
const IMAGES_DIR = path.join(__dirname, '../../public/images/cells');

// Ensure images directory exists
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

async function downloadAndSaveImage(url) {
  try {
    // Log the incoming request
    logger.debug('Starting image download', { url });

    // Validate URL and extension
    const extension = path.extname(url.split('?')[0].toLowerCase());
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      logger.error('Invalid image format', { url, extension });
      throw new Error('Invalid image format. Only .jpg, .jpeg, and .png are allowed.');
    }

    // Generate unique filename
    const hash = crypto.createHash('md5').update(url).digest('hex');
    const filename = `${hash}${extension}`;
    const filepath = path.join(IMAGES_DIR, filename);

    // Check if image already exists
    if (fs.existsSync(filepath)) {
      logger.debug('Image already exists', { filepath });
      return `/images/cells/${filename}`;
    }

    // Download image
    logger.debug('Downloading image', { url });
    const response = await axios.get(url, { 
      responseType: 'stream',
      timeout: 5000 // 5 second timeout
    });

    // Validate content type
    const contentType = response.headers['content-type'];
    if (!contentType || !contentType.startsWith('image/')) {
      logger.error('Invalid content type', { contentType });
      throw new Error('URL does not point to an image');
    }

    // Create write stream and pipe data
    const fileStream = fs.createWriteStream(filepath);
    response.data.pipe(fileStream);

    // Wait for completion
    await new Promise((resolve, reject) => {
      fileStream.on('finish', resolve);
      fileStream.on('error', (err) => {
        logger.error('File stream error', { error: err.message });
        reject(err);
      });
    });

    logger.info('Image downloaded successfully', { filepath });
    return `/images/cells/${filename}`;
  } catch (error) {
    logger.error('Image download failed', { error: error.message });
    throw new Error(`Failed to process image: ${error.message}`);
  }
}

module.exports = { downloadAndSaveImage }; 