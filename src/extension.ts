// /python-ai-fixer/src/extension.ts (デバッグログ追加版)

import * as vscode from 'vscode';
import path from 'path';
import { getFixedCodeFromAIWithStreaming } from './ollama';

export function activate(context: vscode.ExtensionContext) {
  console.log('🎉 AI Python Fixer is now active!'); // ★ログ1: 拡張機能が有効化されたか

  const disposable = vscode.commands.registerCommand('python-ai-fixer.fixMyCode', async () => {
    console.log('🚀 Command "fixMyCode" executed.'); // ★ログ2: コマンドが実行されたか

    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'python') {
      console.log(' Editor not active or not a Python file.');
      return;
    }

    const config = vscode.workspace.getConfiguration('python-ai-fixer.ollama');
    const apiUrl = config.get<string>('apiUrl');
    const modelName = config.get<string>('modelName');
    console.log(`💬 Using model: ${modelName} at ${apiUrl}`); // ★ログ3: 設定が読み込めたか

    if (!apiUrl || !modelName) {
      vscode.window.showErrorMessage('AI Fixerの設定が不十分です。URLとモデル名を確認してください。');
      return;
    }

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `AI Fixer: ${modelName} がコードを生成中...`,
      cancellable: true,
    }, async (progress, token) => {
      const document = editor.document;
      const brokenCode = document.getText();

      try {
        console.log('📞 Calling Ollama API...'); // ★ログ4: APIを呼び出す直前か
        const fixedCode = await getFixedCodeFromAIWithStreaming(
          brokenCode,
          apiUrl,
          modelName,
          (chunk) => { /* ... */ },
          token
        );
        console.log('✅ Ollama API call successful.'); // ★ログ5: API呼び出しが成功したか

        if (token.isCancellationRequested || editor.document.isClosed) return;

        console.log('↔️ Showing diff view...'); // ★ログ6: 差分ビューを表示する直前か
        const fixedDoc = await vscode.workspace.openTextDocument({ content: fixedCode, language: 'python' });
        vscode.commands.executeCommand('vscode.diff', document.uri, fixedDoc.uri, `AIによる修正案: ${path.basename(document.fileName)}`);

      } catch (error) {
        console.error('❌ An error occurred:', error); // ★ログ7: エラーが発生したか
        // ... (エラーメッセージ表示処理)
      }
    });
  });

  context.subscriptions.push(disposable);
}


export function deactivate() { }