# Installation Guide

## Install indokq CLI Globally

### Quick Install (Recommended)

From the project directory:

```bash
npm link
```

This creates a global symlink. Now you can use `indokq` from anywhere!

### Usage

```bash
# Run a task directly
indokq "create a hello.txt file"

# Start interactive mode
indokq

# Use execution mode
indokq "/exec refactor the database code"
```

---

## Alternative Installation Methods

### Method 1: Install from Local Package

```bash
# Build and package
npm run build
npm pack

# Install globally
npm install -g ./indokq-cli-1.0.0.tgz
```

### Method 2: Publish to npm (for distribution)

```bash
# Login to npm (one-time)
npm login

# Publish
npm publish

# Others can install:
npm install -g indokq-cli
```

---

## Uninstall

```bash
# If installed with npm link:
npm unlink -g indokq

# If installed with npm install -g:
npm uninstall -g indokq-cli
```

---

## Verify Installation

```bash
# Check if indokq is available
which indokq  # On Unix/Mac
where indokq  # On Windows

# Run indokq
indokq "test command"
```

---

## Troubleshooting

### Command not found

If `indokq` command is not found after `npm link`:

1. Check npm global bin directory:
   ```bash
   npm config get prefix
   ```

2. Make sure it's in your PATH:
   - **Windows**: Add `C:\Users\YourName\AppData\Roaming\npm` to PATH
   - **Mac/Linux**: Add `/usr/local/bin` or `~/.npm-global/bin` to PATH

### Permission errors (Mac/Linux)

If you get EACCES errors:
```bash
sudo npm link
```

Or configure npm to install globally without sudo:
```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

---

## Requirements

- Node.js 18+ (for ES modules support)
- npm 7+
- Windows Terminal / CMD / Git Bash (Windows)
- Any modern terminal (Mac/Linux)

---

## Environment Setup

Make sure you have a `.env` file with your API key:

```bash
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

The CLI will look for `.env` in:
1. Current working directory
2. Home directory (`~/.indokq/.env`)
3. Project directory

---

## Success! 🎉

You can now run `indokq` from anywhere on your system!
