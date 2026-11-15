// The look plan, in one place. Dusk desert-industrial: sand, rust and dusk blues with one
// teal accent for Vanguard and one ember accent for the Dustjacks. The same names are the
// CSS custom properties in index.html. No other colour appears in the code.
export const PALETTE = {
  canvas: '#191512',
  surface: '#262019',
  hairline: '#3d332a',
  ink: '#efe8dc',
  muted: '#a89a85',
  accent: '#35c4a8',
  sand: '#c8a06a',
  rust: '#a35d33',
  ember: '#e0562e',
  dusk: '#2a2622',
  steel: '#5a6b74',
};

export function shade(name) {
  return PALETTE[name];
}
