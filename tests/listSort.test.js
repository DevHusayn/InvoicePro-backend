import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CATALOG_LIST_SORT,
    PRODUCT_LIST_SORT,
    EXPENSE_LIST_SORT,
    NAME_SORT_COLLATION,
    resolveListSort,
} from '../utils/listSort.js';

test('resolveListSort defaults to newest when sort is missing', () => {
    assert.deepEqual(resolveListSort(undefined, CATALOG_LIST_SORT).sort, CATALOG_LIST_SORT.newest);
    assert.equal(resolveListSort(undefined, CATALOG_LIST_SORT).collation, undefined);
});

test('resolveListSort falls back to newest for unknown keys', () => {
    assert.deepEqual(resolveListSort('not-a-sort', PRODUCT_LIST_SORT).sort, PRODUCT_LIST_SORT.newest);
});

test('resolveListSort maps catalog name and product price keys', () => {
    assert.deepEqual(resolveListSort('nameAsc', CATALOG_LIST_SORT).sort, CATALOG_LIST_SORT.nameAsc);
    assert.deepEqual(resolveListSort('nameAsc', CATALOG_LIST_SORT).collation, NAME_SORT_COLLATION);
    assert.deepEqual(resolveListSort('priceHigh', PRODUCT_LIST_SORT).sort, PRODUCT_LIST_SORT.priceHigh);
    assert.equal(resolveListSort('priceHigh', PRODUCT_LIST_SORT).collation, undefined);
});

test('resolveListSort maps expense amount keys', () => {
    assert.deepEqual(resolveListSort('amountLow', EXPENSE_LIST_SORT).sort, EXPENSE_LIST_SORT.amountLow);
});
