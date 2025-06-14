// /python-ai-fixer/src/ollama_system_prompt.ts
// タイトル: システムプロンプト版 Ollama APIクライアント
// 役割: システムプロンプトを使ってより確実にコードのみを返す

import type * as vscode from 'vscode';

interface OllamaChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface OllamaChatRequest {
    model: string;
    messages: OllamaChatMessage[];
    stream: boolean;
    options?: {
        temperature?: number;
        top_p?: number;
        num_predict?: number;
        stop?: string[];
    };
}

interface OllamaChatResponse {
    model: string;
    created_at: string;
    message?: {
        role: string;
        content: string;
    };
    done: boolean;
}

/**
 * チャット形式のAPIを使用してコード修正を依頼
 */
export async function getFixedCodeFromAIWithChat(
    brokenCode: string,
    apiUrl: string,
    modelName: string,
    onProgress: (chunk: string) => void,
    token: vscode.CancellationToken
): Promise<string> {
    const controller = new AbortController();

    token.onCancellationRequested(() => {
        controller.abort();
    });

    // チャット用のエンドポイントに変更
    const chatApiUrl = apiUrl.replace('/api/generate', '/api/chat');

    const messages: OllamaChatMessage[] = [
        {
            role: 'system',
            content: 'You are a Python code formatter. You MUST respond with ONLY the corrected Python code. Do not include any explanations, markdown formatting, or additional text. Output raw Python code only.'
        },
        {
            role: 'user',
            content: `Fix the indentation and syntax errors in this Python code:\n\n${brokenCode}`
        }
    ];

    const requestBody: OllamaChatRequest = {
        model: modelName,
        messages: messages,
        stream: true,
        options: {
            temperature: 0.1,
            top_p: 0.9,
            num_predict: 2048,
            stop: ["```", "\n\n\n", "Explanation:", "Note:"]
        }
    };

    const response = await fetch(chatApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
    });

    if (!response.ok || !response.body) {
        const errorBody = await response.text();
        throw new Error(`Ollama Chat API request failed with status ${response.status}: ${errorBody}`);
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
                const parsed = JSON.parse(line) as OllamaChatResponse;
                if (parsed.message?.content) {
                    fullResponse += parsed.message.content;
                    onProgress(parsed.message.content);
                }
                if (parsed.done) {
                    reader.releaseLock();
                    return cleanFinalCode(fullResponse);
                }
            } catch (e) {
                console.error("Failed to parse chat stream line:", line, e);
            }
        }
    }

    return cleanFinalCode(fullResponse);
}

function cleanFinalCode(code: string): string {
    // 基本的なクリーニング
    let cleaned = code.replace(/^```python\n?|```$/gm, '').trim();

    // 説明文を除去
    cleaned = cleaned.replace(/^(Here's|Here is|The fixed|Fixed|Corrected|Output).*?:?\s*$/gmi, '');

    return cleaned;
}