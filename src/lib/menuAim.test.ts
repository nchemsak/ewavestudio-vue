import { describe, expect, it } from 'vitest';
import { headingFor, inTriangle } from './menuAim';

describe('menu aim', () => {
	it('tells inside a triangle from outside it', () => {
		const a = { x: 0, y: 0 }, b = { x: 10, y: 0 }, c = { x: 0, y: 10 };
		expect(inTriangle(2, 2, a, b, c)).toBe(true);
		expect(inTriangle(0, 5, a, b, c)).toBe(true);
		expect(inTriangle(8, 8, a, b, c)).toBe(false);
		expect(inTriangle(-1, 2, a, b, c)).toBe(false);
	});
	it('keeps a submenu open for a pointer heading down and right toward it, not for one going down or left', () => {
		const from = { x: 100, y: 50 };
		const menu = { left: 160, top: 40, bottom: 300 };
		expect(headingFor(120, 60, from, menu)).toBe(true);   // diagonally, over the row below
		expect(headingFor(150, 200, from, menu)).toBe(true);  // steeply, near the list
		expect(headingFor(100, 80, from, menu)).toBe(false);  // straight down to the next row
		expect(headingFor(80, 55, from, menu)).toBe(false);   // back left
	});
});
