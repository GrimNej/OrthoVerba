import { forwardRef, useImperativeHandle, useRef } from "react";
import type { CursorResult } from "../../domain/alignment/types";
import type { ParsedScript, ScriptParagraph } from "../../domain/script/types";

export interface ReaderSurfaceHandle {
  load(parsed: ParsedScript): void;
  update(cursor: CursorResult): void;
  clear(): void;
  setFontSize(size: number): void;
  moveManual(delta: number): void;
}

export interface ReaderSurfaceProps {
  readonly onReanchor: (boundary: number) => void;
}

interface SurfaceState {
  parsed: ParsedScript | null;
  cursor: CursorResult | null;
  firstParagraph: number;
  lastParagraph: number;
  tokenElements: Map<number, HTMLElement>;
  fontSize: number;
}

function paragraphForBoundary(parsed: ParsedScript, boundary: number): number {
  const tokenIndex = Math.max(0, Math.min(parsed.tokens.length - 1, boundary - 1));
  return parsed.tokens[tokenIndex]?.paragraphIndex ?? 0;
}

function shouldRemount(state: SurfaceState, paragraphIndex: number): boolean {
  return paragraphIndex < state.firstParagraph || paragraphIndex > state.lastParagraph;
}

export const ReaderSurface = forwardRef<ReaderSurfaceHandle, ReaderSurfaceProps>(
  function ReaderSurface({ onReanchor }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const stateRef = useRef<SurfaceState>({
      parsed: null,
      cursor: null,
      firstParagraph: 0,
      lastParagraph: -1,
      tokenElements: new Map(),
      fontSize: 34,
    });

    function applyTokenState(tokenIndex: number, element: HTMLElement): void {
      const cursor = stateRef.current.cursor;
      if (cursor === null) return;
      element.classList.toggle("reader-token--committed", tokenIndex < cursor.committedBoundary);
      element.classList.toggle("reader-token--provisional", tokenIndex === cursor.provisionalBoundary - 1);
      element.classList.toggle(
        "reader-token--stable",
        cursor.stableBoundary !== null && tokenIndex === cursor.stableBoundary - 1,
      );
    }

    function appendParagraph(
      container: HTMLElement,
      parsed: ParsedScript,
      paragraph: ScriptParagraph,
    ): void {
      const element = document.createElement("p");
      element.className = "reader-paragraph";
      element.dataset["paragraphIndex"] = String(paragraph.index);
      let cursor = paragraph.startUtf16;
      const paragraphTokens = parsed.tokens.slice(
        paragraph.firstTokenIndex,
        paragraph.firstTokenIndex + paragraph.tokenCount,
      );
      for (const token of paragraphTokens) {
        if (token.startUtf16 > cursor) {
          element.append(document.createTextNode(parsed.sourceText.slice(cursor, token.startUtf16)));
        }
        const span = document.createElement("button");
        span.type = "button";
        span.className = "reader-token";
        span.dataset["tokenIndex"] = String(token.index);
        span.textContent = parsed.sourceText.slice(token.startUtf16, token.endUtf16);
        span.title = "Click to continue from here";
        span.addEventListener("click", () => onReanchor(token.index + 1));
        stateRef.current.tokenElements.set(token.index, span);
        applyTokenState(token.index, span);
        element.append(span);
        cursor = token.endUtf16;
      }
      if (cursor < paragraph.endUtf16) {
        element.append(document.createTextNode(parsed.sourceText.slice(cursor, paragraph.endUtf16)));
      }
      container.append(element);
    }

    function mountWindow(centerParagraph: number): void {
      const container = containerRef.current;
      const parsed = stateRef.current.parsed;
      if (container === null || parsed === null) return;
      const first = Math.max(0, centerParagraph - 3);
      const last = Math.min(parsed.paragraphs.length - 1, centerParagraph + 5);
      container.replaceChildren();
      stateRef.current.tokenElements.clear();
      stateRef.current.firstParagraph = first;
      stateRef.current.lastParagraph = last;
      for (let index = first; index <= last; index += 1) {
        const paragraph = parsed.paragraphs[index];
        if (paragraph !== undefined) appendParagraph(container, parsed, paragraph);
      }
    }

    function scrollIntoBand(element: HTMLElement): void {
      const container = containerRef.current;
      if (container === null) return;
      const containerRect = container.getBoundingClientRect();
      const targetRect = element.getBoundingClientRect();
      const bandTop = containerRect.top + containerRect.height * 0.35;
      const bandBottom = containerRect.top + containerRect.height * 0.58;
      if (targetRect.top < bandTop || targetRect.bottom > bandBottom) {
        const targetCenter = targetRect.top + targetRect.height / 2;
        const bandCenter = (bandTop + bandBottom) / 2;
        container.scrollBy({ top: targetCenter - bandCenter, behavior: "auto" });
      }
    }

    function update(cursor: CursorResult): void {
      const parsed = stateRef.current.parsed;
      if (parsed === null) return;
      const previous = stateRef.current.cursor;
      stateRef.current.cursor = cursor;
      const paragraph = paragraphForBoundary(parsed, cursor.provisionalBoundary);
      if (shouldRemount(stateRef.current, paragraph)) mountWindow(paragraph);

      const affected = new Set<number>();
      if (previous !== null) {
        affected.add(previous.provisionalBoundary - 1);
        if (previous.stableBoundary !== null) affected.add(previous.stableBoundary - 1);
        const lower = Math.min(previous.committedBoundary, cursor.committedBoundary);
        const upper = Math.max(previous.committedBoundary, cursor.committedBoundary);
        for (let index = lower; index < upper; index += 1) affected.add(index);
      } else {
        for (const index of stateRef.current.tokenElements.keys()) affected.add(index);
      }
      affected.add(cursor.provisionalBoundary - 1);
      if (cursor.stableBoundary !== null) affected.add(cursor.stableBoundary - 1);
      for (const tokenIndex of affected) {
        const element = stateRef.current.tokenElements.get(tokenIndex);
        if (element !== undefined) applyTokenState(tokenIndex, element);
      }
      const active = stateRef.current.tokenElements.get(Math.max(0, cursor.provisionalBoundary - 1));
      if (active !== undefined) scrollIntoBand(active);
    }

    useImperativeHandle(ref, () => ({
      load(parsed): void {
        stateRef.current.parsed = parsed;
        stateRef.current.cursor = null;
        mountWindow(0);
      },
      update,
      clear(): void {
        stateRef.current.parsed = null;
        stateRef.current.cursor = null;
        stateRef.current.tokenElements.clear();
        containerRef.current?.replaceChildren();
      },
      setFontSize(size): void {
        stateRef.current.fontSize = size;
        if (containerRef.current !== null) containerRef.current.style.fontSize = `${size}px`;
      },
      moveManual(delta): void {
        const parsed = stateRef.current.parsed;
        const current = stateRef.current.cursor;
        if (parsed === null) return;
        const boundary = Math.max(0, Math.min(parsed.tokens.length, (current?.provisionalBoundary ?? 0) + delta));
        onReanchor(boundary);
      },
    }), [onReanchor]);

    return (
      <div className="reader-shell">
        <div className="reading-band" aria-hidden="true" />
        <div
          ref={containerRef}
          className="reader-surface"
          aria-label="Voice-following script"
          style={{ fontSize: `${stateRef.current.fontSize}px` }}
        />
      </div>
    );
  },
);
