/// <reference lib="webworker" />
// Radnik pdf.js (odluka 16): modul se u kontekstu radnika sam povezuje sa `self` (WorkerMessageHandler.initializeFromPort)
// i šalje `ready`, koji `spremanRadnik` čeka.
import 'pdfjs-dist/legacy/build/pdf.worker.mjs';
