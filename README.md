# indokq CLI - AI Agent with Multi-Phase Intelligence

An AI agent CLI built with TypeScript and OpenTUI, implementing a sophisticated multi-phase intelligence system using Claude Sonnet 4.5.

## Features

### Two Modes of Operation

**📋 Planning Mode** (Default)
- Chat with Claude to plan and discuss your task
- Refine requirements and create specifications
- No execution - pure planning and discussion
- Web search enabled for research
- Commands: `/execute` (switch to execution), `/clear` (reset chat)

**⚡ Execution Mode**
- Full AI agent with multi-phase intelligence system
- Automated task execution with tools
- Real-time progress updates

### Multi-Phase Intelligence System (Execution Mode)
- **Prediction Phase**: Task classification and metadata extraction
- **Intelligence Phase**: Parallel streams for rapid information gathering
  - Terminus execution (quick feedback)
  - Web research (Claude's built-in search)
  - Deep strategy generation
  - Environment observation
  - Docker exploration
- **Synthesis Phase**: Combines all intelligence with prompt caching
- **Execution Phase**: Main task execution with tool use

### Additional Features
- **Mode Switching**: Press **Shift+Tab** to switch between Planning and Execution modes
- **Claude Built-in Web Search**: Leverages Claude's native web search capabilities
- **Real-time Streaming UI**: Ink-based interface with live updates
- **Tool Integration**: Command execution, file operations, Docker support
- **Prompt Caching**: Efficient token usage with Claude's caching
- **Interactive Controls**: Press ESC to stop execution at any time

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```
ANTHROPIC_API_KEY=your-api-key-here
ANTHROPIC_BASE_URL=https://api.codemirror.codes/
MODEL_NAME=claude-sonnet-4.5
ENABLE_WEB_SEARCH=true
```

## Usage

### Interactive Mode (Recommended)

Start the CLI and type your task interactively:

```bash
npm run dev
```

**Controls:**
- **Shift+Tab**: Switch between Planning and Execution modes
- **Enter**: Submit message/task
- **ESC**: Stop execution (in Execution mode only)

**Workflow:**
1. Start in Planning Mode - discuss and refine your task
2. Type `/execute` or press **Shift+Tab** to switch to Execution Mode
3. Agent executes the planned task
4. Press **Shift+Tab** to return to Planning for adjustments

**Planning Mode Commands:**
- `/execute` - Switch to execution with current plan
- `/clear` - Clear planning chat history

### Command-Line Mode

Or provide the task directly as an argument:

```bash
npm run dev "Create a Python script that analyzes log files"
```

### Build and Run

```bash
npm run build
npm start
```

## Architecture

```
┌─────────────────────────────────────────┐
│ 1. Prediction Phase                     │
│    └─ Classify task & extract metadata  │
├─────────────────────────────────────────┤
│ 2. Intelligence Phase (Parallel)        │
│    ├─ Terminus: Quick execution         │
│    ├─ Web Research: Claude searches     │
│    ├─ Strategy: Deep knowledge          │
│    ├─ Environment: System observation   │
│    └─ Exploration: Docker testing       │
├─────────────────────────────────────────┤
│ 3. Synthesis Phase                      │
│    └─ Combine all intelligence          │
├─────────────────────────────────────────┤
│ 4. Execution Phase                      │
│    └─ Main execution with tools         │
└─────────────────────────────────────────┘
```

## Project Structure

```
src/
├── config/          # Configuration and prompts
├── core/            # Orchestrator and types
├── tools/           # Tool implementations
└── ui/              # OpenTUI components
```

## License

MIT
