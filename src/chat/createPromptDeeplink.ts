export function createPromptDeeplink(promptText: string): string {
  const baseUrl = 'cursor://anysphere.cursor-deeplink/prompt';
  const encoded = encodeURIComponent(promptText);
  const maxLength = 8000 - baseUrl.length - 10;
  const text = encoded.length > maxLength ? encoded.slice(0, maxLength) : encoded;
  return `${baseUrl}?text=${text}`;
}

import * as vscode from 'vscode';

export async function openPromptInCursor(promptText: string): Promise<boolean> {
  const link = createPromptDeeplink(promptText);
  return vscode.env.openExternal(vscode.Uri.parse(link));
}
