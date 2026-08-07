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
  throw new Error(
    `Unsupported file type "${mimetype}". Upload a .txt or .pdf file, or use "Paste text" instead ` +
      '(for images like flyers, paste a short text description — OCR is not supported in v1).'
  );
}
