import { createError } from 'h3';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { read as readWorkbook, utils as xlsxUtils } from 'xlsx/xlsx.mjs';
import JSZip from 'jszip';
import * as transcriptionService from '~/server/features/transcription/service.js';

/**
 * The chat run's attachment reader: one typed extraction pass per file
 * family so the agent can read what a room attaches (agent-bots README,
 * read_attachment). Text decodes as UTF-8, spreadsheets flatten to CSV,
 * PDFs extract their page text, DOCX unwraps its document body, audio
 * rides the organization's transcription seam — images and video are
 * refused with the boundary (chat models read text only).
 */

const TEXT_LIMIT = 64 * 1024;
const PDF_PAGES_LIMIT = 40;

function attachmentFamily(descriptor) {
    const kind = String(descriptor.kind || '').toLowerCase();
    if (['audio', 'image', 'video'].includes(kind)) return kind;
    const name = String(descriptor.name || '').toLowerCase();
    const mime = String(descriptor.mimeType || '').toLowerCase().split(';')[0].trim();
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (name.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')
        || mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel' || mime === 'text/csv') return 'spreadsheet';
    if (name.endsWith('.docx') || mime.includes('wordprocessingml')) return 'docx';
    return 'text';
}

function decodeXmlEntities(text) {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

function capped(text) {
    const value = String(text || '');
    return value.length > TEXT_LIMIT ? `${value.slice(0, TEXT_LIMIT)}\n…[truncated]` : value;
}

function refuseVisual(descriptor, family) {
    throw createError({
        statusCode: 400,
        message: `${descriptor.name || 'This file'} is an ${family} file; chat models read text only — ask the sender to describe its content instead.`
    });
}

async function spreadsheetText(buffer) {
    const workbook = readWorkbook(buffer, { type: 'buffer' });
    const sheets = (workbook.SheetNames || []).map(name => (
        `## Sheet: ${name}\n${xlsxUtils.sheet_to_csv(workbook.Sheets[name] || {})}`
    ));
    return { readAs: 'csv', text: capped(sheets.join('\n\n')) };
}

async function pdfText(buffer) {
    const loadingTask = getDocument({ data: new Uint8Array(buffer), disableWorker: true, useSystemFonts: true });
    const document = await loadingTask.promise;
    const pageCount = Math.min(document.numPages, PDF_PAGES_LIMIT);
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items
            .filter(item => typeof item.str === 'string' && item.str.length)
            .map(item => item.str)
            .join(' ');
        pages.push(`## Page ${pageNumber}\n${text}`);
    }
    return {
        readAs: 'text',
        text: capped(pages.join('\n\n')),
        ...(document.numPages > pageCount ? { pagesTotal: document.numPages, pagesRead: pageCount } : {})
    };
}

async function docxText(buffer, descriptor) {
    const zip = await JSZip.loadAsync(buffer).catch(() => null);
    const xml = zip ? await zip.file('word/document.xml')?.async('string').catch(() => null) : null;
    if (!xml) {
        throw createError({ statusCode: 400, message: `${descriptor.name || 'The file'} is not a readable DOCX document` });
    }
    const text = decodeXmlEntities(xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, ''));
    return { readAs: 'text', text: capped(text) };
}

async function audioText(buffer, descriptor, auth) {
    const { text } = await transcriptionService.transcribeAudio({
        buffer,
        filename: descriptor.name || 'attachment',
        mimeType: descriptor.mimeType || '',
        organizationId: auth.organizationId
    });
    return { readAs: 'transcript', text: capped(text) };
}

function plainText(buffer) {
    const slice = buffer.subarray(0, TEXT_LIMIT);
    const text = new TextDecoder('utf-8').decode(slice);
    // Binary sniff: NUL or control bytes outside tab/CR/LF mean the file
    // is not text-readable — refuse instead of serving mojibake.
    if (/[\u0000-\u0008\u000e-\u001f]/.test(text.replace(/[\t\n\r]/g, ''))) {
        throw createError({ statusCode: 400, message: 'The file is binary and has no supported text extraction (text, csv, xlsx, pdf, docx, audio)' });
    }
    return { readAs: 'text', text };
}

/**
 * Extracts one attachment's readable content: `{ readAs, text, …extras }`.
 * Throws 400 for visual files and unrecognized binaries, and surfaces the
 * transcription seam's own errors (503 unconfigured, 502 unreachable)
 * unchanged.
 */
export async function readAttachmentContent(descriptor, buffer, auth) {
    const family = attachmentFamily(descriptor);
    if (family === 'image' || family === 'video') refuseVisual(descriptor, family);
    if (family === 'audio') return await audioText(buffer, descriptor, auth);
    if (family === 'spreadsheet') return await spreadsheetText(buffer);
    if (family === 'pdf') return await pdfText(buffer);
    if (family === 'docx') return await docxText(buffer, descriptor);
    return plainText(buffer);
}
