// /python-ai-fixer/src/ollama.ts
// タイトル: Ollama APIクライアント (ワンショット・プロンプト最終版)
// 役割: お手本を提示することで、AIの出力をコードのみに強制する。

import type * as vscode from 'vscode';
import type { OllamaGenerateResponse } from './types';

/**
 * LLMにコード修正を依頼するためのプロンプトを生成します。(ワンショット学習版)
 * @param brokenCode 修正したいコード文字列
 */
function createPrompt(brokenCode: string): string {
    // ★★★ AIにお手本を見せる最強のプロンプト ★★★
    return `
You are an automated Python code correction API. Your only function is to receive a snippet of Python code and return the syntactically correct version.

RULES:
- Your output MUST be ONLY the raw Python code.
- DO NOT include Markdown, explanations, or any conversational text.

---
### EXAMPLE ###

[BROKEN CODE]
def my_func():
print("hello")
[END BROKEN CODE]

[CORRECTED CODE]
def my_func():
    print("hello")
[END CORRECTED CODE]

---
### TASK ###

[BROKEN CODE]
${brokenCode}
[END BROKEN CODE]

[CORRECTED CODE]
`;
}


/**
 * AIにコード修正を依頼し、ストリーミングで結果を受け取ります。
 * (この関数の内部ロジックは変更ありません)
 */
export async function getFixedCodeFromAIWithStreaming(
    brokenCode: string,
    apiUrl: string,
    modelName: string,
    onProgress: (chunk: string) => void,
    token: vscode.CancellationToken
): Promise<string> {
    const prompt = createPrompt(brokenCode);
    const controller = new AbortController();

    token.onCancellationRequested(() => {
        controller.abort();
    });

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: modelName,
            prompt: prompt,
            stream: true,
        }),
        signal: controller.signal,
    });

    if (!response.ok || !response.body) {
        const errorBody = await response.text();
        throw new Error(`Ollama API request failed with status ${response.status}: ${errorBody}`);
    }

    let fullResponse = "";
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
        if (token.isCancellationRequested) {
            reader.releaseLock();
            throw new Error("Operation cancelled by user.");
        }

        const { done, value } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value);
        const lines = chunkText.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
            try {
                const parsed = JSON.parse(line) as OllamaGenerateResponse;
                if (parsed.response) {
                    fullResponse += parsed.response;
                    onProgress(parsed.response);
                }
                if (parsed.done) {
                    reader.releaseLock();
                    return cleanFinalCode(fullResponse);
                }
            } catch (e) {
                console.error("Failed to parse stream line:", line, e);
            }
        }
    }

    return cleanFinalCode(fullResponse);
}

function cleanFinalCode(code: string): string {
    return code.replace(/^```python\n|```$/g, '').trim();
}