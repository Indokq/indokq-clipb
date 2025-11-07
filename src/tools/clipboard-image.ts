import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Save clipboard image to temp file and return path
 * Works cross-platform: Windows, macOS, Linux
 */
export async function getClipboardImage(): Promise<string | null> {
  const platform = process.platform;
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `clipboard-${Date.now()}.png`);
  
  try {
    if (platform === 'win32') {
      // Windows: Use PowerShell to save clipboard image
      // Use forward slashes and wrap in single quotes for PowerShell
      const psPath = tempFile.replace(/\\/g, '/');
      
      const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

try {
    $img = [System.Windows.Forms.Clipboard]::GetImage()
    
    if ($img -ne $null) {
        $img.Save('${psPath}', [System.Drawing.Imaging.ImageFormat]::Png)
        $img.Dispose()
        Write-Host "SUCCESS"
        exit 0
    } else {
        # Check if clipboard has data at all
        $formats = [System.Windows.Forms.Clipboard]::GetDataObject().GetFormats()
        Write-Host "NO_IMAGE"
        Write-Host "Available formats: $($formats -join ', ')"
        exit 1
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    Write-Host "ERROR_DETAIL: $($_.Exception.ToString())"
    exit 2
}
      `;
      
      // Save script to temp file to avoid escaping issues
      const scriptFile = path.join(tempDir, `clipboard-script-${Date.now()}.ps1`);
      fs.writeFileSync(scriptFile, psScript, 'utf-8');
      
      try {
        const { stdout, stderr } = await execAsync(
          `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptFile}"`,
          { timeout: 5000 }
        );
        
        const output = stdout.trim();
        
        // Clean up script file
        fs.unlinkSync(scriptFile);
        
        if (output.includes('SUCCESS') && fs.existsSync(tempFile)) {
          return tempFile;
        }
        
        // Debug: log what we got
        console.error('Clipboard debug:', output);
        if (stderr) {
          console.error('PowerShell stderr:', stderr);
        }
        
        return null;
      } catch (error: any) {
        // Clean up script file on error
        if (fs.existsSync(scriptFile)) {
          fs.unlinkSync(scriptFile);
        }
        throw error;
      }
      
    } else if (platform === 'darwin') {
      // macOS: Use pngpaste (needs to be installed: brew install pngpaste)
      try {
        await execAsync(`pngpaste "${tempFile}"`, { timeout: 5000 });
        if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 0) {
          return tempFile;
        }
      } catch {
        return null;
      }
      
    } else if (platform === 'linux') {
      // Linux: Use xclip
      try {
        await execAsync(`xclip -selection clipboard -t image/png -o > "${tempFile}"`, { timeout: 5000 });
        if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 0) {
          return tempFile;
        }
      } catch {
        return null;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Clipboard error:', error);
    return null;
  }
}

/**
 * Clean up temp clipboard files
 */
export function cleanupTempImage(filepath: string) {
  try {
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  } catch {
    // Ignore cleanup errors
  }
}
