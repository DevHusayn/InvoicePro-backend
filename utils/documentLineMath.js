export function roundMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

export function computeLineSubtotal(items) {
    if (!Array.isArray(items)) return 0;
    return items.reduce((sum, item) => {
        const qty = Number(item.quantity) || 0;
        const rate = Number(item.rate) || 0;
        return sum + qty * rate;
    }, 0);
}

export function computeDocumentDiscount(doc, lineSubtotal) {
    const discount = roundMoney(doc?.discount);
    if (discount > 0) return discount;

    const discountValue = Number(doc?.discountValue) || 0;
    if (discountValue <= 0) return 0;

    if (doc?.discountType === 'percent') {
        return roundMoney(lineSubtotal * (discountValue / 100));
    }

    return roundMoney(discountValue);
}

export function computeDocumentDiscountRatio(doc, items) {
    const lineSubtotal = computeLineSubtotal(items);
    const discount = computeDocumentDiscount(doc, lineSubtotal);
    return lineSubtotal > 0 ? discount / lineSubtotal : 0;
}

/** Gross margin percent on revenue — one decimal place to match catalog margin UI. */
export function computeMarginPercent(revenue, grossProfit) {
    if (!revenue || revenue <= 0) return 0;
    return Math.round(((grossProfit / revenue) * 100) * 10) / 10;
}
