// Socket lines for the designer's "?" tooltip: "name — Type · list ·
// optional", computed from the node's real ports.
export function socketSpecLine(port = {}, formatType = () => 'value') {
  const bits = [formatType(port.type)];
  if (port.access && port.access !== 'item') bits.push(port.access);
  if (port.required === false) bits.push('optional');
  return `${port.label || port.id} — ${bits.join(' · ')}`;
}
