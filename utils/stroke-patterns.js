// Stroke pattern → SVG dasharray for drawing previews: the closed
// vocabulary of the pen-template `pattern` enum.
export function dashArray(pattern = 'SOLID', weight = 1) {
  const unit = Math.max(1, Number(weight) || 1);
  if (pattern === 'DASHED') return `${unit * 6} ${unit * 4}`;
  if (pattern === 'DOTTED') return `${unit * 0.01} ${unit * 3}`;
  return undefined;
}
