import * as usersService from './server/features/users/service.js';
import { connectDB } from './server/db/mongo.js';

async function test() {
  try {
    const email = 'isuo1991@outlook.com';
    const password = 'password'; // I don't know the real password
    console.log('Testing login for:', email);
    
    // We need to mock event if we call endpoints, but here we call service
    // Service doesn't need event.
    
    const result = await usersService.login(email, password);
    console.log('Login result:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('Login failed with error:', e);
    if (e.data) console.error('Error data:', e.data);
  }
}

test().then(() => process.exit());
