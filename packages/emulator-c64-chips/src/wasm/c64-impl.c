// chips C64 implementation translation unit. The chips headers are C99 (compound
// literals, designated initialisers) and only compile cleanly as C — so the
// CHIPS_IMPL bodies live here, built as a C TU. The Embind wrapper (c64-core.cpp)
// includes the same headers for declarations only (no CHIPS_IMPL) under
// `extern "C"` and links against the symbols defined here.

#define _GNU_SOURCE     // expose M_PI (used by the SID filter math in m6581.h)
#include <assert.h>
#include <math.h>

#define CHIPS_ASSERT(c) ((void)0)
#define CHIPS_IMPL
#include "chips/chips_common.h"
#include "chips/m6502.h"
#include "chips/m6526.h"
#include "chips/m6569.h"
#include "chips/m6581.h"
#include "chips/m6522.h"
#include "chips/kbd.h"
#include "chips/mem.h"
#include "chips/clk.h"
#include "systems/c1530.h"
#include "systems/c1541.h"
#include "systems/c64.h"
