import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Pagination, getPaginationItems } from '../src/components/Pagination';

test('getPaginationItems handles small page sets without ellipsis (TSK-29)', () => {
  assert.deepEqual(getPaginationItems(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(getPaginationItems(3, 5), [1, 2, 3, 4, 5]);
});

test('getPaginationItems handles large page sets with smart ellipsis windowing (TSK-29)', () => {
  // Near beginning
  assert.deepEqual(getPaginationItems(1, 20), [1, 2, 3, 4, 5, '...', 20]);
  assert.deepEqual(getPaginationItems(3, 20), [1, 2, 3, 4, 5, '...', 20]);

  // In the middle
  assert.deepEqual(getPaginationItems(10, 20), [1, '...', 9, 10, 11, '...', 20]);

  // Near end
  assert.deepEqual(getPaginationItems(18, 20), [1, '...', 16, 17, 18, 19, 20]);
  assert.deepEqual(getPaginationItems(20, 20), [1, '...', 16, 17, 18, 19, 20]);
});

test('Pagination renders active page with bold brand styling and touch-friendly targets (TSK-29)', () => {
  const html = renderToString(
    React.createElement(Pagination, {
      currentPage: 2,
      totalPages: 5,
      totalItems: 50,
      pageSize: 10,
      onPageChange: () => {},
    })
  );

  // Active page has aria-current and brand styling
  assert.match(html, /aria-current="page"/);
  assert.match(html, /mg-button--primary/);

  // Showing range indicator
  assert.match(html, /Showing.*11.*20.*of.*50.*records/);

  // Touch-friendly target sizing classes
  assert.match(html, /mg-button/);
});

test('Pagination handles zero records gracefully (TSK-29)', () => {
  const html = renderToString(
    React.createElement(Pagination, {
      currentPage: 1,
      totalPages: 1,
      totalItems: 0,
      pageSize: 10,
      onPageChange: () => {},
    })
  );

  assert.match(html, /Showing.*0.*of.*0.*records/);
});
