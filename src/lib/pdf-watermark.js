import { PDFDocument } from 'pdf-lib';
import { SIDJIL_WATERMARK_PNG } from './sidjil-watermark.js';

const WATERMARK_OPACITY = 0.16;
const WATERMARK_SCALE = 0.5;

function base64Bytes(value) {
  const raw = atob(String(value).replace(/\s+/g, ''));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Adds the SIDJIL logo to the centre of every exported PDF page.
 * The logo is deliberately translucent so the source remains readable.
 */
export async function addSidjilWatermark(pdfBytes) {
  const document = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
  const logo = await document.embedPng(base64Bytes(SIDJIL_WATERMARK_PNG));

  for (const page of document.getPages()) {
    const { width, height } = page.getSize();
    const maxWidth = Math.min(width, height) * WATERMARK_SCALE;
    const ratio = logo.height / logo.width;
    const logoWidth = maxWidth;
    const logoHeight = logoWidth * ratio;
    page.drawImage(logo, {
      x: (width - logoWidth) / 2,
      y: (height - logoHeight) / 2,
      width: logoWidth,
      height: logoHeight,
      opacity: WATERMARK_OPACITY,
    });
  }

  return document.save({ useObjectStreams: true, addDefaultPage: false });
}

