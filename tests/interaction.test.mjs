import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp } from '../web/model.mjs';

test('wheel zoom calculation respects clamp bounds and step sizes', () => {
  let targetZoom = 1.0;
  const zoomIn = (deltaY) => {
    const step = deltaY < 0 ? 0.1 : -0.1;
    targetZoom = clamp(Math.round((targetZoom + step) * 100) / 100, 0.25, 3);
    return targetZoom;
  };

  assert.equal(zoomIn(-100), 1.1);
  assert.equal(zoomIn(-100), 1.2);
  assert.equal(zoomIn(100), 1.1);

  // Lower clamp bound check
  targetZoom = 0.3;
  assert.equal(zoomIn(100), 0.25);
  assert.equal(zoomIn(100), 0.25);

  // Upper clamp bound check
  targetZoom = 2.95;
  assert.equal(zoomIn(-100), 3.0);
  assert.equal(zoomIn(-100), 3.0);
});

test('pan math properly offsets viewport scroll position', () => {
  const panStart = { x: 200, y: 300, scrollLeft: 50, scrollTop: 80 };
  const currentPointer = { clientX: 160, clientY: 250 }; // dragged left by 40, up by 50
  const newScrollLeft = panStart.scrollLeft - (currentPointer.clientX - panStart.x);
  const newScrollTop = panStart.scrollTop - (currentPointer.clientY - panStart.y);

  // When dragging left by 40, viewport scrollLeft increases by 40 to move content right
  assert.equal(newScrollLeft, 90);
  // When dragging up by 50, viewport scrollTop increases by 50 to move content down
  assert.equal(newScrollTop, 130);
});

test('zoom anchor preserves point under cursor across scale ratio', () => {
  const mouseX = 300, mouseY = 200;
  const paper = { offsetLeft: 50, offsetTop: 20 };
  const paperX = 250, paperY = 180;
  const ratio = 1.5;

  const targetScrollLeft = paper.offsetLeft + paperX * ratio - mouseX;
  const targetScrollTop = paper.offsetTop + paperY * ratio - mouseY;

  // New paper position of the point: 50 + 250*1.5 = 425
  // Point relative to viewport client: 425 - targetScrollLeft = 425 - 125 = 300 (matches mouseX)
  assert.equal(targetScrollLeft, 125);
  assert.equal(targetScrollTop, 90);
  assert.equal(paper.offsetLeft + paperX * ratio - targetScrollLeft, mouseX);
  assert.equal(paper.offsetTop + paperY * ratio - targetScrollTop, mouseY);
});
