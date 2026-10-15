// One-way migration (owner direction 2026-10-15: named model profiles
// with capability routing): rewrites the retired single-provider
// `data.settings.llm` shape { provider, baseUrl, model, apiKey? } into
// { profiles: { default: { kind: 'chat', ... } }, routes: { chat: 'default' } }.
// Orgs already on profiles are skipped. Run once:
//   node server/scripts/migrate-llm-settings-profiles.js
import { connectDB } from '../db/mongo.js';

async function main() {
    const db = await connectDB();
    const organizations = db.collection('organizations');
    const migrated = [];
    const cursor = organizations.find({ 'data.settings.llm.provider': { $exists: true } });
    for await (const org of cursor) {
        const old = org.data?.settings?.llm;
        if (!old || old.profiles) continue;
        const profile = {
            kind: 'chat',
            provider: String(old.provider || ''),
            baseUrl: String(old.baseUrl || ''),
            model: String(old.model || '')
        };
        if (old.apiKey) profile.apiKey = String(old.apiKey);
        await organizations.updateOne(
            { _id: org._id },
            { $set: { 'data.settings.llm': { profiles: { default: profile }, routes: { chat: 'default' } } } }
        );
        migrated.push(`${org._id}: ${profile.provider}/${profile.model} -> profile "default", route chat`);
    }
    console.log(migrated.length ? migrated.join('\n') : 'nothing to migrate');
    process.exit(0);
}

main().catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
});
