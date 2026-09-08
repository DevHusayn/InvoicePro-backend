import Product from '../models/Product.js';
import { NAME_SORT_COLLATION } from './listSort.js';

export async function findLowStockProductsForUser(userId) {
    return Product.find({
        userId,
        trackInventory: true,
        quantityOnHand: { $gt: 0 },
        lowStockThreshold: { $ne: null },
        $expr: { $lte: ['$quantityOnHand', '$lowStockThreshold'] },
    })
        .select('name quantityOnHand lowStockThreshold')
        .collation(NAME_SORT_COLLATION)
        .sort({ name: 1 })
        .lean();
}
