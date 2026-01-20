# COMPONENT: Cassette Instances

Tracks the lifecycle of physical cassettes produced from nesting queues.

## Lifecycle Stages
- `nested`: Initial state when a queue is marked as "CUT".
- `manufactured`: Cassette has been physically milled/cut.
- `on-site`: Cassette delivered to the construction site.
- `installed`: Cassette successfully installed.

## Data Structure
- `queueId`: Reference to the source production queue.
- `projectSlug`: Reference to the project.
- `cassetteTemplateId`: Link to the original template.
- `dimensions`: Exact dimensions used for this instance.
- `status`: Current lifecycle state.
- `instanceNumber`: Unique identifier within the queue (e.g. "Q-001-1").

## Key Workflows
1. **Creation**: Triggered automatically in `queues.markCut()` service.
2. **Tracking**: Users update status in the Queue Editor's "Instances" tab.
3. **History**: Every status change is logged in `statusHistory`.
