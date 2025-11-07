export const SLASH_COMMAND_OPTIONS = [
  { label: '/help - Display help', value: '/help' },
  { label: '/normal - Switch to normal mode', value: '/normal' },
  { label: '/plan - Switch to planning mode', value: '/plan' },
  { label: '/exec - Switch to execution mode', value: '/exec' },
  { label: '/clear - Clear history', value: '/clear' },
  { label: '/context reset', value: '/context reset' },
  { label: '/context show', value: '/context show' },
  { label: '/exit - Quit', value: '/exit' }
];

export const HELP_TEXT = (mode: string) => `
Commands:
/help ............... Display help information
/plan <message> ..... Switch to planning mode (chat)
/exec <task> ........ Execute task in execution mode
/normal ............. Switch to normal mode
/clear .............. Clear conversation history
/context reset ...... Reset workspace context
/context show ....... Show current workspace context
/exit ............... Quit indokq CLI

Keyboard Shortcuts:
Shift+Tab ........... Cycle between modes (normal/planning/execution)
Alt+V ............... Paste image from clipboard
Ctrl+O .............. Toggle verbose output
ESC ................. Cancel operation

Normal Mode (default):
- Talk naturally and Claude will use tools to help you
- Example: "create a hello.txt file"
- Example: "analyze the codebase structure"
- Claude can call tools but CANNOT spawn agents
- You explicitly spawn agents with @agentname

Explicit agent invocation:
  @terminus <task> ....... Quick exploration agent
  @environment <task> .... System state analyzer
  @prediction <task> ..... Task predictor
  @intelligence <task> ... Meta-agent coordinator
  @synthesis <task> ...... Intelligence synthesizer
  @execution <task> ...... Execution agent

File & Image Attachment:
@filename ........... Attach text files or images to your query
                      Example: @app.tsx how does the spinner work?
Alt+V ............... Paste image from clipboard (screenshots)
                      Example: Take screenshot → Alt+V → Ask question
Drag & Drop ......... Drag image files into terminal (auto-attaches)

Supported images: .png, .jpg, .jpeg, .gif, .webp, .bmp

Workflow:
1. Take screenshot (Win+Shift+S or Cmd+Shift+4)
2. Press Alt+V in CLI to paste
3. Type your question
4. Image sent with Claude Vision API

Current mode: ${mode}
`;
