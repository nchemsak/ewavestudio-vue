// src/lib/menuAim.ts
// "Menu aim" for a submenu that opens beside its row (File → Open ▸): a pointer moving
// diagonally toward the submenu crosses the rows under its row, so the submenu stays open
// while the pointer is still inside the triangle between where it left the row and the
// submenu's near edge (ProjectControls.vue). Pure, unit-tested.

export type Pt = { x: number; y: number };

/** Whether (x, y) is inside the triangle a → b → c, or on its edge */
export function inTriangle(x: number, y: number, a: Pt, b: Pt, c: Pt): boolean {
	const side = (p: Pt, q: Pt) => (q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x);
	const d1 = side(a, b), d2 = side(b, c), d3 = side(c, a);
	return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/** The pointer at (x, y), having left the row at `from`, still heads for a submenu whose left
 *  edge spans `top`..`bottom` at `left` (with a little slack, so a wobbling hand still counts) */
export function headingFor(x: number, y: number, from: Pt, menu: { left: number; top: number; bottom: number }): boolean {
	return inTriangle(x, y, { x: from.x - 4, y: from.y }, { x: menu.left + 2, y: menu.top - 12 }, { x: menu.left + 2, y: menu.bottom + 12 });
}
