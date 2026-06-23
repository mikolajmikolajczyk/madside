#!/usr/bin/env python3
# Patch clownassembler's p2bin.c to drop setjmp/longjmp (#145).
#
# wasi-sdk's setjmp.h is gated behind the wasm Exception-handling proposal, and
# wasi-sdk 33 ships no target-side SjLj runtime (__wasm_setjmp/__wasm_longjmp are
# undefined at link). p2bin.c only uses setjmp/longjmp for a localized EOF
# error-recovery, so we replace it with a static error flag checked at the record
# loop. Idempotent: a no-op once applied.
import sys

path = sys.argv[1]
src = open(path).read()

if "longjmp" not in src and "jmp_buf" not in src:
    print(f"patch-p2bin: already applied ({path})")
    sys.exit(0)

repls = [
    # Drop the header (its #error fires on wasi without EH).
    ("#include <setjmp.h>\n", ""),
    # The jump buffer becomes an error flag.
    ("static jmp_buf jump_buffer;", "static cc_bool read_error;"),
    # ReadByte (returns unsigned int): flag + return 0 instead of longjmp.
    (
        '\t\tTextOutput_fputs("Error: File ended prematurely.\\n", error_callbacks);\n'
        "\t\tlongjmp(jump_buffer, 1);\n"
        "\t}\n"
        "\n"
        "\treturn (unsigned long)byte;",
        '\t\tTextOutput_fputs("Error: File ended prematurely.\\n", error_callbacks);\n'
        "\t\tread_error = cc_true;\n"
        "\t\treturn 0;\n"
        "\t}\n"
        "\n"
        "\treturn (unsigned long)byte;",
    ),
    # ReadBytes (returns void): flag + return instead of longjmp.
    (
        "\tif (BinaryStream_fread(buffer, total_bytes, 1, input_file) == 0)\n"
        "\t{\n"
        '\t\tTextOutput_fputs("Error: File ended prematurely.\\n", error_callbacks);\n'
        "\t\tlongjmp(jump_buffer, 1);\n"
        "\t}",
        "\tif (BinaryStream_fread(buffer, total_bytes, 1, input_file) == 0)\n"
        "\t{\n"
        '\t\tTextOutput_fputs("Error: File ended prematurely.\\n", error_callbacks);\n'
        "\t\tread_error = cc_true;\n"
        "\t\treturn;\n"
        "\t}",
    ),
    # ProcessRecords: replace the setjmp guard with the flag; bail in the loop.
    (
        "\tif (setjmp(jump_buffer) == 0)\n"
        "\t{\n"
        "\t\tfor (;;)\n"
        "\t\t{\n"
        "\t\t\tconst unsigned int record_header = ReadByte();\n"
        "\t\t\tunsigned int granularity;\n",
        "\tread_error = cc_false;\n"
        "\t{\n"
        "\t\tfor (;;)\n"
        "\t\t{\n"
        "\t\t\tconst unsigned int record_header = ReadByte();\n"
        "\t\t\tunsigned int granularity;\n"
        "\n"
        "\t\t\tif (read_error)\n"
        "\t\t\t\treturn cc_false;\n",
    ),
]

for old, new in repls:
    if old not in src:
        sys.exit(f"patch-p2bin: anchor not found (upstream changed?):\n{old[:80]}...")
    src = src.replace(old, new, 1)

open(path, "w").write(src)
print(f"patch-p2bin: applied ({path})")
