#!/usr/bin/env node

// MUST load .env FIRST, before any other imports
// This ensures environment variables are loaded at runtime, not build time
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from the project root (parent of dist/ directory)
const envPath = __dirname.endsWith('dist') 
  ? join(__dirname, '..', '.env')
  : join(__dirname, '.env');

dotenv.config({ path: envPath, override: true });

// DEBUG: Uncomment to verify .env loading if needed
// console.log('🔧 ENV DEBUG:');
// console.log('CWD:', process.cwd());
// console.log('Script dir:', __dirname);
// console.log('.env path:', envPath);
// console.log('API Key loaded:', process.env.ANTHROPIC_API_KEY ? 'Yes ✓' : 'No ✗');
// console.log('API Key (first 20 chars):', process.env.ANTHROPIC_API_KEY?.substring(0, 20));
// console.log('---\n');

import React from 'react';
import { render } from 'ink';
import { App } from './ui/app.js';

// Get optional initial task from command line arguments
const args = process.argv.slice(2);
const initialTask = args.length > 0 ? args.join(' ') : undefined;

try {
  // Render the Ink app
  render(React.createElement(App, { initialTask }));
} catch (error: any) {
  console.error('\n❌ Failed to start CLI:', error.message);
  console.log('\nIf you see "Raw mode not supported", please use Windows Terminal or CMD.\n');
  process.exit(1);
}
