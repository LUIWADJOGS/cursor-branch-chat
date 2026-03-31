import * as vscode from 'vscode';
import { getFullDiff } from '../git/commitDiff';

export async function showCommitDiffPanel(
  workspacePath: string,
  startCommitHash: string,
  chatName: string,
  headerLabel?: string
): Promise<boolean> {
  const diff = await getFullDiff(workspacePath, startCommitHash);
  if (!diff.trim()) {
    return false;
  }

  const panel = vscode.window.createWebviewPanel(
    'branchChatDiff',
    `Changes: ${chatName}`,
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  panel.webview.html = buildDiffHtml(diff, chatName, headerLabel);
  return true;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildDiffHtml(diffText: string, chatName: string, headerLabel?: string): string {
  const lines = diffText.split('\n');
  const files: string[] = [];
  let bodyHtml = '';
  let inFile = false;

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (inFile) {
        bodyHtml += '</div>';
      }
      const m = line.match(/diff --git a\/.+ b\/(.+)/);
      const fileName = m ? m[1] : line;
      const anchor = `file-${files.length}`;
      files.push(fileName);
      bodyHtml += `<div class="file-header" id="${anchor}"><span class="file-icon">▸</span>${escapeHtml(fileName)}</div><div class="diff-block">`;
      inFile = true;
    } else if (line.startsWith('@@')) {
      bodyHtml += `<div class="hunk">${escapeHtml(line)}</div>`;
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      bodyHtml += `<div class="line add"><span class="sign">+</span><span class="code">${escapeHtml(line.slice(1))}</span></div>`;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      bodyHtml += `<div class="line del"><span class="sign">-</span><span class="code">${escapeHtml(line.slice(1))}</span></div>`;
    } else if (line.startsWith(' ')) {
      bodyHtml += `<div class="line ctx"><span class="sign"> </span><span class="code">${escapeHtml(line.slice(1))}</span></div>`;
    }
  }
  if (inFile) {
    bodyHtml += '</div>';
  }

  const fileListHtml = files
    .map(
      (f, i) =>
        `<a class="file-link" href="#file-${i}">${escapeHtml(f.split('/').pop() ?? f)}<span class="file-link-path"> ${escapeHtml(f)}</span></a>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-editor-font-family, 'Menlo', 'Monaco', monospace);
      font-size: var(--vscode-editor-font-size, 13px);
    }
    /* ── top bar ── */
    .top-bar {
      position: sticky;
      top: 0;
      z-index: 10;
      background: var(--vscode-titleBar-activeBackground, #1e1e1e);
      border-bottom: 1px solid var(--vscode-panel-border, #333);
      padding: 8px 16px;
      display: flex;
      align-items: baseline;
      gap: 12px;
    }
    .top-bar .title { font-weight: 600; font-size: 13px; white-space: nowrap; }
    .top-bar .subtitle { font-size: 11px; opacity: 0.55; }
    /* ── file list ── */
    .file-list {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 8px 16px;
      border-bottom: 1px solid var(--vscode-panel-border, #333);
      background: var(--vscode-sideBar-background, #252526);
    }
    .file-link {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 11px;
      background: var(--vscode-badge-background, #3a3d41);
      color: var(--vscode-badge-foreground, #ccc);
      text-decoration: none;
      white-space: nowrap;
      transition: opacity 0.1s;
    }
    .file-link:hover { opacity: 0.75; }
    .file-link-path { display: none; }
    /* ── diff content ── */
    .diff-content { padding: 0 0 64px; }
    .file-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 16px;
      margin-top: 20px;
      background: var(--vscode-editorGroupHeader-tabsBackground, #252526);
      border-top: 1px solid var(--vscode-panel-border, #333);
      border-bottom: 1px solid var(--vscode-panel-border, #333);
      font-size: 12px;
      font-weight: 600;
      font-family: var(--vscode-font-family, sans-serif);
      color: var(--vscode-tab-activeForeground, #ccc);
    }
    .file-icon { opacity: 0.5; font-size: 10px; }
    .diff-block { }
    .hunk {
      padding: 3px 16px;
      background: var(--vscode-diffEditor-unchangedCodeBackground, rgba(30, 50, 80, 0.5));
      color: var(--vscode-descriptionForeground, #858585);
      font-size: 11px;
      user-select: none;
    }
    .line {
      display: flex;
      min-height: 19px;
      line-height: 19px;
    }
    .line .sign {
      width: 24px;
      text-align: center;
      flex-shrink: 0;
      user-select: none;
      font-weight: bold;
    }
    .line .code {
      padding: 0 8px 0 4px;
      white-space: pre;
      flex: 1;
      overflow: visible;
    }
    .line.add {
      background: var(--vscode-diffEditor-insertedLineBackground, rgba(35, 134, 54, 0.2));
    }
    .line.add .sign { color: #3fb950; }
    .line.del {
      background: var(--vscode-diffEditor-removedLineBackground, rgba(248, 81, 73, 0.15));
    }
    .line.del .sign { color: #f85149; }
    .line.ctx { opacity: 0.6; }
  </style>
</head>
<body>
  <div class="top-bar">
    <span class="title">${escapeHtml(headerLabel ?? 'Changes since chat was created')}</span>
    <span class="subtitle">${escapeHtml(chatName)} · ${files.length} file(s)</span>
  </div>
  <div class="file-list">${fileListHtml}</div>
  <div class="diff-content">${bodyHtml}</div>
</body>
</html>`;
}
