import BusinessInfo from '../models/CompanyInfo.js';
import { isPremiumActive } from './businessInfoHelpers.js';

export async function isUserPremium(userId) {
    const info = await BusinessInfo.findOne({ userId }).select('plan premiumUntil').lean();
    return isPremiumActive(info);
}
