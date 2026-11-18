// Keep repeat-section JSON drafts independent: a valid edit to one section
// must not discard an invalid in-progress edit in another section.
export function templateSectionState(sections = [], values = {}) {
  return sections.map(section => ({
    section: String(section),
    value: JSON.stringify(values?.[section] ?? null)
  }));
}

export function reconcileTemplateSectionDrafts(next = [], previous = [], drafts = {}, errors = {}) {
  const previousValues = new Map(previous.map(item => [item.section, item.value]));
  const activeSections = new Set(next.map(item => item.section));
  const nextDrafts = { ...drafts };
  const nextErrors = { ...errors };

  for (const item of next) {
    if (previousValues.has(item.section) && previousValues.get(item.section) !== item.value) {
      delete nextDrafts[item.section];
      delete nextErrors[item.section];
    }
  }
  for (const section of Object.keys(nextDrafts)) {
    if (!activeSections.has(section)) delete nextDrafts[section];
  }
  for (const section of Object.keys(nextErrors)) {
    if (!activeSections.has(section)) delete nextErrors[section];
  }

  return { drafts: nextDrafts, errors: nextErrors };
}
