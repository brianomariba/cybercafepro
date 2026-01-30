/**
 * HawkNine Demo Data Cleanup Script v2.0
 * Removes all demo/test users and keeps only real production data
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hawknine';

const User = require('./models/User');
const Session = require('./models/Session');
const Computer = require('./models/Computer');

async function cleanup() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // === STEP 1: Show current users before cleanup ===
        console.log('\n📊 Current Users in Database:');
        const allUsersBefore = await User.find({});
        console.log(`   Total users: ${allUsersBefore.length}`);

        for (const user of allUsersBefore) {
            console.log(`   - ${user.username} (${user.type}) | Name: ${user.name} | Active: ${user.active} | Created: ${user.createdAt}`);
        }

        // === STEP 2: Remove demo/test agent users ===
        // Pattern matching for demo data:
        // - username contains "agent" followed by numbers (agent1, agent2, etc.)
        // - name is "Agent User 1" or similar
        // - username is "demo"
        // - name is "Demo User"
        // - username contains "test"
        console.log('\n🗑️  Removing demo/test users...');

        const demoPatterns = {
            $or: [
                { username: /^agent\d+$/i },           // agent1, agent2, etc.
                { username: 'demo' },
                { username: /test/i },
                { name: 'Demo User' },
                { name: /^Agent User \d+$/i },         // Agent User 1, Agent User 2, etc.
                { email: /example\.com$/i },           // demo@example.com
                { email: /test@/i }
            ]
        };

        const demoUsersToDelete = await User.find(demoPatterns);
        if (demoUsersToDelete.length > 0) {
            console.log('   Users to be deleted:');
            for (const user of demoUsersToDelete) {
                console.log(`     - ${user.username} (${user.name})`);
            }
        }

        const deleteResult = await User.deleteMany(demoPatterns);
        console.log(`   ✅ Deleted ${deleteResult.deletedCount} demo/test users.`);

        // === STEP 3: Show remaining users after cleanup ===
        console.log('\n📊 Remaining Users After Cleanup:');
        const remainingUsers = await User.find({});
        console.log(`   Total users: ${remainingUsers.length}`);

        if (remainingUsers.length > 0) {
            for (const user of remainingUsers) {
                console.log(`   ✓ ${user.username} (${user.type}) | Name: ${user.name} | Active: ${user.active}`);
            }
        } else {
            console.log('   ⚠️  No users remaining. You will need to create new users via the admin dashboard.');
        }

        // === STEP 4: Clean up orphaned sessions ===
        console.log('\n🧹 Cleaning orphaned sessions...');
        const validUsernames = remainingUsers.map(u => u.username);

        // Remove sessions for users that no longer exist
        const orphanedSessions = await Session.deleteMany({
            user: { $nin: validUsernames }
        });
        console.log(`   ✅ Removed ${orphanedSessions.deletedCount} orphaned sessions.`);

        console.log('\n✅ Cleanup complete!');
        console.log('\n📝 Next Steps:');
        console.log('   1. Login to admin dashboard at https://admin.hawkninegroup.com');
        console.log('   2. Go to Users page');
        console.log('   3. Create real agent users with actual usernames and passwords');
        console.log('   4. Test login on desktop agent with the new credentials');

        process.exit(0);
    } catch (err) {
        console.error('❌ Cleanup failed:', err);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    cleanup();
}

module.exports = cleanup;
