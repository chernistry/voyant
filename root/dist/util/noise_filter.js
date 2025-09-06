// Suppress noisy logs from third-party libs (Transformers.js / ONNX, etc.)
// We only filter specific, known-noisy messages to avoid hiding real issues.
const NOISY_PATTERNS = [
    /dtype not specified for "model"/i,
    /Using the default dtype \(fp32\) for this device \(cpu\)/i,
];
function shouldFilter(chunk) {
    try {
        const text = typeof chunk === 'string' ? chunk : String(chunk ?? '');
        return NOISY_PATTERNS.some((re) => re.test(text));
    }
    catch {
        return false;
    }
}
export function silenceNoisyLibLogs(logLevel = process.env.LOG_LEVEL) {
    const level = String(logLevel || '').toLowerCase();
    // Only engage filters if not in debug/trace
    const enabled = level === 'info' || level === 'warn' || level === 'error' || level === '';
    if (!enabled)
        return;
    // Patch console methods conservatively
    const origWarn = console.warn.bind(console);
    const origInfo = console.info.bind(console);
    const origLog = console.log.bind(console);
    console.warn = (...args) => {
        if (args.some(shouldFilter))
            return; // drop
        origWarn(...args);
    };
    console.info = (...args) => {
        if (args.some(shouldFilter))
            return; // drop
        origInfo(...args);
    };
    console.log = (...args) => {
        if (args.some(shouldFilter))
            return; // drop
        origLog(...args);
    };
    // Patch process stderr/stdout writes (some libs write directly)
    const origStdoutWrite = process.stdout.write.bind(process.stdout);
    const origStderrWrite = process.stderr.write.bind(process.stderr);
    function filteredWrite(orig) {
        return function (chunk, encoding, callback) {
            try {
                if (shouldFilter(chunk))
                    return true; // swallow
            }
            catch { }
            return orig(chunk, encoding, callback);
        };
    }
    // @ts-ignore - we intentionally monkey patch here
    process.stdout.write = filteredWrite(origStdoutWrite);
    // @ts-ignore - we intentionally monkey patch here
    process.stderr.write = filteredWrite(origStderrWrite);
}
