import { connectDB } from '../db/mongo.js';

/**
 * One-shot migration: replaces the retired livekit `call_channels` contract
 * with unified support `chat_groups`. Every channel document becomes a group
 * chat whose participants start as the creating member, so its room becomes
 * `call:group:<same id>` and the group appears in the creator's chats inbox.
 *
 * Usage: node server/scripts/migrate-call-channels-to-groups.js [--dry-run]
 */

const dryRun = process.argv.includes('--dry-run');
const db = await connectDB();

const channels = await db.collection('call_channels').find({}).toArray();
let copied = 0;
for (const channel of channels) {
    const existing = await db.collection('chat_groups').findOne({ _id: channel._id });
    if (existing) continue;
    const participants = [channel.origin?.userId?.toString?.() || channel.origin?.userId]
        .filter(Boolean);
    if (dryRun) {
        copied += 1;
        continue;
    }
    await db.collection('chat_groups').insertOne({ ...channel, participants });
    copied += 1;
}

if (!dryRun && channels.length) {
    await db.collection('call_channels').drop();
}

console.log(`migrate-call-channels-to-groups: ${copied} channel(s) -> chat_groups${dryRun ? ' (dry run)' : ', call_channels dropped'}`);
process.exit(0);
