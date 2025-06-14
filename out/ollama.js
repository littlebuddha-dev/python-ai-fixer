"use strict";
// /python-ai-fixer/src/ollama.ts
// タイトル: Ollama APIクライアント (設定値・キャンセル対応版)
// 役割: 拡張機能の設定値を元にAPIリクエストを送り、キャンセル処理にも対応する。
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFixedCodeFromAIWithStreaming = getFixedCodeFromAIWithStreaming;
function createPrompt(brokenCode) {
    // ... (プロンプト内容は変更なし)
    return `You are an expert Python code fixing tool... (以下略)`;
}
/**
 * AIにコード修正を依頼し、ストリーミングで結果を受け取ります。
 * @param brokenCode 修正したいコード文字列
 * @param apiUrl Ollama APIのエンドポイントURL
 * @param modelName 使用するモデル名
 * @param onProgress ストリーミングでデータチャンクを受け取るたびに呼び出されるコールバック関数
 * @param token VS Codeからのキャンセルトークン
 * @returns 完全に修正されたコード文字列
 */
async function getFixedCodeFromAIWithStreaming(brokenCode, apiUrl, modelName, onProgress, token) {
    const prompt = createPrompt(brokenCode);
    const controller = new AbortController(); // ★★★ キャンセル用のAbortController
    // キャンセルトークンが発行されたら、fetchを中止する
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
        signal: controller.signal, // ★★★ fetchにsignalを渡す
    });
    if (!response.ok || !response.body) {
        const errorBody = await response.text();
        throw new Error(`Ollama API request failed with status ${response.status}: ${errorBody}`);
    }
    let fullResponse = "";
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
        // ★★★ ループの先頭でもキャンセルをチェック
        if (token.isCancellationRequested) {
            reader.releaseLock();
            throw new Error("Operation cancelled by user.");
        }
        const { done, value } = await reader.read();
        if (done)
            break;
        const chunkText = decoder.decode(value);
        const lines = chunkText.split('\n').filter(line => line.trim() !== '');
        for (const line of lines) {
            const parsed = JSON.parse(line);
            if (parsed.response) {
                fullResponse += parsed.response;
                onProgress(parsed.response);
            }
            if (parsed.done) {
                reader.releaseLock();
                return cleanFinalCode(fullResponse);
            }
        }
    }
    return cleanFinalCode(fullResponse);
}
function cleanFinalCode(code) {
    return code.replace(/^```python\n|```$/g, '').trim();
}
//# sourceMappingURL=ollama.js.map