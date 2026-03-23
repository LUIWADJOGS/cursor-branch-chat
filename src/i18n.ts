import * as vscode from 'vscode';

type TranslationKey =
  | 'buildPrompt.branch'
  | 'buildPrompt.task'
  | 'buildPrompt.instructions'
  | 'chat.untitled'
  | 'chat.openTitle'
  | 'messages.attachCurrent.openWorkspace'
  | 'messages.attachCurrent.openChatFirst'
  | 'messages.attachCurrent.success'
  | 'messages.copyPrompt.missing'
  | 'messages.copyPrompt.success'
  | 'messages.createChat.inputPrompt'
  | 'messages.createChat.inputPlaceholder'
  | 'messages.createChat.inputValidation'
  | 'messages.createChat.openFailed'
  | 'messages.createChat.attachFailed'
  | 'messages.changeBranch.inputPrompt'
  | 'messages.changeBranch.inputPlaceholder'
  | 'messages.changeBranch.inputValidation'
  | 'messages.changeBranch.success'
  | 'messages.detach.success'
  | 'messages.noWorkspace'
  | 'messages.openExisting.failed'
  | 'messages.showChats.empty'
  | 'messages.showChats.placeholder';

type Translations = Record<TranslationKey, string>;

const en: Translations = {
  'buildPrompt.branch': 'Branch: {branchName}',
  'buildPrompt.task': 'Task: {title}',
  'buildPrompt.instructions':
    'Work only within this branch. Do not touch code outside the task. No any/unknown. FSD, types from @common/entityStorage/entities.',
  'chat.untitled': 'Untitled Chat',
  'chat.openTitle': 'Open Cursor Chat',
  'messages.attachCurrent.openWorkspace': 'Open a workspace folder first.',
  'messages.attachCurrent.openChatFirst':
    'Open the Cursor chat you want to attach, then run "Attach Current Chat To Branch".',
  'messages.attachCurrent.success': 'Attached "{name}" to branch "{branch}".',
  'messages.copyPrompt.missing': 'This chat was not created from a tracked prompt.',
  'messages.copyPrompt.success': 'Prompt copied to clipboard.',
  'messages.createChat.inputPrompt': 'Short title for this branch chat',
  'messages.createChat.inputPlaceholder': 'e.g. DCT fix, Scan table',
  'messages.createChat.inputValidation': 'Enter a title',
  'messages.createChat.openFailed': 'Could not open Cursor chat deeplink.',
  'messages.createChat.attachFailed':
    'Opened a new Cursor chat, but could not attach it to the current branch automatically.',
  'messages.changeBranch.inputPrompt': 'Move this chat to another branch',
  'messages.changeBranch.inputPlaceholder': 'Enter target branch name',
  'messages.changeBranch.inputValidation': 'Enter a branch name',
  'messages.changeBranch.success': 'Moved "{name}" to branch "{branch}".',
  'messages.detach.success': 'Removed "{name}" from Branch Chats.',
  'messages.noWorkspace': 'Open a workspace folder first.',
  'messages.openExisting.failed': 'Could not switch Cursor to chat "{name}".',
  'messages.showChats.empty': 'No branch chats for "{branch}". Create one with "Create Branch Chat".',
  'messages.showChats.placeholder': 'Chats for branch: {branch}',
};

const ru: Translations = {
  'buildPrompt.branch': 'Ветка: {branchName}',
  'buildPrompt.task': 'Задача: {title}',
  'buildPrompt.instructions':
    'Работаем только в рамках этой ветки. Не трогать код вне задачи. Без any/unknown. FSD, типы из @common/entityStorage/entities.',
  'chat.untitled': 'Чат без названия',
  'chat.openTitle': 'Открыть чат Cursor',
  'messages.attachCurrent.openWorkspace': 'Сначала открой папку workspace.',
  'messages.attachCurrent.openChatFirst':
    'Открой нужный чат Cursor, затем запусти "Attach Current Chat To Branch".',
  'messages.attachCurrent.success': 'Чат "{name}" привязан к ветке "{branch}".',
  'messages.copyPrompt.missing': 'Этот чат не был создан из отслеживаемого prompt.',
  'messages.copyPrompt.success': 'Prompt скопирован в буфер обмена.',
  'messages.createChat.inputPrompt': 'Короткое название для branch chat',
  'messages.createChat.inputPlaceholder': 'например, DCT fix, Scan table',
  'messages.createChat.inputValidation': 'Введите название',
  'messages.createChat.openFailed': 'Не удалось открыть deeplink чата Cursor.',
  'messages.createChat.attachFailed':
    'Новый чат Cursor открыт, но автоматически привязать его к текущей ветке не удалось.',
  'messages.changeBranch.inputPrompt': 'Перенести этот чат на другую ветку',
  'messages.changeBranch.inputPlaceholder': 'Введите имя целевой ветки',
  'messages.changeBranch.inputValidation': 'Введите имя ветки',
  'messages.changeBranch.success': 'Чат "{name}" перенесен на ветку "{branch}".',
  'messages.detach.success': 'Чат "{name}" убран из списка Branch Chats.',
  'messages.noWorkspace': 'Сначала открой папку workspace.',
  'messages.openExisting.failed': 'Не удалось переключить Cursor на чат "{name}".',
  'messages.showChats.empty':
    'Для ветки "{branch}" нет привязанных чатов. Создай новый через "Create Branch Chat".',
  'messages.showChats.placeholder': 'Чаты для ветки: {branch}',
};

const translations = isRussianLanguage() ? ru : en;

export function t(key: TranslationKey, params?: Record<string, string>): string {
  const template = translations[key] ?? en[key];
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, token: string) => params[token] ?? `{${token}}`);
}

function isRussianLanguage(): boolean {
  const language = vscode.env.language?.toLowerCase() ?? 'en';
  return language === 'ru' || language.startsWith('ru-');
}
