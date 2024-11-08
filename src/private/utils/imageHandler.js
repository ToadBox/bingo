const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const { finished } = require('stream/promises');

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png'];
const IMAGES_DIR = path.join(__dirname, '../../public/images/cells');

// Ensure images directory exists
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

async function downloadAndSaveImage(url) {
  try {
    // Validate URL and extension
    const extension = path.extname(url.split('?')[0].toLowerCase());
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      throw new Error('Invalid image format. Only .jpg, .jpeg, and .png are allowed.');
    }

    // Generate unique filename
    const hash = crypto.createHash('md5').update(url).digest('hex');
    const filename = `${hash}${extension}`;
    const filepath = path.join(IMAGES_DIR, filename);

    // Check if image already exists
    if (fs.existsSync(filepath)) {
      return `/images/cells/${filename}`;
    }

    // Download image
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    // Validate content type
    const contentType = response.headers.get('content-type');
    if (!contentType?.startsWith('image/')) {
      throw new Error('URL does not point to an image');
    }

    // Create write stream
    const fileStream = fs.createWriteStream(filepath);
    
    // Convert response to stream and pipe to file
    await finished(
      Readable.fromWeb(response.body).pipe(fileStream)
    );

    return `/images/cells/${filename}`;
  } catch (error) {
    throw new Error(`Failed to process image: ${error.message}`);
  }
}

module.exports = { downloadAndSaveImage }; 