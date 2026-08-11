import Product from '../models/Product.js';

export async function findLowStockProductsForUser(userId) {
    return Product.find({
        userId,
        trackInventory: true,
        quantityOnHand: { $gt: 0 },
        lowStockThreshold: { $ne: null },
        $expr: { $lte: ['$quantityOnHand', '$lowStockThreshold'] },
    })
        .select('name quantityOnHand lowStockThreshold')
        .sort({ name: 1 })
        .lean();
}
