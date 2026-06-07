# Contributing to ServicePulse

First off, thank you for taking the time to contribute! Contributions from the community help make this utility better, faster, and more robust.

---

## 🛠️ How Can I Contribute?

### Reporting Bugs & Feature Requests
- Check the issues tab to make sure your bug or request has not already been reported.
- Create a new issue describing the problem or the proposed feature clearly.
- Provide steps to reproduce bugs, along with your system specs (Windows version, Node.js version, etc.).

### Developing Code

1. Fork the repository and create your branch from `main`:
   ```bash
   git checkout -b feature/my-amazing-feature
   ```
   or for bug fixes:
   ```bash
   git checkout -b fix/issue-number-description
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the app locally and test your changes:
   ```bash
   npm start
   ```

---

## 🎨 Coding Standards

To ensure the application remains fast and lightweight, please adhere to these design principles:

- **Minimal Dependencies**: Do not add external npm packages unless absolutely necessary. Rely on Node's native modules (`os`, `child_process`, `path`) and native Windows CLI commands where possible.
- **WMI Bypasses**: Do not use WMI cmdlets (`Get-CimInstance`, `Get-WmiObject`) for frequent checks. WMI is often slow or restricted on locked-down Windows systems. Prefer pure .NET assemblies or standard commands (e.g. `sc.exe`).
- **Vanilla Frontend**: Use raw HTML, Vanilla CSS, and pure DOM JavaScript. Do not install heavy frontend frameworks (like React, Vue, or Tailwind) to keep the Chromium context lightweight and fast.
- **Resource Optimization**: Ensure that background polling loops are completely paused when the window is hidden (`onVisibilityChange` handler). The app should consume **0% CPU** when dormant in the tray.
- **Format Code**: Maintain clean, readable indentations (2 spaces) and add brief comments for complex operations (e.g. PowerShell string parsing).

---

## 🚀 Pull Request Process

1. Ensure your code compiles and runs locally without console errors.
2. Commit your changes with clear, descriptive commit messages (e.g. `feat: add network statistics card`).
3. Push your branch to your fork and submit a Pull Request (PR) against the `main` branch.
4. Provide a detailed summary of your changes in the PR description, along with screenshots of any UI updates.
5. Once submitted, maintainers will review your PR and merge it upon approval.
