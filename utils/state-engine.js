// Per-state display policy from the compiled contract (SPEC §7): the
// served CTS client bundle resolves every authored state value of a
// type's `states` facet to `{ label, icon, severity }` (authored at
// `states.<axis>.render` on declarations, derived defaults applied at
// compile time by `@perigram/cts` `renderPolicyFor`). This resolver is
// the single display seam shared by the status chip and transition
// actions; values without a declaration render as a neutral chip
// carrying the raw value — the documented stop-line for undeclared
// types. There is no legacy domain status table lookup anymore.

// Bundle ids are kebab CTS ids; callers hold kebab, snake, or legacy
// camel spellings of the same type. One normalization for the states
// lookup seam (mirrors `useFileTypeView.typeById`).
export function kebabStateTypeId(typeId = '') {
    return String(typeId)
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/_/g, '-')
        .toLowerCase();
}

export function resolveStateDisplay(states = null, value = '') {
    const raw = value === null || value === undefined || value === ''
        ? 'UNKNOWN'
        : String(value);
    const render = states?.main?.render || null;
    const policy = render?.[raw] || render?.[raw.toLowerCase()] || render?.[raw.toUpperCase()] || null;
    if (!policy) return { label: raw, severity: 'secondary', icon: null };
    return {
        label: policy.label || raw,
        severity: policy.severity || 'secondary',
        icon: policy.icon || null
    };
}
