import test from 'node:test';
import assert from 'node:assert/strict';
import PurchaseOrder from '../models/PurchaseOrder.js';
import Supplier from '../models/Supplier.js';
import Product from '../models/Product.js';
import { getSupplierActivity } from '../utils/supplierActivity.js';

test('getSupplierActivity aggregates purchase orders and product rollups', async (t) => {
    const userId = '507f1f77bcf86cd799439011';
    const supplierId = '507f1f77bcf86cd799439012';
    const productId = '507f1f77bcf86cd799439013';

    const originalSupplierFind = Supplier.findOne;
    const originalPoFind = PurchaseOrder.find;
    const originalProductFind = Product.find;

    t.after(() => {
        Supplier.findOne = originalSupplierFind;
        PurchaseOrder.find = originalPoFind;
        Product.find = originalProductFind;
    });

    Supplier.findOne = () => ({
        lean: async () => ({
            _id: supplierId,
            name: 'Wholesale Co',
            company: 'Wholesale Co Ltd',
            email: 'buy@wholesale.com',
            phone: '+234800',
            address: 'Lagos',
        }),
    });

    PurchaseOrder.find = () => ({
        sort: () => ({
            lean: async () => [
                {
                    _id: '507f1f77bcf86cd799439021',
                    purchaseOrderNumber: 'PO-0001',
                    date: '2026-08-01',
                    status: 'partial',
                    currency: 'NGN',
                    total: 5000,
                    items: [
                        {
                            description: 'Fish',
                            productId,
                            quantity: 10,
                            quantityReceived: 4,
                            rate: 500,
                        },
                    ],
                },
                {
                    _id: '507f1f77bcf86cd799439022',
                    purchaseOrderNumber: 'PO-0002',
                    date: '2026-07-15',
                    status: 'received',
                    currency: 'NGN',
                    total: 2000,
                    items: [
                        {
                            description: 'Fish',
                            productId,
                            quantity: 4,
                            quantityReceived: 4,
                            rate: 500,
                        },
                    ],
                },
            ],
        }),
    });

    Product.find = () => ({
        select: () => ({
            lean: async () => [{ _id: productId, name: 'Fish' }],
        }),
    });

    const activity = await getSupplierActivity(userId, supplierId);

    assert.equal(activity.supplier.name, 'Wholesale Co');
    assert.equal(activity.summary.openOrders, 1);
    assert.equal(activity.summary.receivedOrders, 1);
    assert.equal(activity.summary.totalOrderedValue, 7000);
    assert.equal(activity.purchaseOrders.length, 2);
    assert.equal(activity.byProduct.length, 1);
    assert.equal(activity.byProduct[0].displayName, 'Fish');
    assert.equal(activity.byProduct[0].quantityOrdered, 14);
    assert.equal(activity.byProduct[0].quantityReceived, 8);
});
