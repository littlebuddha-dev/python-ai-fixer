// /python-ai-fixer/src/extension.ts
// 最終版: AIとローカル修正のハイブリッド

import * as vscode from 'vscode';
import path from 'path';
import { getFixedCodeFromAIWithStreaming } from './ollama';
import { fixPythonIndentation, validatePythonCode } from './localFixer';

export function activate(context: vscode.ExtensionContext) {
  console.log('🎉 AI Python Fixer is now active!');

  // メインコマンド: AI修正を試行
  const aiFixCommand = vscode.commands.registerCommand('python-ai-fixer.fixMyCode', async () => {
    await executeCodeFix(false);
  });

  // 新しいコマンド: ローカル修正のみ
  const localFixCommand = vscode.commands.registerCommand('python-ai-fixer.fixLocally', async () => {
    await executeCodeFix(true);
  });

  // 設定確認コマンド
  const checkConfigCommand = vscode.commands.registerCommand('python-ai-fixer.checkConfig', async () => {
    await checkOllamaConnection();
  });

  context.subscriptions.push(aiFixCommand, localFixCommand, checkConfigCommand);
}

/**
 * コード修正の実行
 */
async function executeCodeFix(forceLocal: boolean = false) {
  console.log(`🚀 Command executed (forceLocal: ${forceLocal})`);

  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'python') {
    vscode.window.showWarningMessage('アクティブなPythonファイルが見つかりません。');
    return;
  }

  const document = editor.document;
  const originalCode = document.getText();

  if (!originalCode.trim()) {
    vscode.window.showWarningMessage('修正するコードが見つかりません。');
    return;
  }

  // コードの事前検証
  const validation = validatePythonCode(originalCode);
  if (!validation.isValid) {
    const showErrors = await vscode.window.showWarningMessage(
      `構文エラーが検出されました:\n${validation.errors.join('\n')}`,
      '続行',
      'キャンセル'
    );

    if (showErrors !== '続行') return;
  }

  if (forceLocal) {
    // ローカル修正のみ
    await performLocalFix(document, originalCode);
    return;
  }

  // AI修正を試行
  const config = vscode.workspace.getConfiguration('python-ai-fixer.ollama');
  const apiUrl = config.get<string>('apiUrl', 'http://localhost:11434/api/generate');
  const modelName = config.get<string>('modelName', 'qwen2.5-coder:7b');
  const enableAI = config.get<boolean>('enableAI', true);

  if (!enableAI) {
    await performLocalFix(document, originalCode);
    return;
  }

  console.log(`💬 Using model: ${modelName} at ${apiUrl}`);

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: `AI Fixer: コードを分析中...`,
    cancellable: true,
  }, async (progress, token) => {
    try {
      progress.report({ message: 'AIに問い合わせ中...', increment: 10 });

      const fixedCode = await getFixedCodeFromAIWithStreaming(
        originalCode,
        apiUrl,
        modelName,
        (chunk) => {
          progress.report({ increment: 2 });
        },
        token
      );

      if (token.isCancellationRequested || editor.document.isClosed) return;

      console.log('✅ AI processing completed');
      progress.report({ message: '結果を表示中...', increment: 20 });

      await showDiff(document, fixedCode, 'AI修正');

    } catch (error) {
      console.error('❌ AI fix failed:', error);

      // AI修正が失敗した場合、ローカル修正を提案
      const fallbackChoice = await vscode.window.showErrorMessage(
        'AI修正が失敗しました。ローカル修正を試しますか？',
        'ローカル修正',
        'キャンセル'
      );

      if (fallbackChoice === 'ローカル修正') {
        await performLocalFix(document, originalCode);
      }
    }
  });
}

/**
 * ローカル修正を実行
 */
async function performLocalFix(document: vscode.TextDocument, originalCode: string) {
  console.log('🔧 Performing local fix...');

  try {
    const fixedCode = fixPythonIndentation(originalCode);

    if (fixedCode.trim() === originalCode.trim()) {
      vscode.window.showInformationMessage('コードにインデントエラーは見つかりませんでした。');
      return;
    }

    await showDiff(document, fixedCode, 'ローカル修正');

  } catch (error) {
    console.error('❌ Local fix failed:', error);
    vscode.window.showErrorMessage('ローカル修正中にエラーが発生しました。');
  }
}

/**
 * 差分表示
 */
async function showDiff(document: vscode.TextDocument, fixedCode: string, title: string) {
  const fixedDoc = await vscode.workspace.openTextDocument({
    content: fixedCode,
    language: 'python'
  });

  await vscode.commands.executeCommand(
    'vscode.diff',
    document.uri,
    fixedDoc.uri,
    `${title}: ${path.basename(document.fileName)}`
  );
}

/**
 * Ollama接続確認
 */
async function checkOllamaConnection() {
  const config = vscode.workspace.getConfiguration('python-ai-fixer.ollama');
  const apiUrl = config.get<string>('apiUrl', 'http://localhost:11434/api/generate');
  const modelName = config.get<string>('modelName', 'qwen2.5-coder:7b');

  vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Ollama接続確認中...',
    cancellable: false,
  }, async (progress) => {
    try {
      progress.report({ message: 'APIに接続中...', increment: 30 });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒タイムアウト

      const response = await fetch(apiUrl.replace('/api/generate', '/api/tags'), {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      progress.report({ message: 'モデル確認中...', increment: 50 });

      if (response.ok) {
        const data = await response.json();
        const models = data.models || [];
        const modelExists = models.some((model: any) =>
          model.name === modelName || model.name.startsWith(modelName.split(':')[0])
        );

        progress.report({ increment: 100 });

        if (modelExists) {
          vscode.window.showInformationMessage(
            `✅ Ollama接続成功！\nモデル: ${modelName}\nURL: ${apiUrl}`
          );
        } else {
          const availableModels = models.map((m: any) => m.name).join(', ');
          vscode.window.showWarningMessage(
            `⚠️ モデル "${modelName}" が見つかりません。\n利用可能なモデル: ${availableModels || 'なし'}`
          );
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

    } catch (error) {
      console.error('Connection check failed:', error);

      let errorMessage = '❌ Ollama接続失敗\n';

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage += 'タイムアウト: 10秒以内に応答がありませんでした';
        } else if (error.message.includes('fetch')) {
          errorMessage += `接続エラー: ${apiUrl}\nOllamaが起動しているか確認してください`;
        } else {
          errorMessage += error.message;
        }
      }

      const action = await vscode.window.showErrorMessage(
        errorMessage,
        'Ollama起動コマンド表示',
        '設定を開く'
      );

      if (action === 'Ollama起動コマンド表示') {
        vscode.window.showInformationMessage(
          'Ollamaを起動するには:\n' +
          '1. ターミナルで "ollama serve" を実行\n' +
          `2. "${modelName}" をインストール: "ollama pull ${modelName}"`
        );
      } else if (action === '設定を開く') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'python-ai-fixer.ollama');
      }
    }
  });
}

export function deactivate() { }