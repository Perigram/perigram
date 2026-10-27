// Structured construction refusals (SPEC §24): a fill/render refusal
// travels as `failures` (named offenders) on the action error; callers
// render the list instead of a generic message.
export function refusalFailuresOf(error) {
  const failures = error?.data?.data?.failures;
  if (!Array.isArray(failures) || !failures.length) return null;
  return failures
    .map(failure => (failure && typeof failure === 'object' ? failure : { message: String(failure) }))
    .map(failure => ({
      name: failure.name == null ? null : String(failure.name),
      message: String(failure.message || '')
    }))
    .filter(failure => failure.message || failure.name);
}
