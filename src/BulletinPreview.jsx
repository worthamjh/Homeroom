import { SCALLOP_BAND } from "./boardConfig";

/**
 * A miniature of the bulletin strip — the same structure the real board
 * draws, at whatever size the parent gives it.
 *
 * Extracted because there were about to be three copies of it: the board
 * itself, the store's browse card, and the settings panel's swatch. The
 * swatch used to fake it by tiling the scallop's top-edge tile across the
 * whole square, which produced rows of bumps rather than a border around
 * an edge — nothing like what you actually get (Jay: "can we make the box
 * next to it look more like the actual background?").
 *
 * `band` is the only thing that varies: the real strip and the store card
 * use SCALLOP_BAND, a 16px swatch needs a much thinner one or the border
 * eats the whole square. Tiles scale with it, so the scallops stay round
 * instead of being squashed.
 */
export default function BulletinPreview({ style, band = SCALLOP_BAND, radius = 3, border }) {
  if (!style) return null;
  const sc = style.scallop;
  const trimH = Math.max(3, Math.round(band * 0.6));
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: style.background, borderRadius: radius, overflow: "hidden", border, boxSizing: "border-box" }}>
      {/* Dot trim: top and bottom edges only, which is all the real one has. */}
      {style.trim && (
        <>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: trimH, backgroundImage: style.trim, backgroundRepeat: "repeat-x", backgroundSize: `${trimH * 2}px ${trimH}px` }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: trimH, backgroundImage: style.trim, backgroundRepeat: "repeat-x", backgroundSize: `${trimH * 2}px ${trimH}px` }} />
        </>
      )}
      {/* Scallops: all four edges, corner patches underneath, horizontals
          over the sides — the same stacking as the board, so the corners
          read as overlapping strips here too. */}
      {sc && (
        <>
          <div style={{ position: "absolute", top: 0, left: 0, width: band, height: band, background: sc.color }} />
          <div style={{ position: "absolute", top: 0, right: 0, width: band, height: band, background: sc.color }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, width: band, height: band, background: sc.color }} />
          <div style={{ position: "absolute", bottom: 0, right: 0, width: band, height: band, background: sc.color }} />
          <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: band, backgroundImage: sc.left, backgroundRepeat: "repeat-y", backgroundSize: `${band}px ${band * 2}px` }} />
          <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: band, backgroundImage: sc.right, backgroundRepeat: "repeat-y", backgroundSize: `${band}px ${band * 2}px` }} />
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: band, backgroundImage: sc.top, backgroundRepeat: "repeat-x", backgroundSize: `${band * 2}px ${band}px` }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: band, backgroundImage: sc.bottom, backgroundRepeat: "repeat-x", backgroundSize: `${band * 2}px ${band}px` }} />
        </>
      )}
    </div>
  );
}
