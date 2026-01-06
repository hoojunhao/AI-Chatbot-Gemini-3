# Moving Development to Windows 11

Yes, you can switch to Windows 11 and continue developing this project seamlessly.

## Why it works
The project stack (**Vite, React, TypeScript**) is cross-platform by design.
- **No Linux-specific commands**: Your `package.json` scripts (`vite`, `vite build`) work natively on Windows Command Prompt and PowerShell.
- **Pure JS Dependencies**: You have no binary dependencies that require OS-specific compilation.

## Setup Instructions

1.  **Install Node.js**: Download and install the [Node.js LTS version for Windows](https://nodejs.org/).
2.  **Get the Code**:
    ```powershell
    git clone <your-repo-url>
    cd <repo-name>
    ```
3.  **Install Dependencies**:
    ```powershell
    npm install
    ```
4.  **Run the App**:
    ```powershell
    npm run dev
    ```

## Recommendations
For the best experience on Windows, consider:
- **VS Code**: Works identically on Windows.
- **Git Bash**: Included with [Git for Windows](https://git-scm.com/download/win), gives you a familiar Linux-like terminal.
- **WSL 2**: (Optional) Use [Windows Subsystem for Linux](https://learn.microsoft.com/en-us/windows/wsl/install) to run a real Linux kernel inside Windows, giving you the exact same environment you have now.
