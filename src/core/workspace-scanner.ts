import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';

export interface WorkspaceCache {
  version: string;
  scannedAt: number;
  rootPath: string;
  
  // Project metadata
  projectType: 'typescript' | 'javascript' | 'python' | 'rust' | 'go' | 'mixed';
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun';
  
  // File tree (lightweight)
  fileTree: FileTreeNode[];
  fileCount: number;
  directoryCount: number;
  
  // Searchable metadata
  keywords: Map<string, string[]>;  // keyword -> file paths
  todos: TodoItem[];
  fixmes: TodoItem[];
  
  // Dependencies
  dependencies?: {
    packageJson?: PackageJsonInfo;
    requirements?: string[];  // Python
    cargoToml?: CargoInfo;    // Rust
    goMod?: GoModInfo;        // Go
  };
  
  // Scripts/commands
  availableScripts?: Record<string, string>;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  extension?: string;
  size?: number;
  children?: FileTreeNode[];
}

export interface TodoItem {
  file: string;
  line: number;
  type: 'TODO' | 'FIXME' | 'NOTE' | 'HACK';
  text: string;
  author?: string;
}

export interface PackageJsonInfo {
  name: string;
  version: string;
  scripts: Record<string, string>;
  dependencies: string[];
  devDependencies: string[];
}

export interface CargoInfo {
  name: string;
  version: string;
  dependencies: string[];
}

export interface GoModInfo {
  module: string;
  dependencies: string[];
}

export class WorkspaceScanner {
  private cache: WorkspaceCache | null = null;
  private cacheFile = '.indokq/workspace-cache.json';
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
  
  /**
   * Scan workspace and cache metadata
   */
  async scan(rootPath: string, force: boolean = false): Promise<WorkspaceCache> {
    // Load existing cache if fresh
    if (!force && await this.isCacheFresh(rootPath)) {
      return this.cache!;
    }
    
    console.log('🔍 Scanning workspace...');
    
    const cache: WorkspaceCache = {
      version: '1.0.0',
      scannedAt: Date.now(),
      rootPath,
      projectType: await this.detectProjectType(rootPath),
      packageManager: await this.detectPackageManager(rootPath),
      fileTree: [],
      fileCount: 0,
      directoryCount: 0,
      keywords: new Map(),
      todos: [],
      fixmes: [],
      dependencies: await this.scanDependencies(rootPath),
      availableScripts: await this.extractScripts(rootPath)
    };
    
    // Build file tree
    cache.fileTree = await this.buildFileTree(rootPath);
    cache.fileCount = this.countFiles(cache.fileTree);
    cache.directoryCount = this.countDirectories(cache.fileTree);
    
    // Extract keywords from code
    await this.extractKeywords(cache, rootPath);
    
    // Scan for TODO/FIXME comments
    await this.scanComments(cache, rootPath);
    
    // Save cache
    await this.saveCache(cache, rootPath);
    this.cache = cache;
    
    console.log(`✅ Workspace scanned: ${cache.fileCount} files, ${cache.todos.length + cache.fixmes.length} TODOs/FIXMEs`);
    
    return cache;
  }
  
  /**
   * Get cached workspace data
   */
  getCache(): WorkspaceCache | null {
    return this.cache;
  }
  
  /**
   * Find files matching keywords
   */
  findFilesByKeyword(keyword: string): string[] {
    if (!this.cache) return [];
    return this.cache.keywords.get(keyword.toLowerCase()) || [];
  }
  
  /**
   * Get project overview for prompts
   */
  getProjectOverview(): string {
    if (!this.cache) return 'Workspace not scanned';
    
    const scriptsList = this.cache.availableScripts 
      ? Object.keys(this.cache.availableScripts).join(', ')
      : 'none';
    
    return `Project: ${this.cache.projectType}${this.cache.packageManager ? ` (${this.cache.packageManager})` : ''}
Files: ${this.cache.fileCount}
Directories: ${this.cache.directoryCount}
Scripts: ${scriptsList}
TODOs: ${this.cache.todos.length}, FIXMEs: ${this.cache.fixmes.length}`;
  }
  
  /**
   * Get file tree as formatted string
   */
  getFormattedFileTree(maxDepth: number = 2): string {
    if (!this.cache) return '';
    return this.formatFileTree(this.cache.fileTree, maxDepth);
  }
  
  private async isCacheFresh(rootPath: string): Promise<boolean> {
    try {
      const cachePath = path.join(rootPath, this.cacheFile);
      if (!fs.existsSync(cachePath)) return false;
      
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      this.cache = {
        ...data,
        keywords: new Map(Object.entries(data.keywords || {}))
      };
      
      const age = Date.now() - this.cache.scannedAt;
      return age < this.CACHE_TTL_MS;
    } catch {
      return false;
    }
  }
  
  private async saveCache(cache: WorkspaceCache, rootPath: string) {
    try {
      const cachePath = path.join(rootPath, this.cacheFile);
      const cacheDir = path.dirname(cachePath);
      
      // Create .indokq directory if it doesn't exist
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      
      // Convert Map to object for JSON serialization
      const serializable = {
        ...cache,
        keywords: Object.fromEntries(cache.keywords)
      };
      
      fs.writeFileSync(cachePath, JSON.stringify(serializable, null, 2));
    } catch (error) {
      console.warn('Failed to save workspace cache:', error);
    }
  }
  
  private async detectProjectType(rootPath: string): Promise<WorkspaceCache['projectType']> {
    const indicators = {
      typescript: ['tsconfig.json', 'package.json'],
      javascript: ['package.json', 'node_modules'],
      python: ['requirements.txt', 'setup.py', 'pyproject.toml', '__init__.py'],
      rust: ['Cargo.toml', 'Cargo.lock'],
      go: ['go.mod', 'go.sum']
    };
    
    const detected: string[] = [];
    
    for (const [type, files] of Object.entries(indicators)) {
      for (const file of files) {
        if (fs.existsSync(path.join(rootPath, file))) {
          detected.push(type);
          break;
        }
      }
    }
    
    if (detected.length === 0) return 'mixed';
    if (detected.length > 1) return 'mixed';
    return detected[0] as WorkspaceCache['projectType'];
  }
  
  private async detectPackageManager(rootPath: string): Promise<WorkspaceCache['packageManager']> {
    if (fs.existsSync(path.join(rootPath, 'bun.lockb'))) return 'bun';
    if (fs.existsSync(path.join(rootPath, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fs.existsSync(path.join(rootPath, 'yarn.lock'))) return 'yarn';
    if (fs.existsSync(path.join(rootPath, 'package-lock.json'))) return 'npm';
    return undefined;
  }
  
  private async buildFileTree(rootPath: string): Promise<FileTreeNode[]> {
    try {
      // Use fast-glob to find files, respecting .gitignore
      const files = await fg(['**/*'], {
        cwd: rootPath,
        ignore: [
          'node_modules/**',
          'dist/**',
          'build/**',
          '.git/**',
          '.next/**',
          'out/**',
          'coverage/**',
          '.vscode/**',
          '.idea/**',
          '*.log',
          '.indokq/**'
        ],
        dot: false,
        onlyFiles: false,
        stats: true
      });
      
      // Build tree structure
      const root: FileTreeNode[] = [];
      const dirMap = new Map<string, FileTreeNode>();
      
      for (const entry of files) {
        const relativePath = entry.path || entry.name;
        const fullPath = path.join(rootPath, relativePath);
        const stats = entry.stats;
        
        if (!stats) continue;
        
        const node: FileTreeNode = {
          name: path.basename(relativePath),
          path: relativePath,
          type: stats.isDirectory() ? 'directory' : 'file',
          extension: stats.isFile() ? path.extname(relativePath) : undefined,
          size: stats.isFile() ? stats.size : undefined
        };
        
        // Add to tree (simplified - just collect for now)
        root.push(node);
      }
      
      return root;
    } catch (error) {
      console.warn('Failed to build file tree:', error);
      return [];
    }
  }
  
  private async extractKeywords(cache: WorkspaceCache, rootPath: string) {
    try {
      // Find source files
      const sourceFiles = await fg(['**/*.{ts,tsx,js,jsx,py,rs,go}'], {
        cwd: rootPath,
        ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**']
      });
      
      const keywordRegexes = [
        /export\s+(function|class|interface|type|const)\s+(\w+)/g,
        /function\s+(\w+)/g,
        /class\s+(\w+)/g,
        /interface\s+(\w+)/g,
        /type\s+(\w+)/g,
        /def\s+(\w+)/g,  // Python
        /fn\s+(\w+)/g     // Rust
      ];
      
      for (const file of sourceFiles.slice(0, 100)) { // Limit to avoid slowness
        try {
          const content = fs.readFileSync(path.join(rootPath, file), 'utf8');
          const words = new Set<string>();
          
          // Extract keywords using regex
          for (const regex of keywordRegexes) {
            let match;
            while ((match = regex.exec(content)) !== null) {
              const keyword = match[match.length - 1]; // Last capture group
              if (keyword && keyword.length > 2) {
                words.add(keyword.toLowerCase());
              }
            }
          }
          
          // Add to keyword map
          for (const word of words) {
            if (!cache.keywords.has(word)) {
              cache.keywords.set(word, []);
            }
            cache.keywords.get(word)!.push(file);
          }
        } catch {
          // Skip files that can't be read
        }
      }
    } catch (error) {
      console.warn('Failed to extract keywords:', error);
    }
  }
  
  private async scanComments(cache: WorkspaceCache, rootPath: string) {
    try {
      const sourceFiles = await fg(['**/*.{ts,tsx,js,jsx,py,rs,go}'], {
        cwd: rootPath,
        ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**']
      });
      
      const todoRegex = /(TODO|FIXME|NOTE|HACK):\s*(.+)/gi;
      
      for (const file of sourceFiles.slice(0, 100)) { // Limit to avoid slowness
        try {
          const content = fs.readFileSync(path.join(rootPath, file), 'utf8');
          const lines = content.split('\n');
          
          lines.forEach((line, index) => {
            const match = todoRegex.exec(line);
            if (match) {
              const item: TodoItem = {
                file,
                line: index + 1,
                type: match[1].toUpperCase() as TodoItem['type'],
                text: match[2].trim()
              };
              
              if (item.type === 'TODO') {
                cache.todos.push(item);
              } else if (item.type === 'FIXME') {
                cache.fixmes.push(item);
              }
            }
          });
        } catch {
          // Skip files that can't be read
        }
      }
    } catch (error) {
      console.warn('Failed to scan comments:', error);
    }
  }
  
  private async scanDependencies(rootPath: string): Promise<WorkspaceCache['dependencies']> {
    const deps: WorkspaceCache['dependencies'] = {};
    
    // Try package.json
    try {
      const pkgPath = path.join(rootPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        deps.packageJson = {
          name: pkg.name || '',
          version: pkg.version || '',
          scripts: pkg.scripts || {},
          dependencies: Object.keys(pkg.dependencies || {}),
          devDependencies: Object.keys(pkg.devDependencies || {})
        };
      }
    } catch {}
    
    // Try requirements.txt
    try {
      const reqPath = path.join(rootPath, 'requirements.txt');
      if (fs.existsSync(reqPath)) {
        const content = fs.readFileSync(reqPath, 'utf8');
        deps.requirements = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
      }
    } catch {}
    
    return Object.keys(deps).length > 0 ? deps : undefined;
  }
  
  private async extractScripts(rootPath: string): Promise<Record<string, string> | undefined> {
    try {
      const pkgPath = path.join(rootPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        return pkg.scripts || {};
      }
    } catch {}
    
    return undefined;
  }
  
  private countFiles(nodes: FileTreeNode[]): number {
    return nodes.filter(n => n.type === 'file').length;
  }
  
  private countDirectories(nodes: FileTreeNode[]): number {
    return nodes.filter(n => n.type === 'directory').length;
  }
  
  private formatFileTree(nodes: FileTreeNode[], maxDepth: number, currentDepth: number = 0, indent: string = ''): string {
    if (currentDepth >= maxDepth || nodes.length === 0) return '';
    
    // Group by directory/file and limit output
    const dirs = nodes.filter(n => n.type === 'directory').slice(0, 10);
    const files = nodes.filter(n => n.type === 'file').slice(0, 15);
    
    let result = '';
    
    for (const dir of dirs) {
      result += `${indent}📁 ${dir.name}\n`;
    }
    
    for (const file of files) {
      result += `${indent}📄 ${file.name}\n`;
    }
    
    if (nodes.length > 25) {
      result += `${indent}... (${nodes.length - 25} more)\n`;
    }
    
    return result;
  }
}
