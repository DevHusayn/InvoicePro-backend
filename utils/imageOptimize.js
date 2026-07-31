import sharp from 'sharp';

const MAX_LOGO_WIDTH = 800;
const MAX_LOGO_HEIGHT = 800;
const MAX_AVATAR_SIZE = 256;
const PNG_COMPRESSION = 9;
const JPEG_QUALITY = 82;

function parseDataUrl(dataUrl) {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
}

function toDataUrl(mime, buffer) {
    return `data:${mime};base64,${buffer.toString('base64')}`;
}

/** Resize and compress PNG branding assets while preserving format. */
export async function optimizePngDataUrl(dataUrl) {
    const parsed = parseDataUrl(dataUrl);
    if (!parsed || !parsed.mime.includes('png')) return dataUrl;

    try {
        const output = await sharp(parsed.buffer)
            .resize(MAX_LOGO_WIDTH, MAX_LOGO_HEIGHT, {
                fit: 'inside',
                withoutEnlargement: true,
            })
            .png({ compressionLevel: PNG_COMPRESSION, palette: true })
            .toBuffer();

        if (output.length >= parsed.buffer.length) return dataUrl;
        return toDataUrl('image/png', output);
    } catch {
        return dataUrl;
    }
}

/** Resize and compress JPEG avatar while preserving format. */
export async function optimizeJpegDataUrl(dataUrl) {
    const parsed = parseDataUrl(dataUrl);
    if (!parsed || !parsed.mime.includes('jpeg') && !parsed.mime.includes('jpg')) return dataUrl;

    try {
        const output = await sharp(parsed.buffer)
            .resize(MAX_AVATAR_SIZE, MAX_AVATAR_SIZE, {
                fit: 'cover',
                withoutEnlargement: true,
            })
            .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
            .toBuffer();

        if (output.length >= parsed.buffer.length) return dataUrl;
        return toDataUrl('image/jpeg', output);
    } catch {
        return dataUrl;
    }
}

/** Optimize uploaded business assets based on field type. */
export async function optimizeBusinessAsset(field, dataUrl) {
    if (!dataUrl) return dataUrl;

    const pngFields = ['companyLogoUrl', 'companyStampUrl', 'authorizedSignatureUrl', 'businessLogo'];
    const jpegFields = ['companyLogoAvatarUrl'];

    if (pngFields.includes(field)) {
        return optimizePngDataUrl(dataUrl);
    }
    if (jpegFields.includes(field)) {
        return optimizeJpegDataUrl(dataUrl);
    }
    return dataUrl;
}
