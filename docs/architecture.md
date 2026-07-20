# Architecture

`BrowserSpeechAdapter` converts browser result slots into bounded cumulative snapshots. `TrackingWorkerClient` fences every request by session, script, control, request, epoch, and revision. The worker parses exact source text, preserves source offsets, scores N-best alternatives against the known script, and emits observed/provisional/stable/committed boundaries. `ReaderSurface` performs imperative class changes and reading-band scrolling rather than rerendering the whole script on each recognition event.
