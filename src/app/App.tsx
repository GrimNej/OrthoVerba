import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SavedLocalScript } from "../application/ports/persistence-port";
import type { EnginePhase } from "../application/reader/reader-engine";
import type { CursorResult } from "../domain/alignment/types";
import type { ParsedScript } from "../domain/script/types";
import type { AudioTelemetry } from "../domain/audio/types";
import { createOptionalPersistence, createReaderEngine } from "./composition-root";
import { ReaderSurface, type ReaderSurfaceHandle } from "../presentation/reader-surface/ReaderSurface";

const EXAMPLE_SCRIPT = `Welcome to OrthoVerba.

Paste your own script here, prepare it, and then press Start Listening. Read naturally. The current words will follow your voice, and you can click any word to manually re-anchor the reader.

Nothing is saved unless you explicitly choose Save on this device.`;

export function App(): React.JSX.Element {
  const readerRef = useRef<ReaderSurfaceHandle>(null);
  const engineRef = useRef<ReturnType<typeof createReaderEngine> | null>(null);
  const persistence = useMemo(() => createOptionalPersistence(), []);
  const [sourceText, setSourceText] = useState(EXAMPLE_SCRIPT);
  const [locale, setLocale] = useState("en-US");
  const [phase, setPhase] = useState<EnginePhase>("idle");
  const [status, setStatus] = useState("Example ready — prepare it or paste your own script.");
  const [parsed, setParsed] = useState<ParsedScript | null>(null);
  const [cursor, setCursor] = useState<CursorResult | null>(null);
  const [telemetry, setTelemetry] = useState<AudioTelemetry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(34);
  const [savedScripts, setSavedScripts] = useState<readonly SavedLocalScript[]>([]);
  const [savedId, setSavedId] = useState<string | undefined>(undefined);
  const [saveName, setSaveName] = useState("My script");
  const [showStorage, setShowStorage] = useState(false);

  useEffect(() => {
    const engine = createReaderEngine({
      onPhase(nextPhase, message) {
        setPhase(nextPhase);
        setStatus(message);
      },
      onParsed(nextParsed) {
        setParsed(nextParsed);
        setCursor(null);
        readerRef.current?.load(nextParsed);
      },
      onCursor(nextCursor) {
        setCursor(nextCursor);
        readerRef.current?.update(nextCursor);
      },
      onTelemetry: setTelemetry,
      onError: setError,
    });
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const prepare = useCallback(() => {
    try {
      setError(null);
      engineRef.current?.prepare(sourceText, locale);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to prepare the script.");
    }
  }, [locale, sourceText]);

  const start = useCallback(async () => {
    try {
      setError(null);
      await engineRef.current?.start();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to start listening.");
    }
  }, []);

  const reanchor = useCallback((boundary: number) => {
    engineRef.current?.reanchor(boundary);
    if (cursor !== null) {
      const manual: CursorResult = {
        ...cursor,
        observedBoundary: boundary,
        provisionalBoundary: boundary,
        stableBoundary: boundary,
        committedBoundary: boundary,
        stage: "committed",
        confidence: 1,
      };
      setCursor(manual);
      readerRef.current?.update(manual);
    }
  }, [cursor]);

  async function refreshSaved(): Promise<void> {
    try {
      setSavedScripts(await persistence.list());
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to open local storage.");
    }
  }

  async function saveLocal(): Promise<void> {
    try {
      const saved = await persistence.save({
        ...(savedId === undefined ? {} : { id: savedId }),
        name: saveName.trim() || "Untitled script",
        sourceText,
        locale,
      });
      setSavedId(saved.id);
      setStatus("Saved only in this browser on this device.");
      await refreshSaved();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to save locally.");
    }
  }

  function openSaved(script: SavedLocalScript): void {
    engineRef.current?.stop();
    setSourceText(script.sourceText);
    setLocale(script.locale);
    setSaveName(script.name);
    setSavedId(script.id);
    setShowStorage(false);
    setParsed(null);
    setCursor(null);
    readerRef.current?.clear();
    setStatus("Saved script loaded. Press Prepare Script.");
  }

  async function deleteSaved(id: string): Promise<void> {
    await persistence.delete(id);
    if (savedId === id) setSavedId(undefined);
    await refreshSaved();
  }

  function clearSession(): void {
    engineRef.current?.stop();
    setSourceText("");
    setParsed(null);
    setCursor(null);
    setTelemetry(null);
    setSavedId(undefined);
    setError(null);
    readerRef.current?.clear();
    setStatus("Session cleared. Nothing unsaved remains in the app.");
  }

  const listening = phase === "listening" || phase === "starting";
  const prepared = parsed !== null;
  const modeLabel = engineRef.current?.recognitionSupported === false
    ? "Voice unavailable"
    : "Browser-selected recognition";
  const progress = parsed === null || cursor === null || parsed.tokens.length === 0
    ? 0
    : Math.round((cursor.provisionalBoundary / parsed.tokens.length) * 100);

  return (
    <main className="app-frame">
      <header className="topbar">
        <div className="brand-lockup">
          <img src="/icons/icon.svg" alt="" width="44" height="44" />
          <div>
            <p className="eyebrow">Private voice-following reader</p>
            <h1>OrthoVerba</h1>
          </div>
        </div>
        <div className="privacy-pill"><span /> Temporary — not saved</div>
      </header>

      <section className="workspace">
        <aside className="control-panel" aria-label="Reader controls">
          <div className="panel-section">
            <label htmlFor="script">Your script</label>
            <textarea
              id="script"
              value={sourceText}
              onChange={(event) => {
                setSourceText(event.target.value);
                setSavedId(undefined);
              }}
              disabled={listening}
              spellCheck
              placeholder="Paste your script here…"
            />
            <div className="row compact">
              <select value={locale} onChange={(event) => setLocale(event.target.value)} disabled={listening} aria-label="Language">
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="en-AU">English (Australia)</option>
                <option value="en-IN">English (India)</option>
              </select>
              <button className="secondary" onClick={prepare} disabled={listening || sourceText.trim().length === 0}>Prepare Script</button>
            </div>
          </div>

          <div className="panel-section">
            <div className="status-card" data-phase={phase}>
              <span className="status-dot" />
              <div><strong>{status}</strong><small>{modeLabel}; your browser may use a remote speech service.</small></div>
            </div>
            {error !== null && <div className="error-card" role="alert">{error}</div>}
            <div className="button-grid">
              <button className="primary" onClick={() => void start()} disabled={!prepared || listening}>Start Listening</button>
              <button className="secondary" onClick={() => engineRef.current?.pause()} disabled={!listening}>Pause</button>
              <button className="secondary" onClick={() => engineRef.current?.stop()} disabled={phase === "idle"}>Stop</button>
              <button className="danger" onClick={clearSession}>Clear Session</button>
            </div>
          </div>

          <div className="panel-section metrics">
            <div><span>Progress</span><strong>{progress}%</strong></div>
            <div><span>Position</span><strong>{cursor?.provisionalBoundary ?? 0}/{parsed?.tokens.length ?? 0}</strong></div>
            <div><span>Confidence</span><strong>{Math.round((cursor?.confidence ?? 0) * 100)}%</strong></div>
            <div><span>Mic</span><strong>{telemetry?.speechActive ? "Speaking" : listening ? "Quiet" : "Off"}</strong></div>
            <div className="level-meter" aria-label="Microphone level"><i style={{ width: `${Math.round((telemetry?.rms ?? 0) * 500)}%` }} /></div>
          </div>

          <div className="panel-section">
            <label htmlFor="font-size">Reader text size — {fontSize}px</label>
            <input
              id="font-size"
              type="range"
              min="24"
              max="64"
              value={fontSize}
              onChange={(event) => {
                const size = Number(event.target.value);
                setFontSize(size);
                readerRef.current?.setFontSize(size);
              }}
            />
            <div className="row compact">
              <button className="ghost" onClick={() => readerRef.current?.moveManual(-1)} disabled={!prepared}>← Previous</button>
              <button className="ghost" onClick={() => readerRef.current?.moveManual(1)} disabled={!prepared}>Next →</button>
            </div>
          </div>

          <div className="panel-section local-save">
            <h2>Optional local saving</h2>
            <p>Nothing is stored automatically. This action creates IndexedDB data only in this browser.</p>
            <input value={saveName} onChange={(event) => setSaveName(event.target.value)} aria-label="Saved script name" />
            <div className="row compact">
              <button className="secondary" onClick={() => void saveLocal()} disabled={sourceText.trim().length === 0}>Save on this device</button>
              <button className="ghost" onClick={() => { setShowStorage(!showStorage); if (!showStorage) void refreshSaved(); }}>Manage saved</button>
            </div>
            {showStorage && (
              <div className="saved-list">
                {savedScripts.length === 0 && <p>No locally saved scripts.</p>}
                {savedScripts.map((script) => (
                  <div className="saved-item" key={script.id}>
                    <button className="saved-open" onClick={() => openSaved(script)}><strong>{script.name}</strong><small>{new Date(script.savedAtIso).toLocaleString()}</small></button>
                    <button className="icon-danger" onClick={() => void deleteSaved(script.id)} aria-label={`Delete ${script.name}`}>×</button>
                  </div>
                ))}
                {savedScripts.length > 0 && <button className="danger" onClick={() => void persistence.deleteAll().then(refreshSaved)}>Delete all local data</button>}
              </div>
            )}
          </div>
        </aside>

        <section className="reader-panel" aria-label="Reader">
          {!prepared && (
            <div className="empty-state">
              <div className="empty-icon">OV</div>
              <h2>Prepare your script</h2>
              <p>Paste text on the left and click Prepare Script. Click any displayed word later to manually set your place.</p>
            </div>
          )}
          <ReaderSurface ref={readerRef} onReanchor={reanchor} />
          <footer className="reader-footer">
            <span>Stage: {cursor?.stage ?? "waiting"}</span>
            <span>Alternative rank: {cursor?.diagnostics.alternativeRank ?? 0}</span>
            <span>{cursor?.diagnostics.restartGuardActive ? "Re-establishing after restart" : "Position established"}</span>
          </footer>
        </section>
      </section>
    </main>
  );
}
