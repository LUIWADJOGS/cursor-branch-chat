import { t } from '../i18n';

export function buildBranchPrompt(branchName: string, title: string): string {
  const lines = [
    t('buildPrompt.branch', { branchName }),
    t('buildPrompt.task', { title }),
    '',
    t('buildPrompt.instructions'),
  ];
  return lines.join('\n');
}
