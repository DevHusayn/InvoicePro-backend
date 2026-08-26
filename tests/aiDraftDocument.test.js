import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildAiDraftFromModelOutput,
    matchCatalogClient,
    matchCatalogProduct,
    parseModelJson,
    rateAppearsStatedInPrompt,
    sliceCatalog,
    normalizeAiDocumentType,
    normalizeAiPrompt,
} from '../utils/aiDraftDocument.js';

const catalog = sliceCatalog({
    clients: [
        { _id: '64b0a1c2d3e4f5a6b7c8d901', name: 'Ahmed Musa', company: 'Ahmed Stores', email: 'ahmed@example.com', phone: '0801' },
        { _id: '64b0a1c2d3e4f5a6b7c8d902', name: 'Ada Obi', company: 'Ada Ventures' },
    ],
    products: [
        { _id: '64b0a1c2d3e4f5a6b7c8d911', name: 'Cement', unitPrice: 8500, trackInventory: true, quantityOnHand: 40 },
        { _id: '64b0a1c2d3e4f5a6b7c8d912', name: 'Nails', unitPrice: 500 },
    ],
});

const sourceClients = [
    {
        _id: '64b0a1c2d3e4f5a6b7c8d901',
        name: 'Ahmed Musa',
        company: 'Ahmed Stores',
        email: 'ahmed@example.com',
        phone: '0801',
        address: 'Kano',
    },
];

test('normalizeAiDocumentType rejects receipts and chat', () => {
    assert.equal(normalizeAiDocumentType('invoice'), 'invoice');
    assert.equal(normalizeAiDocumentType('quotation'), 'quotation');
    assert.throws(() => normalizeAiDocumentType('receipt'), (err) => err.code === 'AI_UNSUPPORTED_TYPE');
    assert.throws(() => normalizeAiDocumentType('assistant'), (err) => err.code === 'AI_UNSUPPORTED_TYPE');
});

test('normalizeAiPrompt rejects empty input', () => {
    assert.throws(() => normalizeAiPrompt('   '), (err) => err.code === 'AI_PROMPT_REQUIRED');
});

test('parseModelJson reads fenced JSON and rejects garbage', () => {
    const parsed = parseModelJson('```json\n{"items":[{"description":"Cement","quantity":1}]}\n```');
    assert.equal(parsed.items[0].description, 'Cement');
    assert.throws(() => parseModelJson('not json'), (err) => err.code === 'AI_DRAFT_INVALID');
});

test('matchCatalogClient and matchCatalogProduct use fuzzy names and ignore unknown ids', () => {
    const client = matchCatalogClient('Ahmed', catalog.clients, 'missing');
    assert.equal(client.id, '64b0a1c2d3e4f5a6b7c8d901');
    const product = matchCatalogProduct('bags of cement', catalog.products, 'missing');
    assert.equal(product.id, '64b0a1c2d3e4f5a6b7c8d911');
});

test('rateAppearsStatedInPrompt requires the amount in the user sentence', () => {
    const prompt = 'Invoice Ahmed 3 bags of cement at 8500 and delivery 2000';
    assert.equal(rateAppearsStatedInPrompt(prompt, 8500), true);
    assert.equal(rateAppearsStatedInPrompt(prompt, 12000), false);
    assert.equal(rateAppearsStatedInPrompt('3 bags of cement', 3), false);
    assert.equal(rateAppearsStatedInPrompt('delivery at 3', 3), true);
});

test('buildAiDraftFromModelOutput uses catalog prices unless the prompt stated a price', () => {
    const prompt = 'Invoice Ahmed 3 bags of cement and delivery';
    const draft = buildAiDraftFromModelOutput({
        parsed: {
            clientName: 'Ahmed',
            catalogClientId: '64b0a1c2d3e4f5a6b7c8d901',
            items: [
                { description: 'Cement', quantity: 3, rate: 99999, catalogProductId: '64b0a1c2d3e4f5a6b7c8d911' },
                { description: 'Delivery', quantity: 1, rate: 4500 },
            ],
        },
        prompt,
        documentType: 'invoice',
        catalog,
        sourceClients,
    });

    assert.equal(draft.saved, false);
    assert.equal(draft.documentType, 'invoice');
    assert.equal(draft.client.clientId, '64b0a1c2d3e4f5a6b7c8d901');
    assert.equal(draft.client.clientEmail, 'ahmed@example.com');
    assert.equal(draft.client.matched, true);
    assert.equal(draft.items[0].rate, 8500);
    assert.equal(draft.items[0].productId, '64b0a1c2d3e4f5a6b7c8d911');
    assert.equal(draft.items[0].isNewItem, false);
    assert.equal(draft.items[1].rate, 0);
    assert.equal(draft.items[1].isNewItem, true);
    assert.match(draft.items[1].reviewReason, /new item/);
    assert.equal(draft.items.every((item) => item.quantity > 0), true);
});

test('buildAiDraftFromModelOutput keeps a price that appears in the prompt', () => {
    const prompt = 'Quote Ada 2 boxes of nails at 600';
    const draft = buildAiDraftFromModelOutput({
        parsed: {
            clientName: 'Ada',
            items: [{ description: 'Nails', quantity: 2, rate: 600, catalogProductId: '64b0a1c2d3e4f5a6b7c8d912' }],
        },
        prompt,
        documentType: 'quotation',
        catalog,
        sourceClients,
    });
    assert.equal(draft.documentType, 'quotation');
    assert.equal(draft.items[0].rate, 600);
    assert.equal(draft.saved, false);
});

test('buildAiDraftFromModelOutput does not auto-save and rejects empty item lists', () => {
    const draft = buildAiDraftFromModelOutput({
        parsed: { items: [{ description: 'Cement', quantity: 1 }] },
        prompt: 'cement',
        documentType: 'invoice',
        catalog,
        sourceClients,
    });
    assert.equal(draft.saved, false);
    assert.equal(Object.prototype.hasOwnProperty.call(draft, 'id'), false);

    assert.throws(
        () =>
            buildAiDraftFromModelOutput({
                parsed: { items: [] },
                prompt: 'hello',
                documentType: 'invoice',
                catalog,
            }),
        (err) => err.code === 'AI_DRAFT_EMPTY'
    );
});
