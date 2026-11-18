import { defineEventHandler } from 'h3';
import { listInstancesForType } from '../[type]/index.get.js';

// The static editor route under this directory shadows the generic
// `[type]` list route for the bare type path, so the graph workspace's
// collection read has its own entry.
export default defineEventHandler(event => listInstancesForType(event, 'graph-document'));
