import { describe, expect, it } from 'vitest'
import { indexC } from '../src/engine'

// Top-level symbol extraction: functions (definitions + prototypes), #define
// macros, and global variables (with their resolvable type name). Locals inside
// function bodies must NOT leak into the symbol table.

describe('indexC — symbol extraction', () => {
  it('collects functions, macros, and globals; skips locals', () => {
    const idx = indexC([
      {
        path: 'src/main.c',
        text: `#define MAX 10
int add(int a, int b);
void main(void) { int local; }
struct Foo g;
unsigned char *p;`,
      },
    ])
    const kinds = (label: string) => idx.symbols.get(label)?.kind
    expect(kinds('MAX')).toBe('macro')
    expect(kinds('add')).toBe('function')
    expect(kinds('main')).toBe('function')
    expect(kinds('g')).toBe('global')
    expect(kinds('p')).toBe('global')
    // a local declared inside main() is not a top-level symbol
    expect(idx.symbols.has('local')).toBe(false)
  })

  it('records the resolvable type name of a global (struct tag / typedef)', () => {
    const idx = indexC([
      {
        path: 'src/main.c',
        text: 'struct Foo { int x; }; typedef struct { int a; } Bar; struct Foo g; Bar b;',
      },
    ])
    expect(idx.symbols.get('g')?.type).toBe('Foo')
    expect(idx.symbols.get('b')?.type).toBe('Bar')
  })

  it('tags sysroot-header symbols with their declaring header; project symbols carry none', () => {
    const idx = indexC([{ path: 'src/main.c', text: 'void main(void) {}' }], {
      sysrootHeaders: [
        { path: 'include/conio.h', text: 'void cputs(const char* s);\n#define CH_DEL 20' },
      ],
    })
    expect(idx.symbols.get('cputs')?.header).toBe('conio.h')
    expect(idx.symbols.get('CH_DEL')?.header).toBe('conio.h')
    // a project .c symbol gets no header
    expect(idx.symbols.get('main')?.header).toBeUndefined()
  })

  it('records a one-line signature as detail for functions (prototype + definition)', () => {
    const idx = indexC([
      {
        path: 'src/main.c',
        text: 'int add(int a, int b);\nvoid run(void) { int x; }',
      },
    ])
    expect(idx.symbols.get('add')?.detail).toBe('int add(int a, int b)')
    expect(idx.symbols.get('run')?.detail).toBe('void run(void)')
  })

  it('indexes a cc65 register macro as a typed global, not a plain macro', () => {
    const idx = indexC([], {
      sysrootHeaders: [
        {
          path: 'include/_vic2.h',
          text: 'struct __vic2 { unsigned char bordercolor; };\n#define VIC (*(struct __vic2*)0xD000)\n#define PLAIN 1',
        },
      ],
    })
    expect(idx.symbols.get('VIC')?.kind).toBe('global')
    expect(idx.symbols.get('VIC')?.type).toBe('__vic2')
    expect(idx.symbols.get('VIC')?.header).toBe('_vic2.h')
    // a normal object-like macro is still a macro
    expect(idx.symbols.get('PLAIN')?.kind).toBe('macro')
  })

  it('indexes cc65 functions decorated with __fastcall__ / __cdecl__', () => {
    const idx = indexC([], {
      decorators: /\b(?:__fastcall__|__cdecl__)\b/g,
      sysrootHeaders: [
        {
          path: 'include/conio.h',
          text: 'void __fastcall__ cputs (const char* s);\nvoid __cdecl__ gotoxy (unsigned char x);\nvoid clrscr (void);',
        },
      ],
    })
    // decorated prototypes now index, with the decorator stripped from detail
    expect(idx.symbols.get('cputs')?.kind).toBe('function')
    expect(idx.symbols.get('cputs')?.detail).toBe('void cputs (const char* s)')
    expect(idx.symbols.get('cputs')?.header).toBe('conio.h')
    expect(idx.symbols.get('gotoxy')?.detail).toBe('void gotoxy (unsigned char x)')
    // a plain (undecorated) prototype still indexes
    expect(idx.symbols.get('clrscr')?.kind).toBe('function')
  })
})
