#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from './ui/app.js';

// Check terminal compatibility
if (process.platform === 'win32') {
  console.log('\n⚠️  Windows Detected');
  console.log('For best experience, use one of these terminals:');
  console.log('  - Windows Terminal (recommended)');
  console.log('  - CMD (Command Prompt)');
  console.log('  - Git Bash');
  console.log('  - WSL\n');
  console.log('PowerShell has limited support. If you see errors, switch terminals.\n');
}

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
