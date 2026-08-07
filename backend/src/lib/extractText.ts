import { describeImage, isSupportedImageType } from './claude';

// Thrown for a genuinely unsupported file type (client's fault, 400).
// Distinguished from a failure *while processing* a supported type (e.g. a
// Claude API error describing an image), which is more like a 502.
export class UnsupportedFileTypeError extends Error {}

// pdf-parse ships as CommonJS with no types-friendly default export path,
// so it's required lazily to keep startup fast when PDFs are never uploaded.
export async function extractTextFromFile(buffer: Buffer, mimetype: string): Promise<string> {
  if (mimetype === 'application/pdf') {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    return data.text;
  }
  if (mimetype.startsWith('text/')) {
    return buffer.toString('utf-8');
  }
  if (isSupportedImageType(mimetype)) {
    // No OCR library — Claude's vision reads the image directly. Only the
    // resulting text is ever stored; the image bytes are discarded after
    // this call.
    return describeImage(buffer, mimetype);
  }
  throw new UnsupportedFileTypeError(
    `Unsupported file type "${mimetype}". Upload a .txt, .pdf, .jpg, .png, .gif, or .webp file, or ` +
      'use "Paste text" instead.'
  );
}
