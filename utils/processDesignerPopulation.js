// Presentation population primacy for the process canvas (canonical
// contract: components/process-designer/README.md — node UI contract
// "Cards" and "Lanes"). The one predicate every consumer routes through:
// the remove operation is presentation-secondary (plain content surface,
// hidden in the clean view) while remaining a lane effect whose grants
// are written by the lane drop like every other effect.
export function isSecondaryPopulationKind(opKind) {
  return String(opKind || '') === 'effect.deleteEntity';
}
