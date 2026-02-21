/**
 * Image Processing Service
 * 
 * Purpose: Handle image uploads, resizing, and optimization.
 * 
 * Operation: Uses 'sharp' to compress images and generate thumbnails.
 * Converts all images to WebP format for maximum performance.
 */

import sharp from 'sharp';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { uploadConfig } from '../config/index.js';
import { existsSync, mkdirSync } from 'fs';

/**
 * Process and save an uploaded dress image
 * Creates both a optimized full-size image and a thumbnail
 * 
 * @param {Buffer} buffer - The raw image buffer
 * @returns {Promise<{ imageUrl: string, thumbnailUrl: string }>}
 */
export async function processDressImage(buffer) {
  const fileName = `${uuidv4()}.webp`;
  const fullPath = path.join(uploadConfig.dressesDir, fileName);
  const thumbFileName = `thumb_${fileName}`;
  const thumbPath = path.join(uploadConfig.dressesDir, thumbFileName);

  // Ensure directory exists
  if (!existsSync(uploadConfig.dressesDir)) {
    mkdirSync(uploadConfig.dressesDir, { recursive: true });
  }

  // 1. Process full-size image (Optimized)
  // Max width 1200px, high quality compression
  await sharp(buffer)
    .resize(1200, null, { withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(fullPath);

  // 2. Process thumbnail
  // Small size (300px), lower quality for fast loading
  await sharp(buffer)
    .resize(300, 400, { fit: 'cover' })
    .webp({ quality: 60 })
    .toFile(thumbPath);

  return {
    imageUrl: `/uploads/dresses/${fileName}`,
    thumbnailUrl: `/uploads/dresses/${thumbFileName}`
  };
}
