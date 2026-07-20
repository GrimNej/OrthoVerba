export interface ScriptToken {
  readonly index: number;
  readonly raw: string;
  readonly normalized: string;
  readonly startUtf16: number;
  readonly endUtf16: number;
  readonly paragraphIndex: number;
  readonly informationWeight: number;
}

export interface ScriptParagraph {
  readonly index: number;
  readonly startUtf16: number;
  readonly endUtf16: number;
  readonly firstTokenIndex: number;
  readonly tokenCount: number;
}

export interface ParsedScript {
  readonly sourceText: string;
  readonly locale: string;
  readonly tokens: readonly ScriptToken[];
  readonly paragraphs: readonly ScriptParagraph[];
}
