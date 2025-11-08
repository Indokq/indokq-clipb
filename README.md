# indokq CLI - AI Agent with Multi-Phase Intelligence

An AI agent CLI built with TypeScript and OpenTUI, implementing a sophisticated multi-phase intelligence system using Claude Sonnet 4.5.

## Features

### Three Modes of Operation

**🔧 Normal Mode** (Default)
- Talk naturally with Claude to accomplish tasks
- Claude uses tools directly (read files, execute commands, etc.)
- Quick exploratory work and one-off tasks
- Switch modes: Press **Shift+Tab** or use `/plan` or `/exec`

**📋 Specification Mode**
Transforms simple feature descriptions into working code with automatic planning and safety checks. You provide a brief description of what you want, and indokq creates a detailed specification and implementation plan before making any changes.

**How it works:**
1. **Describe your feature** - Provide a simple description in 4-6 sentences. No need to write formal specifications.
2. **indokq creates the spec** - Analyzes your request and generates a complete specification with acceptance criteria, implementation plan, and technical details.
3. **Review and approve** - Review the generated specification and implementation plan. Request changes or approve as-is.
4. **Implementation** - Only after approval does indokq begin making actual code changes, showing each modification for review.

**indokq generates:**
- Complete specification with detailed acceptance criteria
- Technical implementation plan covering all layers
- File-by-file breakdown of changes needed
- Testing strategy and verification steps
- Security and compliance considerations

**⚡ Execution Mode**
- Full AI agent with multi-phase intelligence system
- Automated task execution with parallel intelligence streams
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
- **Shift+Tab**: Cycle between modes (Normal → Specification → Execution)
- **Enter**: Submit message/task
- **ESC**: Cancel operation or close menus

**Workflow:**
1. Start in Normal Mode (default) - quick tasks and exploration
2. Press **Shift+Tab** or type `/plan` to switch to Specification Mode - for planned feature development
3. Describe your feature, review the generated spec, and approve
4. Press **Shift+Tab** or type `/exec` to switch to Execution Mode - for automated task execution
5. Press **Shift+Tab** to cycle back to Normal Mode

**Commands:**
- `/plan` or `/spec` - Switch to specification mode
- `/exec` - Switch to execution mode
- `/normal` - Switch to normal mode
- `/mcp` - MCP server management
- `/clear` - Clear conversation history

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
