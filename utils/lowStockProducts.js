import Product from '../models/Product.js';

export async function findLowStockProductsForUser(userId) {
    return Product.find({
        userId,
        trackInventory: true,
        lowStockThreshold: { $ne: null },
        $expr: { $lte: ['$quantityOnHand', '$lowStockThreshold'] },
    })
        .select('name quantityOnHand lowStockThreshold')
        .sort({ name: 1 })
        .lean();
}
