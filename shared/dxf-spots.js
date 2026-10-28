// The {spot:<name>} marker read for fill dialogs (SPEC §24): a template's
// placement anchors, parsed client-side from the template payload. The
// executor's placement engine owns the composition law; this is the read
// the assignment surface shares with it.
const SPOT = /^\{spot:([^}]+)\}$/;

export function spotNamesOf(text) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  const names = [];
  let inEntities = false;
  let pendingSection = false;
  let pendingType = '';
  let pendingText = null;
  let pendingX = null;
  let pendingY = null;
  const flush = () => {
    if (pendingType === 'TEXT' || pendingType === 'MTEXT') {
      const match = SPOT.exec(String(pendingText ?? '').trim());
      if (match) names.push(match[1]);
    }
    pendingType = '';
    pendingText = null;
    pendingX = null;
    pendingY = null;
  };
  for (let index = 0; index < lines.length; index += 2) {
    const code = Number.parseInt(lines[index].trim(), 10);
    if (!Number.isFinite(code)) continue;
    const value = lines[index + 1];
    if (code === 0) {
      const type = value.trim();
      if (type === 'SECTION') {
        pendingSection = true;
        continue;
      }
      if (type === 'ENDSEC') {
        inEntities = false;
        continue;
      }
      if (inEntities) {
        flush();
        pendingType = type;
      }
      continue;
    }
    if (pendingSection && code === 2) {
      inEntities = value.trim() === 'ENTITIES';
      pendingSection = false;
      continue;
    }
    if (!inEntities) continue;
    if (code === 1) pendingText = value;
  }
  flush();
  return names;
}
