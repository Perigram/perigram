// Framework task contracts (SPEC §21): the async executors the framework
// features and workers claim.
//
// The queue-era task surface is gone: `dxf.parseUpload`, `cassette.bakeTemplate`,
// `attachment.generate`, and `vision.extractGeometry` had no enqueue site left
// after the legacy domain cut, and their workers were deleted with them. The
// nesting solver is not a task — it is the synchronous `nesting.solve` V→V
// command served by the HTTP nesting worker. New tasks are declared here when
// a live executor is registered beside them.
export const frameworkTaskDefinitions = {};
