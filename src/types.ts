// /python-ai-fixer/src/types.ts
// タイトル: 型定義ファイル
// 役割: プロジェクト全体で使われる型を定義する。

/**
 * Ollama APIの `/api/generate` エンドポイントからのレスポンスの型。
 * 必要なプロパティのみを定義しています。
 */
export interface OllamaGenerateResponse {
    model: string;
    created_at: string;
    response: string; // AIによって生成されたテキスト
    done: boolean;
    total_duration: number;
    // 他にも多くのプロパティがありますが、今回は `response` のみ利用します。
}