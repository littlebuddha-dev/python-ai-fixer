"use strict";
// /python-ai-fixer/src/extension.ts (デバッグログ追加版)
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path_1 = __importDefault(require("path"));
const ollama_1 = require("./ollama");
function activate(context) {
    console.log('🎉 AI Python Fixer is now active!'); // ★ログ1: 拡張機能が有効化されたか
    const disposable = vscode.commands.registerCommand('python-ai-fixer.fixMyCode', async () => {
        console.log('🚀 Command "fixMyCode" executed.'); // ★ログ2: コマンドが実行されたか
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'python') {
            console.log(' Editor not active or not a Python file.');
            return;
        }
        const config = vscode.workspace.getConfiguration('python-ai-fixer.ollama');
        const apiUrl = config.get('apiUrl');
        const modelName = config.get('modelName');
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
                const fixedCode = await (0, ollama_1.getFixedCodeFromAIWithStreaming)(brokenCode, apiUrl, modelName, (chunk) => { }, token);
                console.log('✅ Ollama API call successful.'); // ★ログ5: API呼び出しが成功したか
                if (token.isCancellationRequested || editor.document.isClosed)
                    return;
                console.log('↔️ Showing diff view...'); // ★ログ6: 差分ビューを表示する直前か
                const fixedDoc = await vscode.workspace.openTextDocument({ content: fixedCode, language: 'python' });
                vscode.commands.executeCommand('vscode.diff', document.uri, fixedDoc.uri, `AIによる修正案: ${path_1.default.basename(document.fileName)}`);
            }
            catch (error) {
                console.error('❌ An error occurred:', error); // ★ログ7: エラーが発生したか
                // ... (エラーメッセージ表示処理)
            }
        });
    });
    context.subscriptions.push(disposable);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map