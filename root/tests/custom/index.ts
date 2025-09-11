// Custom Test Suite Index
// Этот файл позволяет запускать все custom тесты через один импорт

// API & CLI Integration
export * from './api_or_cli.test';

// Search & Web Integration
export * from './brave_search.test';
export * from './brave_search_fallback.test';
export * from './tavily_search.test';
export * from './web_search_consent.test';
export * from './web_search_fallback.test';

// Core Logic
export * from './graph.test';
export * from './graph-optimization.test';
export * from './router.memory.test';
export * from './chat.test';
export * from './flight_clarification.test';

// Tools Layer
export * from './tools.test';
export * from './opentripmap.test';
export * from './packing.test';

// Security & Quality
export * from './security.test';
export * from './fetch_allowlist.test';
export * from './hallucination_guard.test';
export * from './transcript-recorder.test';

// Self-Check
export * from './receipts.selfcheck.test';

// Test Utilities
export { createTestApp } from './brave_search_fallback.test';
export { runCLI } from './receipts.selfcheck.test';
