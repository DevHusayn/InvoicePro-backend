import BusinessInfo from '../models/CompanyInfo.js';
import Invoice from '../models/Invoice.js';
import { escapeRegex } from './pagination.js';

const VALID_PLANS = new Set(['free', 'premium']);
const VALID_STATUSES = new Set(['active', 'suspended']);
const VALID_ACTIVITY = new Set(['has_invoices', 'no_invoices']);

export function parseAdminUserFilters(query = {}) {
    const search = String(query.search || '').trim();
    const plan = VALID_PLANS.has(query.plan) ? query.plan : 'all';
    const status = VALID_STATUSES.has(query.status) ? query.status : 'all';
    const activity = VALID_ACTIVITY.has(query.activity) ? query.activity : 'all';
    return { search, plan, status, activity };
}

/** Build a MongoDB filter for admin user list/export (AND logic across filters). */
export async function buildAdminUserFilter({ search, plan, status, activity }) {
    const conditions = [];

    if (status !== 'all') {
        conditions.push({ status });
    }

    if (search) {
        const regex = new RegExp(escapeRegex(search), 'i');
        const businessUserIds = await BusinessInfo.find({ name: regex }).distinct('userId');
        const searchOr = [{ email: regex }, { name: regex }];
        if (businessUserIds.length) {
            searchOr.push({ _id: { $in: businessUserIds } });
        }
        conditions.push({ $or: searchOr });
    }

    if (plan === 'premium') {
        const premiumUserIds = await BusinessInfo.find({ plan: 'premium' }).distinct('userId');
        conditions.push({ _id: { $in: premiumUserIds.length ? premiumUserIds : [null] } });
    } else if (plan === 'free') {
        const premiumUserIds = await BusinessInfo.find({ plan: 'premium' }).distinct('userId');
        if (premiumUserIds.length) {
            conditions.push({ _id: { $nin: premiumUserIds } });
        }
    }

    if (activity === 'has_invoices') {
        const withInvoices = await Invoice.distinct('userId');
        conditions.push({ _id: { $in: withInvoices.length ? withInvoices : [null] } });
    } else if (activity === 'no_invoices') {
        const withInvoices = await Invoice.distinct('userId');
        if (withInvoices.length) {
            conditions.push({ _id: { $nin: withInvoices } });
        }
    }

    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return { $and: conditions };
}

/** Short slug for export filenames, e.g. free-active or all. */
export function buildAdminUserFilterSlug({ plan, status, activity, search }) {
    const parts = [];
    if (plan !== 'all') parts.push(plan);
    if (status !== 'all') parts.push(status);
    if (activity !== 'all') parts.push(activity === 'has_invoices' ? 'with-invoices' : 'no-invoices');
    if (search) parts.push('search');
    return parts.length ? parts.join('-') : 'all';
}
