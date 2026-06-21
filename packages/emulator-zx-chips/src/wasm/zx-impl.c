// chips ZX Spectrum implementation translation unit. The chips headers are C99
// (compound literals, designated initialisers, anonymous unions) and only
// compile cleanly as C — so the CHIPS_IMPL bodies live here, built as a C TU.
// The Embind wrapper (zx-core.cpp) includes the same headers for declarations
// only (no CHIPS_IMPL) under `extern "C"` and links against the symbols here.
// Mirrors c64-impl.c.

#define CHIPS_ASSERT(c) ((void)0)
#define CHIPS_IMPL
#include "chips/chips_common.h"
#include "chips/z80.h"
#include "chips/beeper.h"
#include "chips/ay38910.h"
#include "chips/kbd.h"
#include "chips/mem.h"
#include "chips/clk.h"
#include "systems/zx.h"
