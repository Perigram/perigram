// One-way migration (owner direction 2026-10-16: the organization AI
// replaces created bots). Deletes custom bot members and their
// subscriptions, removes them from role assignments and group
// participants, and strips the retired tokenHash/profile bot-marker
// fields from the remaining bot members (the per-org assistants). Run
// once after deploying the delegation scheme:
//   node server/scripts/migrate-retire-custom-bots.js
import { connectDB } from '../db/mongo.js';
import { ObjectId } from 'mongodb';

const assistantEmailFor = (organizationId) => `assistant-${organizationId}@bots.perigram.internal`;

async function main() {
    const db = await connectDB();
    const users = db.collection('users');
    const organizations = db.collection('organizations');
    const subscriptions = db.collection('agent_bot_subscriptions');
    const chatGroups = db.collection('chat_groups');

    // The assistant address is deterministic per org — resolve, never
    // create: the running app bootstraps assistants lazily anyway.
    const orgIds = (await organizations.find({}, { projection: { _id: 1 } }).toArray()).map(org => org._id.toString());
    const assistantIds = new Set();
    for (const orgId of orgIds) {
        const assistant = await users.findOne({ 'data.email': assistantEmailFor(orgId), 'data.bot': { $exists: true } });
        if (assistant) assistantIds.add(assistant._id.toString());
    }

    const customBots = await users.find({ 'data.bot': { $exists: true } }).toArray();
    const removed = [];
    for (const bot of customBots) {
        const botId = bot._id.toString();
        if (assistantIds.has(botId)) continue;
        await subscriptions.deleteMany({ botUserId: botId });
        await organizations.updateMany(
            {},
            { $unset: { [`data.roleAssignments.${botId}`]: '' } }
        );
        await chatGroups.updateMany(
            { participants: botId },
            { $pull: { participants: botId } }
        );
        await users.deleteOne({ _id: bot._id });
        removed.push(`${botId} (${bot.data?.email || bot.identity?.name || 'unnamed'})`);
    }

    const stripped = await users.updateMany(
        { 'data.bot': { $exists: true } },
        { $unset: { 'data.bot.tokenHash': '', 'data.bot.profile': '' } }
    );

    // Subscription rows for groups deleted before deletion cleaned up
    // after itself (rooms the old scheme left behind).
    const groupRows = await subscriptions.find({ conversationKey: /^group:/ }).toArray();
    let orphanedRows = 0;
    for (const row of groupRows) {
        const groupId = row.conversationKey.slice('group:'.length);
        const group = await chatGroups.findOne({ _id: toFlexibleGroupId(groupId) });
        if (!group) {
            await subscriptions.deleteOne({ _id: row._id });
            orphanedRows += 1;
        }
    }

    console.log([
        removed.length ? `deleted custom bots:\n  ${removed.join('\n  ')}` : 'no custom bots to delete',
        `stripped retired bot fields on ${stripped.modifiedCount} bot member(s)`,
        orphanedRows ? `deleted ${orphanedRows} subscription row(s) of removed group rooms` : 'no orphaned group subscriptions'
    ].join('\n'));
    process.exit(0);
}

function toFlexibleGroupId(id) {
    try {
        return new ObjectId(String(id));
    } catch {
        return String(id);
    }
}

main().catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
});
