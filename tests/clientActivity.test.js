import test from 'node:test';
import assert from 'node:assert/strict';
import Invoice from '../models/Invoice.js';
import Quotation from '../models/Quotation.js';
import Client from '../models/Client.js';
import Product from '../models/Product.js';
import { getClientActivity } from '../utils/clientActivity.js';

test('getClientActivity aggregates documents and product rollups', async (t) => {
    const userId = '507f1f77bcf86cd799439011';
    const clientId = '507f1f77bcf86cd799439012';
    const productId = '507f1f77bcf86cd799439013';

    const originalClientFind = Client.findOne;
    const originalInvoiceFind = Invoice.find;
    const originalQuotationFind = Quotation.find;
    const originalProductFind = Product.find;

    t.after(() => {
        Client.findOne = originalClientFind;
        Invoice.find = originalInvoiceFind;
        Quotation.find = originalQuotationFind;
        Product.find = originalProductFind;
    });

    Client.findOne = () => ({
        lean: async () => ({
            _id: clientId,
            name: 'Ada Okonkwo',
            company: 'Ada Stores',
            email: 'ada@example.com',
            phone: '+234801',
            address: 'Abuja',
        }),
    });

    let invoiceQueryCount = 0;
    Invoice.find = () => {
        invoiceQueryCount += 1;
        const isReceiptQuery = invoiceQueryCount === 2;
        return {
            select: () => ({
                sort: () => ({
                    lean: async () => {
                        if (isReceiptQuery) {
                            return [
                                {
                                    _id: '507f1f77bcf86cd799439022',
                                    receiptNumber: 'RCP-0002',
                                    date: '2026-08-05',
                                    status: 'paid',
                                    total: 3000,
                                    amountPaid: 3000,
                                    currency: 'NGN',
                                    documentType: 'receipt',
                                    items: [
                                        {
                                            description: 'Fish',
                                            productId,
                                            quantity: 3,
                                            rate: 1000,
                                        },
                                    ],
                                },
                            ];
                        }
                        return [
                            {
                                _id: '507f1f77bcf86cd799439021',
                                invoiceNumber: 'INV-0001',
                                date: '2026-08-01',
                                status: 'partial',
                                total: 5000,
                                amountPaid: 2000,
                                currency: 'NGN',
                                documentType: 'invoice',
                                items: [
                                    {
                                        description: 'Fish',
                                        productId,
                                        quantity: 5,
                                        rate: 1000,
                                    },
                                ],
                            },
                        ];
                    },
                }),
            }),
        };
    };

    Quotation.find = () => ({
        select: () => ({
            sort: () => ({
                lean: async () => [
                    {
                        _id: '507f1f77bcf86cd799439023',
                        quotationNumber: 'QUO-0001',
                        date: '2026-07-20',
                        status: 'sent',
                        total: 1500,
                        currency: 'NGN',
                        items: [],
                    },
                ],
            }),
        }),
    });

    Product.find = () => ({
        select: () => ({
            lean: async () => [{ _id: productId, name: 'Fish' }],
        }),
    });

    const activity = await getClientActivity(userId, clientId);

    assert.equal(activity.client.name, 'Ada Okonkwo');
    assert.equal(activity.summary.invoiceCount, 1);
    assert.equal(activity.summary.receiptCount, 1);
    assert.equal(activity.summary.quotationCount, 1);
    assert.equal(activity.summary.totalInvoiced, 8000);
    assert.equal(activity.summary.totalPaid, 5000);
    assert.equal(activity.summary.outstanding, 3000);
    assert.equal(activity.documents.length, 3);
    assert.equal(activity.byProduct.length, 1);
    assert.equal(activity.byProduct[0].displayName, 'Fish');
    assert.equal(activity.byProduct[0].quantitySold, 8);
    assert.equal(activity.byProduct[0].lineTotal, 8000);
});
