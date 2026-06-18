/* WASI has no process model; getpid() is only used by cc65 for unique temp-file
   names, and a single-shot wasm run needs no real PID. */
int getpid(void) { return 1; }
