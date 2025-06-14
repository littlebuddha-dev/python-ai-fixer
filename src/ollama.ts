// /python-ai-fixer/src/ollama.ts
// タイトル: モデル特化型解決策
// 役割: 異なるAPIエンドポイントと強制的なコード抽出

import * as vscode from 'vscode';
import type { OllamaGenerateResponse } from './types';

/**
 * モデル固有の設定を取得
 */
function getModelSpecificConfig(modelName: string) {
    // DeepSeek系モデルの対話を防ぐ設定
    if (modelName.includes('deepseek')) {
        return {
            temperature: 0.0,
            top_k: 1,
            top_p: 0.05,
            num_predict: 300,
            repeat_penalty: 1.0,
            stop: ["I'm", "I am", "As a", "However", "Feel free", "Please", "Sure", "Let me", "Hi", "Hello"],
            system: "You are a code formatter. Output only Python code. No explanations."
        };
    }

    // CodeLlama系の設定
    if (modelName.includes('codellama') || modelName.includes('code')) {
        return {
            temperature: 0.1,
            top_k: 5,
            top_p: 0.2,
            num_predict: 500,
            system: "Fix Python indentation. Return code only."
        };
    }

    // デフォルト設定
    return {
        temperature: 0.0,
        top_k: 1,
        top_p: 0.1,
        num_predict: 400,
        system: "Fix the Python code formatting."
    };
}

/**
 * 隠し文字を使った強制的なプロンプト
 */
function createStealthPrompt(brokenCode: string, modelName: string): string {
    if (modelName.includes('deepseek')) {
        // DeepSeek用の特殊なプロンプト
        return `<|system|>You are a Python code formatter. You must return only the corrected Python code with proper indentation. Do not provide explanations or conversations.<|end|>
<|user|>
\`\`\`python
${brokenCode}
\`\`\`
<|end|>
<|assistant|>
\`\`\`python
`;
    }

    // コード補完形式
    return `# Python code with indentation errors:
${brokenCode}

# Same code with correct indentation:
`;
}

/**
 * 完全にローカルな処理でコードを修正
 */
function performLocalIndentFix(code: string): string {
    console.log('🔧 Performing local indentation fix...');

    const lines = code.split('\n');
    const fixedLines: string[] = [];
    let indentLevel = 0;
    let inFunction = false;
    let inClass = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // 空行はそのまま保持
        if (!trimmed) {
            fixedLines.push('');
            continue;
        }

        // コメント行はそのまま保持（インデントは調整）
        if (trimmed.startsWith('#')) {
            fixedLines.push('    '.repeat(indentLevel) + trimmed);
            continue;
        }

        // インデントレベルを調整するキーワード
        if (/^(elif |else:|except|finally:|return |break|continue)/.test(trimmed)) {
            if (indentLevel > 0) indentLevel--;
        }

        // クラスや関数の終了を検出
        if (/^(def |class )/.test(trimmed)) {
            indentLevel = 0;
            inFunction = trimmed.startsWith('def ');
            inClass = trimmed.startsWith('class ');
        }

        // 現在のインデントレベルで行を追加
        const indentedLine = '    '.repeat(indentLevel) + trimmed;
        fixedLines.push(indentedLine);

        // インデントレベルを増やすキーワード
        if (trimmed.endsWith(':')) {
            // pass文の後はインデントを戻す
            const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
            if (nextLine !== 'pass') {
                indentLevel++;
            }
        }

        // pass文の場合は次の行でインデントを戻す
        if (trimmed === 'pass') {
            // 次の行を見て、同じレベルかそれより上位のキーワードなら戻す
            const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
            if (nextLine && (/^(def |class |if |for |while |try |elif |else:|except|finally:)/.test(nextLine) || !nextLine.startsWith('    '))) {
                if (indentLevel > 0) indentLevel--;
            }
        }
    }

    return fixedLines.join('\n');
}

/**
 * Pythonコードの簡単な構文検証
 */
function validatePythonSyntax(code: string): boolean {
    const lines = code.split('\n').filter(line => line.trim());
    if (lines.length === 0) return false;

    // 基本的なPython構文パターン
    const pythonPatterns = [
        /^(def |class |import |from )/,
        /^(if |elif |else:|for |while |try:|except|finally:|with )/,
        /^[a-zA-Z_][a-zA-Z0-9_]*\s*=/,
        /^[a-zA-Z_][a-zA-Z0-9_]*\(/,
        /^    /,
        /^#/
    ];

    const codeLineCount = lines.filter(line =>
        pythonPatterns.some(pattern => pattern.test(line))
    ).length;

    return codeLineCount / lines.length > 0.5;
}

/**
 * 代替API（ChatAPI）を試行
 */
async function tryAlternativeAPI(
    brokenCode: string,
    apiUrl: string,
    modelName: string,
    token: vscode.CancellationToken
): Promise<string | null> {

    const chatUrl = apiUrl.replace('/api/generate', '/api/chat');
    const controller = new AbortController();

    token.onCancellationRequested(() => {
        controller.abort();
    });

    const messages = [
        {
            role: 'system',
            content: 'You are a Python formatter. Return only the corrected code with proper indentation. No explanations.'
        },
        {
            role: 'user',
            content: `Fix indentation:\n\`\`\`python\n${brokenCode}\n\`\`\``
        }
    ];

    try {
        const response = await fetch(chatUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: modelName,
                messages: messages,
                stream: false,
                options: {
                    temperature: 0.0,
                    top_p: 0.1,
                    num_predict: 300,
                    stop: ["```", "Explanation", "Note"]
                }
            }),
            signal: controller.signal,
        });

        if (response.ok) {
            const result = await response.json();
            const content = result.message?.content || '';

            // コードブロックから抽出
            const codeMatch = content.match(/```(?:python)?\s*(.*?)```/s);
            if (codeMatch) {
                return codeMatch[1].trim();
            }

            return content.trim();
        }
    } catch (error) {
        console.warn('Chat API failed:', error);
    }

    return null;
}

/**
 * メイン関数：段階的なフォールバック戦略
 */
export async function getFixedCodeFromAIWithStreaming(
    brokenCode: string,
    apiUrl: string,
    modelName: string,
    onProgress: (chunk: string) => void,
    token: vscode.CancellationToken
): Promise<string> {

    console.log(`🚀 Starting code fix with model: ${modelName}`);
    onProgress('[Starting analysis...]');

    // 段階1: Chat APIを試行
    try {
        console.log('📞 Trying Chat API...');
        onProgress('[Trying Chat API...]');

        const chatResult = await tryAlternativeAPI(brokenCode, apiUrl, modelName, token);
        if (chatResult && validatePythonSyntax(chatResult) && chatResult.trim() !== brokenCode.trim()) {
            console.log('✅ Chat API succeeded');
            onProgress('[Chat API success]');
            return chatResult;
        }
    } catch (error) {
        console.warn('Chat API failed:', error);
    }

    // 段階2: 強制的なプロンプトで Generate API
    try {
        console.log('📞 Trying Generate API with stealth prompt...');
        onProgress('[Trying stealth prompt...]');

        const stealthPrompt = createStealthPrompt(brokenCode, modelName);
        const modelConfig = getModelSpecificConfig(modelName);

        const controller = new AbortController();
        token.onCancellationRequested(() => controller.abort());

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: modelName,
                prompt: stealthPrompt,
                stream: false,
                options: modelConfig
            }),
            signal: controller.signal,
        });

        if (response.ok) {
            const result = await response.json() as OllamaGenerateResponse;
            let extracted = result.response || '';

            // コードブロックから抽出
            const codeMatch = extracted.match(/```(?:python)?\s*(.*?)```/s);
            if (codeMatch) {
                extracted = codeMatch[1].trim();
            }

            // 説明文でなく、有効なコードなら返す
            if (validatePythonSyntax(extracted) &&
                !extracted.toLowerCase().includes("i'm sorry") &&
                !extracted.toLowerCase().includes("as a programming") &&
                extracted.trim() !== brokenCode.trim()) {

                console.log('✅ Generate API with stealth prompt succeeded');
                onProgress('[Stealth prompt success]');
                return extracted;
            }
        }
    } catch (error) {
        console.warn('Generate API failed:', error);
    }

    // 段階3: 完全にローカルな処理
    console.log('🔧 Falling back to local indentation fix');
    onProgress('[Using local fix...]');

    const localFix = performLocalIndentFix(brokenCode);

    // ローカル修正と元のコードが同じなら、問題なしと判断
    if (localFix.trim() === brokenCode.trim()) {
        vscode.window.showInformationMessage('コードにインデントエラーは見つかりませんでした。');
        throw new Error('No indentation issues found');
    }

    onProgress('[Local fix complete]');
    return localFix;
}