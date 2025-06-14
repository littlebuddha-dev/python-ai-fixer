// /python-ai-fixer/src/localFixer.ts
// タイトル: ローカルPythonインデント修正ツール
// 役割: AIに依存せずにPythonコードのインデントを修正

/**
 * Python構文解析のためのトークンタイプ
 */
enum TokenType {
    KEYWORD_BLOCK_START,  // def, class, if, for, while, try, with
    KEYWORD_BLOCK_CONTINUE, // elif, else, except, finally
    KEYWORD_SIMPLE,       // return, break, continue, pass
    ASSIGNMENT,           // 変数代入
    FUNCTION_CALL,        // 関数呼び出し
    COMMENT,              // コメント
    STRING,               // 文字列
    EMPTY,                // 空行
    OTHER                 // その他
}

interface ParsedLine {
    original: string;
    trimmed: string;
    type: TokenType;
    endsWithColon: boolean;
    indentLevel: number;
    lineNumber: number;
}

/**
 * ローカルでPythonコードのインデントを修正する
 */
export function fixPythonIndentation(code: string): string {
    const lines = code.split('\n');
    const parsedLines = lines.map((line, index) => parseLine(line, index));

    // インデントレベルを計算
    const fixedLines = calculateIndentation(parsedLines);

    return fixedLines.map(line => line.trimmed ?
        '    '.repeat(line.indentLevel) + line.trimmed : ''
    ).join('\n');
}

/**
 * 行を解析してトークンタイプを判定
 */
function parseLine(line: string, lineNumber: number): ParsedLine {
    const trimmed = line.trim();

    if (!trimmed) {
        return {
            original: line,
            trimmed: '',
            type: TokenType.EMPTY,
            endsWithColon: false,
            indentLevel: 0,
            lineNumber
        };
    }

    let type = TokenType.OTHER;

    // コメント
    if (trimmed.startsWith('#')) {
        type = TokenType.COMMENT;
    }
    // ブロック開始キーワード
    else if (/^(def |class |if |for |while |try:|with |async def |async for |async with )/.test(trimmed)) {
        type = TokenType.KEYWORD_BLOCK_START;
    }
    // ブロック継続キーワード
    else if (/^(elif |else:|except|finally:)/.test(trimmed)) {
        type = TokenType.KEYWORD_BLOCK_CONTINUE;
    }
    // 単純キーワード
    else if (/^(return |break|continue|pass|yield |raise |assert |del |global |nonlocal )/.test(trimmed)) {
        type = TokenType.KEYWORD_SIMPLE;
    }
    // 変数代入
    else if (/^[a-zA-Z_][a-zA-Z0-9_]*(\[.*?\])?\s*[+\-*/%&|^<>=!]*=/.test(trimmed)) {
        type = TokenType.ASSIGNMENT;
    }
    // 関数呼び出し（行の開始）
    else if (/^[a-zA-Z_][a-zA-Z0-9_]*\s*\(/.test(trimmed)) {
        type = TokenType.FUNCTION_CALL;
    }

    return {
        original: line,
        trimmed,
        type,
        endsWithColon: trimmed.endsWith(':') && !trimmed.startsWith('#'),
        indentLevel: 0, // 後で計算
        lineNumber
    };
}

/**
 * インデントレベルを計算
 */
function calculateIndentation(parsedLines: ParsedLine[]): ParsedLine[] {
    const result = [...parsedLines];
    let currentIndent = 0;
    let blockStack: { type: string; indent: number }[] = [];

    for (let i = 0; i < result.length; i++) {
        const line = result[i];

        if (line.type === TokenType.EMPTY) {
            line.indentLevel = currentIndent;
            continue;
        }

        // ブロック継続キーワードは一段下げる
        if (line.type === TokenType.KEYWORD_BLOCK_CONTINUE) {
            if (blockStack.length > 0) {
                currentIndent = blockStack[blockStack.length - 1].indent;
            } else {
                currentIndent = Math.max(0, currentIndent - 1);
            }
        }

        line.indentLevel = currentIndent;

        // ブロック開始の場合、スタックに追加してインデントを増加
        if (line.type === TokenType.KEYWORD_BLOCK_START ||
            (line.type === TokenType.KEYWORD_BLOCK_CONTINUE && line.endsWithColon)) {

            if (line.endsWithColon) {
                blockStack.push({
                    type: line.trimmed.split(' ')[0],
                    indent: currentIndent
                });
                currentIndent++;
            }
        }

        // pass文の後は特別処理
        if (line.trimmed === 'pass') {
            // 次の行をチェック
            const nextNonEmptyIndex = findNextNonEmptyLine(result, i + 1);
            if (nextNonEmptyIndex !== -1) {
                const nextLine = result[nextNonEmptyIndex];

                // 次の行が同レベルまたは上位レベルのキーワードなら、ブロック終了
                if (nextLine.type === TokenType.KEYWORD_BLOCK_START ||
                    nextLine.type === TokenType.KEYWORD_BLOCK_CONTINUE ||
                    isBlockEndingKeyword(nextLine.trimmed)) {

                    if (blockStack.length > 0) {
                        blockStack.pop();
                        currentIndent = blockStack.length > 0 ?
                            blockStack[blockStack.length - 1].indent + 1 : 0;
                    }
                }
            }
        }

        // return, break, continue の後もブロック終了の可能性
        if (/^(return|break|continue)(\s|$)/.test(line.trimmed)) {
            const nextNonEmptyIndex = findNextNonEmptyLine(result, i + 1);
            if (nextNonEmptyIndex !== -1) {
                const nextLine = result[nextNonEmptyIndex];

                if (nextLine.type === TokenType.KEYWORD_BLOCK_START ||
                    nextLine.type === TokenType.KEYWORD_BLOCK_CONTINUE) {

                    // 次の行のインデントレベルを予測
                    const expectedIndent = predictNextIndentLevel(nextLine, blockStack);
                    if (expectedIndent < currentIndent) {
                        currentIndent = expectedIndent;
                        // スタックも調整
                        while (blockStack.length > currentIndent) {
                            blockStack.pop();
                        }
                    }
                }
            }
        }
    }

    return result;
}

/**
 * 次の非空行のインデックスを見つける
 */
function findNextNonEmptyLine(lines: ParsedLine[], startIndex: number): number {
    for (let i = startIndex; i < lines.length; i++) {
        if (lines[i].type !== TokenType.EMPTY) {
            return i;
        }
    }
    return -1;
}

/**
 * ブロック終了キーワードかどうか判定
 */
function isBlockEndingKeyword(trimmed: string): boolean {
    return /^(def |class |if |for |while |try:|with |@)/.test(trimmed);
}

/**
 * 次の行の予想インデントレベルを計算
 */
function predictNextIndentLevel(line: ParsedLine, blockStack: { type: string; indent: number }[]): number {
    if (line.type === TokenType.KEYWORD_BLOCK_START) {
        return 0; // トップレベルの定義
    }

    if (line.type === TokenType.KEYWORD_BLOCK_CONTINUE) {
        // elif, else, except, finally は同じレベル
        return blockStack.length > 0 ? blockStack[blockStack.length - 1].indent : 0;
    }

    return blockStack.length;
}

/**
 * コードの基本的な構文チェック
 */
export function validatePythonCode(code: string): { isValid: boolean; errors: string[] } {
    const lines = code.split('\n');
    const errors: string[] = [];
    let parenthesesCount = 0;
    let bracketsCount = 0;
    let bracesCount = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lineNum = i + 1;

        if (!line || line.startsWith('#')) continue;

        // 括弧のバランスチェック
        for (const char of line) {
            switch (char) {
                case '(':
                    parenthesesCount++;
                    break;
                case ')':
                    parenthesesCount--;
                    if (parenthesesCount < 0) {
                        errors.push(`Line ${lineNum}: Unmatched closing parenthesis`);
                    }
                    break;
                case '[':
                    bracketsCount++;
                    break;
                case ']':
                    bracketsCount--;
                    if (bracketsCount < 0) {
                        errors.push(`Line ${lineNum}: Unmatched closing bracket`);
                    }
                    break;
                case '{':
                    bracesCount++;
                    break;
                case '}':
                    bracesCount--;
                    if (bracesCount < 0) {
                        errors.push(`Line ${lineNum}: Unmatched closing brace`);
                    }
                    break;
            }
        }

        // コロンの後に何もない行（pass文が必要）
        if (line.endsWith(':')) {
            const nextLineIndex = findNextNonEmptyLine(
                lines.map((l, idx) => ({ trimmed: l.trim(), type: TokenType.OTHER, original: l, endsWithColon: false, indentLevel: 0, lineNumber: idx })),
                i + 1
            );

            if (nextLineIndex === -1) {
                errors.push(`Line ${lineNum}: Block starting with ':' has no content`);
            }
        }
    }

    // 最終的な括弧バランス
    if (parenthesesCount !== 0) {
        errors.push(`Unbalanced parentheses: ${parenthesesCount > 0 ? 'missing closing' : 'extra closing'}`);
    }
    if (bracketsCount !== 0) {
        errors.push(`Unbalanced brackets: ${bracketsCount > 0 ? 'missing closing' : 'extra closing'}`);
    }
    if (bracesCount !== 0) {
        errors.push(`Unbalanced braces: ${bracesCount > 0 ? 'missing closing' : 'extra closing'}`);
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}