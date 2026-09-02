import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

const PAGE_H = 297;
const FOOTER_RESERVE = 22;

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
        : [22, 163, 74];
}

/** ISO code (NGN, USD) — Helvetica cannot render ₦ / € / GH₵. */
function formatMoney(value, currencyCode) {
    return `${currencyCode} ${Number(value || 0).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    })}`;
}

function getStatementCurrencyCode(code = 'NGN') {
    const normalized = String(code || 'NGN').toUpperCase();
    return /^[A-Z]{3}$/.test(normalized) ? normalized : 'NGN';
}

function applyColumnAlignment(data, alignments) {
    if (data.section !== 'head' && data.section !== 'body' && data.section !== 'foot') {
        return;
    }
    const halign = alignments[data.column.index] || 'left';
    data.cell.styles.halign = halign;
}

/**
 * @param {ReturnType<import('./monthlyStatementBuild.js').buildMonthlyStatement>} statement
 * @param {object} businessInfo
 * @returns {Buffer}
 */
export function generateMonthlyStatementPdfBuffer(statement, businessInfo) {
    const doc = new jsPDF();
    const primaryColor = hexToRgb(businessInfo?.brandColor || '#16A34A');
    const textColor = [31, 41, 55];
    const grayColor = [107, 114, 128];
    const currencyCode = getStatementCurrencyCode(businessInfo?.defaultCurrency);

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, PAGE_H, 'F');

    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, 210, 3, 'F');

    doc.setTextColor(...textColor);
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.text(String(businessInfo?.name || 'Your Business'), 15, 18);

    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...grayColor);
    doc.text('Monthly billing statement', 15, 26);
    doc.text(`Period: ${statement.periodLabel}`, 15, 32);
    doc.text(`Generated: ${format(statement.generatedAt, 'MMM d, yyyy')}`, 15, 38);

    doc.setFontSize(16);
    doc.setTextColor(...primaryColor);
    doc.setFont(undefined, 'bold');
    doc.text('Statement summary', 15, 52);

    const summaryBody = [
        ['Paid', formatMoney(statement.totals.paid, currencyCode)],
        ['Balance', formatMoney(statement.totals.partial, currencyCode)],
        ['Pending', formatMoney(statement.totals.pending, currencyCode)],
        ['Overdue', formatMoney(statement.totals.overdue, currencyCode)],
        ['Cancelled', formatMoney(statement.totals.cancelled, currencyCode)],
        ['Total billed', formatMoney(statement.totals.total, currencyCode)],
        ['Documents in period', String(statement.totals.documentCount)],
    ];

    autoTable(doc, {
        startY: 56,
        head: [['Category', 'Amount']],
        body: summaryBody,
        theme: 'plain',
        tableWidth: 180,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: {
            fillColor: primaryColor,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
        },
        columnStyles: {
            0: { cellWidth: 55, halign: 'left' },
            1: { cellWidth: 125, halign: 'right' },
        },
        didParseCell: (data) => applyColumnAlignment(data, ['left', 'right']),
        margin: { left: 15, right: 15, bottom: FOOTER_RESERVE + 4 },
    });

    let tableY = doc.lastAutoTable.finalY + 12;

    doc.setFontSize(12);
    doc.setTextColor(...textColor);
    doc.setFont(undefined, 'bold');
    doc.text('By client', 15, tableY);

    if (!statement.hasData) {
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...grayColor);
        doc.text('No documents were issued during this period.', 15, tableY + 8);
    } else {
        const tableHead = [
            'Client',
            'Paid',
            'Balance',
            'Pending',
            'Overdue',
            'Cancelled',
            'Total',
        ];

        const tableBody = statement.rows.map((row) => [
            row.clientSubtitle
                ? `${row.clientName}\n${row.clientSubtitle}`
                : row.clientName,
            formatMoney(row.paid, currencyCode),
            formatMoney(row.partial, currencyCode),
            formatMoney(row.pending, currencyCode),
            formatMoney(row.overdue, currencyCode),
            formatMoney(row.cancelled, currencyCode),
            formatMoney(row.total, currencyCode),
        ]);

        const footRow = [
            'Total',
            formatMoney(statement.totals.paid, currencyCode),
            formatMoney(statement.totals.partial, currencyCode),
            formatMoney(statement.totals.pending, currencyCode),
            formatMoney(statement.totals.overdue, currencyCode),
            formatMoney(statement.totals.cancelled, currencyCode),
            formatMoney(statement.totals.total, currencyCode),
        ];

        const clientAlign = ['left', 'center', 'center', 'center', 'center', 'center', 'center'];

        autoTable(doc, {
            startY: tableY + 4,
            head: [tableHead],
            body: tableBody,
            foot: [footRow],
            showFoot: 'lastPage',
            theme: 'striped',
            tableWidth: 180,
            styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
            headStyles: {
                fillColor: primaryColor,
                textColor: [255, 255, 255],
                fontStyle: 'bold',
            },
            footStyles: {
                fillColor: [241, 245, 249],
                textColor: textColor,
                fontStyle: 'bold',
            },
            columnStyles: {
                0: { cellWidth: 36, halign: 'left' },
                1: { cellWidth: 24, halign: 'center' },
                2: { cellWidth: 24, halign: 'center' },
                3: { cellWidth: 24, halign: 'center' },
                4: { cellWidth: 24, halign: 'center' },
                5: { cellWidth: 24, halign: 'center' },
                6: { cellWidth: 24, halign: 'center' },
            },
            didParseCell: (data) => applyColumnAlignment(data, clientAlign),
            margin: { left: 15, right: 15, bottom: FOOTER_RESERVE + 4 },
        });
    }

    doc.setPage(doc.getNumberOfPages());
    const footerLineY = PAGE_H - FOOTER_RESERVE;

    doc.setDrawColor(229, 231, 235);
    doc.line(15, footerLineY - 4, 195, footerLineY - 4);
    doc.setFontSize(7);
    doc.setTextColor(...grayColor);
    doc.text(
        `Amounts grouped by document status for ${statement.periodLabel}. Issue dates determine the billing period.`,
        105,
        footerLineY + 2,
        { align: 'center', maxWidth: 170 },
    );
    doc.text(
        `${businessInfo?.name || ''} · ${businessInfo?.email || ''}`,
        105,
        footerLineY + 7,
        { align: 'center' },
    );

    doc.setFillColor(...primaryColor);
    doc.rect(0, 294, 210, 3, 'F');

    return Buffer.from(doc.output('arraybuffer'));
}

export function buildMonthlyStatementFilename(periodLabel) {
    const slug = periodLabel.replace(/\s+/g, '-').toLowerCase();
    return `monthly-statement-${slug}.pdf`;
}
